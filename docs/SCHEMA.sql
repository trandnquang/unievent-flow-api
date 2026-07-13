-- ============================================================================
-- UniEvent Flow — Database Schema (PostgreSQL)
-- Nguồn: ERD.md + SRS v2.0 §6 (Yêu cầu dữ liệu) + API.md (FR-01 → FR-28)
-- Phiên bản schema: 1.0
-- Ngày tạo: 13/07/2026
-- ============================================================================
--
-- GHI CHÚ THIẾT KẾ:
-- 1) Dùng ENUM thay vì VARCHAR + CHECK cho các cột trạng thái, giúp
--    ràng buộc chặt ở tầng CSDL và dễ đọc khi bảo vệ đồ án.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 0. RESET (chỉ dùng khi dev — xoá sạch để chạy lại script nhiều lần)
-- ----------------------------------------------------------------------------
DROP VIEW IF EXISTS v_event_registration_stats;

DROP TABLE IF EXISTS checkin_logs CASCADE;
DROP TABLE IF EXISTS feedbacks CASCADE;
DROP TABLE IF EXISTS tickets CASCADE;
DROP TABLE IF EXISTS registrations CASCADE;
DROP TABLE IF EXISTS events CASCADE;
DROP TABLE IF EXISTS users CASCADE;

DROP TYPE IF EXISTS sentiment_label;
DROP TYPE IF EXISTS ticket_status;
DROP TYPE IF EXISTS registration_status;
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
CREATE TYPE user_role            AS ENUM ('student', 'organizer');
CREATE TYPE event_status         AS ENUM ('active', 'cancelled');
CREATE TYPE registration_status  AS ENUM ('pending', 'confirmed', 'failed');
CREATE TYPE ticket_status        AS ENUM ('valid', 'checked_in', 'cancelled');
CREATE TYPE sentiment_label      AS ENUM ('positive', 'negative', 'neutral');


