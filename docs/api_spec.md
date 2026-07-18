# THIẾT KẾ API — UniEvent Flow

_Tài liệu đặc tả REST API — dùng làm API contract giữa Backend (Quang) và Frontend (Dũng)_
_Phiên bản: 0.2.2 — Dựa trên SRS v0.3.1 (FR-01 → FR-37), ERD.md v0.2.0 và SCHEMA.sql v0.2.1_

---

## 0. Đổi gì so với v0.1.0 (28 FR → 37 FR)

| Nhóm                  | Thay đổi                                                                                                                                                              |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Auth & Account        | `POST /auth/register` thêm `organizerCode`; `PATCH /users/me` thêm `avatarUrl/bio/socialLinks`; thêm mới `GET /organizers/:userId` (FR-33)                            |
| Quản lý sự kiện       | `POST/PATCH /events` thêm `locationType/joinUrl`, thêm guard giảm vé; thêm mới 3 nhóm endpoint: lịch trình (FR-32), thông báo cập nhật (FR-31), CLB đồng hành (FR-37) |
| Đăng ký & Vé          | Thêm mới `POST /registrations/:registrationId/cancel` (FR-34); worker nền `sendEventReminder` (FR-35, không có endpoint)                                              |
| Check-in              | Thêm mới `POST /tickets/:ticketId/self-checkin` (FR-36) cho sự kiện online                                                                                            |
| Feedback & AI         | `POST /events/:eventId/feedbacks` đổi `content` thành tuỳ chọn, thêm `rating` bắt buộc (1–5)                                                                          |
| Dashboard             | `GET /events/:eventId/dashboard` — "Điểm phản hồi AI" nay tính bằng `AVG(feedbacks.rating)`                                                                           |
| **Quản trị hệ thống** | **Nhóm hoàn toàn mới**: vô hiệu hoá tài khoản (FR-29), buộc huỷ sự kiện (FR-30)                                                                                       |

Mã lỗi mới: `INVALID_ORGANIZER_CODE`, `ACCOUNT_DISABLED`, `MAX_TICKETS_BELOW_CONFIRMED`, `CO_HOST_NOT_ORGANIZER`, `CANNOT_CANCEL_CHECKED_IN_TICKET`, `REGISTRATION_NOT_CANCELLABLE`, `RATING_REQUIRED`, `EVENT_NOT_ONLINE`, `EVENT_ALREADY_STARTED`, `EVENT_ALREADY_CANCELLED`.

---

## 1. Nguyên tắc thiết kế chung

### 1.1 Versioning & Base URL

```
https://<host>/api/v1
```

Version nằm trên URL (không dùng header) — đơn giản, dễ debug, dễ demo trước hội đồng.

### 1.2 Định dạng response chuẩn

**Thành công:**

```json
{
  "success": true,
  "data": { ... },
  "meta": { "pagination": { "page": 1, "limit": 20, "total": 57, "totalPages": 3 } }
}
```

`meta` chỉ xuất hiện khi endpoint có phân trang.

**Lỗi:**

```json
{
  "success": false,
  "error": {
    "code": "SOLD_OUT",
    "message": "Sự kiện đã hết vé",
    "details": []
  }
}
```

`code` là mã lỗi dạng SCREAMING_SNAKE_CASE, ổn định qua thời gian — frontend dựa vào `code` để rẽ nhánh UI, không parse `message` (message có thể đổi ngôn ngữ/wording).

### 1.3 Mã trạng thái HTTP dùng thống nhất

| Code | Ý nghĩa trong hệ thống                                                                                      |
| ---- | ----------------------------------------------------------------------------------------------------------- |
| 200  | Thành công, trả dữ liệu ngay                                                                                |
| 201  | Tạo mới thành công (trả về resource vừa tạo)                                                                |
| 202  | Đã nhận yêu cầu, đang xử lý bất đồng bộ (đăng ký vé, phân tích cảm xúc)                                     |
| 204  | Thành công, không có nội dung trả về (logout)                                                               |
| 400  | Request sai định dạng / validation lỗi (chi tiết trong `error.details`)                                     |
| 401  | Chưa đăng nhập / token hết hạn                                                                              |
| 403  | Đã đăng nhập nhưng không đủ quyền (sai role, không phải chủ sở hữu resource, hoặc tài khoản bị vô hiệu hoá) |
| 404  | Không tìm thấy resource                                                                                     |
| 409  | Xung đột trạng thái (hết vé, email đã tồn tại, đã check-in rồi)                                             |
| 422  | Request hợp lệ về cú pháp nhưng vi phạm business rule                                                       |
| 429  | Vượt rate limit                                                                                             |
| 500  | Lỗi hệ thống                                                                                                |

