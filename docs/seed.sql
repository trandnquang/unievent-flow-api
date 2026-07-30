-- ============================================================================
-- UniEvent Flow — DỮ LIỆU THỬ NGHIỆM (seed)
--
-- KHÔNG chạy file này trực tiếp bằng psql. Chạy `npm run seed` — script
-- scripts/gen-seed.ts thay 3 chỗ giữ chỗ dưới đây rồi mới thực thi, và sau đó
-- ký jwt_code cho từng vé theo end_time THẬT của sự kiện:
--
--   __PASSWORD_HASH__   bcrypt hash của mật khẩu demo dùng chung
--   __ADMIN_EMAIL__     ADMIN_SEED_EMAIL trong .env
--   __ADMIN_NAME__      ADMIN_SEED_NAME trong .env
--
-- QUY ƯỚC UUID: mọi bản ghi seed bắt đầu bằng `5eed` để bước dọn dẹp ở mục 0
-- xoá đúng dữ liệu seed và không đụng tới dữ liệu thật.
--   5eed0001 = users        5eed0002 = events        5eed0003 = event_schedule
--   5eed0004 = event_updates 5eed0005 = registrations 5eed0006 = tickets
--   5eed0007 = checkin_logs  5eed0008 = feedbacks
--
-- QUY ƯỚC THỜI GIAN: mọi mốc tính tương đối theo now(). Nếu ghi ngày tuyệt đối
-- thì các ca phụ thuộc "hiện tại" (cửa sổ tự check-in BR-95, sự kiện đang diễn
-- ra, reset_token còn hạn) sẽ hết hiệu lực chỉ sau vài giờ.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 0. DỌN DẸP — theo đúng thứ tự khoá ngoại, cho phép chạy lại nhiều lần
--
-- PHẠM VI SEED không chỉ là các bản ghi tiền tố `5eed`. Bộ kiểm thử đầu-cuối
-- (scripts/smoke.ts) tạo thêm sự kiện và tài khoản với UUID ngẫu nhiên; nếu chỉ
-- xoá theo tiền tố thì chúng ở lại và giữ khoá ngoại tới người dùng seed, khiến
-- lần chạy sau gãy ở events_organizer_id_fkey (ON DELETE RESTRICT).
--
-- Vì vậy phạm vi = (id tiền tố `5eed`) HOẶC (thuộc miền email @seed.unievent.local).
-- Mọi tài khoản do bộ test tạo đều dùng miền này.
--
-- Thứ tự: 3 bảng có khoá ngoại ON DELETE RESTRICT tới users phải được dọn TRƯỚC
-- khi xoá users — checkin_logs.organizer_id, event_updates.organizer_id, và
-- events.organizer_id. Xoá events sẽ tự CASCADE xuống registrations → tickets →
-- checkin_logs/feedbacks và event_schedule/event_updates/event_co_hosts.
-- ----------------------------------------------------------------------------
DELETE FROM checkin_logs
WHERE organizer_id IN (
    SELECT id FROM users
    WHERE id::text LIKE '5eed%' OR email LIKE '%@seed.unievent.local'
);

DELETE FROM event_updates
WHERE organizer_id IN (
    SELECT id FROM users
    WHERE id::text LIKE '5eed%' OR email LIKE '%@seed.unievent.local'
);

DELETE FROM events
WHERE id::text LIKE '5eed%'
   OR organizer_id IN (
       SELECT id FROM users
       WHERE id::text LIKE '5eed%' OR email LIKE '%@seed.unievent.local'
   );

DELETE FROM users
WHERE id::text LIKE '5eed%' OR email LIKE '%@seed.unievent.local';


-- ----------------------------------------------------------------------------
-- 1. users — FR-01→07, FR-29, FR-33, FR-38
-- ----------------------------------------------------------------------------
INSERT INTO users (id, name, email, password_hash, role, avatar_url, club_name, bio, social_links, is_active, reset_token, reset_token_expires) VALUES

-- U1 — Sinh viên hoạt động bình thường. Nhân vật chính của phần lớn luồng thử.
('5eed0001-0000-4000-8000-000000000001', 'Nguyễn Văn An', 'sv.an@seed.unievent.local',
 '__PASSWORD_HASH__', 'student', NULL, NULL, 'Sinh viên năm 3 ngành CNPM', NULL, TRUE, NULL, NULL),

-- U2 — is_active=false: đăng nhập đúng mật khẩu vẫn phải bị chặn 403 ACCOUNT_DISABLED (BR-98)
('5eed0001-0000-4000-8000-000000000002', 'Trần Thị Bình', 'sv.binh@seed.unievent.local',
 '__PASSWORD_HASH__', 'student', NULL, NULL, NULL, NULL, FALSE, NULL, NULL),

