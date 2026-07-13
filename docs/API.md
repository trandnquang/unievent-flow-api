# THIẾT KẾ API — UniEvent Flow

*Tài liệu đặc tả REST API — dùng làm API contract giữa Backend (Quang) và Frontend (Dũng)*
*Phiên bản: 1.0 — Dựa trên SRS v2.0 (FR-01 → FR-28) và ERD*

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

| Code | Ý nghĩa trong hệ thống |
| --- | --- |
| 200 | Thành công, trả dữ liệu ngay |
| 201 | Tạo mới thành công (trả về resource vừa tạo) |
| 202 | Đã nhận yêu cầu, đang xử lý bất đồng bộ (đăng ký vé, phân tích cảm xúc) |
| 204 | Thành công, không có nội dung trả về (logout) |
| 400 | Request sai định dạng / validation lỗi (chi tiết trong `error.details`) |
| 401 | Chưa đăng nhập / token hết hạn |
| 403 | Đã đăng nhập nhưng không đủ quyền (sai role hoặc không phải chủ sở hữu resource) |
| 404 | Không tìm thấy resource |
| 409 | Xung đột trạng thái (hết vé, email đã tồn tại, đã check-in rồi) |
| 422 | Request hợp lệ về cú pháp nhưng vi phạm business rule |
| 429 | Vượt rate limit |
| 500 | Lỗi hệ thống |

### 1.4 Xác thực & phân quyền

- Header: `Authorization: Bearer <accessToken>`
- JWT payload tối thiểu: `{ sub: userId, role: "student" | "organizer", iat, exp }`
- Access token hết hạn sau **2 giờ**. Không có refresh token trong phạm vi 7 tuần (đơn giản hoá — có thể ghi vào phần "Could" nếu dư thời gian).
- Middleware 2 lớp:
  - `requireAuth` — bắt buộc có token hợp lệ
  - `requireRole('organizer')` — kiểm tra role
  - `requireOwnership` — so `event.organizer_id` với `req.user.id` cho các thao tác sửa/xoá/xem báo cáo sự kiện (một Organizer không được sửa sự kiện của Organizer khác)

### 1.5 Phân trang & lọc
Query chuẩn cho mọi list endpoint: `?page=1&limit=20&sort=-created_at`
Lọc riêng theo domain (vd `?category=&club_name=&from=&to=` cho `/events`).

### 1.6 Rate limiting
Áp dụng `express-rate-limit` + store Redis (`rate-limit-redis`) — tái dùng Redis đã có sẵn cho nghiệp vụ đếm vé, không cần thêm hạ tầng. Áp cho:
- `POST /auth/login` — chống brute-force
- `POST /checkin/scan` — theo NFR-01 (≥5 lượt quét/giây/cổng vẫn phải mượt, rate limit chỉ chặn spam bất thường, không chặn quét hợp lệ)

### 1.7 Idempotency (khuyến nghị bổ sung)
`POST /events/:eventId/registrations` nên chấp nhận header tuỳ chọn `Idempotency-Key` để tránh sinh 2 Registration nếu sinh viên bấm nút đăng ký 2 lần do mạng chậm. Không bắt buộc cho MVP nhưng nên note lại vì đây đúng là loại chi tiết hội đồng hay hỏi khi thấy có Redis.

---

## 2. Nhóm Auth & Account — FR-01 → FR-07

| Method | Endpoint | Auth | FR | Mô tả |
| --- | --- | --- | --- | --- |
| POST | `/auth/register` | Public | FR-01 | Body: `{name, email, password, role}` → 201 `{user}` |
| POST | `/auth/login` | Public | FR-02 | Body: `{email, password}` → 200 `{accessToken, expiresIn, user}` |
| POST | `/auth/logout` | Auth | FR-03 | 204. Stateless JWT nên chỉ cần client xoá token; có thể bổ sung blacklist token trong Redis TTL = thời gian còn lại nếu cần "logout thật" |
| POST | `/auth/forgot-password` | Public | FR-07 | Body: `{email}` → luôn trả 202 dù email có tồn tại hay không (chống dò email) |
| POST | `/auth/reset-password` | Public | FR-07 | Body: `{token, newPassword}` → 200. `token` là `reset_token` lưu ở User, có `reset_token_expires` |
| POST | `/auth/change-password` | Auth | FR-04 | Body: `{oldPassword, newPassword}` → 200. NFR-08: hash lại bằng bcrypt trước khi lưu |
| GET | `/users/me` | Auth | FR-05 | 200 `{user}` (không trả `password_hash`) |
| PATCH | `/users/me` | Auth | FR-06 | Body: `{name, ...}` → 200 `{user}` |