### 1.4 Xác thực & phân quyền

- Header: `Authorization: Bearer <accessToken>`
- JWT payload tối thiểu: `{ sub: userId, role: "student" | "organizer" | "admin", iat, exp }`
- Access token hết hạn sau **2 giờ**. Không có refresh token trong phạm vi 7 tuần (đơn giản hoá).
- Middleware:
  - `requireAuth` — bắt buộc có token hợp lệ
  - `requireRole('organizer' | 'admin')` — kiểm tra role
  - `requireOwnership` — so `event.organizer_id` (hoặc `registration.user_id`, `ticket` sở hữu gián tiếp qua registration) với `req.user.id` cho các thao tác sửa/xoá/xem báo cáo (một Organizer không được sửa sự kiện của Organizer khác)
  - `requireActive` — chặn nếu `users.is_active = false` (tài khoản đã bị Quản trị viên vô hiệu hoá — FR-29), áp dụng ngay ở bước đăng nhập và có thể re-check ở middleware chung cho request đã có token cũ
- **Ngoại lệ duy nhất**: các endpoint dưới `/admin/*` dùng `requireRole('admin')` và **bỏ qua** `requireOwnership` một cách có chủ đích (ví dụ buộc huỷ sự kiện không thuộc sở hữu) — xem SRS CBR 4.

### 1.5 Phân trang & lọc

Query chuẩn cho mọi list endpoint: `?page=1&limit=20&sort=-created_at`
Lọc riêng theo domain (vd `?category=&club_name=&from=&to=` cho `/events`).

### 1.6 Rate limiting

Áp dụng `express-rate-limit` + store Redis (`rate-limit-redis`) — tái dùng Redis đã có sẵn cho nghiệp vụ đếm vé, không cần thêm hạ tầng. Áp cho:

- `POST /auth/login` — chống brute-force mật khẩu
- `POST /auth/register` — **khuyến nghị bổ sung so với v0.1.0**: vì `organizerCode` là một chuỗi tĩnh dùng chung (lưu trong `.env`), endpoint này nên bị rate-limit theo IP để chống dò `organizerCode` bằng cách đăng ký lặp lại
- `POST /checkin/scan` — theo NFR-01 (≥5 lượt quét/giây/cổng vẫn phải mượt, rate limit chỉ chặn spam bất thường, không chặn quét hợp lệ)

### 1.7 Idempotency (khuyến nghị bổ sung)

`POST /events/:eventId/registrations` nên chấp nhận header tuỳ chọn `Idempotency-Key` để tránh sinh 2 Registration nếu sinh viên bấm nút đăng ký 2 lần do mạng chậm. Áp dụng nguyên tắc tương tự cho `POST /registrations/:registrationId/cancel` và `POST /tickets/:ticketId/self-checkin` — cả hai đều là chuyển trạng thái một chiều nên có thể thiết kế **idempotent theo bản chất** (gọi lại lần 2 khi đã ở trạng thái đích không nên trả lỗi 500, mà trả lỗi nghiệp vụ rõ ràng — xem mã lỗi `REGISTRATION_NOT_CANCELLABLE` ở mục 4).

---

## 2. Nhóm Auth & Account — FR-01 → FR-07, FR-33