-- U3 — Ban tổ chức #1, hồ sơ ĐẦY ĐỦ: social_links dùng đúng bộ 6 khoá cố định của BR-18
-- {facebook, website, tiktok, discord, instagram, zalo}. Chủ hầu hết sự kiện seed.
('5eed0001-0000-4000-8000-000000000003', 'CLB Công nghệ Thông tin', 'btc.cntt@seed.unievent.local',
 '__PASSWORD_HASH__', 'organizer', 'https://res.cloudinary.com/demo/image/upload/v1/unieventflow/avatar-clb-cntt.png',
 'CLB Công nghệ Thông tin', 'Nơi kết nối sinh viên đam mê công nghệ — thành lập 2015',
 '{"facebook":"https://facebook.com/clbcntt","website":"https://clbcntt.edu.vn","tiktok":"https://tiktok.com/@clbcntt","discord":"https://discord.gg/clbcntt","instagram":"https://instagram.com/clbcntt","zalo":"https://zalo.me/clbcntt"}'::jsonb,
 TRUE, NULL, NULL),

-- U4 — Ban tổ chức #2. Chỉ dùng làm NGƯỜI ĐƯỢC MỜI co-host (BR-45b: khác events.organizer_id).
('5eed0001-0000-4000-8000-000000000004', 'CLB Tiếng Anh Sinh viên', 'btc.english@seed.unievent.local',
 '__PASSWORD_HASH__', 'organizer', NULL, 'CLB Tiếng Anh Sinh viên',
 'Học tiếng Anh qua hoạt động thực tế', NULL, TRUE, NULL, NULL),

-- U6 — reset_token CÒN HẠN: POST /auth/reset-password phải đổi mật khẩu thành công (FR-07)
('5eed0001-0000-4000-8000-000000000006', 'Lê Minh Cường', 'sv.cuong@seed.unievent.local',
 '__PASSWORD_HASH__', 'student', NULL, NULL, NULL, NULL, TRUE,
 'seed-reset-token-con-han-0000000000000001', now() + interval '30 minutes'),

-- U7 — reset_token HẾT HẠN: cùng endpoint phải trả 400 RESET_TOKEN_EXPIRED
('5eed0001-0000-4000-8000-000000000007', 'Phạm Thu Dung', 'sv.dung@seed.unievent.local',
 '__PASSWORD_HASH__', 'student', NULL, NULL, NULL, NULL, TRUE,
 'seed-reset-token-het-han-0000000000000002', now() - interval '1 hour'),

-- U8, U9 — sinh viên phụ, đủ để dựng các ca đăng ký/phản hồi đa dạng
('5eed0001-0000-4000-8000-000000000008', 'Hoàng Quốc Duy', 'sv.duy@seed.unievent.local',
 '__PASSWORD_HASH__', 'student', NULL, NULL, NULL, NULL, TRUE, NULL, NULL),
('5eed0001-0000-4000-8000-000000000009', 'Vũ Khánh Linh', 'sv.linh@seed.unievent.local',
 '__PASSWORD_HASH__', 'student', NULL, NULL, NULL, NULL, TRUE, NULL, NULL);

-- U5 — Quản trị viên, khớp ADMIN_SEED_EMAIL/ADMIN_SEED_NAME trong .env.
-- Tách riêng vì `npm run seed:admin` có thể đã tạo tài khoản này với id khác:
-- ON CONFLICT giữ nguyên id cũ (tránh gãy khoá ngoại) và chỉ đồng bộ lại thông tin.
-- Vì vậy MỌI tham chiếu tới admin ở dưới đều tra theo email, KHÔNG hardcode id.
INSERT INTO users (id, name, email, password_hash, role, is_active) VALUES
('5eed0001-0000-4000-8000-000000000005', '__ADMIN_NAME__', '__ADMIN_EMAIL__',
 '__PASSWORD_HASH__', 'admin', TRUE)
ON CONFLICT (email) DO UPDATE
SET name = EXCLUDED.name,
    password_hash = EXCLUDED.password_hash,
    role = 'admin',
    is_active = TRUE;


-- ----------------------------------------------------------------------------
-- 2. events — FR-08→13, FR-30
--    Ràng buộc phải tôn trọng:
--      chk_event_time_range        end_time > start_time
--      chk_event_location_fields   in_person ⇒ location NOT NULL
--                                  online    ⇒ join_url NOT NULL
--    Phủ đủ 9 giá trị của ENUM event_category.
-- ----------------------------------------------------------------------------
INSERT INTO events (id, organizer_id, title, description, cover_image, location, location_type, join_url, category, club_name, start_time, end_time, max_tickets, status, cancel_reason, cancelled_by, cancelled_at) VALUES

