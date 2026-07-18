-- ============================================================================
-- UniEvent Flow — Database Schema (PostgreSQL)
-- Nguồn: ERD.md + SRS v0.3.1 (37 FR) + API.md v0.2.1
-- Phiên bản schema: v0.2.1
-- Ngày cập nhật: 17/07/2026
-- ============================================================================
--
-- GHI CHÚ THIẾT KẾ:
-- 1) Dùng ENUM thay vì VARCHAR + CHECK cho các cột trạng thái, giúp
--    ràng buộc chặt ở tầng CSDL và dễ đọc khi bảo vệ đồ án.
-- 2) So với v1.0: users/events/feedbacks/checkin_logs được mở rộng cột;
--    3 bảng mới: event_schedule, event_updates, event_co_hosts.
--
-- *** CẢNH BÁO — ĐỌC TRƯỚC KHI CHẠY ***
-- Script này bắt đầu bằng khối DROP CASCADE để có thể chạy lại nhiều lần
-- trong lúc phát triển (giống thiết kế của bản v0.1.0). Nếu Postgres đang chạy
-- (Docker) đã có dữ liệu thật muốn giữ lại, KHÔNG chạy thẳng file này —
-- hãy tách phần ALTER TABLE tương ứng (xem UniEventFlow_thay_doi_v2.md mục 3)
-- để migrate an toàn, hoặc backup (pg_dump) trước khi chạy.
-- Không dùng `prisma migrate dev` cho instance đang chạy — team dùng Prisma
-- introspect-only (`prisma db pull`), tự quản lý migration bằng SQL thuần.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 0. RESET (chỉ dùng khi dev — xoá sạch để chạy lại script nhiều lần)
-- ----------------------------------------------------------------------------
DROP VIEW IF EXISTS v_event_registration_stats;

DROP TABLE IF EXISTS event_co_hosts CASCADE;
DROP TABLE IF EXISTS event_updates CASCADE;
DROP TABLE IF EXISTS event_schedule CASCADE;
DROP TABLE IF EXISTS checkin_logs CASCADE;
DROP TABLE IF EXISTS feedbacks CASCADE;
DROP TABLE IF EXISTS tickets CASCADE;
DROP TABLE IF EXISTS registrations CASCADE;
DROP TABLE IF EXISTS events CASCADE;
DROP TABLE IF EXISTS users CASCADE;

DROP TYPE IF EXISTS checkin_method;
DROP TYPE IF EXISTS sentiment_label;
DROP TYPE IF EXISTS ticket_status;
DROP TYPE IF EXISTS registration_status;
DROP TYPE IF EXISTS event_location_type;
DROP TYPE IF EXISTS event_status;
DROP TYPE IF EXISTS user_role;

DROP FUNCTION IF EXISTS trigger_set_updated_at();


-- ----------------------------------------------------------------------------
-- 1. EXTENSIONS
-- ----------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "pgcrypto";  -- cung cấp gen_random_uuid()


-- ----------------------------------------------------------------------------
-- 2. ENUM TYPES
-- ----------------------------------------------------------------------------
CREATE TYPE user_role            AS ENUM ('student', 'organizer', 'admin');
CREATE TYPE event_status         AS ENUM ('active', 'cancelled');
CREATE TYPE event_location_type  AS ENUM ('in_person', 'online');
CREATE TYPE registration_status  AS ENUM ('pending', 'confirmed', 'failed');
CREATE TYPE ticket_status        AS ENUM ('valid', 'checked_in', 'cancelled');
CREATE TYPE sentiment_label      AS ENUM ('positive', 'negative', 'neutral');
CREATE TYPE checkin_method       AS ENUM ('qr_scan', 'self');