| Method | Endpoint                | Auth       | FR               | Mô tả                                                                                                                                                                                                                 |
| ------ | ----------------------- | ---------- | ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| POST   | `/auth/register`        | Public     | FR-01            | Body: `{name, email, password, role, organizerCode?}` → 201 `{user}`. `organizerCode` **bắt buộc** nếu `role=organizer`, so khớp với biến môi trường phía server                                                      |
| POST   | `/auth/login`           | Public     | FR-02            | Body: `{email, password}` → 200 `{accessToken, expiresIn, user}`. Chặn nếu `is_active=false`                                                                                                                          |
| POST   | `/auth/logout`          | Auth       | FR-03            | 204. Stateless JWT nên chỉ cần client xoá token                                                                                                                                                                       |
| POST   | `/auth/forgot-password` | Public     | FR-07            | Body: `{email}` → luôn trả 202 dù email có tồn tại hay không (chống dò email)                                                                                                                                         |
| POST   | `/auth/reset-password`  | Public     | FR-07            | Body: `{token, newPassword}` → 200. `token` là `reset_token` lưu ở `users`, có `reset_token_expires`                                                                                                                  |
| POST   | `/auth/change-password` | Auth       | FR-04            | Body: `{oldPassword, newPassword}` → 200. NFR-08: hash lại bằng bcrypt trước khi lưu                                                                                                                                  |
| GET    | `/users/me`             | Auth       | FR-05            | 200 `{user}` (không trả `password_hash`)                                                                                                                                                                              |
| PATCH  | `/users/me`             | Auth       | FR-06            | Body: `{name?, avatarUrl?, bio?, socialLinks?}` → 200 `{user}`. Không cho sửa `email/role/password` qua endpoint này                                                                                                  |
| GET    | `/organizers/:userId`   | **Public** | **FR-33** ⭐ mới | 200 `{organizer: {name, avatarUrl, bio, socialLinks}, events: [...]}` — chỉ trả nếu `user.role=organizer`; 404 nếu không phải hoặc không tồn tại. `events` chỉ gồm sự kiện `status=active` do organizer này phụ trách |

**Body chi tiết `PATCH /users/me`:**

```json
{
  "name": "Trần Đình Nhật Quang",
  "avatarUrl": "https://cdn.../avatar.png",
  "bio": "Backend & kiến trúc hệ thống — K47 CNPM",
  "socialLinks": {
    "instagram": "...",
    "x": "...",
    "youtube": "...",
    "tiktok": "..."
  }
}
```

`socialLinks` lưu thẳng vào cột JSONB, không validate cấu trúc chặt ở CSDL — kiểm tra ở tầng Zod schema.

**Lỗi đặc thù nhóm này:** `EMAIL_ALREADY_EXISTS` (409), `INVALID_CREDENTIALS` (401), `RESET_TOKEN_EXPIRED` (400), `INVALID_ORGANIZER_CODE` (422, ⭐ mới), `ACCOUNT_DISABLED` (403, ⭐ mới).

---

## 3. Nhóm Quản lý sự kiện — FR-08 → FR-13, FR-31, FR-32, FR-37

### 3.1 CRUD sự kiện cơ bản

| Method | Endpoint                  | Auth              | FR    | Mô tả                                                                                                                                                                                                                                                                                                           |
| ------ | ------------------------- | ----------------- | ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| POST   | `/events`                 | Organizer         | FR-08 | Body: `{title, description?, coverImage?, locationType, location?, joinUrl?, category?, clubName?, startTime, endTime, maxTickets}` → 201 `{event}`. `locationType=in_person` ⇒ `location` bắt buộc; `locationType=online` ⇒ `joinUrl` bắt buộc                                                                 |
| GET    | `/events`                 | Public            | FR-13 | Query: `q, category, club_name, from, to, page, limit` → 200 danh sách + `ticketsRemaining` mỗi item (đọc từ Redis)                                                                                                                                                                                             |
| GET    | `/events/:eventId`        | Public            | FR-09 | 200 `{event, ticketsRemaining, schedule: [...], updates: [...] (5 mới nhất), coHosts: [...]}` — số vé còn lại lấy real-time từ Redis, không phải PostgreSQL                                                                                                                                                     |
| PATCH  | `/events/:eventId`        | Organizer + Owner | FR-10 | Body: `{title?, description?, coverImage?, locationType?, location?, joinUrl?, category?, clubName?, startTime?, endTime?, maxTickets?}` (partial — chỉ gửi trường muốn sửa) → 200 `{event}`. Nếu giảm `maxTickets` xuống dưới số `registrations.status=confirmed` hiện tại → 422 `MAX_TICKETS_BELOW_CONFIRMED` |
| POST   | `/events/:eventId/cancel` | Organizer + Owner | FR-11 | 200 `{event}` — đổi `status → cancelled` (soft-cancel), **không** dùng `DELETE`. Chỉ cho phép khi `start_time > now`; nếu sự kiện đã bắt đầu/kết thúc → 422 `EVENT_ALREADY_STARTED`                                                                                                                             |
| GET    | `/events/mine`            | Organizer         | FR-12 | 200 danh sách sự kiện của chính organizer đang đăng nhập                                                                                                                                                                                                                                                        |

