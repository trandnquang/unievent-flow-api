-- ============================================================================
-- UniEvent Flow — Database Schema (PostgreSQL)
-- Nguồn: ERD.md v0.4.1 + SRS v0.7.0 (42 FR, 42 UC, 127 BR) + API.md v0.5.0
-- Phiên bản schema: v0.4.1
-- Ngày cập nhật: 30/07/2026
--
-- CHANGELOG v0.4.1 (30/07/2026, đồng bộ SRS v0.7.0 / API v0.5.0 — 6 nhóm cuối):
--   KHÔNG có thay đổi DDL nào. Toàn bộ Check-in, Feedback&AI, Dashboard, Quản trị và
--   Uploads chạy trên bảng/cột/index đã có sẵn từ v0.4.1.
--
--   ⚠️ HAI RÀNG BUỘC DƯỚI ĐÂY CHỈ TỒN TẠI Ở FILE NÀY, KHÔNG CÓ TRONG schema.prisma:
--     - chk_checkin_method_organizer (bảng checkin_logs): 'self' => organizer_id NULL,
--       'qr_scan' => organizer_id NOT NULL.
--     - rating BETWEEN 1 AND 5 (bảng feedbacks).
--   Prisma introspect không biểu diễn được CHECK constraint, nên tầng ứng dụng PHẢI tự
--   chặn ở Zod/service — nếu không, CSDL ném lỗi thô và người dùng nhận HTTP 500 thay vì
--   lỗi nghiệp vụ rõ ràng. Xem SRS mục 2.6.1 ghi chú 4.
--
--   ⚠️ VIEW v_event_registration_stats KHÔNG được khai báo trong schema.prisma (thiếu
--   previewFeatures = ["views"]) — mọi truy vấn tới view này phải dùng $queryRaw.
--   Xem SRS mục 2.6.1 ghi chú 5.
--
-- CHANGELOG v0.4.1 (29/07/2026, đồng bộ SRS v0.6.10 / API v0.4.8 — Nhóm 3 Đăng ký & Vé):
--   KHÔNG có thay đổi DDL nào. Toàn bộ nghiệp vụ đăng ký/vé chạy trên các bảng và enum
--   đã có sẵn: registrations (+ partial unique uq_registration_active_per_user_event),
--   tickets.jwt_code, và view v_event_registration_stats dùng để đối soát với bộ đếm Redis.
--   Ghi chú: bộ đếm vé và khoá giữ chỗ nằm HOÀN TOÀN trên Redis, không có cột tương ứng
--   trong PostgreSQL — đây là thiết kế hai pha có chủ đích (xem SRS mục 2.2.3).
--
-- CHANGELOG v0.4.1 (28/07/2026, đồng bộ SRS v0.6.9 / API v0.4.7):
--   KHÔNG có thay đổi DDL nào. Chỉ sửa comment ràng buộc BR-106 ở bảng events:
--   cancel_reason nay BẮT BUỘC ở cả FR-11 lẫn FR-30 (trước ghi FR-11 được để NULL).
--   3 cột cancel_reason/cancelled_by/cancelled_at vẫn NULLABLE như cũ.
--
-- CHANGELOG v0.4.0 -> v0.4.1 (Giai đoạn 1 — rà soát đồng bộ chéo 4 tài liệu):
--   KHÔNG có thay đổi DDL nào. Chỉ cập nhật dòng provenance ở header cho khớp
--   phiên bản tài liệu hiện hành (SRS v0.6.1 -> v0.6.6, API v0.4.0 -> v0.4.4,
--   con số 40 FR/41 UC/120 BR -> 42 FR/42 UC/127 BR). Các FR bổ sung ở SRS
--   v0.6.2->v0.6.6 (FR-39 tra cứu quản trị, FR-40 tải ảnh, FR-41 danh sách
--   người đăng ký, FR-42 xem phản hồi đã gửi) đều là endpoint đọc/nghiệp vụ
--   trên cấu trúc sẵn có — không thêm bảng/cột/enum/index. Lược đồ 9 bảng giữ
--   nguyên 100% như v0.4.0. Ghi chú "⭐ v1.0" bên dưới là nhãn MỐC RÀ SOÁT nội
--   bộ (đợt gộp v0.3.0->v1.0), không phải số phiên bản file — giữ nguyên.
--
-- CHANGELOG v0.3.0 -> v0.4.0 (gộp 4 đợt rà soát tài liệu, SRS v0.5.0 -> v0.6.1):
--   [Đợt 1]
--     - users: thêm cột club_name (FR-38, BR-92) — CLB/đơn vị mà tài khoản Ban
--       tổ chức đại diện; trước đó biểu mẫu nhận trường này nhưng không có nơi lưu.
--     - registration_status: thêm giá trị 'cancelled' (FR-34, BR-56) — trạng thái
--       đích khi sinh viên tự huỷ đăng ký; trước đó chỉ tickets.status được đổi,
--       khiến bản ghi đã huỷ vẫn bị coi là confirmed (đăng ký lại bị chặn, email
--       nhắc lịch vẫn gửi, dashboard đếm sai).
--     - v_event_registration_stats: cột cancelled_count mới; failed/cancelled bị
--       loại khỏi tickets_remaining_db (đã hoàn vé về Redis).
--   [Đợt 2]
--     - events: thêm 3 cột ghi vết huỷ sự kiện — cancel_reason, cancelled_by,
--       cancelled_at (FR-30, BR-106) — hành động Admin buộc huỷ BẮT BUỘC nhập lý do.
--   [Đợt 3 & 4] Không thay đổi cấu trúc CSDL. Các quy tắc mới (TTL giữ chỗ,
--     khoá check-in nguyên tử, cache trạng thái tài khoản) đều nằm trên Redis
--     (SRS BR-88, BR-91, CBR 7) — chủ đích không phình cấu trúc PostgreSQL cho
--     dữ liệu tạm thời. FR-40 (tải ảnh) tái dùng cột cover_image/avatar_url có sẵn.
-- ============================================================================
--
-- GHI CHÚ THIẾT KẾ:
-- 1) Dùng ENUM thay vì VARCHAR + CHECK cho các cột trạng thái, giúp
--    ràng buộc chặt ở tầng CSDL và dễ đọc khi bảo vệ đồ án.
-- 2) So với v1.0: users/events/feedbacks/checkin_logs được mở rộng cột;
--    3 bảng mới: event_schedule, event_updates, event_co_hosts.
-- 3) ⭐ ĐỔI SO VỚI v0.2.1 (theo phiên rà soát scope 21/07/2026, SRS v0.4.0→v0.4.2):
--    a) Bỏ organizerCode khỏi luồng đăng ký — KHÔNG có cột/bảng mới cho FR-38
--       (Admin tạo tài khoản Organizer chỉ là INSERT vào users có sẵn với
--       role='organizer', không cần schema riêng).
--    b) event_co_hosts: thêm cột status (co_host_status: pending|accepted|
--       declined) — Co-host giờ có quyền thao tác thật sau khi accept,
--       không còn thuần hiển thị (SRS BR-44→46e).
--    c) events.category: đổi từ VARCHAR tự do sang ENUM cố định 9 giá trị
--       (event_category), tránh lỗi chính tả, tăng độ chính xác lọc/tìm kiếm
--       (SRS BR-28b, CBR 5).
--    d) users.social_links: bộ khoá JSONB cố định đổi thành
--       {facebook, website, tiktok, discord, instagram, zalo} (SRS mục 5.2).
--
-- BỐN ĐIỂM QUAN TRỌNG (theo ERD v1.0 — bám sát khi bảo trì schema):
--   (a) v_event_registration_stats đếm registration theo status IN ('confirmed',
--       'pending'), KHÔNG chỉ 'confirmed' — SRS BR-35 và script đối soát NFR-27
--       phụ thuộc điều này.
--   (b) uq_registration_active_per_user_event giữ phạm vi WHERE status IN
--       ('pending','confirmed') để bản ghi 'cancelled'/'failed' rơi ra khỏi ràng
--       buộc, cho phép sinh viên đăng ký lại (SRS BR-49).
--   (c) UNIQUE trên checkin_logs.ticket_id là lớp phòng vệ CUỐI CÙNG chống
--       check-in trùng (SRS mục 5.6.2); lớp 1 là Redis SETNX (BR-91), lớp 2 là
--       kiểm tra ticket.status (BR-61).
--   (d) NFR-44 yêu cầu đo hiệu năng tìm kiếm trước/sau khi bật pg_trgm + GIN;
--       chỉ mục GIN tách riêng ở cuối file để bật/tắt phục vụ phép đo.
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
DROP TYPE IF EXISTS event_category;      -- ⭐ mới, v0.3.0
DROP TYPE IF EXISTS co_host_status;      -- ⭐ mới, v0.3.0

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
CREATE TYPE registration_status  AS ENUM ('pending', 'confirmed', 'failed', 'cancelled');  -- 'cancelled' mới v1.0 (FR-34, BR-56)
CREATE TYPE ticket_status        AS ENUM ('valid', 'checked_in', 'cancelled');
CREATE TYPE sentiment_label      AS ENUM ('positive', 'negative', 'neutral');
CREATE TYPE checkin_method       AS ENUM ('qr_scan', 'self');
-- ⭐ mới, v0.3.0 — SRS BR-28b / CBR 5 (mục 5.2): 9 danh mục cố định, thay cho VARCHAR tự do.
CREATE TYPE event_category       AS ENUM (
    'academic', 'competition', 'seminar_workshop', 'career',
    'volunteer', 'arts_entertainment', 'sports', 'orientation', 'other'
);
-- ⭐ mới, v0.3.0 — SRS BR-44→46e: trạng thái lời mời Co-host, thay cho liên kết thuần hiển thị.
CREATE TYPE co_host_status       AS ENUM ('pending', 'accepted', 'declined');