-- E1 [academic] ĐÃ KẾT THÚC 7 ngày trước, in_person.
-- Dùng cho: gửi/xem phản hồi (BR-67 đòi vé checked_in), và chặn huỷ → 422 EVENT_ALREADY_STARTED.
-- Vé của sự kiện này có exp = end_time + 24h nên ĐÃ HẾT HẠN → test result=expired_ticket (BR-99).
('5eed0002-0000-4000-8000-000000000001', '5eed0001-0000-4000-8000-000000000003',
 'Hội thảo Khoa học Sinh viên 2026', 'Báo cáo nghiên cứu khoa học cấp khoa.',
 NULL, 'Hội trường A1, Cơ sở 1', 'in_person', NULL, 'academic', 'CLB Công nghệ Thông tin',
 now() - interval '7 days', now() - interval '7 days' + interval '4 hours', 200, 'active', NULL, NULL, NULL),

-- E2 [career] TƯƠNG LAI +30 ngày. Sự kiện "giàu" nhất: có cover_image Cloudinary,
-- lịch trình, thông báo, co-host accepted, và các cặp đăng-ký-lại.
('5eed0002-0000-4000-8000-000000000002', '5eed0001-0000-4000-8000-000000000003',
 'Ngày hội Việc làm CNTT 2026', 'Hơn 40 doanh nghiệp tuyển dụng trực tiếp tại sân trường.',
 'https://res.cloudinary.com/demo/image/upload/v1/unieventflow/cover-job-fair-2026.jpg',
 'Sân vận động Trường', 'in_person', NULL, 'career', 'CLB Công nghệ Thông tin',
 now() + interval '30 days', now() + interval '30 days' + interval '8 hours', 500, 'active', NULL, NULL, NULL),

-- E3 [seminar_workshop] ONLINE và ĐANG TRONG CỬA SỔ tự check-in của BR-95:
-- now ∈ [start_time − 15p, end_time + 30p]. Bắt đầu 10 phút trước, kết thúc sau 50 phút.
('5eed0002-0000-4000-8000-000000000003', '5eed0001-0000-4000-8000-000000000003',
 'Webinar: Lộ trình trở thành Backend Engineer', 'Chia sẻ từ kỹ sư đang làm tại doanh nghiệp.',
 NULL, NULL, 'online', 'https://meet.google.com/seed-webinar-backend', 'seminar_workshop', 'CLB Công nghệ Thông tin',
 now() - interval '10 minutes', now() + interval '50 minutes', 300, 'active', NULL, NULL, NULL),

-- E4 [competition] HẾT VÉ HẲN: max_tickets = 2 và có đúng 2 đăng ký confirmed
-- → tickets_remaining_db = 0, đăng ký tiếp phải trả 409 SOLD_OUT.
('5eed0002-0000-4000-8000-000000000004', '5eed0001-0000-4000-8000-000000000003',
 'Cuộc thi Lập trình ACM Mở rộng', 'Thi đấu theo đội 3 người, đề theo chuẩn ICPC.',
 NULL, 'Phòng máy B2-301', 'in_person', NULL, 'competition', 'CLB Công nghệ Thông tin',
 now() + interval '14 days', now() + interval '14 days' + interval '6 hours', 2, 'active', NULL, NULL, NULL),

-- E5 [volunteer] GẦN HẾT VÉ: max_tickets = 3, đã có 2 confirmed → còn đúng 1 vé.
('5eed0002-0000-4000-8000-000000000005', '5eed0001-0000-4000-8000-000000000003',
 'Chiến dịch Mùa hè Xanh 2026', 'Tình nguyện tại các xã vùng sâu trong 2 tuần.',
 NULL, 'Điểm tập kết: Cổng chính', 'in_person', NULL, 'volunteer', 'CLB Công nghệ Thông tin',
 now() + interval '21 days', now() + interval '21 days' + interval '5 hours', 3, 'active', NULL, NULL, NULL),

-- E6 [arts_entertainment] ĐÃ HUỶ BỞI CHỦ SỰ KIỆN (FR-11, BR-106): cancelled_by = organizer.
-- cancel_reason bắt buộc 10–500 ký tự.
('5eed0002-0000-4000-8000-000000000006', '5eed0001-0000-4000-8000-000000000003',
 'Đêm nhạc Acoustic Chào Tân sinh viên', 'Đêm nhạc mở màn năm học mới.',
 NULL, 'Sân khấu ngoài trời khu B', 'in_person', NULL, 'arts_entertainment', 'CLB Công nghệ Thông tin',
 now() + interval '10 days', now() + interval '10 days' + interval '3 hours', 150, 'cancelled',
 'Ban tổ chức không kịp hoàn tất thủ tục xin phép sử dụng sân khấu ngoài trời nên phải huỷ sự kiện.',
 '5eed0001-0000-4000-8000-000000000003', now() - interval '2 days'),