### 3.2 Lịch trình sự kiện — FR-32 ⭐ mới

| Method | Endpoint                                | Auth              | Mô tả                                                                                                                                                                 |
| ------ | --------------------------------------- | ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/events/:eventId/schedule`             | Public            | 200 danh sách mốc lịch trình, sắp theo `sort_order` (cũng đã nhúng sẵn trong `GET /events/:eventId`, endpoint riêng dùng khi cần tải lại độc lập, ví dụ sau khi edit) |
| POST   | `/events/:eventId/schedule`             | Organizer + Owner | Body: `{startTime, title, location?, sortOrder?}` → 201 `{scheduleItem}`                                                                                              |
| PATCH  | `/events/:eventId/schedule/:scheduleId` | Organizer + Owner | 200 `{scheduleItem}`                                                                                                                                                  |
| DELETE | `/events/:eventId/schedule/:scheduleId` | Organizer + Owner | 204                                                                                                                                                                   |

### 3.3 Thông báo cập nhật sự kiện — FR-31 ⭐ mới

| Method | Endpoint                   | Auth              | Mô tả                                                  |
| ------ | -------------------------- | ----------------- | ------------------------------------------------------ |
| GET    | `/events/:eventId/updates` | Public            | Query `page, limit` → 200 danh sách, `created_at DESC` |
| POST   | `/events/:eventId/updates` | Organizer + Owner | Body: `{title, content}` → 201 `{update}`              |

### 3.4 CLB/Ban tổ chức đồng hành — FR-37 ⭐ mới

| Method | Endpoint                            | Auth              | Mô tả                                                                                                                              |
| ------ | ----------------------------------- | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| POST   | `/events/:eventId/co-hosts`         | Organizer + Owner | Body: `{userId}` → 201 `{coHost: {id, name, avatarUrl}}`. `userId` phải có `role=organizer`, không thì 422 `CO_HOST_NOT_ORGANIZER` |
| DELETE | `/events/:eventId/co-hosts/:userId` | Organizer + Owner | 204                                                                                                                                |

Co-host **không có** endpoint chỉnh sửa quyền — theo thiết kế, bảng `event_co_hosts` không có cột quyền hạn (BR-46 trong SRS), chỉ dùng để hiển thị + click-to-profile (`GET /organizers/:userId`, mục 2).

**Lỗi đặc thù nhóm này:** `EVENT_NOT_FOUND` (404), `FORBIDDEN_NOT_OWNER` (403), `MAX_TICKETS_BELOW_CONFIRMED` (422, ⭐ mới), `CO_HOST_NOT_ORGANIZER` (422, ⭐ mới),
`EVENT_ALREADY_STARTED` (422, ⭐ mới),
`EVENT_ALREADY_CANCELLED` (409, ⭐ mới).

---

## 4. Nhóm Đăng ký & Vé điện tử — FR-14 → FR-18, FR-34, FR-35

Đây là nhóm quan trọng nhất về mặt kỹ thuật (chống oversell), nên thiết kế API phản ánh đúng luồng bất đồng bộ ở SRS mục 2.2.3 / BR-47→BR-58.

| Method | Endpoint                                | Auth            | FR               | Mô tả                                                                                                                                                                                                                                               |
| ------ | --------------------------------------- | --------------- | ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| POST   | `/events/:eventId/registrations`        | Student         | FR-14            | Xem chi tiết luồng bên dưới                                                                                                                                                                                                                         |
| GET    | `/registrations/:registrationId`        | Owner           | FR-15/16         | Polling trạng thái xử lý → 200 `{status: pending\|confirmed\|failed, ticket?}`                                                                                                                                                                      |
| POST   | `/registrations/:registrationId/cancel` | Student + Owner | **FR-34** ⭐ mới | Chỉ khi `status=confirmed` và `ticket.status=valid` → 200 `{registration, ticket}`, hoàn 1 vé về Redis. Vé đã `checked_in` → 422 `CANNOT_CANCEL_CHECKED_IN_TICKET`; registration đã `cancelled/failed/pending` → 422 `REGISTRATION_NOT_CANCELLABLE` |
| GET    | `/users/me/tickets`                     | Student         | FR-17            | 200 danh sách vé của sinh viên                                                                                                                                                                                                                      |
| GET    | `/tickets/:ticketId`                    | Owner           | FR-18            | 200 `{ticket, qrCodeDataUrl}`                                                                                                                                                                                                                       |

### Luồng `POST /events/:eventId/registrations` (bám theo SRS §2.2.3, BR-47→50)

```
1. Backend chạy lệnh giảm đếm nguyên tử trên Redis (Lua script: check + decrement 1 lần gọi)
2a. Hết vé  → trả ngay 409 { error: { code: "SOLD_OUT" } }   (không chạm PostgreSQL)
2b. Còn vé  → tạo Registration (status=pending, TTL giữ chỗ),
              đẩy job vào BullMQ,
              trả ngay 202 { data: { registrationId, status: "pending" } }