-- ----------------------------------------------------------------------------
-- 3. BẢNG users
--    Tài khoản dùng chung cho Sinh viên, Ban tổ chức & Quản trị viên.
--    FR-01→07, FR-29, FR-33.
-- ----------------------------------------------------------------------------
CREATE TABLE users (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name                  VARCHAR(150) NOT NULL,
    email                 VARCHAR(255) NOT NULL UNIQUE,
    password_hash         VARCHAR(255) NOT NULL,
    role                  user_role NOT NULL,
    avatar_url            VARCHAR(500),
    bio                   VARCHAR(160),
    social_links          JSONB,
    is_active             BOOLEAN NOT NULL DEFAULT TRUE,
    reset_token           VARCHAR(255),
    reset_token_expires   TIMESTAMPTZ,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE users IS 'Tài khoản dùng chung, phân biệt bằng role (student|organizer|admin). FR-01→07, FR-29, FR-33.';
COMMENT ON COLUMN users.reset_token IS 'Token một lần dùng cho luồng quên mật khẩu (FR-07)';
COMMENT ON COLUMN users.reset_token_expires IS 'Hạn dùng của reset_token; NULL nếu không có yêu cầu reset đang chờ';
COMMENT ON COLUMN users.avatar_url IS 'Ảnh đại diện — FR-06';
COMMENT ON COLUMN users.bio IS 'Tiểu sử ngắn, tối đa 160 ký tự — FR-06';
COMMENT ON COLUMN users.social_links IS 'JSON tự do, ví dụ {"instagram":"...","x":"...","youtube":"...","tiktok":"..."} — FR-06';
COMMENT ON COLUMN users.is_active IS 'false = tài khoản bị Quản trị viên vô hiệu hoá (FR-29), chặn đăng nhập dù mật khẩu đúng';

CREATE INDEX idx_users_role ON users(role);
-- Tra cứu nhanh khi xử lý /auth/reset-password
CREATE INDEX idx_users_reset_token ON users(reset_token) WHERE reset_token IS NOT NULL;


-- ----------------------------------------------------------------------------
-- 4. BẢNG events
--    Sự kiện do Ban tổ chức tạo, trực tiếp hoặc trực tuyến.
--    FR-08→13, FR-30.
-- ----------------------------------------------------------------------------
CREATE TABLE events (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organizer_id   UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    title          VARCHAR(255) NOT NULL,
    description    TEXT,
    cover_image    VARCHAR(500),
    location       VARCHAR(255),
    location_type  event_location_type NOT NULL DEFAULT 'in_person',
    join_url       VARCHAR(500),
    category       VARCHAR(100),
    club_name      VARCHAR(150),
    start_time     TIMESTAMPTZ NOT NULL,
    end_time       TIMESTAMPTZ NOT NULL,
    max_tickets    INTEGER NOT NULL CHECK (max_tickets > 0),
    status         event_status NOT NULL DEFAULT 'active',
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT chk_event_time_range CHECK (end_time > start_time),
    -- BR-30 (SRS 3.2.1): location bắt buộc nếu in_person; join_url bắt buộc nếu online.
    CONSTRAINT chk_event_location_fields CHECK (
        (location_type = 'in_person' AND location IS NOT NULL)
        OR (location_type = 'online' AND join_url IS NOT NULL)
    )
);

COMMENT ON TABLE events IS 'Sự kiện, hiển thị landing page. FR-08→13, FR-30.';
COMMENT ON COLUMN events.max_tickets IS 'Số vé tối đa cấu hình khi tạo sự kiện — nguồn khởi tạo bộ đếm Redis (SRS §2.2.3). Không cho giảm xuống dưới số registration.status=confirmed hiện tại (BR-35, kiểm tra ở service layer vì là aggregate check).';
COMMENT ON COLUMN events.location_type IS 'in_person: location bắt buộc | online: join_url bắt buộc — FR-08';
COMMENT ON COLUMN events.join_url IS 'Đường dẫn tham gia (Zoom/Meet/...) cho sự kiện online — FR-08';

CREATE INDEX idx_events_organizer_id ON events(organizer_id);
CREATE INDEX idx_events_status ON events(status);
-- Hỗ trợ tìm kiếm/lọc theo CLB, loại hình, khoảng thời gian (FR-13)
CREATE INDEX idx_events_search ON events(status, category, club_name, start_time);


-- ----------------------------------------------------------------------------
-- 5. BẢNG event_schedule  (MỚI)
--    Lịch trình chi tiết trong sự kiện (các mốc thời gian). FR-32.
-- ----------------------------------------------------------------------------
CREATE TABLE event_schedule (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id    UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    start_time  TIMESTAMPTZ NOT NULL,
    title       VARCHAR(255) NOT NULL,
    location    VARCHAR(255),
    sort_order  INTEGER NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE event_schedule IS 'Các mốc lịch trình chi tiết của một sự kiện (vd 8:00 Khai mạc, 9:00 Toạ đàm...). FR-32.';
COMMENT ON COLUMN event_schedule.sort_order IS 'Quyết định thứ tự hiển thị trên giao diện (BR-43)';

CREATE INDEX idx_event_schedule_event_id ON event_schedule(event_id);


-- ----------------------------------------------------------------------------
-- 6. BẢNG event_updates  (MỚI)
--    Feed thông báo cập nhật do Ban tổ chức đăng. FR-31.
-- ----------------------------------------------------------------------------
CREATE TABLE event_updates (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id      UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    organizer_id  UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    title         VARCHAR(255) NOT NULL,
    content       TEXT NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE event_updates IS 'Thông báo cập nhật đăng bởi chủ sự kiện, hiển thị mới nhất trước. FR-31.';

CREATE INDEX idx_event_updates_event_id ON event_updates(event_id, created_at DESC);


-- ----------------------------------------------------------------------------
-- 7. BẢNG event_co_hosts  (MỚI)
--    CLB/Ban tổ chức đồng hành — thuần hiển thị, không có quyền quản lý. FR-37.
-- ----------------------------------------------------------------------------
CREATE TABLE event_co_hosts (
    event_id  UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    user_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    added_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (event_id, user_id)
);

COMMENT ON TABLE event_co_hosts IS 'Liên kết hiển thị CLB/Ban tổ chức đồng hành — không có cột quyền hạn (BR-46). user_id phải có role=organizer, kiểm tra ở service layer (FR-37).';

CREATE INDEX idx_event_co_hosts_user_id ON event_co_hosts(user_id);


-- ----------------------------------------------------------------------------
-- 8. BẢNG registrations
--    Yêu cầu giữ vé, xử lý bất đồng bộ qua BullMQ (FR-14, SRS §2.2.3)
-- ----------------------------------------------------------------------------
CREATE TABLE registrations (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id       UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status         registration_status NOT NULL DEFAULT 'pending',
    requested_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    processed_at   TIMESTAMPTZ
);

COMMENT ON TABLE registrations IS 'Bản ghi giữ chỗ tạm, được worker xử lý thành Ticket. FR-14, FR-15, FR-16.';

CREATE INDEX idx_registrations_event_id ON registrations(event_id);
CREATE INDEX idx_registrations_user_id ON registrations(user_id);
CREATE INDEX idx_registrations_status ON registrations(status);
-- Chặn 1 sinh viên tạo nhiều bản ghi pending/confirmed trùng cho cùng 1 sự kiện
-- (double-submit do mạng chậm / bấm nút 2 lần — bổ trợ cho Idempotency-Key ở API.md §1.7)
CREATE UNIQUE INDEX uq_registration_active_per_user_event
    ON registrations(event_id, user_id)
    WHERE status IN ('pending', 'confirmed');


-- ----------------------------------------------------------------------------
-- 9. BẢNG tickets
--    Vé chính thức (1 Registration → tối đa 1 Ticket). FR-15, FR-17, FR-18, FR-34.
-- ----------------------------------------------------------------------------
CREATE TABLE tickets (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    registration_id   UUID NOT NULL UNIQUE REFERENCES registrations(id) ON DELETE CASCADE,
    jwt_code          TEXT NOT NULL UNIQUE,
    status            ticket_status NOT NULL DEFAULT 'valid',
    issued_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE tickets IS 'Vé điện tử JWT/QR, sinh sau khi Registration=confirmed. FR-15, FR-17, FR-18. status=cancelled dùng chung cho cả huỷ-do-sự-kiện-huỷ và tự-huỷ-đăng-ký (FR-34, BR-56).';

CREATE INDEX idx_tickets_status ON tickets(status);


-- ----------------------------------------------------------------------------
-- 10. BẢNG checkin_logs
--     Lịch sử check-in tại cổng (qr_scan) hoặc tự check-in online (self).
--     1 Ticket → tối đa 1 CheckinLog. FR-20, FR-21, FR-36.
-- ----------------------------------------------------------------------------
CREATE TABLE checkin_logs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id       UUID NOT NULL UNIQUE REFERENCES tickets(id) ON DELETE CASCADE,
    organizer_id    UUID REFERENCES users(id) ON DELETE RESTRICT,
    checkin_method  checkin_method NOT NULL DEFAULT 'qr_scan',
    checkin_time    TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- BR-66 (SRS 3.4.5): qr_scan bắt buộc có organizer_id; self (check-in online) thì NULL.
    CONSTRAINT chk_checkin_method_organizer CHECK (
        (checkin_method = 'qr_scan' AND organizer_id IS NOT NULL)
        OR (checkin_method = 'self' AND organizer_id IS NULL)
    )
);

COMMENT ON TABLE checkin_logs IS 'Ghi nhận mỗi lần check-in hợp lệ. FR-20, FR-21, FR-22, FR-36.';
COMMENT ON COLUMN checkin_logs.organizer_id IS 'NULL khi checkin_method=self (sinh viên tự check-in sự kiện online, FR-36)';
COMMENT ON COLUMN checkin_logs.checkin_method IS 'qr_scan: quét QR tại cổng (in_person) | self: tự xác nhận tham dự (online) — FR-36';

CREATE INDEX idx_checkin_logs_organizer_id ON checkin_logs(organizer_id);
CREATE INDEX idx_checkin_logs_checkin_time ON checkin_logs(checkin_time);


-- ----------------------------------------------------------------------------
-- 11. BẢNG feedbacks
--     Phản hồi sau sự kiện: rating bắt buộc + content tuỳ chọn, gắn nhãn
--     cảm xúc AI. FR-23→26, FR-28.
--     (1 Ticket → tối đa 1 Feedback: "xác minh đã tham dự" theo ERD.md)
-- ----------------------------------------------------------------------------
CREATE TABLE feedbacks (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id          UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    ticket_id         UUID NOT NULL UNIQUE REFERENCES tickets(id) ON DELETE CASCADE,
    rating            SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
    content           TEXT,
    sentiment_label   sentiment_label,
    keywords          TEXT,
    analyzed_at       TIMESTAMPTZ,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE feedbacks IS 'Chỉ chấp nhận khi Ticket.status=checked_in (điều kiện đã tham dự). FR-23→26, FR-28.';
COMMENT ON COLUMN feedbacks.rating IS 'Đánh giá sao 1–5, bắt buộc (FR-23). "Điểm phản hồi AI" trên dashboard = AVG(rating) — BR-77, quyết định sản phẩm đã chốt.';
COMMENT ON COLUMN feedbacks.content IS 'Nhận xét dạng text, KHÔNG bắt buộc (nullable) — chỉ rating là bắt buộc (FR-23)';
COMMENT ON COLUMN feedbacks.sentiment_label IS 'NULL = chưa được LLM phân tích (FR-25); set giá trị sau khi phân tích xong (FR-26). Chỉ áp dụng phân tích cho feedback có content khác rỗng.';

CREATE INDEX idx_feedbacks_event_id ON feedbacks(event_id);
CREATE INDEX idx_feedbacks_user_id ON feedbacks(user_id);
CREATE INDEX idx_feedbacks_sentiment_label ON feedbacks(sentiment_label);
-- Hỗ trợ truy vấn "feedback có nội dung, theo sự kiện, chưa được phân tích" cho FR-25 (batch theo event)
CREATE INDEX idx_feedbacks_unanalyzed ON feedbacks(event_id) WHERE analyzed_at IS NULL AND content IS NOT NULL;


-- ----------------------------------------------------------------------------
-- 12. TRIGGER: tự động cập nhật updated_at
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_updated_at_users
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER set_updated_at_events
    BEFORE UPDATE ON events
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();


-- ----------------------------------------------------------------------------
-- 13. VIEW hỗ trợ Dashboard (FR-27) — gộp số liệu đăng ký theo sự kiện
--     API /events/:eventId/dashboard có thể SELECT trực tiếp từ view này
--     thay vì tự viết lại JOIN + FILTER mỗi lần.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_event_registration_stats AS
SELECT
    e.id                                                     AS event_id,
    e.title,
    e.max_tickets,
    COUNT(r.id) FILTER (WHERE r.status = 'confirmed')        AS confirmed_count,
    COUNT(r.id) FILTER (WHERE r.status = 'pending')          AS pending_count,
    COUNT(r.id) FILTER (WHERE r.status = 'failed')           AS failed_count,
    COUNT(t.id) FILTER (WHERE t.status = 'checked_in')       AS checked_in_count,
    e.max_tickets - COUNT(r.id) FILTER (WHERE r.status IN ('confirmed', 'pending'))
                                                               AS tickets_remaining_db
    -- Lưu ý: số vé còn lại "thật" (real-time) phải đọc từ Redis theo SRS §2.2.3,
    -- cột tickets_remaining_db ở đây chỉ mang tính tham chiếu/đối soát định kỳ.
FROM events e
LEFT JOIN registrations r ON r.event_id = e.id
LEFT JOIN tickets t ON t.registration_id = r.id
GROUP BY e.id, e.title, e.max_tickets;

COMMENT ON VIEW v_event_registration_stats IS 'View tổng hợp cho Dashboard (FR-27). tickets_remaining_db chỉ dùng đối soát, không thay thế Redis counter.';


-- ============================================================================
-- HẾT SCRIPT TẠO MỚI. Xem UniEventFlow_thay_doi_v2.md mục 3 để lấy các câu
-- lệnh ALTER TABLE tương ứng nếu cần migrate incremental thay vì recreate.
-- ============================================================================