-- E7 [sports] ĐÃ HUỶ BỞI QUẢN TRỊ VIÊN (FR-30, BR-96): cancelled_by tra theo email admin
-- (xem ghi chú ON CONFLICT ở mục 1 — id của admin có thể không phải id seed).
('5eed0002-0000-4000-8000-000000000007', '5eed0001-0000-4000-8000-000000000003',
 'Giải Bóng đá Sinh viên Liên khoa', 'Giải đấu thường niên giữa các khoa.',
 NULL, 'Sân bóng cỏ nhân tạo khu C', 'in_person', NULL, 'sports', 'CLB Công nghệ Thông tin',
 now() + interval '25 days', now() + interval '25 days' + interval '4 hours', 300, 'cancelled',
 'Sự kiện bị buộc huỷ do nội dung quảng bá vi phạm quy định truyền thông của Nhà trường.',
 (SELECT id FROM users WHERE email = '__ADMIN_EMAIL__'), now() - interval '1 day'),

-- E8 [orientation] Chủ sự kiện là Ban tổ chức #2 — để kiểm requireOwnerOnly chặn đúng
-- khi Ban tổ chức #1 cố sửa/huỷ sự kiện không thuộc sở hữu (403 FORBIDDEN_NOT_OWNER).
('5eed0002-0000-4000-8000-000000000008', '5eed0001-0000-4000-8000-000000000004',
 'Tuần lễ Định hướng Tân sinh viên K50', 'Giới thiệu chương trình đào tạo và đời sống sinh viên.',
 NULL, 'Hội trường lớn', 'in_person', NULL, 'orientation', 'CLB Tiếng Anh Sinh viên',
 now() + interval '45 days', now() + interval '45 days' + interval '6 hours', 800, 'active', NULL, NULL, NULL),

-- E9 [other] ONLINE, tương lai. Dùng cho lời mời co-host đang pending.
('5eed0002-0000-4000-8000-000000000009', '5eed0001-0000-4000-8000-000000000003',
 'Talkshow: Cân bằng Học tập và Cuộc sống', 'Trò chuyện cùng chuyên gia tâm lý học đường.',
 NULL, NULL, 'online', 'https://meet.google.com/seed-talkshow-balance', 'other', 'CLB Công nghệ Thông tin',
 now() + interval '5 days', now() + interval '5 days' + interval '2 hours', 400, 'active', NULL, NULL, NULL),

-- E10 [academic] IN_PERSON và ĐANG DIỄN RA (bắt đầu 10 phút trước, còn 110 phút).
-- Đây là sự kiện để test QUÉT QR THẬT: vé còn hiệu lực, chưa hết hạn, đúng loại in_person.
('5eed0002-0000-4000-8000-000000000010', '5eed0001-0000-4000-8000-000000000003',
 'Seminar Trí tuệ Nhân tạo trong Giáo dục', 'Ứng dụng LLM vào hỗ trợ giảng dạy.',
 NULL, 'Phòng hội thảo A5-201', 'in_person', NULL, 'academic', 'CLB Công nghệ Thông tin',
 now() - interval '10 minutes', now() + interval '110 minutes', 100, 'active', NULL, NULL, NULL);


-- ----------------------------------------------------------------------------
-- 3. event_schedule — FR-32, BR-43 (sort_order quyết định thứ tự hiển thị)
-- ----------------------------------------------------------------------------
INSERT INTO event_schedule (id, event_id, start_time, title, location, sort_order) VALUES
('5eed0003-0000-4000-8000-000000000001', '5eed0002-0000-4000-8000-000000000002',
 now() + interval '30 days', 'Đón khách và phát tài liệu', 'Cổng chính sân vận động', 1),
('5eed0003-0000-4000-8000-000000000002', '5eed0002-0000-4000-8000-000000000002',
 now() + interval '30 days' + interval '1 hour', 'Khai mạc và giới thiệu doanh nghiệp', 'Sân khấu trung tâm', 2),
('5eed0003-0000-4000-8000-000000000003', '5eed0002-0000-4000-8000-000000000002',
 now() + interval '30 days' + interval '3 hours', 'Phỏng vấn trực tiếp tại gian hàng', 'Khu gian hàng A–H', 3),
('5eed0003-0000-4000-8000-000000000004', '5eed0002-0000-4000-8000-000000000002',
 now() + interval '30 days' + interval '7 hours', 'Tổng kết và trao giải mini-game', 'Sân khấu trung tâm', 4);