-- ----------------------------------------------------------------------------
-- 3. BẢNG users
--    Tài khoản dùng chung cho Sinh viên & Ban tổ chức (FR-01 → FR-07)
-- ----------------------------------------------------------------------------
CREATE TABLE users (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name                  VARCHAR(150) NOT NULL,
    email                 VARCHAR(255) NOT NULL UNIQUE,
    password_hash         VARCHAR(255) NOT NULL,
    role                  user_role NOT NULL,
    is_active             BOOLEAN NOT NULL DEFAULT TRUE,
    reset_token           VARCHAR(255),
    reset_token_expires   TIMESTAMPTZ,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE users IS 'Tài khoản dùng chung, phân biệt bằng role. FR-01→07.';
COMMENT ON COLUMN users.reset_token IS 'Token một lần dùng cho luồng quên mật khẩu (FR-07)';
COMMENT ON COLUMN users.reset_token_expires IS 'Hạn dùng của reset_token; NULL nếu không có yêu cầu reset đang chờ';

CREATE INDEX idx_users_role ON users(role);
-- Tra cứu nhanh khi xử lý /auth/reset-password
CREATE INDEX idx_users_reset_token ON users(reset_token) WHERE reset_token IS NOT NULL;


-- ----------------------------------------------------------------------------
-- 4. BẢNG events
--    Sự kiện do Ban tổ chức tạo (FR-08 → FR-13)
-- ----------------------------------------------------------------------------
CREATE TABLE events (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organizer_id   UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    title          VARCHAR(255) NOT NULL,
    description    TEXT,
    cover_image    VARCHAR(500),
    location       VARCHAR(255),
    category       VARCHAR(100),
    club_name      VARCHAR(150),
    start_time     TIMESTAMPTZ NOT NULL,
    end_time       TIMESTAMPTZ NOT NULL,
    max_tickets    INTEGER NOT NULL CHECK (max_tickets > 0),
    status         event_status NOT NULL DEFAULT 'active',
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT chk_event_time_range CHECK (end_time > start_time)
);

COMMENT ON TABLE events IS 'Sự kiện, hiển thị landing page. FR-08→13.';
COMMENT ON COLUMN events.max_tickets IS 'Số vé tối đa cấu hình khi tạo sự kiện — nguồn khởi tạo bộ đếm Redis (SRS §5.2)';

CREATE INDEX idx_events_organizer_id ON events(organizer_id);
CREATE INDEX idx_events_status ON events(status);
-- Hỗ trợ tìm kiếm/lọc theo CLB, loại hình, khoảng thời gian (FR-13)
CREATE INDEX idx_events_search ON events(status, category, club_name, start_time);


-- ----------------------------------------------------------------------------
-- 5. BẢNG registrations
--    Yêu cầu giữ vé, xử lý bất đồng bộ qua BullMQ (FR-14, SRS §5.2)
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
-- 6. BẢNG tickets
--    Vé chính thức (1 Registration → tối đa 1 Ticket). FR-15, FR-17, FR-18.
-- ----------------------------------------------------------------------------
CREATE TABLE tickets (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    registration_id   UUID NOT NULL UNIQUE REFERENCES registrations(id) ON DELETE CASCADE,
    jwt_code          TEXT NOT NULL UNIQUE,
    status            ticket_status NOT NULL DEFAULT 'valid',
    issued_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE tickets IS 'Vé điện tử JWT/QR, sinh sau khi Registration=confirmed. FR-15, FR-17, FR-18.';

CREATE INDEX idx_tickets_status ON tickets(status);


-- ----------------------------------------------------------------------------
-- 7. BẢNG checkin_logs
--    Lịch sử quét vé tại cổng (1 Ticket → tối đa 1 CheckinLog). FR-20, FR-21.
-- ----------------------------------------------------------------------------
CREATE TABLE checkin_logs (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id      UUID NOT NULL UNIQUE REFERENCES tickets(id) ON DELETE CASCADE,
    organizer_id   UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    checkin_time   TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE checkin_logs IS 'Ghi nhận mỗi lần check-in hợp lệ tại cổng. FR-20, FR-21, FR-22.';

CREATE INDEX idx_checkin_logs_organizer_id ON checkin_logs(organizer_id);
CREATE INDEX idx_checkin_logs_checkin_time ON checkin_logs(checkin_time);


-- ----------------------------------------------------------------------------
-- 8. BẢNG feedbacks
--    Phản hồi sau sự kiện, gắn nhãn cảm xúc AI. FR-23→26, FR-28.
--    (1 Ticket → tối đa 1 Feedback: "xác minh đã tham dự" theo ERD.md)
-- ----------------------------------------------------------------------------
CREATE TABLE feedbacks (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id          UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    ticket_id         UUID NOT NULL UNIQUE REFERENCES tickets(id) ON DELETE CASCADE,
    content           TEXT NOT NULL,
    sentiment_label   sentiment_label,
    keywords          TEXT,
    analyzed_at       TIMESTAMPTZ,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE feedbacks IS 'Chỉ chấp nhận khi Ticket.status=checked_in (điều kiện đã tham dự). FR-23→26, FR-28.';
COMMENT ON COLUMN feedbacks.sentiment_label IS 'NULL = chưa được LLM phân tích; set sau khi FR-25 chạy xong';

CREATE INDEX idx_feedbacks_event_id ON feedbacks(event_id);
CREATE INDEX idx_feedbacks_user_id ON feedbacks(user_id);
CREATE INDEX idx_feedbacks_sentiment_label ON feedbacks(sentiment_label);
-- Hỗ trợ truy vấn "feedback theo sự kiện chưa được phân tích" cho FR-25 (batch theo event)
CREATE INDEX idx_feedbacks_unanalyzed ON feedbacks(event_id) WHERE analyzed_at IS NULL;


-- ----------------------------------------------------------------------------
-- 9. TRIGGER: tự động cập nhật updated_at
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
-- 10. VIEW hỗ trợ Dashboard (FR-27) — gộp số liệu đăng ký theo sự kiện
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
    -- Lưu ý: số vé còn lại "thật" (real-time) phải đọc từ Redis theo SRS §5.2,
    -- cột tickets_remaining_db ở đây chỉ mang tính tham chiếu/đối soát định kỳ.
FROM events e
LEFT JOIN registrations r ON r.event_id = e.id
LEFT JOIN tickets t ON t.registration_id = r.id
GROUP BY e.id, e.title, e.max_tickets;

COMMENT ON VIEW v_event_registration_stats IS 'View tổng hợp cho Dashboard (FR-27). tickets_remaining_db chỉ dùng đối soát, không thay thế Redis counter.';