-- ----------------------------------------------------------------------------
-- 3. BẢNG users
--    Tài khoản dùng chung cho Sinh viên, Ban tổ chức & Quản trị viên.
--    FR-01→07, FR-29, FR-33, FR-38.
--    ⭐ v0.3.0: FR-38 (Admin tạo tài khoản Organizer, Provisioning-based)
--    KHÔNG cần cột/bảng mới — chỉ là 1 INSERT khác nguồn gốc (do Admin gọi,
--    không phải người dùng tự đăng ký) với role='organizer' trực tiếp,
--    password_hash sinh từ mật khẩu tạm ngẫu nhiên (SRS BR-82→86).
-- ----------------------------------------------------------------------------
CREATE TABLE users (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name                  VARCHAR(150) NOT NULL,
    email                 VARCHAR(255) NOT NULL UNIQUE,
    password_hash         VARCHAR(255) NOT NULL,
    role                  user_role NOT NULL,
    avatar_url            VARCHAR(500),
    club_name             VARCHAR(150),   -- mới v1.0 (FR-38, BR-92) — chỉ có ý nghĩa với role='organizer'
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
COMMENT ON COLUMN users.social_links IS '⭐ sửa v0.3.0 — object JSONB CHỈ chứa tập khoá cố định {facebook, website, tiktok, discord, instagram, zalo}, validate ở tầng Zod (không CHECK được cấp CSDL cho khoá JSONB); ví dụ {"facebook":"...","website":"...","zalo":"..."} — FR-06, SRS BR-18';
COMMENT ON COLUMN users.club_name IS 'mới v1.0 — Tên CLB/đơn vị mà tài khoản Ban tổ chức đại diện (FR-38, BR-92). Nhập khi Admin tạo tài khoản (POST /admin/organizers), chủ tài khoản sửa được qua FR-06 (BR-17), hiển thị trên hồ sơ công khai FR-33 (BR-26), và điền sẵn cho events.club_name khi tạo sự kiện. NULL/không dùng với role=student|admin. KHÔNG phải FK — hệ thống không quản lý danh mục CLB tập trung (SRS CBR 5).';
COMMENT ON COLUMN users.is_active IS 'false = tài khoản bị Quản trị viên vô hiệu hoá (FR-29), chặn đăng nhập dù mật khẩu đúng. Việc thu hồi quyền có hiệu lực từ request kế tiếp nhờ middleware requireActive + cache Redis active:{userId} TTL 60s (SRS CBR 7, BR-98) — không chờ accessToken hết hạn.';

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
    category       event_category,  -- ⭐ sửa v0.3.0: VARCHAR(100) tự do → ENUM cố định (nullable, tuỳ chọn)
    club_name      VARCHAR(150),
    start_time     TIMESTAMPTZ NOT NULL,
    end_time       TIMESTAMPTZ NOT NULL,
    max_tickets    INTEGER NOT NULL CHECK (max_tickets > 0),
    status         event_status NOT NULL DEFAULT 'active',
    cancel_reason  TEXT,                                              -- mới v1.0 (FR-11 + FR-30, BR-106)
    cancelled_by   UUID REFERENCES users(id) ON DELETE SET NULL,      -- mới v1.0 — ai huỷ (Admin hoặc chủ sự kiện)
    cancelled_at   TIMESTAMPTZ,                                       -- mới v1.0 — thời điểm huỷ
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT chk_event_time_range CHECK (end_time > start_time),
    -- BR-106 (SRS v0.6.9): cancel_reason BẮT BUỘC 10-500 ký tự ở CẢ HAI luồng huỷ —
    -- chủ sự kiện tự huỷ (FR-11) và Admin buộc huỷ (FR-30). Vi phạm -> 422
    -- CANCEL_REASON_REQUIRED. (Bản trước ghi "FR-11 có thể để NULL" — đã bỏ ở v0.6.9
    -- vì mâu thuẫn với UI SRS 4.3.8 vốn luôn bắt buộc nhập lý do.)
    -- 3 cột vẫn NULLABLE ở tầng CSDL: sự kiện chưa huỷ thì không có gì để ghi. Ràng buộc
    -- "đã huỷ thì phải có đủ reason/by/at" kiểm ở tầng service (aggregate với status),
    -- không CHECK cứng ở CSDL để tránh chặn dữ liệu seed/migrate.
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
COMMENT ON COLUMN events.category IS 'ENUM 9 giá trị cố định (xem type event_category), tuỳ chọn/NULL = "Chưa phân loại". Không ép mặc định = other ở tầng CSDL — SRS BR-28b.';
COMMENT ON COLUMN events.club_name IS 'Đơn vị đứng tên tổ chức của TỪNG sự kiện. Mặc định điền sẵn từ users.club_name của người tạo (BR-92) nhưng sửa được — cho phép đứng tên hộ / phối hợp liên đơn vị. KHÔNG ràng buộc phải trùng users.club_name.';
COMMENT ON COLUMN events.cancel_reason IS 'mới v1.0 — Lý do huỷ sự kiện. BẮT BUỘC 10-500 ký tự khi Admin buộc huỷ (FR-30, BR-106); có thể NULL khi chủ sự kiện tự huỷ (FR-11).';
COMMENT ON COLUMN events.cancelled_by IS 'mới v1.0 — FK tới users.id: người thực hiện huỷ. ON DELETE SET NULL để không mất bản ghi sự kiện nếu tài khoản người huỷ bị xoá. Với FR-11 = chính chủ sự kiện; với FR-30 = tài khoản Admin.';
COMMENT ON COLUMN events.cancelled_at IS 'mới v1.0 — Thời điểm sự kiện chuyển sang cancelled.';

CREATE INDEX idx_events_organizer_id ON events(organizer_id);
CREATE INDEX idx_events_status ON events(status);
-- Hỗ trợ tìm kiếm/lọc theo CLB, loại hình, khoảng thời gian (FR-13)
-- ⭐ v0.3.0: category giờ là ENUM (event_category) — lọc so khớp chính xác, hiệu quả hơn VARCHAR tự do trước đây.
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
-- 7. BẢNG event_co_hosts
--    Co-host — có quyền thao tác thật (đăng thông báo/lịch trình/check-in)
--    sau khi chấp nhận lời mời. FR-37. ⭐ VIẾT LẠI TOÀN DIỆN so với v0.2.1
--    (trước đây thuần hiển thị, không có cột quyền hạn/trạng thái nào).
-- ----------------------------------------------------------------------------
CREATE TABLE event_co_hosts (
    event_id     UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status       co_host_status NOT NULL DEFAULT 'pending',  -- ⭐ mới v0.3.0
    added_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    responded_at TIMESTAMPTZ,  -- ⭐ mới v0.3.0: thời điểm accept/decline; NULL khi còn pending
    PRIMARY KEY (event_id, user_id)
);

COMMENT ON TABLE event_co_hosts IS '⭐ sửa v0.3.0: Co-host có quyền thao tác giới hạn (đăng thông báo FR-31, quản lý lịch trình FR-32, check-in FR-19→22) sau khi status=accepted — SRS BR-44→46e, CBR 6. user_id phải có role=organizer VÀ khác events.organizer_id (không tự mời chính mình — BR-45b), cả hai đều kiểm tra ở service layer vì Postgres không CHECK được tham chiếu bảng khác.';
COMMENT ON COLUMN event_co_hosts.status IS 'pending: vừa mời, CHƯA có quyền thao tác nào | accepted: đã chấp nhận, có đủ quyền Co-host | declined: đã từ chối, không có quyền. Mời lại người declined → cập nhật lại về pending (SRS BR-46, upsert theo PK event_id+user_id, KHÔNG tạo dòng trùng). Mời lại người đã accepted → từ chối ở tầng service, trả lỗi CO_HOST_ALREADY_ACCEPTED, KHÔNG tự động reset về pending (SRS BR-46 nhánh d).';
COMMENT ON COLUMN event_co_hosts.responded_at IS 'Set khi user tự PATCH .../co-hosts/me/accept hoặc /decline (SRS UC-17b, BR-46d) — dùng để hiển thị lịch sử, không dùng cho logic phân quyền (chỉ status mới quyết định quyền).';

CREATE INDEX idx_event_co_hosts_user_id ON event_co_hosts(user_id);
-- ⭐ mới v0.3.0: hỗ trợ FR-12 mở rộng (UC-13, BR-38) — truy vấn nhanh "sự kiện tôi đồng hành đã accepted"
-- và banner "lời mời đang chờ" (BR-38b) theo đúng user_id, lọc thêm theo status.
CREATE INDEX idx_event_co_hosts_user_status ON event_co_hosts(user_id, status);


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

COMMENT ON TABLE registrations IS 'Bản ghi giữ chỗ tạm, được worker xử lý thành Ticket. FR-14, FR-15, FR-16, FR-34. status: pending -> confirmed|failed (worker); confirmed -> cancelled (tự huỷ, FR-34/BR-56). failed = worker lỗi HOẶC hết TTL giữ chỗ 60s (BR-88/89, đã hoàn vé Redis). cancelled = tự huỷ (đã hoàn vé Redis + ticket=cancelled). Cả failed lẫn cancelled là trạng thái kết thúc; sinh viên được đăng ký lại (unique index chỉ chặn pending/confirmed).';

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

COMMENT ON TABLE checkin_logs IS 'Ghi nhận mỗi lần check-in hợp lệ. FR-20, FR-21, FR-22, FR-36. UNIQUE(ticket_id) là LỚP PHÒNG VỆ CUỐI CÙNG chống check-in trùng (SRS mục 5.6.2): lớp 1 = Redis SETNX checkin:{ticketId} trong luồng đồng bộ (BR-91), lớp 2 = kiểm tra ticket.status (BR-61), lớp 3 = ràng buộc UNIQUE này. Việc ghi bản ghi có thể bất đồng bộ (BR-62) vì tính đúng đắn kết quả trả về đã do lớp 1 chốt.';
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
    COUNT(r.id) FILTER (WHERE r.status = 'cancelled')        AS cancelled_count,  -- mới v1.0 (FR-34)
    COUNT(t.id) FILTER (WHERE t.status = 'checked_in')       AS checked_in_count,
    -- Chỉ 'confirmed' + 'pending' chiếm chỗ; 'failed'/'cancelled' đã hoàn vé về Redis (BR-89, BR-56).
    -- Cột này dùng ĐỐI SOÁT với bộ đếm Redis (SRS NFR-27), KHÔNG thay thế Redis.
    e.max_tickets - COUNT(r.id) FILTER (WHERE r.status IN ('confirmed', 'pending'))
                                                               AS tickets_remaining_db
    -- Lưu ý: số vé còn lại "thật" (real-time) phải đọc từ Redis theo SRS §2.2.3,
    -- cột tickets_remaining_db ở đây chỉ mang tính tham chiếu/đối soát định kỳ.
FROM events e
LEFT JOIN registrations r ON r.event_id = e.id
LEFT JOIN tickets t ON t.registration_id = r.id
GROUP BY e.id, e.title, e.max_tickets;

COMMENT ON VIEW v_event_registration_stats IS 'View tổng hợp cho Dashboard (FR-27). tickets_remaining_db chỉ dùng đối soát với Redis (NFR-27), không thay thế Redis counter.';


-- ----------------------------------------------------------------------------
-- 14. INDEX bổ trợ cho các endpoint quản trị (FR-39) — mới v1.0
-- ----------------------------------------------------------------------------
-- GET /admin/events lọc theo organizer_id + status (BR-103, BR-110); idx_events_status
-- và idx_events_organizer_id đã có, đủ dùng. GET /admin/users lọc theo role/is_active +
-- search trên name/email (BR-101). idx_users_role đã có; thêm chỉ mục hỗ trợ lọc is_active.
CREATE INDEX idx_users_is_active ON users(is_active);

-- Hỗ trợ truy vấn "sự kiện đã huỷ bởi ai" khi đối soát/audit (FR-30, BR-106) — thưa,
-- partial index để không tốn dung lượng cho phần lớn sự kiện còn active.
CREATE INDEX idx_events_cancelled_by ON events(cancelled_by) WHERE cancelled_by IS NOT NULL;


-- ----------------------------------------------------------------------------
-- 15. TÌM KIẾM TOÀN VĂN (tuỳ chọn) — phục vụ FR-13 + phép đo NFR-44
-- ----------------------------------------------------------------------------
-- idx_events_search hiện KHÔNG hỗ trợ tìm từ khoá trên title/description (FR-13 dùng
-- ILIKE '%...%'). Với dữ liệu demo, ILIKE chạy được. NFR-44 yêu cầu đo hiệu năng tìm
-- kiếm TRƯỚC và SAU khi bật pg_trgm + GIN trên 10.000 bản ghi giả lập.
-- Tách riêng thành khối bật/tắt để phục vụ phép đo (mặc định COMMENT — bật khi đo):
--
-- CREATE EXTENSION IF NOT EXISTS pg_trgm;
-- CREATE INDEX idx_events_title_trgm ON events USING GIN (title gin_trgm_ops);
-- CREATE INDEX idx_events_desc_trgm  ON events USING GIN (description gin_trgm_ops);
-- -- Đo: EXPLAIN ANALYZE SELECT ... WHERE title ILIKE '%...%' OR description ILIKE '%...%';
-- -- So sánh thời gian trước/sau, đưa biểu đồ vào báo cáo (SRS mục 5.7.4).


-- ============================================================================
-- HẾT SCRIPT TẠO MỚI.
-- ============================================================================


-- ============================================================================
-- MIGRATE INCREMENTAL v0.2.1 → v0.3.0 (⭐ mới) — dùng thay cho DROP CASCADE
-- ở đầu file NẾU instance đang chạy đã có dữ liệu thật muốn giữ lại.
-- Với môi trường dev hiện tại (Postgres pre-applied qua Docker, chưa có dữ
-- liệu thật — xem ghi chú dự án), có thể bỏ qua khối này và chạy lại toàn
-- bộ script từ đầu (DROP CASCADE) như bình thường.
-- ============================================================================

-- 1) events.category: VARCHAR tự do → ENUM cố định (BR-28b)
-- CREATE TYPE event_category AS ENUM (
--     'academic', 'competition', 'seminar_workshop', 'career',
--     'volunteer', 'arts_entertainment', 'sports', 'orientation', 'other'
-- );
-- -- Chuẩn hoá dữ liệu cũ KHÔNG khớp 9 giá trị trên về NULL trước khi đổi kiểu cột,
-- -- nếu không câu ALTER COLUMN ... USING bên dưới sẽ lỗi:
-- UPDATE events SET category = NULL
--   WHERE category IS NOT NULL AND category NOT IN (
--     'academic','competition','seminar_workshop','career',
--     'volunteer','arts_entertainment','sports','orientation','other');
-- ALTER TABLE events ALTER COLUMN category TYPE event_category USING category::event_category;