-- ----------------------------------------------------------------------------
-- 4. event_updates — FR-31 (feed thông báo, hiển thị created_at DESC)
-- ----------------------------------------------------------------------------
INSERT INTO event_updates (id, event_id, organizer_id, title, content, created_at) VALUES
('5eed0004-0000-4000-8000-000000000001', '5eed0002-0000-4000-8000-000000000002',
 '5eed0001-0000-4000-8000-000000000003', 'Đã chốt danh sách 42 doanh nghiệp',
 'Danh sách đầy đủ kèm vị trí gian hàng đã được cập nhật trên trang sự kiện. Sinh viên nên chuẩn bị sẵn CV bản in.',
 now() - interval '3 days'),
('5eed0004-0000-4000-8000-000000000002', '5eed0002-0000-4000-8000-000000000002',
 '5eed0001-0000-4000-8000-000000000003', 'Bổ sung khu vực gửi xe miễn phí',
 'Nhà trường mở thêm bãi gửi xe khu C cho người tham dự, miễn phí trong toàn bộ thời gian diễn ra sự kiện.',
 now() - interval '1 day'),
('5eed0004-0000-4000-8000-000000000003', '5eed0002-0000-4000-8000-000000000002',
 '5eed0001-0000-4000-8000-000000000003', 'Lưu ý về trang phục',
 'Khuyến khích trang phục lịch sự vì nhiều doanh nghiệp phỏng vấn ngay tại chỗ.',
 now() - interval '6 hours');


-- ----------------------------------------------------------------------------
-- 5. event_co_hosts — FR-37, BR-44→46e
--    user_id LUÔN là Ban tổ chức #2 (U4) và luôn khác events.organizer_id (BR-45b).
--    responded_at: NULL khi còn pending, có giá trị khi đã accept/decline.
-- ----------------------------------------------------------------------------
INSERT INTO event_co_hosts (event_id, user_id, status, added_at, responded_at) VALUES
-- accepted → U4 có đủ quyền Co-host trên E2 (đăng thông báo, lịch trình, check-in)
('5eed0002-0000-4000-8000-000000000002', '5eed0001-0000-4000-8000-000000000004',
 'accepted', now() - interval '10 days', now() - interval '9 days'),
-- pending → U4 CHƯA có quyền gì trên E9; dùng test banner lời mời (BR-38b) và accept/decline
('5eed0002-0000-4000-8000-000000000009', '5eed0001-0000-4000-8000-000000000004',
 'pending', now() - interval '2 days', NULL),
-- declined → mời lại phải cập nhật về pending, không tạo dòng trùng (BR-46)
('5eed0002-0000-4000-8000-000000000005', '5eed0001-0000-4000-8000-000000000004',
 'declined', now() - interval '8 days', now() - interval '7 days');


-- ----------------------------------------------------------------------------
-- 6. registrations — FR-14→16, FR-34
--    Ràng buộc: uq_registration_active_per_user_event là UNIQUE **một phần**
--    trên (event_id, user_id) WHERE status IN ('pending','confirmed').
--    Nhờ vậy một sinh viên được đăng ký LẠI sau khi failed/cancelled — các cặp
--    R14/R15 và R16/R17 dưới đây tồn tại song song chính là bằng chứng.
-- ----------------------------------------------------------------------------
INSERT INTO registrations (id, event_id, user_id, status, requested_at, processed_at) VALUES

-- --- E1 (đã kết thúc): 5 đăng ký confirmed → 5 vé đã check-in → nền cho phản hồi
('5eed0005-0000-4000-8000-000000000001', '5eed0002-0000-4000-8000-000000000001', '5eed0001-0000-4000-8000-000000000001', 'confirmed', now() - interval '20 days', now() - interval '20 days'),
('5eed0005-0000-4000-8000-000000000002', '5eed0002-0000-4000-8000-000000000001', '5eed0001-0000-4000-8000-000000000008', 'confirmed', now() - interval '20 days', now() - interval '20 days'),
('5eed0005-0000-4000-8000-000000000003', '5eed0002-0000-4000-8000-000000000001', '5eed0001-0000-4000-8000-000000000009', 'confirmed', now() - interval '19 days', now() - interval '19 days'),
('5eed0005-0000-4000-8000-000000000004', '5eed0002-0000-4000-8000-000000000001', '5eed0001-0000-4000-8000-000000000006', 'confirmed', now() - interval '19 days', now() - interval '19 days'),
('5eed0005-0000-4000-8000-000000000005', '5eed0002-0000-4000-8000-000000000001', '5eed0001-0000-4000-8000-000000000007', 'confirmed', now() - interval '18 days', now() - interval '18 days'),