**Lỗi đặc thù nhóm này:** `EMAIL_ALREADY_EXISTS` (409), `INVALID_CREDENTIALS` (401), `RESET_TOKEN_EXPIRED` (400).

---

## 3. Nhóm Quản lý sự kiện — FR-08 → FR-13

| Method | Endpoint | Auth | FR | Mô tả |
| --- | --- | --- | --- | --- |
| POST | `/events` | Organizer | FR-08 | Tạo sự kiện → 201 `{event}` |
| GET | `/events` | Public | FR-13 | Query: `q, category, club_name, from, to, page, limit` → 200 danh sách + `ticketsRemaining` mỗi item (đọc từ Redis) |
| GET | `/events/:eventId` | Public | FR-09 | 200 `{event, ticketsRemaining}` — số vé còn lại lấy real-time từ Redis, không phải PostgreSQL |
| PATCH | `/events/:eventId` | Organizer + Owner | FR-10 | 200 `{event}` |
| POST | `/events/:eventId/cancel` | Organizer + Owner | FR-11 | 200 `{event}` — đổi `status → cancelled`, **không** dùng `DELETE` vì đây là chuyển trạng thái nghiệp vụ (soft-cancel), không phải xoá dữ liệu |
| GET | `/events/mine` | Organizer | FR-12 | 200 danh sách sự kiện của chính organizer đang đăng nhập |

**Lỗi đặc thù:** `EVENT_NOT_FOUND` (404), `FORBIDDEN_NOT_OWNER` (403), `CANNOT_CANCEL_STARTED_EVENT` (422 — tuỳ rule nhóm tự quyết).

---

## 4. Nhóm Đăng ký & Vé điện tử — FR-14 → FR-18

Đây là nhóm quan trọng nhất về mặt kỹ thuật (chống oversell), nên thiết kế API phản ánh đúng luồng bất đồng bộ ở SRS mục 5.2.

| Method | Endpoint | Auth | FR | Mô tả |
| --- | --- | --- | --- | --- |
| POST | `/events/:eventId/registrations` | Student | FR-14 | Xem chi tiết luồng bên dưới |
| GET | `/registrations/:registrationId` | Owner | FR-15/16 | Polling trạng thái xử lý → 200 `{status: pending\|confirmed\|failed, ticket?}` |
| GET | `/users/me/tickets` | Student | FR-17 | 200 danh sách vé của sinh viên |
| GET | `/tickets/:ticketId` | Owner | FR-18 | 200 `{ticket, qrCodeDataUrl}` |

### Luồng `POST /events/:eventId/registrations` (bám theo SRS 5.2)

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

> Vì dự án loại bỏ push notification (out-of-scope theo SRS 1.2), polling là lựa chọn hợp lý duy nhất trong 7 tuần — không cần thêm SSE/WebSocket.

---

## 5. Nhóm Check-in tại cổng — FR-19 → FR-22

| Method | Endpoint | Auth | FR | Mô tả |
| --- | --- | --- | --- | --- |
| POST | `/checkin/scan` | Organizer | FR-19/20 | Body: `{qrToken}` → xác thực JWT bằng secret, trả kết quả **đồng bộ** trong <1s; ghi `CheckinLog` + đổi `ticket.status` có thể làm **bất đồng bộ** ngay sau khi trả response (fire-and-forget hoặc queue nhẹ) |
| GET | `/events/:eventId/checkins` | Organizer + Owner | FR-21 | 200 danh sách check-in |
| GET | `/events/:eventId/checkins/export` | Organizer + Owner | FR-22 | 200, `Content-Type: text/csv` — xuất file trực tiếp, không cần lưu file trung gian |

