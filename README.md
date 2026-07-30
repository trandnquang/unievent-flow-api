# UniEvent Flow API — Hệ thống Đặt lịch Sự kiện & Check-in Học đường

> **Đồ án tốt nghiệp** — Backend hoàn chỉnh, đang đóng mốc tài liệu **v1.0.0**.
> 42 FR · **50 endpoint REST** + `GET /health` · 5 worker nền · 9 bảng PostgreSQL.

UniEvent Flow API là hệ thống backend quản lý sự kiện học đường: Ban tổ chức tạo và vận hành sự kiện, Sinh viên đăng ký nhận vé điện tử QR, nhân sự tại cổng quét vé check-in, và toàn bộ phản hồi sau sự kiện được phân tích cảm xúc bằng LLM.

Phân quyền theo **3 vai trò**:

| Vai trò | Nguồn gốc tài khoản | Phạm vi |
| :--- | :--- | :--- |
| `student` | Tự đăng ký (`POST /auth/register`) | Đăng ký sự kiện, nhận vé, tự check-in sự kiện trực tuyến, gửi phản hồi |
| `organizer` | **Chỉ** do Quản trị viên cấp (`POST /admin/organizers`) — không có đường tự đăng ký | Tạo/vận hành sự kiện của mình, mời Co-host, check-in tại cổng, xem dashboard |
| `admin` | Tạo bằng `npm run seed:admin` — không có endpoint public nào tạo được | Bật/tắt tài khoản, buộc huỷ sự kiện, cấp tài khoản Ban tổ chức, tra cứu toàn hệ thống |

Ngoài vai trò còn có hai tầng quyền sở hữu tách bạch: **`requireOwnerOnly`** cho việc không thể uỷ quyền (sửa/huỷ sự kiện, quản lý Co-host) và **`requireOwnerOrCoHost`** cho việc vận hành uỷ quyền được (thông báo, lịch trình, check-in).

---

## 🛠 Công nghệ Sử dụng

- **Runtime**: Node.js v20+ (đang phát triển trên v24)
- **Framework**: Express 5 (TypeScript `strict` + `exactOptionalPropertyTypes`)
- **ORM / Database layer**: Prisma 7 (`@prisma/client` + `@prisma/adapter-pg`) kết nối **PostgreSQL 16**
- **Validation**: Zod v4
- **Authentication & Security**: JWT (`jsonwebtoken`), Bcrypt, CORS, Rate limiting (`express-rate-limit` + store Redis)
- **Redis 7 + BullMQ**: bộ đếm vé nguyên tử, khoá giữ chỗ, khoá chống check-in trùng, 5 hàng đợi worker
- **Google Gemini** (`@google/genai`): phân tích cảm xúc phản hồi
- **Cloudinary**: lưu trữ ảnh bìa sự kiện và ảnh đại diện
- **Nodemailer**: gửi email qua worker (dev dùng Mailpit)

### Vì sao cần Redis, không chỉ PostgreSQL

Tồn kho vé sống **hoàn toàn trên Redis** — cố ý, không phải thiếu sót. PostgreSQL chỉ giữ sổ cái để đối soát qua view `v_event_registration_stats`. Ba loại khoá dưới đây **không có cột PostgreSQL tương ứng**:

| Khoá Redis | Vai trò |
| :--- | :--- |
| `event:{eventId}:tickets` | Bộ đếm vé còn lại. Giảm bằng script Lua nguyên tử để hai request đồng thời không phát dư vé (BR-47) |
| `hold:{registrationId}` | Giữ chỗ trong lúc worker xử lý; hết TTL thì job hẹn giờ hoàn vé (BR-88/89) |
| `checkin:{ticketId}` | `SET NX` chốt "vé này đã dùng" ngay trong luồng đồng bộ — hai máy quét cùng lúc chỉ một máy nhận `valid` (BR-91) |
| `idem:{userId}:{key}` | Chặn double-submit theo header `Idempotency-Key` (API §1.7) |
| `active:{userId}` | Cache trạng thái tài khoản để `requireActive` không truy vấn CSDL mỗi request (BR-98) |