-- --- E3 (online, đang trong cửa sổ)
-- R6: vé còn `valid` → dùng để GỌI THẬT POST /tickets/:id/self-checkin và nhận 200
('5eed0005-0000-4000-8000-000000000006', '5eed0002-0000-4000-8000-000000000003', '5eed0001-0000-4000-8000-000000000001', 'confirmed', now() - interval '2 days', now() - interval '2 days'),
-- R7: đã tự check-in xong → nền cho checkin_logs method='self'
('5eed0005-0000-4000-8000-000000000007', '5eed0002-0000-4000-8000-000000000003', '5eed0001-0000-4000-8000-000000000008', 'confirmed', now() - interval '2 days', now() - interval '2 days'),

-- --- E2: đủ 4 trạng thái + 2 cặp "đăng ký lại"
('5eed0005-0000-4000-8000-000000000008', '5eed0002-0000-4000-8000-000000000002', '5eed0001-0000-4000-8000-000000000001', 'pending',   now() - interval '30 seconds', NULL),
('5eed0005-0000-4000-8000-000000000009', '5eed0002-0000-4000-8000-000000000002', '5eed0001-0000-4000-8000-000000000008', 'failed',    now() - interval '5 days', now() - interval '5 days'),
-- Cặp 1 (cancelled → confirmed): U9 tự huỷ rồi đăng ký lại thành công
('5eed0005-0000-4000-8000-000000000014', '5eed0002-0000-4000-8000-000000000002', '5eed0001-0000-4000-8000-000000000009', 'cancelled', now() - interval '6 days', now() - interval '4 days'),
('5eed0005-0000-4000-8000-000000000015', '5eed0002-0000-4000-8000-000000000002', '5eed0001-0000-4000-8000-000000000009', 'confirmed', now() - interval '3 days', now() - interval '3 days'),
-- Cặp 2 (failed → pending): U6 bị lỗi worker lần đầu, đang thử lại
('5eed0005-0000-4000-8000-000000000016', '5eed0002-0000-4000-8000-000000000002', '5eed0001-0000-4000-8000-000000000006', 'failed',    now() - interval '2 days', now() - interval '2 days'),
('5eed0005-0000-4000-8000-000000000017', '5eed0002-0000-4000-8000-000000000002', '5eed0001-0000-4000-8000-000000000006', 'pending',   now() - interval '20 seconds', NULL),

-- --- E5 (gần hết vé): đúng 2 confirmed trên max_tickets = 3
('5eed0005-0000-4000-8000-000000000010', '5eed0002-0000-4000-8000-000000000005', '5eed0001-0000-4000-8000-000000000009', 'confirmed', now() - interval '4 days', now() - interval '4 days'),
('5eed0005-0000-4000-8000-000000000011', '5eed0002-0000-4000-8000-000000000005', '5eed0001-0000-4000-8000-000000000006', 'confirmed', now() - interval '4 days', now() - interval '4 days'),

-- --- E4 (hết vé hẳn): đúng 2 confirmed trên max_tickets = 2
('5eed0005-0000-4000-8000-000000000012', '5eed0002-0000-4000-8000-000000000004', '5eed0001-0000-4000-8000-000000000001', 'confirmed', now() - interval '5 days', now() - interval '5 days'),
('5eed0005-0000-4000-8000-000000000013', '5eed0002-0000-4000-8000-000000000004', '5eed0001-0000-4000-8000-000000000008', 'confirmed', now() - interval '5 days', now() - interval '5 days'),

-- --- E6 (sự kiện bị huỷ): đăng ký GIỮ NGUYÊN confirmed, chỉ vé chuyển sang cancelled (BR-96)
('5eed0005-0000-4000-8000-000000000018', '5eed0002-0000-4000-8000-000000000006', '5eed0001-0000-4000-8000-000000000001', 'confirmed', now() - interval '9 days', now() - interval '9 days'),

-- --- E10 (đang diễn ra, in_person): 2 vé còn hiệu lực để quét QR thật
('5eed0005-0000-4000-8000-000000000019', '5eed0002-0000-4000-8000-000000000010', '5eed0001-0000-4000-8000-000000000009', 'confirmed', now() - interval '1 day', now() - interval '1 day'),
('5eed0005-0000-4000-8000-000000000020', '5eed0002-0000-4000-8000-000000000010', '5eed0001-0000-4000-8000-000000000006', 'confirmed', now() - interval '1 day', now() - interval '1 day');