-- 2) event_co_hosts: thêm status + responded_at (BR-44→46e)
-- CREATE TYPE co_host_status AS ENUM ('pending', 'accepted', 'declined');
-- ALTER TABLE event_co_hosts ADD COLUMN status co_host_status NOT NULL DEFAULT 'pending';
-- ALTER TABLE event_co_hosts ADD COLUMN responded_at TIMESTAMPTZ;
-- CREATE INDEX idx_event_co_hosts_user_status ON event_co_hosts(user_id, status);
-- -- Lưu ý: DEFAULT 'pending' áp dụng cho cả các dòng co-host cũ đã tồn tại trước v0.3.0 —
-- -- đây là lựa chọn AN TOÀN hơn 'accepted', vì co-host kiểu cũ (thuần hiển thị) chưa từng
-- -- thật sự "chấp nhận" gì cả (khái niệm accept không tồn tại trước bản này); nếu muốn giữ
-- -- nguyên trải nghiệm cho các Co-host đã gắn từ trước, đổi thủ công từng dòng cần thiết
-- -- sang 'accepted' sau khi migrate, không nên đặt 'accepted' làm DEFAULT chung.

-- 3) users.social_links: không cần ALTER (vẫn là JSONB) — chỉ cần dọn dữ liệu cũ ở tầng
--    ứng dụng nếu muốn (đổi khoá "instagram/x/youtube/tiktok" cũ sang bộ mới
--    "facebook/website/tiktok/discord/instagram/zalo"), không bắt buộc ngay vì JSONB
--    không ràng buộc khoá ở tầng CSDL — chỉ ảnh hưởng hiển thị nếu khoá cũ còn sót lại.
-- ============================================================================