⚠️ Hệ quả khi vận hành: **reset CSDL mà không dọn các khoá này sẽ để lại trạng thái mồ côi**. Ví dụ khoá `checkin:*` có TTL 24h sống sót qua lần seed sau, khiến một vé chưa hề quét vẫn trả `already_checked_in`. Script `npm run seed` đã tự dọn cả 5 nhóm khoá trên.

---

## 🏗 Kiến trúc 2 tiến trình

API **không bao giờ** chờ tác vụ chậm. Mọi việc phụ thuộc dịch vụ ngoài (SMTP, LLM) hoặc không cần trả lời ngay đều đẩy sang tiến trình worker riêng:

```text
┌────────────────┐        BullMQ (Redis)        ┌────────────────────┐
│  npm run dev   │ ───────────────────────────▶ │  npm run worker    │
│  API Express   │                              │  5 worker nền      │
│  (trả lời <1s) │ ◀─────────────────────────── │                    │
└────────────────┘         PostgreSQL           └────────────────────┘
```

| Worker | Hàng đợi | Nhiệm vụ |
| :--- | :--- | :--- |
| `emailWorker` | `email` | 5 loại email: đặt lại mật khẩu, xác nhận vé, thông báo sự kiện, mời Co-host, cấp tài khoản BTC |
| `processRegistration` | `registration` | Sinh vé JWT sau khi giữ chỗ thành công (FR-16), và bù trừ tồn kho khi quá hạn (BR-88/89/93) |
| `sendEventReminder` | `reminder` | Nhắc lịch trước giờ bắt đầu `REMINDER_LEAD_TIME_HOURS` (FR-35) |
| `writeCheckinLog` | `checkin` | Ghi `checkin_logs` **sau khi** máy quét đã nhận kết quả, giữ ràng buộc <1s (BR-62/94) |
| `analyzeSentiment` | `feedback` | Gọi Gemini phân tích cảm xúc, chia lô 50 phản hồi/lần (FR-25/26) |

**Cả hai tiến trình phải cùng chạy.** Chỉ bật `npm run dev` thì đăng ký sẽ treo ở `pending` mãi vì không ai sinh vé.

---

## 🔌 Tích hợp dịch vụ ngoài

### Google Gemini — phân tích cảm xúc (FR-25/26, BR-72)

Ép mô hình trả JSON theo `responseSchema`, mỗi phản hồi nhận một nhãn `positive|negative|neutral` và tối đa 5 từ khoá tiếng Việt.

- Thiếu `GEMINI_API_KEY` → API **vẫn khởi động bình thường**, chỉ `POST /events/:id/feedbacks/analyze` trả **503 `SENTIMENT_UNAVAILABLE`** ngay tại endpoint (không nhận job rồi thất bại lặng lẽ).
- Lỗi dịch vụ (sai khoá 401/403, sai tên model 404, hết quota 429) làm job BullMQ **failed** để hiện lên log; chỉ lỗi tạm thời của từng lô mới được bỏ qua và thử lại ở lần chạy sau.
- ⚠️ **Không dùng bí danh trôi** như `gemini-flash-latest`: Google đổi mô hình phía sau thì kết quả phân tích tự đổi mà không có thay đổi nào bên mình. Mặc định hiện tại là `gemini-3.5-flash-lite`. Họ `gemini-2.5-*` đã bị Google khoá với tài khoản mới (trả 404).

### Cloudinary — lưu trữ ảnh (FR-40, BR-111)

`POST /uploads/image` nhận `multipart/form-data` field `file`, trả về **URL công khai**. Ứng dụng **không** lưu tệp nhị phân trên máy chủ hay trong PostgreSQL — chỉ ghi URL vào `events.cover_image` / `users.avatar_url` ở một request riêng.

Kiểm hai lớp (BR-104): MIME khai báo ∈ `{image/jpeg, image/png, image/webp}`, **và** magic bytes đầu tệp phải khớp định dạng đã khai báo. Tên tệp tự sinh bằng UUID, không bao giờ dùng tên gốc do client gửi.