3. Worker (chạy nền) → ghi Registration=confirmed, sinh Ticket (JWT/QR),
              gửi email qua queue riêng
4. Frontend poll GET /registrations/:id (khuyến nghị mỗi 2s, tối đa ~15s)
   cho tới khi status = confirmed (trả kèm ticket) hoặc failed
```

### Luồng `POST /registrations/:registrationId/cancel` (BR-55, BR-56)

```
1. Kiểm tra ownership (registration.user_id = req.user.id) + status hiện tại
2. status ≠ confirmed          → 422 REGISTRATION_NOT_CANCELLABLE
   ticket.status = checked_in  → 422 CANNOT_CANCEL_CHECKED_IN_TICKET
3. Hợp lệ → ticket.status = cancelled (đồng bộ, trong 1 transaction)
4. Cộng lại 1 đơn vị bộ đếm vé còn lại trên Redis (đối xứng với bước giảm ở đăng ký)
5. Trả 200 ngay — không cần xử lý bất đồng bộ (khác với luồng đăng ký)
```

### Worker nền — FR-35 ⭐ mới (không có endpoint)

`workers/sendEventReminder.ts` — job BullMQ lên lịch theo `event.start_time - N giờ` (N cấu hình qua env), gửi email nhắc lịch tới toàn bộ `registrations.status=confirmed` của sự kiện đó. Đăng ký lịch chạy (`repeat` hoặc `delayed job`) ngay khi `POST /events` tạo sự kiện thành công.

**Lỗi đặc thù nhóm này:** `SOLD_OUT` (409), `CANNOT_CANCEL_CHECKED_IN_TICKET` (422, ⭐ mới), `REGISTRATION_NOT_CANCELLABLE` (422, ⭐ mới).

---

## 5. Nhóm Check-in tại cổng — FR-19 → FR-22, FR-36

| Method | Endpoint                           | Auth              | FR               | Mô tả                                                                                                                                                                                                                                             |
| ------ | ---------------------------------- | ----------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| POST   | `/checkin/scan`                    | Organizer         | FR-19/20         | Body: `{qrToken}` → xác thực JWT bằng secret, trả kết quả **đồng bộ** trong <1s; ghi `checkin_logs` + đổi `ticket.status` có thể làm **bất đồng bộ** ngay sau khi trả response. **Chỉ áp dụng cho sự kiện `location_type=in_person`** (SRS BR-60) |
| GET    | `/events/:eventId/checkins`        | Organizer + Owner | FR-21            | 200 danh sách check-in (gồm cả `checkin_method` để phân biệt quét tại cổng và tự check-in online)                                                                                                                                                 |
| GET    | `/events/:eventId/checkins/export` | Organizer + Owner | FR-22            | 200, `Content-Type: text/csv` — xuất file trực tiếp, không cần lưu file trung gian                                                                                                                                                                |
| POST   | `/tickets/:ticketId/self-checkin`  | Student + Owner   | **FR-36** ⭐ mới | Chỉ hoạt động nếu `event.location_type=online`, ngược lại 422 `EVENT_NOT_ONLINE`. Ghi `checkin_logs` với `organizer_id=NULL, checkin_method=self`, đổi `ticket.status=checked_in` → 200 `{ticket}`                                                |

**Response `/checkin/scan`:**

```json
{
  "success": true,
  "data": {
    "result": "valid",
    "attendee": { "name": "...", "eventTitle": "..." }
  }
}
```

Các giá trị `result`: `valid` | `already_checked_in` | `invalid_signature` | `event_mismatch` | `cancelled_ticket`. Trả `result` thay vì chỉ mã HTTP giúp organizer UI hiển thị đúng loại lỗi (vé dùng lại vs vé giả) mà vẫn giữ HTTP 200 cho một request kỹ thuật hợp lệ.

**Response `/tickets/:ticketId/self-checkin`:**

```json
{
  "success": true,
  "data": { "ticket": { "id": "...", "status": "checked_in" } }
}
```

Không có khái niệm `result` như luồng quét QR vì đây là hành động chủ động của chính sinh viên (không có khả năng "vé giả"/"nhầm sự kiện" như khi tổ chức quét cho người khác) — chỉ cần 200 hoặc lỗi nghiệp vụ rõ ràng.

**Lỗi đặc thù nhóm này:** `EVENT_NOT_ONLINE` (422, ⭐ mới), ngoài ra dùng chung `result` codes ở trên cho `/checkin/scan`.

---

## 6. Nhóm Feedback & Phân tích cảm xúc AI — FR-23 → FR-26, FR-28

| Method | Endpoint                             | Auth                                          | FR       | Mô tả                                                                                                                                                                                                                                                                                            |
| ------ | ------------------------------------ | --------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| POST   | `/events/:eventId/feedbacks`         | Student                                       | FR-23    | Body: `{rating, content?}`. `rating` **bắt buộc**, số nguyên 1–5; thiếu/sai khoảng → 400 `RATING_REQUIRED`. `content` **tuỳ chọn**. Chỉ chấp nhận nếu sinh viên có `ticket.status=checked_in` cho sự kiện đó (điều kiện "đã tham dự" — thoả cả với luồng quét QR lẫn tự check-in online ở FR-36) |
| GET    | `/events/:eventId/feedbacks`         | Organizer + Owner                             | FR-24    | Query `sentiment=positive\|negative\|neutral&page=&limit=`                                                                                                                                                                                                                                       |
| POST   | `/events/:eventId/feedbacks/analyze` | Organizer + Owner (hoặc job hệ thống tự động) | FR-25/26 | Gộp feedback có `content` khác rỗng và chưa phân tích (`analyzed_at IS NULL`) thành 1 batch, gọi LLM API → 202 `{jobId}`. Feedback chỉ có `rating`, không có `content`, có thể bỏ qua bước gọi LLM                                                                                               |
| GET    | `/events/:eventId/feedbacks/summary` | Organizer + Owner                             | FR-28    | 200 `{sentimentBreakdown: {positive, negative, neutral}, topKeywords: [{keyword, count}], averageRating: number}`                                                                                                                                                                                |

**Body `POST /events/:eventId/feedbacks`:**

```json
{ "rating": 5, "content": "Sự kiện tổ chức tốt, nội dung hữu ích." }
```

```json
{ "rating": 4 }
```

Ví dụ thứ hai (chỉ có `rating`, không có `content`) là hợp lệ theo FR-23 đã chốt.

**Lỗi đặc thù nhóm này:** `RATING_REQUIRED` (400, ⭐ mới), `DUPLICATE_FEEDBACK` (409 — một `ticket_id` chỉ gửi được 1 feedback), `NOT_ATTENDED` (422 — chưa `checked_in`).

---

## 7. Nhóm Dashboard — FR-27, FR-28

| Method | Endpoint                     | Auth              | FR       | Mô tả                                                                                                                                                            |
| ------ | ---------------------------- | ----------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/events/:eventId/dashboard` | Organizer + Owner | FR-27/28 | 200 gộp cả 2 nhóm số liệu trong 1 lần gọi: `{ registrations: { total, confirmed, checkedIn, remaining }, sentiment: { breakdown, topKeywords, averageRating } }` |

