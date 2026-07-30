# UniEvent Flow — Backend Context (CLAUDE.md)

## Nguồn sự thật duy nhất (single source of truth)

Không tự suy đoán, không tự thêm field / endpoint / bảng / cột / enum ngoài 4 tài liệu:

- `docs/srs.md` — SRS **v0.7.2** (FR-01 → FR-42: 42 FR, 42 UC, 127 BR) — thẩm quyền nghiệp vụ cao nhất
- `docs/api_spec.md` — API **v0.5.2** (50 endpoint; contract giữa Backend ↔ Frontend)
- `docs/erd.md` — ERD **v0.4.1** (9 bảng)
- `docs/schema.sql` — SCHEMA **v0.4.1** (nguồn sự thật CSDL; `prisma/schema.prisma` chỉ là bản introspect)

Khi mâu thuẫn: về **nghiệp vụ** SRS > API > ERD; về **cấu trúc CSDL** thì `schema.sql` là chuẩn
(Prisma chỉ `db pull`, không tự định nghĩa lược đồ).

## Trạng thái hiện tại — đang HARDENING tiến tới doc v1.0.0

- Backend đã hiện thực **đủ 50/50 endpoint**; 4 tài liệu đã đồng bộ ngược để khớp mã nguồn
  (từ SRS v0.7.0 / API v0.5.0 trở đi).
- Đợt hiện tại **KHÔNG audit lại từ đầu, KHÔNG redesign** — chỉ **VERIFY** (doc ↔ code khớp thật chưa)
  và **FIX** lỗi tồn đọng theo tài liệu, rồi mới đóng mốc v1.0.0.
- Trình tự: verify doc↔code → nối & kiểm tra Gemini + Cloudinary → sửa must-fix → seed dữ liệu test
  → chạy thử toàn bộ endpoint → viết lại README → bump 4 tài liệu lên v1.0.0.

## Ràng buộc kỹ thuật cố định

- Node.js + Express + TypeScript **strict mode**.
- PostgreSQL chạy trong Docker, schema đã apply — **KHÔNG** `prisma migrate dev`,
  chỉ `npx prisma db pull` (introspect-only). Tự quản migration bằng SQL thuần.
- **Redis + BullMQ**: bộ đếm vé, khoá giữ chỗ, khoá check-in **nằm HOÀN TOÀN trên Redis**
  (không có cột PostgreSQL tương ứng — thiết kế hai pha có chủ đích, SRS §2.2.3).
- Zod validate (`exactOptionalPropertyTypes`), JWT + bcrypt.
- **LLM phân tích cảm xúc = Google Gemini** (BR-72): `GEMINI_API_KEY`, `GEMINI_MODEL`
  (mặc định `gemini-2.5-flash`). Ép JSON output theo schema; chia lô 50 phản hồi/lần gọi.
- **Lưu trữ ảnh = Cloudinary** (BR-111): `CLOUDINARY_CLOUD_NAME` / `_API_KEY` / `_API_SECRET` / `_FOLDER`.
  FR-40 chỉ trả URL; app **KHÔNG** lưu tệp nhị phân, chỉ ghi URL vào `cover_image` / `avatar_url`.
- Response envelope / mã lỗi theo `api_spec.md` §1.2–1.4; cấu trúc thư mục theo §11.
- Comment nghiệp vụ **tiếng Việt** kèm mã BR/MSG; tên biến/hàm **tiếng Anh**.

## Bẫy đã biết — PHẢI kiểm khi hardening (đừng bỏ sót)

1. **CORS đã có trong `package.json` nhưng CHƯA từng được mount** (API §1.6b) → FE không gọi
   được endpoint nào từ trình duyệt. Cấu hình qua `CORS_ORIGIN`. → must-fix.
2. **Hai ràng buộc `CHECK` chỉ tồn tại ở SQL, Prisma KHÔNG introspect được** → tầng Zod/service
   PHẢI tự chặn, nếu không lỗi CSDL thô thành **HTTP 500** thay vì lỗi nghiệp vụ rõ ràng:
   - `chk_checkin_method_organizer`: `self` ⇒ `organizer_id` NULL; `qr_scan` ⇒ NOT NULL (BR-66).
   - `feedbacks.rating BETWEEN 1 AND 5`.
3. **VIEW `v_event_registration_stats` KHÔNG có trong `schema.prisma`** → mọi truy vấn tới view
   này phải dùng `$queryRaw`, không được coi là model Prisma.
4. **Suy giảm mềm khi thiếu key ngoài**: chưa cấu hình `GEMINI_API_KEY` → luồng phân tích trả
   `503 SENTIMENT_UNAVAILABLE` (API vẫn khởi động); Cloudinary lỗi → `502 UPLOAD_FAILED` (MSG-48).
5. **`job_id` của `POST /events/:eventId/feedbacks/analyze` hiện KHÔNG poll được** (chưa có endpoint)
   — điểm còn treo, cần chốt trước v1.0.0 (bỏ `job_id`, hay thêm endpoint tra cứu).

## Quy ước casing (wire format — KHÔNG hỏi lại)

Toàn bộ field và wrapper key trong request/response body dùng **snake_case**
(`location_type`, `organizer_code`, `schedule_item`, `co_host`, `qr_token`, `checked_in_at`,
`registration_id`, `sentiment_breakdown`, `top_keywords`, `average_rating`, `is_active`, ...),
BẤT KỂ tài liệu mô tả bằng camelCase. camelCase trong văn bản tài liệu chỉ mang tính diễn giải,
không phải wire format ràng buộc.

## Nguyên tắc làm việc

- **Schema là nguồn sự thật CSDL**: không thêm hạ tầng không có chỗ dựa schema (đã bác tính năng
  bản đồ vì `location` chỉ là text, không toạ độ).
- **Phái sinh hơn thêm cột**: mã vé rút gọn, `registered_count`... suy ra ở tầng ứng dụng, tránh migrate.
- **Ma trận truy vết KHÔNG đáng tin** — verify endpoint / mã lỗi / cột trong **thân tài liệu và mã nguồn**.
- Biến thể **BR/MSG có hậu tố chữ** (BR-46e, BR-40b...) phải grep riêng — sort số sẽ gộp sai.
- Thay đổi **cross-cutting / bảo mật**: dùng **plan mode**, dừng chờ duyệt trước khi sửa.
- **Module-by-module, mỗi prompt một mối quan tâm** — không gộp nhiều concern vào một pass.