| Tình huống | Phản hồi |
| :--- | :--- |
| Vượt `MAX_UPLOAD_SIZE_MB` | 413 `FILE_TOO_LARGE` |
| Sai MIME / magic bytes không khớp | 422 `INVALID_FILE_TYPE` |
| Không gửi tệp | 400 `BAD_REQUEST` |
| Cloudinary lỗi hoặc chưa cấu hình | 502 `UPLOAD_FAILED` — **không** tạo bản ghi nào |

---

## 📦 Hướng dẫn Cài đặt & Chạy Dự án

### 1. Dựng hạ tầng bằng Docker

```bash
docker compose up -d      # postgres:16 · redis:7 · mailpit
```

Ba container: `unievent_postgres` (5432), `unievent_redis` (6379), `unievent_mailpit` (SMTP 1025, giao diện web **[localhost:8025](http://localhost:8025)**).

### 2. Chuẩn bị `.env`

```bash
cp .env.example .env
```

`.env.example` đã liệt kê **đủ 30 biến** kèm giải thích. Bảng dưới nhóm theo mục đích; cột "Bắt buộc" đánh dấu biến không có giá trị mặc định.

| Biến | Bắt buộc | Mặc định | Vai trò |
| :--- | :---: | :--- | :--- |
| `PORT` | | `3000` | Cổng API |
| `DATABASE_URL` | ✅ | — | Chuỗi kết nối PostgreSQL |
| `REDIS_URL` | ✅ | — | Chuỗi kết nối Redis |
| `JWT_SECRET` | ✅ | — | Khoá ký access token (tối thiểu 10 ký tự) |
| `JWT_EXPIRES_IN` | | `7200` | Hạn access token, **tính bằng GIÂY** (7200 = 2 giờ) |
| `TICKET_JWT_SECRET` | ✅ | — | Khoá ký JWT của **vé**. **Phải khác `JWT_SECRET`** — vé sống tới `end_time+24h` và bị in ra QR phát tán công khai, tách khoá để lộ vé không kéo theo giả mạo phiên đăng nhập |
| `CORS_ORIGIN` | | `http://localhost:5173` | Danh sách origin cho phép, phân tách bằng dấu phẩy |
| `SMTP_HOST` / `SMTP_PORT` | | `localhost` / `1025` | Máy chủ SMTP (mặc định trỏ Mailpit) |
| `SMTP_USER` / `SMTP_PASS` | | *(rỗng)* | Bỏ trống nếu SMTP không yêu cầu xác thực |
| `SMTP_FROM` | | `UniEvent Flow <no-reply@unievent.local>` | Địa chỉ gửi |
| `APP_RESET_URL` | | `…:5173/reset-password` | Trang FE đặt lại mật khẩu (FR-07) |
| `APP_EVENT_URL` | | `…:5173/events` | Trang FE chi tiết sự kiện (FR-31, BR-46b) |
| `APP_TICKET_URL` | | `…:5173/tickets` | Trang FE xem vé (FR-18) |
| `APP_LOGIN_URL` | | `…:5173/login` | Trang FE đăng nhập — email cấp tài khoản BTC trỏ về đây (FR-38) |
| `REGISTRATION_HOLD_TTL_SECONDS` | | `60` | Thời gian giữ chỗ chờ worker xử lý (BR-88) |
| `CHECKIN_LOCK_TTL_SECONDS` | | `86400` | TTL khoá chống check-in trùng (BR-91) — khớp biên hết hạn vé |
| `ACTIVE_CACHE_TTL_SECONDS` | | `60` | TTL cache trạng thái tài khoản (BR-98) |
| `REMINDER_LEAD_TIME_HOURS` | | `24` | Gửi email nhắc lịch trước giờ bắt đầu bao nhiêu giờ (BR-57) |
| `GEMINI_API_KEY` | | *(rỗng)* | Thiếu thì luồng phân tích trả 503, API vẫn chạy |
| `GEMINI_MODEL` | | `gemini-3.5-flash-lite` | Tên mô hình — **đừng dùng bí danh trôi** |
| `CLOUDINARY_CLOUD_NAME` / `_API_KEY` / `_API_SECRET` | | *(rỗng)* | Thiếu thì upload trả 502, API vẫn chạy |
| `CLOUDINARY_FOLDER` | | `unievent` | Thư mục đích trên Cloudinary |
| `MAX_UPLOAD_SIZE_MB` | | `5` | Dung lượng ảnh tối đa (BR-104) |
| `ADMIN_SEED_EMAIL` / `_PASSWORD` / `_NAME` | | — | **Chỉ** `npm run seed:admin` đọc 3 biến này |

### 3. Cài đặt & sinh Prisma Client

```bash
npm install
npx prisma generate
```

> ⚠️ **`docs/schema.sql` là nguồn sự thật của CSDL, không phải `prisma/schema.prisma`.**
> Lược đồ được quản lý bằng SQL thuần; Prisma chỉ dùng ở chế độ **introspect-only**:
>
> ```bash
> npx prisma db pull      # ĐÚNG — đọc ngược lược đồ từ CSDL đang chạy
> npx prisma migrate dev  # ❌ TUYỆT ĐỐI KHÔNG — sẽ ghi đè lược đồ thật
> ```
>
> Hai hệ quả cần nhớ: Prisma **không** biểu diễn được `CHECK` constraint (nên tầng Zod/service phải tự chặn, nếu không lỗi CSDL thô thành HTTP 500), và view `v_event_registration_stats` **không** phải model Prisma — mọi truy vấn tới nó phải dùng `$queryRaw`.

### 4. Kiểm tra kết nối 4 dịch vụ

```bash
npm run check:connections
```

Gọi thật PostgreSQL (kèm đọc view), Redis, Gemini (một lượt `generateContent` ép JSON) và Cloudinary (ping + upload/xoá ảnh 1×1), in bảng PASS/FAIL kèm độ trễ. Thoát với mã ≠ 0 nếu có dịch vụ hỏng. Không in giá trị khoá bí mật ra log.

Đây là bước nên chạy **đầu tiên khi có sự cố**, để tách bạch "sai cấu hình" khỏi "sai mã nguồn".

### 5. Nạp dữ liệu

```bash
npm run seed:admin   # tạo tài khoản Quản trị viên đầu tiên từ ADMIN_SEED_*
npm run seed         # nạp docs/seed.sql + ký JWT vé + dựng lại khoá Redis
```

`npm run seed` **idempotent** — chạy lại bao nhiêu lần cũng cho cùng một kết quả. Nó thực hiện 3 việc mà SQL thuần không làm được: băm bcrypt mật khẩu demo, ký `jwt_code` cho từng vé theo `end_time` thật của sự kiện (BR-99), và dọn + dựng lại toàn bộ khoá Redis.

Dữ liệu mẫu phủ 10 sự kiện (đủ 9 danh mục, có sự kiện đã kết thúc / đang diễn ra / hết vé / đã huỷ), 9 tài khoản, 20 đăng ký đủ 4 trạng thái, 16 vé, 5 phản hồi. **Mật khẩu demo cho mọi tài khoản seed: `Password123!`**

### 6. Khởi chạy

Cần **hai terminal**:

```bash
npm run dev      # terminal 1 — API Express, hot-reload bằng tsx
npm run worker   # terminal 2 — 5 worker nền
```

Môi trường production:

```bash
npm run build
npm run start
```

### 7. Kiểm thử

```bash
npx tsc --noEmit   # kiểm kiểu tĩnh
npm run smoke      # gọi thật toàn bộ 50 endpoint
```

`npm run smoke` **luôn tự chạy `npm run seed` trước** — bắt buộc, vì bộ test thay đổi trạng thái thật (dùng `reset_token` một lần, check-in vé, huỷ sự kiện, gán nhãn cảm xúc). Chạy trên CSDL đã bẩn sẽ cho hàng loạt FAIL giả.

Mỗi lời gọi kiểm 3 lớp: HTTP status · envelope `{success, data, meta}` · **quét đệ quy mọi khoá trong body để bắt camelCase**. Ngoài ra có 8 ca lỗi nghiệp vụ tiêu biểu và 2 luồng bất đồng bộ chạy thật (đăng ký → vé phát ra; phân tích cảm xúc → summary đổi số) với Gemini và Cloudinary dùng khoá thật.

---

## 🏛 Cấu trúc Thư mục

```text
docs/                       # 4 tài liệu nguồn sự thật + seed.sql
├── srs.md                  # Nghiệp vụ — thẩm quyền cao nhất
├── api_spec.md             # Contract Backend ↔ Frontend
├── erd.md                  # Quan hệ dữ liệu
├── schema.sql              # Nguồn sự thật CSDL
└── seed.sql                # Dữ liệu thử nghiệm (idempotent)

scripts/
├── seedAdmin.ts            # Tạo tài khoản Quản trị viên đầu tiên
├── gen-seed.ts             # Nạp seed.sql + bcrypt + ký JWT vé + dựng khoá Redis
├── smoke.ts                # Kiểm thử đầu-cuối 50 endpoint
└── check-connections.ts    # Kiểm kết nối PostgreSQL/Redis/Gemini/Cloudinary

src/
├── config/                 # env (Zod), db (Prisma), redis (ioredis + Lua), bullmq, queues, cloudinary
├── schemas/                # Zod schema — validate request, đồng thời chặn các CHECK mà Prisma không biểu diễn
├── middlewares/            # requireAuth · requireActive · requireRole · requireOwnerOnly ·
│                           # requireOwnerOrCoHost · errorHandler · 5 rate limiter
├── controllers/            # Nhận request, gọi service, trả envelope chuẩn (11 file)
├── services/               # Nghiệp vụ (17 file) — Redis atomic decrement, ký JWT vé, gọi LLM…
├── workers/                # 5 worker BullMQ + điểm khởi động riêng
├── routes/                 # Router theo domain, mount dưới /api/v1
├── redis/scripts.ts        # Lua script cho thao tác nguyên tử trên bộ đếm vé
├── utils/                  # AppError · CSV (RFC 4180) · QR · kiểm magic bytes ảnh · validation
├── app.ts                  # Express app — CORS đứng trước mọi handler
└── server.ts               # Khởi động + Graceful Shutdown
```

---

## 🚀 Danh sách 50 Endpoint

Toàn bộ đã được `npm run smoke` gọi thật và **PASS 95/95** phép kiểm (bao gồm cả ca lỗi).

**Envelope chuẩn** (API §1.2) — thành công:

```json
{ "success": true, "data": { }, "meta": { "pagination": { } } }
```

Lỗi:

```json
{ "success": false, "error": { "code": "SOLD_OUT", "message": "…", "details": [] } }
```

> **Wire format là `snake_case` tuyệt đối** — mọi field và wrapper key trong request/response body (`qr_token`, `checked_in_at`, `registration_id`, `co_host`, `schedule_item`, `access_token`…). Tài liệu API mô tả một số chỗ bằng camelCase, đó chỉ là văn bản diễn giải, không phải wire format.

Base URL: `/api/v1` (trừ `/health`).

### 0. Hệ thống

| Method | Endpoint | Quyền |
| :--- | :--- | :--- |
| **GET** | `/health` | Public |

### 1. Auth & Tài khoản — 6 endpoint

| Method | Endpoint | FR | Mô tả | Quyền |
| :--- | :--- | :--- | :--- | :--- |
| **POST** | `/auth/register` | FR-01 | Đăng ký tài khoản Sinh viên | Public · 3 lần/giờ/IP |
| **POST** | `/auth/login` | FR-02 | Đăng nhập, trả `access_token` + `expires_in` | Public · 5 lần/phút/IP |
| **POST** | `/auth/logout` | FR-03 | Đăng xuất → 204 | Auth |
| **POST** | `/auth/forgot-password` | FR-07 | Yêu cầu token khôi phục → 202 | Public |
| **POST** | `/auth/reset-password` | FR-07 | Đặt lại mật khẩu bằng `reset_token` | Public |
| **POST** | `/auth/change-password` | FR-04 | Đổi mật khẩu — body `{old_password, new_password}` | Auth |

### 2. Hồ sơ người dùng — 5 endpoint

| Method | Endpoint | FR | Mô tả | Quyền |
| :--- | :--- | :--- | :--- | :--- |
| **GET** | `/users/me` | FR-05 | Hồ sơ của chính mình | Auth |
| **PATCH** | `/users/me` | FR-06 | Cập nhật `name`, `avatar_url`, `bio`, `social_links`, `club_name` | Auth |
| **GET** | `/users/me/tickets` | FR-17 | Danh sách vé của chính Sinh viên | Student |
| **GET** | `/users/me/feedbacks` | FR-42 | Phản hồi đã gửi | Student |
| **GET** | `/organizers/:userId` | FR-33 | Hồ sơ công khai của Ban tổ chức | Public |

### 3. Quản lý sự kiện — 6 endpoint

| Method | Endpoint | FR | Mô tả | Quyền |
| :--- | :--- | :--- | :--- | :--- |
| **GET** | `/events` | FR-13 | Lọc `q`, `category`, `club_name`, `from`, `to` + phân trang | Public |
| **POST** | `/events` | FR-08 | Tạo sự kiện | Organizer |
| **GET** | `/events/:eventId` | FR-09 | Chi tiết kèm lịch trình, 5 thông báo mới nhất, Co-host, số vé còn lại | Public |
| **PATCH** | `/events/:eventId` | FR-10 | Cập nhật sự kiện | Organizer + Owner |
| **POST** | `/events/:eventId/cancel` | FR-11 | Huỷ mềm — `reason` bắt buộc 10–500 ký tự | Organizer + Owner |
| **GET** | `/events/mine` | FR-12 | Trả `{owned, co_hosting, pending_invitations}` | Organizer |

### 4. Lịch trình sự kiện — 4 endpoint (FR-32)

| Method | Endpoint | Mô tả | Quyền |
| :--- | :--- | :--- | :--- |
| **GET** | `/events/:eventId/schedule` | Danh sách mốc, sắp theo `sort_order` | Public |
| **POST** | `/events/:eventId/schedule` | Thêm mốc → 201 `{schedule_item}` | Owner-or-CoHost |
| **PATCH** | `/events/:eventId/schedule/:scheduleId` | Sửa mốc | Owner-or-CoHost |
| **DELETE** | `/events/:eventId/schedule/:scheduleId` | Xoá mốc → 204 | Owner-or-CoHost |

### 5. Thông báo sự kiện — 4 endpoint (FR-31)

| Method | Endpoint | Mô tả | Quyền |
| :--- | :--- | :--- | :--- |
| **GET** | `/events/:eventId/updates` | Feed thông báo, `created_at DESC` | Public |
| **POST** | `/events/:eventId/updates` | Đăng thông báo → 201, đẩy job gửi email | Owner-or-CoHost |
| **PATCH** | `/events/:eventId/updates/:updateId` | Sửa nội dung — **không** gửi lại email | Owner-or-CoHost |
| **DELETE** | `/events/:eventId/updates/:updateId` | Gỡ khỏi feed → 204 | Owner-or-CoHost |

### 6. Co-host — 5 endpoint (FR-37)

| Method | Endpoint | Mô tả | Quyền |
| :--- | :--- | :--- | :--- |
| **GET** | `/events/:eventId/co-hosts` | Đủ cả 3 trạng thái `pending`/`accepted`/`declined` | Organizer + Owner |
| **POST** | `/events/:eventId/co-hosts` | Mời Co-host (upsert 4 nhánh) | Owner · 10 lần/giờ/user |
| **PATCH** | `/events/:eventId/co-hosts/me/accept` | Người được mời tự chấp nhận | Organizer được mời |
| **PATCH** | `/events/:eventId/co-hosts/me/decline` | Người được mời tự từ chối | Organizer được mời |
| **DELETE** | `/events/:eventId/co-hosts/:userId` | Gỡ Co-host → 204 | Organizer + Owner |

### 7. Đăng ký & Vé điện tử — 4 endpoint

| Method | Endpoint | FR | Mô tả | Quyền |
| :--- | :--- | :--- | :--- | :--- |
| **POST** | `/events/:eventId/registrations` | FR-14 | Giữ vé → **202** `{registration_id, status}`. Nhận header tuỳ chọn `Idempotency-Key` | Student |
| **GET** | `/registrations/:registrationId` | FR-15/16 | Poll trạng thái xử lý | Owner |
| **POST** | `/registrations/:registrationId/cancel` | FR-34 | Tự huỷ đăng ký, hoàn vé về Redis | Student + Owner |
| **GET** | `/tickets/:ticketId` | FR-18 | Chi tiết vé kèm `qr_code_data_url` (PNG base64) | Owner |

### 8. Người tham gia — 1 endpoint

| Method | Endpoint | FR | Mô tả | Quyền |
| :--- | :--- | :--- | :--- | :--- |
| **GET** | `/events/:eventId/registrations` | FR-41 | `{items: [{user_id, name, email, registered_at, reg_status, checkin_status}]}`. ⚠️ Trả email (PII) | Owner-or-CoHost |

### 9. Check-in — 4 endpoint

| Method | Endpoint | FR | Mô tả | Quyền |
| :--- | :--- | :--- | :--- | :--- |
| **POST** | `/events/:eventId/checkin/scan` | FR-19/20 | Quét QR — body `{qr_token}`, trả **đồng bộ** `result` ∈ `valid` / `already_checked_in` / `invalid_signature` / `event_mismatch` / `cancelled_ticket` / `expired_ticket`. Chỉ cho `in_person` | Owner-or-CoHost · 20 lần/giây |
| **GET** | `/events/:eventId/checkins` | FR-21 | Lịch sử check-in | Owner-or-CoHost |
| **GET** | `/events/:eventId/checkins/export` | FR-22 | Xuất CSV **RFC 4180 kèm BOM UTF-8** (mọi ô bọc nháy kép, CRLF) để Excel đọc đúng tiếng Việt | Owner-or-CoHost |
| **POST** | `/tickets/:ticketId/self-checkin` | FR-36 | Tự check-in sự kiện **trực tuyến**. Body **rỗng** — server tự ghi `checkin_time`, không nhận mốc thời gian nào từ client. Chỉ mở trong `[start−15p, end+30p]` | Student + Owner |

### 10. Phản hồi & Phân tích cảm xúc — 4 endpoint

| Method | Endpoint | FR | Mô tả | Quyền |
| :--- | :--- | :--- | :--- | :--- |
| **POST** | `/events/:eventId/feedbacks` | FR-23 | Gửi phản hồi — `rating` 1–5 bắt buộc, `content` tuỳ chọn ≤500 ký tự. Đòi vé đã `checked_in` | Student |
| **GET** | `/events/:eventId/feedbacks` | FR-24 | Danh sách, lọc theo `sentiment` | Organizer + Owner |
| **POST** | `/events/:eventId/feedbacks/analyze` | FR-25/26 | Kích hoạt phân tích → **202**, worker gọi Gemini | Organizer + Owner |
| **GET** | `/events/:eventId/feedbacks/summary` | FR-28 | `{sentiment_breakdown, top_keywords, average_rating, total_feedbacks}` | Organizer + Owner |

### 11. Dashboard — 1 endpoint

| Method | Endpoint | FR | Mô tả | Quyền |
| :--- | :--- | :--- | :--- | :--- |
| **GET** | `/events/:eventId/dashboard` | FR-27/28 | Số liệu đăng ký (đọc từ Redis, đối soát qua view) + tổng hợp cảm xúc | Organizer + Owner |

### 12. Quản trị hệ thống — 5 endpoint

| Method | Endpoint | FR | Mô tả | Quyền |
| :--- | :--- | :--- | :--- | :--- |
| **PATCH** | `/admin/users/:userId/status` | FR-29 | Bật/tắt tài khoản, xoá cache ngay để thu hồi quyền có hiệu lực từ request kế tiếp | Admin |
| **POST** | `/admin/events/:eventId/force-cancel` | FR-30 | Buộc huỷ — huỷ được cả sự kiện đang diễn ra | Admin |
| **POST** | `/admin/organizers` | FR-38 | **Con đường duy nhất** tạo tài khoản `organizer`; mật khẩu tạm gửi qua email | Admin |
| **GET** | `/admin/users` | FR-39 | Tra cứu người dùng — lọc `search`, `role`, `is_active` | Admin |
| **GET** | `/admin/events` | FR-39 | Tra cứu sự kiện — lọc `search`, `status`, `organizer_id` | Admin |

### 13. Tiện ích dùng chung — 1 endpoint

| Method | Endpoint | FR | Mô tả | Quyền |
| :--- | :--- | :--- | :--- | :--- |
| **POST** | `/uploads/image` | FR-40 | `multipart/form-data` field `file` → 201 `{url}` | Auth (mọi role) · 10 lần/giờ |

---

## ⚠️ Mã lỗi nghiệp vụ thường gặp

Nguyên tắc **"một mã lỗi ↔ một HTTP status"** — frontend rẽ nhánh theo `error.code`, không theo đường dẫn.

| Mã | Status | Khi nào |
| :--- | :---: | :--- |
| `VALIDATION_ERROR` | 400 | Sai cú pháp/kiểu dữ liệu (Zod) |
| `RATING_REQUIRED` / `CONTENT_TOO_LONG` | 400 | Phản hồi thiếu số sao / nhận xét quá 500 ký tự |
| `UNAUTHORIZED` | 401 | Thiếu token hoặc token hết hạn |
| `INVALID_CREDENTIALS` | 401 | Sai email/mật khẩu |
| `ACCOUNT_DISABLED` | 403 | Tài khoản bị vô hiệu hoá |
| `FORBIDDEN_NOT_OWNER` | 403 | Không phải chủ sở hữu tài nguyên |
| `CANNOT_DISABLE_ADMIN` | 403 | Cố vô hiệu hoá chính mình / admin khác / admin cuối cùng |
| `SOLD_OUT` | 409 | Hết vé |
| `DUPLICATE_REGISTRATION` | 409 | Request trùng theo `Idempotency-Key` |
| `ALREADY_CHECKED_IN` | 409 | Tự check-in lần hai |
| `EVENT_ALREADY_CANCELLED` | 409 | Sự kiện đã bị huỷ trước đó |
| `FILE_TOO_LARGE` | 413 | Ảnh vượt `MAX_UPLOAD_SIZE_MB` |
| `EVENT_NOT_IN_PERSON` | 422 | Quét QR vào sự kiện **trực tuyến** |
| `EVENT_NOT_ONLINE` | 422 | Tự check-in vé của sự kiện **trực tiếp** |
| `SELF_CHECKIN_WINDOW_CLOSED` | 422 | Ngoài khung `[start−15p, end+30p]` |
| `NOT_ATTENDED` | 422 | Gửi phản hồi khi chưa từng check-in |
| `CANCEL_REASON_REQUIRED` | 422 | Lý do huỷ thiếu / ngoài 10–500 ký tự |
| `EVENT_ALREADY_STARTED` | 422 | Huỷ sự kiện đã bắt đầu |
| `TOO_MANY_REQUESTS` | 429 | Vượt rate limit |
| `UPLOAD_FAILED` | 502 | Cloudinary lỗi hoặc chưa cấu hình |
| `SENTIMENT_UNAVAILABLE` | 503 | Chưa cấu hình `GEMINI_API_KEY` |

---

## 📚 Tài liệu nguồn — mốc v1.0.0

Bốn tài liệu trong `docs/` là **nguồn sự thật duy nhất**. Không tự thêm field / endpoint / bảng / cột / enum nằm ngoài chúng.

| Tài liệu | Vai trò |
| :--- | :--- |
| `docs/srs.md` | Đặc tả nghiệp vụ (42 FR, 42 UC, 127 BR) — **thẩm quyền cao nhất về nghiệp vụ** |
| `docs/api_spec.md` | Contract Backend ↔ Frontend (50 endpoint) |
| `docs/erd.md` | Quan hệ dữ liệu (9 bảng) |
| `docs/schema.sql` | **Nguồn sự thật CSDL** — `prisma/schema.prisma` chỉ là bản introspect |

Khi mâu thuẫn: về **nghiệp vụ** SRS > API > ERD; về **cấu trúc CSDL** `schema.sql` là chuẩn.