`registrations.remaining` đọc từ Redis (nguồn thật, real-time); `sentiment.averageRating` = `AVG(feedbacks.rating)` trên toàn bộ feedback đã gửi của sự kiện — **đây chính là chỉ số "Điểm phản hồi AI"** hiển thị trên UI, tính bằng trung bình cộng thô của `rating`, **không** suy ra từ `sentiment_label` (quyết định sản phẩm đã chốt, xem SRS BR-77).

Gợi ý: tách riêng `feedbacks/summary` (mục 6) để tái sử dụng độc lập, nhưng `dashboard` gọi lại cùng service layer bên trong — tránh trùng logic, không trùng endpoint public.

---

## 8. Nhóm Quản trị hệ thống (Admin) — FR-29, FR-30 ⭐ nhóm hoàn toàn mới

| Method | Endpoint                              | Auth  | FR    | Mô tả                                                                                                                                    |
| ------ | ------------------------------------- | ----- | ----- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| PATCH  | `/admin/users/:userId/status`         | Admin | FR-29 | Body: `{isActive: boolean}` → 200 `{user}`. `isActive=false` khiến tài khoản không đăng nhập được (dù mật khẩu đúng) từ request kế tiếp  |
| POST   | `/admin/events/:eventId/force-cancel` | Admin | FR-30 | 200 `{event}` — hành vi giống `POST /events/:eventId/cancel` (mục 3) nhưng **bỏ qua** `requireOwnership`, chỉ cần `requireRole('admin')` |