-- ============================================================================
-- MIGRATE INCREMENTAL v0.3.0 -> v1.0 (mới) — 4 thay đổi cấu trúc từ 4 đợt rà soát.
-- Với môi trường dev (Postgres pre-applied qua Docker, chưa có dữ liệu thật),
-- bỏ qua khối này và chạy lại toàn bộ script (DROP CASCADE). Dùng khi instance
-- đang chạy đã có dữ liệu muốn giữ. KHÔNG dùng `prisma migrate dev`.
-- ============================================================================

-- 1) [Đợt 1] registration_status: thêm giá trị 'cancelled' (FR-34, BR-56)
--    ALTER TYPE ... ADD VALUE không chạy được trong transaction block ở một số phiên bản;
--    chạy riêng, ngoài BEGIN/COMMIT:
-- ALTER TYPE registration_status ADD VALUE IF NOT EXISTS 'cancelled';

-- 2) [Đợt 1] users.club_name (FR-38, BR-92)
-- ALTER TABLE users ADD COLUMN club_name VARCHAR(150);

-- 3) [Đợt 2] events: 3 cột ghi vết huỷ (FR-30, BR-106)
-- ALTER TABLE events ADD COLUMN cancel_reason TEXT;
-- ALTER TABLE events ADD COLUMN cancelled_by  UUID REFERENCES users(id) ON DELETE SET NULL;
-- ALTER TABLE events ADD COLUMN cancelled_at  TIMESTAMPTZ;
-- CREATE INDEX idx_events_cancelled_by ON events(cancelled_by) WHERE cancelled_by IS NOT NULL;

-- 4) [Đợt 2/3] Index bổ trợ cho FR-39 + cập nhật view
-- CREATE INDEX idx_users_is_active ON users(is_active);
-- CREATE OR REPLACE VIEW v_event_registration_stats AS ... (thêm cancelled_count — xem mục 13).
-- ============================================================================