-- ----------------------------------------------------------------------------
-- 7. tickets — FR-15, FR-17, FR-18, FR-34
--    jwt_code để chỗ giữ chỗ DUY NHẤT cho mỗi vé (cột NOT NULL + UNIQUE);
--    scripts/gen-seed.ts sẽ ký lại bằng TICKET_JWT_SECRET với
--    exp = end_time của sự kiện + 24h (BR-99) rồi UPDATE đè lên.
-- ----------------------------------------------------------------------------
INSERT INTO tickets (id, registration_id, jwt_code, status, issued_at) VALUES
-- E1 — 5 vé đã check-in (nền cho phản hồi). Vé đã quá hạn vì sự kiện kết thúc 7 ngày trước.
('5eed0006-0000-4000-8000-000000000001', '5eed0005-0000-4000-8000-000000000001', '__JWT_PENDING_01__', 'checked_in', now() - interval '20 days'),
('5eed0006-0000-4000-8000-000000000002', '5eed0005-0000-4000-8000-000000000002', '__JWT_PENDING_02__', 'checked_in', now() - interval '20 days'),
('5eed0006-0000-4000-8000-000000000003', '5eed0005-0000-4000-8000-000000000003', '__JWT_PENDING_03__', 'checked_in', now() - interval '19 days'),
('5eed0006-0000-4000-8000-000000000004', '5eed0005-0000-4000-8000-000000000004', '__JWT_PENDING_04__', 'checked_in', now() - interval '19 days'),
('5eed0006-0000-4000-8000-000000000005', '5eed0005-0000-4000-8000-000000000005', '__JWT_PENDING_05__', 'checked_in', now() - interval '18 days'),
-- E3 online — vé còn valid (để tự check-in thật) và vé đã checked_in (nền cho log 'self')
('5eed0006-0000-4000-8000-000000000006', '5eed0005-0000-4000-8000-000000000006', '__JWT_PENDING_06__', 'valid',      now() - interval '2 days'),
('5eed0006-0000-4000-8000-000000000007', '5eed0005-0000-4000-8000-000000000007', '__JWT_PENDING_07__', 'checked_in', now() - interval '2 days'),
-- E5 — 2 vé valid
('5eed0006-0000-4000-8000-000000000008', '5eed0005-0000-4000-8000-000000000010', '__JWT_PENDING_08__', 'valid', now() - interval '4 days'),
('5eed0006-0000-4000-8000-000000000009', '5eed0005-0000-4000-8000-000000000011', '__JWT_PENDING_09__', 'valid', now() - interval '4 days'),
-- E4 — 2 vé valid (sự kiện đã hết vé)
('5eed0006-0000-4000-8000-000000000010', '5eed0005-0000-4000-8000-000000000012', '__JWT_PENDING_10__', 'valid', now() - interval '5 days'),
('5eed0006-0000-4000-8000-000000000011', '5eed0005-0000-4000-8000-000000000013', '__JWT_PENDING_11__', 'valid', now() - interval '5 days'),
-- E2 — vé của lần đăng ký LẠI thành công (cặp cancelled → confirmed)
('5eed0006-0000-4000-8000-000000000012', '5eed0005-0000-4000-8000-000000000015', '__JWT_PENDING_12__', 'valid', now() - interval '3 days'),
-- E6 — vé bị huỷ theo sự kiện bị huỷ (BR-96): status='cancelled'
('5eed0006-0000-4000-8000-000000000013', '5eed0005-0000-4000-8000-000000000018', '__JWT_PENDING_13__', 'cancelled', now() - interval '9 days'),
-- E2 — vé bị huỷ do sinh viên TỰ HUỶ đăng ký (FR-34, BR-56)
('5eed0006-0000-4000-8000-000000000014', '5eed0005-0000-4000-8000-000000000014', '__JWT_PENDING_14__', 'cancelled', now() - interval '6 days'),
-- E10 — 2 vé valid trên sự kiện ĐANG diễn ra: quét QR ở đây mới ra result='valid'
('5eed0006-0000-4000-8000-000000000015', '5eed0005-0000-4000-8000-000000000019', '__JWT_PENDING_15__', 'valid', now() - interval '1 day'),
('5eed0006-0000-4000-8000-000000000016', '5eed0005-0000-4000-8000-000000000020', '__JWT_PENDING_16__', 'valid', now() - interval '1 day');