**Đề xuất bổ sung (chưa chốt trong phạm vi quyết định hiện có):** hai endpoint trên yêu cầu Admin đã biết trước `userId`/`eventId` cần thao tác, nhưng chưa có endpoint liệt kê/tìm kiếm dành riêng cho Admin (`GET /admin/users?search=&isActive=`, tương tự cho `events`). Trong lúc chờ nhóm chốt, Admin có thể tạm dùng `GET /events` (public, đã có sẵn) để tìm `eventId`; với `userId` thì hiện chưa có endpoint public nào liệt kê toàn bộ user (chỉ có `GET /organizers/:userId` theo id đã biết, mục 2) — cần bổ sung `GET /admin/users` ở vòng lặp tiếp theo nếu muốn tính năng dùng được thực tế, không chỉ đúng trên giấy.

**Lỗi đặc thù nhóm này:** dùng chung `403 FORBIDDEN` (sai role) và `404` (user/event không tồn tại); không có mã lỗi nghiệp vụ riêng vì hành động đơn giản là toggle/force.

---

## 9. Health check

```
GET /health  → 200 { "status": "ok", "uptime": <seconds> }
```

Dùng cho Render healthcheck khi deploy (NFR-07, nay là mục 6.4/6.6 trong SRS).

---

## 10. Bảng tổng hợp FR ↔ Endpoint

| Nhóm FR                                | Số lượng FR | Endpoint tương ứng                                                                                 |
| -------------------------------------- | ----------- | -------------------------------------------------------------------------------------------------- |
| Auth & Account (FR-01→07, 33)          | 8           | 9 endpoint (`/auth/*`, `/users/me`, `/organizers/:userId`)                                         |
| Quản lý sự kiện (FR-08→13, 31, 32, 37) | 9           | 14 endpoint (`/events*`, `/events/:id/schedule*`, `/events/:id/updates*`, `/events/:id/co-hosts*`) |
| Đăng ký & Vé (FR-14→18, 34, 35)        | 7           | 5 endpoint (`/registrations*`, `/tickets/:id`) + 1 worker nền không endpoint                       |
| Check-in (FR-19→22, 36)                | 5           | 4 endpoint (`/checkin/scan`, `/events/:id/checkins*`, `/tickets/:id/self-checkin`)                 |
| Feedback & AI (FR-23→26)               | 4           | 4 endpoint (`/events/:id/feedbacks*`)                                                              |
| Dashboard (FR-27, 28)                  | 2           | 1 endpoint (`/events/:id/dashboard`, tái dùng `/feedbacks/summary`)                                |
| **Quản trị hệ thống (FR-29, 30)**      | **2**       | **2 endpoint (`/admin/*`)**                                                                        |

Tổng: **37 FR → 39 endpoint REST** + 1 worker nền không lộ endpoint (FR-35) (một số FR nền tảng/hệ thống như FR-15, FR-16, FR-20, FR-26 không có endpoint riêng vì được thực hiện bên trong luồng của endpoint cha).

---

## 11. Cấu trúc thư mục backend đề xuất

```
src/
  config/          # env, db, redis, bullmq connection
  schemas/         # zod schema — dùng chung cho validate request + sinh OpenAPI
  routes/          # express Router theo domain (auth, events, registrations, checkin, feedbacks, dashboard, admin)
  controllers/      # nhận req, gọi service, trả response theo envelope chuẩn
  services/        # business logic (redis atomic decrement, jwt sign/verify, llm call...)
  workers/         # BullMQ worker: processRegistration, sendTicketEmail, sendEventReminder, analyzeSentiment
  middlewares/     # requireAuth, requireRole, requireOwnership, requireActive, errorHandler, rateLimiter
  docs/            # openapi registry + generator (xem phần 12)
  server.ts
```