**Response `/checkin/scan`:**
```json
{ "success": true, "data": { "result": "valid", "attendee": { "name": "...", "eventTitle": "..." } } }
```
Các giá trị `result`: `valid` | `already_checked_in` | `invalid_signature` | `event_mismatch` | `cancelled_ticket`. Trả `result` thay vì chỉ mã HTTP giúp organizer UI hiển thị đúng loại lỗi (vé dùng lại vs vé giả) mà vẫn giữ HTTP 200 cho một request kỹ thuật hợp lệ.

---

## 6. Nhóm Feedback & Phân tích cảm xúc AI — FR-23 → FR-26, FR-28

| Method | Endpoint | Auth | FR | Mô tả |
| --- | --- | --- | --- | --- |
| POST | `/events/:eventId/feedbacks` | Student | FR-23 | Body: `{content}`. Chỉ chấp nhận nếu sinh viên có `Ticket.status = checked_in` cho sự kiện đó (điều kiện "đã tham dự") |
| GET | `/events/:eventId/feedbacks` | Organizer + Owner | FR-24 | Query `sentiment=positive\|negative\|neutral&page=&limit=` |
| POST | `/events/:eventId/feedbacks/analyze` | Organizer + Owner (hoặc job hệ thống tự động) | FR-25/26 | Gộp feedback chưa phân tích thành 1 batch, gọi LLM API → 202 `{jobId}`. Có thể kích hoạt thủ công (nút "Phân tích ngay" trên dashboard) hoặc tự động theo lịch (cron mỗi N giờ) |
| GET | `/events/:eventId/feedbacks/summary` | Organizer + Owner | FR-28 | 200 `{sentimentBreakdown: {positive, negative, neutral}, topKeywords: [{keyword, count}]}` |

---

## 7. Nhóm Dashboard — FR-27, FR-28

| Method | Endpoint | Auth | FR | Mô tả |
| --- | --- | --- | --- | --- |
| GET | `/events/:eventId/dashboard` | Organizer + Owner | FR-27/28 | 200 gộp cả 2 nhóm số liệu trong 1 lần gọi để giảm round-trip cho trang dashboard: `{ registrations: { total, confirmed, checkedIn, remaining }, sentiment: { breakdown, topKeywords } }` |

Gợi ý: tách riêng `feedbacks/summary` (mục 6) để tái sử dụng độc lập, nhưng `dashboard` gọi lại cùng service layer bên trong — tránh trùng logic, không trùng endpoint public.

---

## 8. Health check

```
GET /health  → 200 { "status": "ok", "uptime": <seconds> }
```
Dùng cho Render healthcheck khi deploy (NFR-07).

---

## 9. Bảng tổng hợp FR ↔ Endpoint

| Nhóm FR | Số lượng | Endpoint tương ứng |
| --- | --- | --- |
| 3.1 Auth (FR-01→07) | 7 | 8 endpoint (`/auth/*`, `/users/me`) |
| 3.2 Event (FR-08→13) | 6 | 6 endpoint (`/events*`) |
| 3.3 Registration/Ticket (FR-14→18) | 5 | 4 endpoint (`/registrations*`, `/tickets*`) |
| 3.4 Check-in (FR-19→22) | 4 | 3 endpoint (`/checkin*`) |
| 3.5 Feedback/AI (FR-23→26) | 4 | 4 endpoint (`/feedbacks*`) |
| 3.6 Dashboard (FR-27,28) | 2 | 1 endpoint (`/dashboard`, tái dùng `/feedbacks/summary`) |

Tổng: **28 FR → 26 endpoint REST** (một số FR nền tảng/hệ thống như FR-15, FR-16, FR-20 không có endpoint riêng vì được thực hiện bên trong luồng của endpoint cha).

---

## 10. Cấu trúc thư mục backend đề xuất

```
src/
  config/          # env, db, redis, bullmq connection
  schemas/         # zod schema — dùng chung cho validate request + sinh OpenAPI
  routes/          # express Router theo domain (auth, events, registrations, checkin, feedbacks, dashboard)
  controllers/      # nhận req, gọi service, trả response theo envelope chuẩn
  services/        # business logic (redis atomic decrement, jwt sign/verify, llm call...)
  workers/         # BullMQ worker: processRegistration, sendTicketEmail, analyzeSentiment
  middlewares/     # requireAuth, requireRole, requireOwnership, errorHandler, rateLimiter
  docs/            # openapi registry + generator (xem phần 11)
  server.ts
```