-- ----------------------------------------------------------------------------
-- 8. checkin_logs — FR-20, FR-21, FR-36
--    CHECK chk_checkin_method_organizer (chỉ tồn tại ở SQL):
--      checkin_method='qr_scan' ⇒ organizer_id NOT NULL
--      checkin_method='self'    ⇒ organizer_id IS NULL
-- ----------------------------------------------------------------------------
INSERT INTO checkin_logs (id, ticket_id, organizer_id, checkin_method, checkin_time) VALUES
-- qr_scan — 5 lượt quét tại cổng E1 (in_person), người quét là chủ sự kiện U3
('5eed0007-0000-4000-8000-000000000001', '5eed0006-0000-4000-8000-000000000001', '5eed0001-0000-4000-8000-000000000003', 'qr_scan', now() - interval '7 days' + interval '15 minutes'),
('5eed0007-0000-4000-8000-000000000002', '5eed0006-0000-4000-8000-000000000002', '5eed0001-0000-4000-8000-000000000003', 'qr_scan', now() - interval '7 days' + interval '18 minutes'),
('5eed0007-0000-4000-8000-000000000003', '5eed0006-0000-4000-8000-000000000003', '5eed0001-0000-4000-8000-000000000003', 'qr_scan', now() - interval '7 days' + interval '22 minutes'),
('5eed0007-0000-4000-8000-000000000004', '5eed0006-0000-4000-8000-000000000004', '5eed0001-0000-4000-8000-000000000003', 'qr_scan', now() - interval '7 days' + interval '25 minutes'),
('5eed0007-0000-4000-8000-000000000005', '5eed0006-0000-4000-8000-000000000005', '5eed0001-0000-4000-8000-000000000003', 'qr_scan', now() - interval '7 days' + interval '31 minutes'),
-- self — sinh viên tự check-in sự kiện ONLINE E3, organizer_id BẮT BUỘC là NULL
('5eed0007-0000-4000-8000-000000000006', '5eed0006-0000-4000-8000-000000000007', NULL, 'self', now() - interval '5 minutes');


-- ----------------------------------------------------------------------------
-- 9. feedbacks — FR-23→26, FR-28
--    rating CHECK BETWEEN 1 AND 5. Mọi phản hồi gắn vé đã checked_in của E1
--    (BR-67: chưa tham dự thì 422 NOT_ATTENDED).
--    Partial index idx_feedbacks_unanalyzed = (analyzed_at IS NULL AND content IS NOT NULL):
--    F1 chỉ có rating nên KHÔNG lọt vào batch FR-25; F5 thì có.
-- ----------------------------------------------------------------------------
INSERT INTO feedbacks (id, event_id, user_id, ticket_id, rating, content, sentiment_label, keywords, analyzed_at, created_at) VALUES

-- F1 — CHỈ RATING: content NULL ⇒ không tốn token phân tích, sentiment mãi NULL
('5eed0008-0000-4000-8000-000000000001', '5eed0002-0000-4000-8000-000000000001',
 '5eed0001-0000-4000-8000-000000000001', '5eed0006-0000-4000-8000-000000000001',
 5, NULL, NULL, NULL, NULL, now() - interval '6 days'),

-- F2 — đã phân tích, POSITIVE
('5eed0008-0000-4000-8000-000000000002', '5eed0002-0000-4000-8000-000000000001',
 '5eed0001-0000-4000-8000-000000000008', '5eed0006-0000-4000-8000-000000000002',
 5, 'Nội dung báo cáo rất hữu ích, diễn giả trình bày dễ hiểu và trả lời câu hỏi rất nhiệt tình.',
 'positive', 'nội dung hữu ích,diễn giả,dễ hiểu', now() - interval '5 days', now() - interval '6 days'),

-- F3 — đã phân tích, NEGATIVE
('5eed0008-0000-4000-8000-000000000003', '5eed0002-0000-4000-8000-000000000001',
 '5eed0001-0000-4000-8000-000000000009', '5eed0006-0000-4000-8000-000000000003',
 2, 'Âm thanh hội trường bị rè suốt buổi, phải chờ khá lâu ở khâu đăng ký nhận tài liệu.',
 'negative', 'âm thanh,chờ lâu,đăng ký', now() - interval '5 days', now() - interval '6 days'),

-- F4 — đã phân tích, NEUTRAL
('5eed0008-0000-4000-8000-000000000004', '5eed0002-0000-4000-8000-000000000001',
 '5eed0001-0000-4000-8000-000000000006', '5eed0006-0000-4000-8000-000000000004',
 3, 'Sự kiện diễn ra đúng lịch trình, không có gì đặc biệt so với năm ngoái.',
 'neutral', 'đúng lịch trình,bình thường', now() - interval '5 days', now() - interval '6 days'),

-- F5 — CHƯA phân tích: có content nhưng analyzed_at NULL ⇒ đúng mục tiêu của
-- POST /events/:eventId/feedbacks/analyze (FR-25). Chạy batch xong ô này phải được lấp đầy.
('5eed0008-0000-4000-8000-000000000005', '5eed0002-0000-4000-8000-000000000001',
 '5eed0001-0000-4000-8000-000000000007', '5eed0006-0000-4000-8000-000000000005',
 4, 'Phần toạ đàm cuối buổi rất đáng giá, mong năm sau kéo dài thêm thời gian hỏi đáp.',
 NULL, NULL, NULL, now() - interval '4 days');