So với v0.1.0, thêm `routes/admin.ts` + `middlewares/requireActive.ts`; các domain còn lại (event, registration, checkin, feedback) mở rộng thêm route con trong cùng file/router hiện có, không cần domain mới.

---

## 12. Đề xuất công cụ xuất API Document (tương đương Springdoc OpenAPI)

Springdoc trong Spring hoạt động theo kiểu **code-first**: đọc annotation trực tiếp trên controller/DTO, tự sinh OpenAPI spec + Swagger UI, không cần viết YAML tay. Với stack Node/Express/TypeScript hiện tại của nhóm (đã dùng **zod** để validate), có 3 lựa chọn tương đương, xếp theo mức độ phù hợp:

| Giải pháp                                                                  | Cách hoạt động                                                                                                                      | Ưu điểm                                                                                                                            | Nhược điểm                                                                                                                                                               |
| -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **`@asteasolutions/zod-to-openapi` + `swagger-ui-express`** ⭐ khuyến nghị | Định nghĩa schema bằng zod (đã có sẵn trong stack) → gắn `.openapi()` → generator tự sinh spec từ chính schema dùng để validate     | 1 nguồn sự thật duy nhất (schema = validation + docs, không lệch nhau); gần với triết lý "chỉ viết code, docs tự ra" của Springdoc | Cần đăng ký path thủ công qua `registry.registerPath()` (không quét tự động như annotation Spring)                                                                       |
| `swagger-jsdoc` + `swagger-ui-express`                                     | Viết comment JSDoc `@openapi` phía trên mỗi route, tool quét comment sinh spec                                                      | Cài nhanh, không đổi kiến trúc code hiện tại                                                                                       | Comment và code (zod schema) là 2 nguồn riêng biệt → dễ lệch nhau khi sửa gấp, không tận dụng được zod đã có                                                             |
| `tsoa` (decorator-based)                                                   | Viết controller dạng class + decorator (`@Route`, `@Post`, `@Body`...), tool build-time tự sinh routes **và** OpenAPI spec cùng lúc | Trải nghiệm gần Springdoc nhất (thật sự tự động, không cần đăng ký path thủ công)                                                  | Phải chuyển toàn bộ route sang class + decorator, cần bật `experimentalDecorators` — khối lượng refactor không đáng trong 7 tuần vì team đã chọn kiến trúc Express thuần |

**Khuyến nghị: dùng phương án 1.** Lý do ngắn gọn: nhóm đã có `zod` trong danh sách thư viện dự kiến dùng để validate input — tận dụng lại chính schema đó để sinh OpenAPI thay vì viết thêm một bộ định nghĩa riêng, vừa tiết kiệm thời gian (quan trọng với deadline 7 tuần), vừa đảm bảo docs không bao giờ lệch với validate thật. Với 39 endpoint (tăng từ 26), việc dùng chung 1 nguồn schema càng quan trọng hơn để tránh docs lệch khi khối lượng route tăng ~50%.

Cài đặt:

```bash
npm install zod @asteasolutions/zod-to-openapi swagger-ui-express
npm install -D @types/swagger-ui-express
```

> Lưu ý version: `zod-to-openapi` bản mới nhất (≥8.x) yêu cầu **Zod v4**. Nếu team dùng Zod v3, cài `@asteasolutions/zod-to-openapi@7.3.4` và gọi `extendZodWithOpenApi(z)` một lần khi khởi động app.

Kết quả: Swagger UI phục vụ tại `GET /api-docs` (tương đương `/swagger-ui.html` của Springdoc), và JSON spec thô tại `GET /api-docs.json` — Dũng có thể dùng file này để sinh typed API client cho phía React bằng `openapi-typescript`.

---

## 13. Ghi chú cho buổi bảo vệ

Hai điểm kỹ thuật khó nhất của đề tài (chống oversell qua Redis atomic decrement, check-in <1s qua JWT tự xác thực) đều được thể hiện rõ trong thiết kế API ở mục 4 và mục 5 — có thể dùng trực tiếp 2 sequence đó làm slide giải thích kiến trúc khi phản biện. Lưu ý riêng cho phần mở rộng 9 FR mới: NFR-01 (<1s) **chỉ áp dụng cho `/checkin/scan`** (luồng in_person), không áp dụng cho `/tickets/:ticketId/self-checkin` (luồng online, không có ràng buộc "cổng" vật lý) — cần nói rõ điểm này nếu hội đồng hỏi về hiệu năng của toàn bộ nhóm check-in.