---

## 11. Đề xuất công cụ xuất API Document (tương đương Springdoc OpenAPI)

Springdoc trong Spring hoạt động theo kiểu **code-first**: đọc annotation trực tiếp trên controller/DTO, tự sinh OpenAPI spec + Swagger UI, không cần viết YAML tay. Với stack Node/Express/TypeScript hiện tại của nhóm (đã dùng **zod** để validate), có 3 lựa chọn tương đương, xếp theo mức độ phù hợp:

| Giải pháp | Cách hoạt động | Ưu điểm | Nhược điểm |
| --- | --- | --- | --- |
| **`@asteasolutions/zod-to-openapi` + `swagger-ui-express`** ⭐ khuyến nghị | Định nghĩa schema bằng zod (đã có sẵn trong stack) → gắn `.openapi()` → generator tự sinh spec từ chính schema dùng để validate | 1 nguồn sự thật duy nhất (schema = validation + docs, không lệch nhau); gần với triết lý "chỉ viết code, docs tự ra" của Springdoc | Cần đăng ký path thủ công qua `registry.registerPath()` (không quét tự động như annotation Spring) |
| `swagger-jsdoc` + `swagger-ui-express` | Viết comment JSDoc `@openapi` phía trên mỗi route, tool quét comment sinh spec | Cài nhanh, không đổi kiến trúc code hiện tại | Comment và code (zod schema) là 2 nguồn riêng biệt → dễ lệch nhau khi sửa gấp, không tận dụng được zod đã có |
| `tsoa` (decorator-based) | Viết controller dạng class + decorator (`@Route`, `@Post`, `@Body`...), tool build-time tự sinh routes **và** OpenAPI spec cùng lúc | Trải nghiệm gần Springdoc nhất (thật sự tự động, không cần đăng ký path thủ công) | Phải chuyển toàn bộ route sang class + decorator, cần bật `experimentalDecorators` — khối lượng refactor không đáng trong 7 tuần vì team đã chọn kiến trúc Express thuần |

**Khuyến nghị: dùng phương án 1.** Lý do ngắn gọn: nhóm đã có `zod` trong danh sách thư viện dự kiến dùng để validate input — tận dụng lại chính schema đó để sinh OpenAPI thay vì viết thêm một bộ định nghĩa riêng, vừa tiết kiệm thời gian (quan trọng với deadline 7 tuần), vừa đảm bảo docs không bao giờ lệch với validate thật.

Cài đặt:
```bash
npm install zod @asteasolutions/zod-to-openapi swagger-ui-express
npm install -D @types/swagger-ui-express
```
> Lưu ý version: `zod-to-openapi` bản mới nhất (≥8.x) yêu cầu **Zod v4**. Nếu team dùng Zod v3, cài `@asteasolutions/zod-to-openapi@7.3.4` và gọi `extendZodWithOpenApi(z)` một lần khi khởi động app.

Kết quả: Swagger UI phục vụ tại `GET /api-docs` (tương đương `/swagger-ui.html` của Springdoc), và JSON spec thô tại `GET /api-docs.json` — Dũng có thể dùng file này để sinh typed API client cho phía React bằng `openapi-typescript`, giúp đúng tinh thần "trao đổi API contract từ Tuần 2" đã ghi trong SRS 2.5.

Xem code mẫu minh hoạ pattern này (áp dụng cho nhóm Auth + Event + Registration, có thể nhân rộng cho các nhóm còn lại) trong thư mục `api-scaffold/` đi kèm.

---

## 12. Ghi chú cho buổi bảo vệ

Hai điểm kỹ thuật khó nhất của đề tài (chống oversell qua Redis atomic decrement, check-in <1s qua JWT tự xác thực) đều được thể hiện rõ trong thiết kế API ở mục 4 và mục 5 — có thể dùng trực tiếp 2 sequence đó làm slide giải thích kiến trúc khi phản biện.
