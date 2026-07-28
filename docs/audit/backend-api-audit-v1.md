# Audit Backend API — UniEvent Flow (v1)

_Ngày audit: 28/07/2026 · Đối chiếu: SRS v0.6.8 · API-spec v0.4.6 · ERD v0.4.1 · SCHEMA v0.4.1_
_Phạm vi: chỉ đọc, không sửa code, không đề xuất thay đổi DDL._

## Bước 0 — Xác nhận phiên bản tài liệu chuẩn

| Tài liệu | Yêu cầu | Thực tế trong repo | Kết quả |
| --- | --- | --- | --- |
| `docs/srs.md` | v0.6.8 | v0.6.8 — 42 FR / 42 UC / 127 BR | ✅ khớp |
| `docs/api_spec.md` | v0.4.6 | v0.4.6 — 49 endpoint + `/health` | ✅ khớp |
| `docs/erd.md` | v0.4.1 | v0.4.1 — 9 bảng | ✅ khớp |
| `docs/schema.sql` | v0.4.1 | v0.4.1 (26/07/2026) | ✅ khớp |

Cả 4 tài liệu đều đúng phiên bản yêu cầu — audit tiến hành trên đúng bản mới nhất.

> Ghi chú kỹ thuật: trong lúc audit, file đặc tả API xuất hiện dưới tên `docs/api-spec.md` rồi được đổi lại về `docs/api_spec.md` (cùng nội dung, cùng kích thước 80.975 bytes, cùng mtime). Tên hiện tại **khớp** với đường dẫn khai báo trong `CLAUDE.md`, không cần sửa gì.

---

## 1. Tóm tắt số liệu

**Tổng đặc tả: 49 endpoint REST nghiệp vụ** (+ `GET /health` + 1 worker nền FR-35).
**Route thật đang chạy: 23** (đếm trực tiếp từ `src/routes/*`, không suy từ tên file).

| Mức lệch | Số lượng | Tỷ lệ |
| --- | --- | --- |
| ✅ **ĐÚNG** | **7** / 49 | 14% |
| 🟥 **KHÔNG TỒN TẠI** | **26** / 49 | 53% |
| 🟧 **SAI CONTRACT** | **12** / 49 | 25% |
| 🟨 **THIẾU LOGIC NGHIỆP VỤ** | **4** / 49 | 8% |

Ngoài ra: **worker nền FR-35 chưa tồn tại** (BullMQ đã cài trong `package.json` nhưng chưa có thư mục `src/workers/`), **Redis chưa được nối dây** (ioredis đã cài, chưa có `config/redis.ts`).

**Kết luận mức độ:** 53% khối lượng là **xây mới**, không phải vá. Nhóm 3, 4, 5, 6, 7, 8, 9 (Đăng ký/Vé, Người tham gia, Check-in, Feedback, Dashboard, Admin, Uploads) **hoàn toàn trống** — chiếm 21/26 endpoint chưa tồn tại. 5 endpoint chưa tồn tại còn lại nằm rải trong nhóm 1–2 (FR-42, sửa/xoá thông báo, accept/decline co-host).

### Danh sách 23 route thật đang chạy

Base: `/api/v1` (mount tại `src/app.ts:23`).

| # | Route | File khai báo |
| --- | --- | --- |
| 1 | `POST /auth/register` | `src/routes/auth.routes.ts:9` |
| 2 | `POST /auth/login` | `src/routes/auth.routes.ts:10` |
| 3 | `POST /auth/forgot-password` | `src/routes/auth.routes.ts:11` |
| 4 | `POST /auth/reset-password` | `src/routes/auth.routes.ts:12` |
| 5 | `POST /auth/logout` | `src/routes/auth.routes.ts:15` |
| 6 | `POST /auth/change-password` | `src/routes/auth.routes.ts:16` |
| 7 | `GET /users/me` | `src/routes/user.routes.ts:11` |
| 8 | `PATCH /users/me` | `src/routes/user.routes.ts:12` |
| 9 | `GET /organizers/:userId` | `src/routes/organizer.routes.ts:7` |
| 10 | `GET /events` | `src/routes/event.routes.ts:16` |
| 11 | `GET /events/mine` | `src/routes/event.routes.ts:20` |
| 12 | `POST /events` | `src/routes/event.routes.ts:28` |
| 13 | `GET /events/:eventId` | `src/routes/event.routes.ts:37` |
| 14 | `PATCH /events/:eventId` | `src/routes/event.routes.ts:39` |
| 15 | `POST /events/:eventId/cancel` | `src/routes/event.routes.ts:48` |
| 16 | `GET /events/:eventId/updates` | `src/routes/event.routes.ts:58` |
| 17 | `POST /events/:eventId/updates` | `src/routes/event.routes.ts:60` |
| 18 | `GET /events/:eventId/schedule` | `src/routes/event.routes.ts:70` |
| 19 | `POST /events/:eventId/schedule` | `src/routes/event.routes.ts:72` |
| 20 | `PATCH /events/:eventId/schedule/:scheduleId` | `src/routes/event.routes.ts:81` |
| 21 | `DELETE /events/:eventId/schedule/:scheduleId` | `src/routes/event.routes.ts:90` |
| 22 | `POST /events/:eventId/co-hosts` | `src/routes/event.routes.ts:100` |
| 23 | `DELETE /events/:eventId/co-hosts/:userId` | `src/routes/event.routes.ts:109` |

_(+ `GET /health` mount ở root, ngoài `/api/v1` — `src/app.ts:12`)_

---

## 2. Vấn đề hệ thống (cross-cutting)

Xử lý các mục này **trước** khi làm từng nhóm FR — mỗi mục ảnh hưởng nhiều module cùng lúc.

### S1 — 🟥 `requireOwnerOrCoHost` KHÔNG TỒN TẠI (nghiêm trọng nhất về phân quyền)

`src/middlewares/auth.middleware.ts` chỉ có `requireAuth`, `requireActive`, `requireRole`, `requireOwnership`. Middleware `requireOwnerOrCoHost` (API §1.4, SRS CBR 6) **chưa được viết**.

Hệ quả hiện tại: 4 route đang dùng `requireOwnership` (owner-only) trong khi đặc tả yêu cầu owner-or-cohost → **Co-host đã `accepted` bị trả 403 sai**:

- `POST /events/:eventId/schedule` (BR-42)
- `PATCH /events/:eventId/schedule/:scheduleId` (BR-42)
- `DELETE /events/:eventId/schedule/:scheduleId` (BR-42)
- `POST /events/:eventId/updates` (BR-40)

Và 4 endpoint sắp xây cũng phụ thuộc nó: `POST /checkin/scan`, `GET /events/:id/checkins`, `GET /events/:id/checkins/export`, `GET /events/:id/registrations` (BR-113).

> Ghi chú: `requireOwnership` hiện tại **đúng hành vi** của `requireOwnerOnly` (so `event.organizer_id` với `req.user.id`, trả 403 `FORBIDDEN_NOT_OWNER`, gán `req.event`). Chỉ khác tên. Đổi tên là việc phụ; viết `requireOwnerOrCoHost` mới là việc chính.

### S2 — 🟨 `requireActive` đúng phạm vi nhưng SAI cơ chế (BR-98 / CBR 7)

**Phạm vi: ✅ không bỏ sót route nào.** Kiểm tra từng route đã xác thực:

| Router | Cách áp | Kết quả |
| --- | --- | --- |
| `/auth/logout`, `/auth/change-password` | khai báo tường minh từng route | ✅ có |
| `/users/*` | `router.use(requireAuth, requireActive)` | ✅ có |
| `/events/*` (7 route auth) | khai báo tường minh từng route | ✅ có |
| `/organizers/:userId` | public (BR-27) | ✅ đúng, không cần |

**Cơ chế: ❌ sai.** `requireActive` gọi thẳng `prisma.users.findUnique` **mỗi request** (`src/middlewares/auth.middleware.ts:56`). Đặc tả yêu cầu cache Redis khoá `active:{userId}` **TTL 60s**, xoá cache ngay khi `PATCH /admin/users/:id/status` đổi trạng thái. Hiện chưa có Redis client nào trong codebase → chưa thể cache, và cũng chưa có FR-29 để xoá cache.

⚠️ **Rủi ro khi mở rộng:** cách áp hiện tại là _khai báo tường minh từng route_ ở `event.routes.ts` — dễ quên khi thêm route mới. Nên chuyển sang `router.use()` ở cấp router như `user.routes.ts` đang làm, hoặc gói thành 1 mảng middleware dùng chung.

### S3 — 🟨 Redis chưa được nối dây (chặn ~15 quy tắc nghiệp vụ)

`ioredis` + `bullmq` đã có trong `package.json`, `env.REDIS_URL` chỉ là placeholder (`src/config/env.ts:11` ghi rõ "Redis chưa tích hợp trong Tuần 1-2"). Chưa có `src/config/redis.ts`, chưa có `src/workers/`.

Các BR đang bị chặn hoàn toàn: BR-47 (Lua atomic decrement), BR-88 (`hold:{registrationId}` TTL 60s), BR-89/93 (bù trừ vé), BR-90 (INCRBY delta khi đổi `max_tickets`), BR-91 (`checkin:{ticketId}` NX EX 86400), BR-94 (giải phóng khoá khi ghi log thất bại), BR-97 (job `reminder:{eventId}`), BR-98 (cache `active:{userId}`), NFR 6.1 (rate-limit store).

Tạm thời `EventService.getTicketsRemainingMap()` đọc từ view `v_event_registration_stats` (PostgreSQL) — có comment `TODO [Tuần 3]` thừa nhận đây là giá trị đối soát tạm.

### S4 — 🟧 Prisma client STALE so với SCHEMA v0.4.1 (sửa ở tầng ứng dụng, KHÔNG phải migration)

`prisma/schema.prisma` (introspect ngày 17/07) **cũ hơn** `docs/schema.sql` v0.4.1. Thiếu:

| Thiếu trong Prisma model | Có trong schema.sql | Chặn BR nào |
| --- | --- | --- |
| `users.club_name VARCHAR(150)` | dòng 147 | BR-92, BR-17, BR-26 |
| `events.cancel_reason / cancelled_by / cancelled_at` | dòng 191–193 | BR-106 (FR-11 + FR-30) |
| `event_co_hosts.status` (`co_host_status`) + `responded_at` | dòng 273, 275 | BR-44→46e (toàn bộ co-host) |
| enum `registration_status` giá trị `cancelled` | dòng 118 | BR-56 (FR-34) |
| enum `event_category` (9 giá trị) — Prisma đang để `String? @db.VarChar(100)` | dòng 123–126 | BR-28b |
| enum `co_host_status` | dòng 128 | BR-46 |

**Cách sửa đúng theo CLAUDE.md:** chạy `npx prisma db pull` + `npx prisma generate` (introspect-only). **Không** `prisma migrate dev`, **không** đề xuất DDL mới — schema đã chốt và đã đủ dùng.

⚠️ **Chưa kiểm chứng được:** audit này không truy vấn DB Docker đang chạy. Nếu `db pull` sinh ra đúng model cũ này thì **DB mới là bên chưa apply schema v0.4.1**, không phải Prisma — trường hợp đó cần quyết định của người vận hành, nằm ngoài phạm vi sửa tầng ứng dụng.

### S5 — 🟧 Mã lỗi (§1.3 + lịch sử "Đổi gì so với vX")

**Mã sai / đã nghỉ hưu vẫn còn trong code:**

| Mã | Vị trí | Vấn đề |
| --- | --- | --- |
| `INVALID_ORGANIZER_CODE` (422) | `src/services/auth.service.ts:36` | **Đã nghỉ hưu ở v0.3.0** (API §2, mục 0b) — `organizerCode` bị loại bỏ hoàn toàn |
| `CO_HOST_ALREADY_EXISTS` (409) | `src/services/eventCoHost.service.ts:27` | Không có trong đặc tả. Đúng phải là `CO_HOST_ALREADY_ACCEPTED` (409) và **chỉ** ở nhánh (d) của BR-46 |

**Mã đặc tả yêu cầu nhưng chưa bao giờ được phát ra (18 mã):**
`EVENT_NOT_REGISTRABLE`, `SOLD_OUT`, `DUPLICATE_REGISTRATION`, `REGISTRATION_NOT_CANCELLABLE`, `CANNOT_CANCEL_CHECKED_IN_TICKET`, `REGISTRATION_FAILED`, `EVENT_NOT_ONLINE`, `SELF_CHECKIN_WINDOW_CLOSED`, `RATING_REQUIRED`, `CONTENT_TOO_LONG` (⭐ v0.4.6), `DUPLICATE_FEEDBACK`, `NOT_ATTENDED`, `CANNOT_DISABLE_ADMIN` (⭐ v0.4.3), `INVALID_FILE_TYPE`, `FILE_TOO_LARGE`, `UPLOAD_FAILED`, `UPDATE_NOT_FOUND` (⭐ v0.4.2), `CANNOT_INVITE_SELF` (⭐ v0.3.0).

**Mã code tự đặt, đặc tả không liệt kê nhưng không mâu thuẫn** (chấp nhận được, ghi nhận để đồng bộ với FE): `USER_NOT_FOUND`, `SCHEDULE_ITEM_NOT_FOUND`, `CO_HOST_NOT_FOUND`, `BAD_REQUEST`, `NOT_FOUND`, `TOO_MANY_REQUESTS`, `VALIDATION_ERROR`, `INTERNAL_SERVER_ERROR`.

### S6 — ✅ Envelope §1.2 áp dụng nhất quán

`errorHandler` (`src/middlewares/error.middleware.ts`) phủ đủ 4 nhánh: `ZodError` → 400 `VALIDATION_ERROR` kèm `details[]`; `AppError` → `{code, message, details?}`; `SyntaxError` JSON → 400 `BAD_REQUEST`; fallback → 500. Mọi controller trả `{success:true, data:{...}}`, có phân trang thì thêm `meta.pagination`. **Không phát hiện route nào trả raw JSON ngoài envelope.**

Sai lệch duy nhất: `GET /health` (`src/app.ts:12`) trả `{success:true, data:{status:'UP', timestamp}}` trong khi API §10 ghi `{ "status": "ok", "uptime": <seconds> }` — khác cả giá trị (`UP` vs `ok`) lẫn trường (`timestamp` vs `uptime`). Ảnh hưởng healthcheck của Render (NFR-07).

### S7 — 🟨 Phân trang & lọc (§1.5)

- ✅ `GET /events`: `page/limit/sort` qua Zod, `meta.pagination` đầy đủ, whitelist `sort` (`created_at|start_time|title`) — chống injection qua `orderBy`. Tốt.
- ✅ `GET /events/:id/updates`: `page/limit` qua Zod. Thiếu `sort` (đặc tả chỉ yêu cầu `created_at DESC` cố định → chấp nhận được).
- 🟥 `GET /events/mine` (`src/controllers/event.controller.ts:65-66`): parse thủ công `Number(req.query.page)` **không qua Zod**. `?page=abc` → `NaN` → `skip: NaN` → Prisma ném lỗi → **500 thay vì 400**. Đây là lỗi thật, không chỉ là lệch đặc tả.
- 🟥 Các list endpoint chưa tồn tại (FR-41, FR-39, FR-24, FR-17, FR-42) đều cần chuẩn phân trang này.

### S8 — 🟧 Rate limiting (§1.6) — thiếu 4/5 điểm áp dụng

| Endpoint | Đặc tả | Thực tế |
| --- | --- | --- |
| `POST /auth/login` | 5 lần/phút/IP, store Redis | ⚠️ có, nhưng **10 lần/15 phút** + **store in-memory** (`src/middlewares/rateLimiter.middleware.ts:3` đã ghi TODO) |
| `POST /auth/register` | 3 lần/giờ/IP | ❌ không có |
| `POST /events/:eventId/co-hosts` | 10 lần/giờ/user | ❌ không có |
| `POST /checkin/scan` | 20 lần/giây/user | ❌ endpoint chưa tồn tại |
| `POST /uploads/image` | 10 lần/giờ/user (BR-105) | ❌ endpoint chưa tồn tại |

Store in-memory sẽ hỏng khi chạy nhiều instance trên Render — cần `rate-limit-redis`.

### S9 — 🟥 Idempotency (§1.7) — chưa có gì

Không có xử lý header `Idempotency-Key` ở bất kỳ đâu. Cả 3 endpoint đích (`POST /events/:id/registrations`, `POST /registrations/:id/cancel`, `POST /tickets/:id/self-checkin`) đều chưa tồn tại → xử lý cùng lúc khi xây nhóm 3 và 5.

### S10 — 🟨 Quy ước casing (CLAUDE.md) — hiện đang lẫn lộn

CLAUDE.md chốt: **toàn bộ field và wrapper key dùng snake_case**. Code tuân thủ ở phần lớn (`location_type`, `join_url`, `social_links`, `schedule_item`, `co_host`, `club_name`) nhưng **rò rỉ camelCase** ở:

- `ticketsRemaining` — `src/services/event.service.ts:28, 147, 225`
- `accessToken`, `expiresIn` — `src/services/auth.service.ts:110-112`
- `meta.pagination.totalPages` — mọi list endpoint

Cần chốt: hoặc đổi hết sang `tickets_remaining` / `access_token` / `expires_in` / `total_pages`, hoặc bổ sung ngoại lệ vào CLAUDE.md. **Quyết định này ảnh hưởng FE — nên chốt trước khi xây nhóm 3 trở đi**, vì các nhóm mới sẽ sinh thêm rất nhiều field (`registeredCount`, `qrCodeDataUrl`, `checkedInAt`, `sentimentBreakdown`, `topKeywords`, `averageRating`, `checkinStatus`, `regStatus`, `registeredAt`, `isActive`…).

### S11 — 🟨 Cấu trúc thư mục vs API §12

Thiếu: `src/workers/`, `src/config/redis.ts`, `src/config/bullmq.ts`, `src/docs/` (OpenAPI registry), `src/routes/{registrations,tickets,checkin,feedbacks,dashboard,admin,uploads}.ts`. Phần đã có (`config/`, `schemas/`, `routes/`, `controllers/`, `services/`, `middlewares/`) đúng chuẩn §12.

Ngoài ra: `npm test` = `echo "Error: no test specified" && exit 1` — chưa có hạ tầng test nào, trong khi SRS có bảng TC-xx-01→nn cho từng FR.

---

## 3. Audit theo từng nhóm FR

### Nhóm 1 — Auth & Account (FR-01→07, 33, 42) — 10 endpoint

| Endpoint | FR / BR | Trạng thái hiện tại | Mức lệch | Ghi chú |
| --- | --- | --- | --- | --- |
| `POST /auth/register` | FR-01 | `auth.routes.ts:9` → `AuthController.register` | 🟧 **SAI CONTRACT** | Zod **bắt buộc** `role` (`auth.schema.ts:18`) + nhận `organizer_code`. Đặc tả v0.3.0: body **chỉ** `{name,email,password}`, server gán cứng `role='student'`. Hệ quả: request đúng đặc tả **bị 400**. Service còn ném `INVALID_ORGANIZER_CODE` — mã đã nghỉ hưu. Thiếu rate-limit 3/h/IP |
| `POST /auth/login` | FR-02, BR-07, BR-08 | `auth.routes.ts:10` + `loginRateLimiter` | 🟨 **THIẾU LOGIC** | Contract đúng (200 `{accessToken, expiresIn, user}`), `INVALID_CREDENTIALS` 401 + `ACCOUNT_DISABLED` 403 đúng. Nhưng: rate-limit sai ngưỡng & store in-memory (S8); `expiresIn` trả `env.JWT_EXPIRES_IN` (chuỗi `'2h'`) trong khi token ký cứng `7200` (`auth.service.ts:102`) — env đổi thì 2 giá trị lệch nhau |
| `POST /auth/logout` | FR-03 | `auth.routes.ts:15` | ✅ **ĐÚNG** | 204, stateless. Có `requireAuth + requireActive` |
| `POST /auth/forgot-password` | FR-07, BR-22 | `auth.routes.ts:11` | 🟨 **THIẾU LOGIC** | 202 luôn trả kể cả email không tồn tại ✅; token 32-byte + hạn 20 phút ✅. Nhưng **chưa gửi email** (`auth.service.ts:136` TODO) → FR-07 chưa dùng được thực tế |
| `POST /auth/reset-password` | FR-07 | `auth.routes.ts:12` | ✅ **ĐÚNG** | 200, `RESET_TOKEN_EXPIRED` 400, xoá token sau khi dùng |
| `POST /auth/change-password` | FR-04, NFR-08 | `auth.routes.ts:16` | ✅ **ĐÚNG** | 200, bcrypt hash lại |
| `GET /users/me` | FR-05 | `user.routes.ts:11` | ✅ **ĐÚNG** | `sanitizeUser` loại `password_hash`/`reset_token`/`reset_token_expires` |
| `PATCH /users/me` | FR-06, BR-17, BR-18 | `user.routes.ts:12` | 🟧 **SAI CONTRACT** | ① `social_links` dùng **bộ khoá CŨ** `{instagram, x, youtube, tiktok}` + `.strict()` (`auth.schema.ts:88-96`) → `facebook`/`website`/`discord`/`zalo` **bị 400**, `x`/`youtube` **được nhận sai**. Đúng phải là `{facebook, website, tiktok, discord, instagram, zalo}` (BR-18, SRS §5.2). ② **Thiếu hoàn toàn** `club_name` (BR-17: nhận khi `role=organizer`, role khác thì bỏ qua không báo lỗi) — cột chưa có trong Prisma stale (S4) |
| `GET /users/me/feedbacks` | FR-42, BR-122 | — | 🟥 **KHÔNG TỒN TẠI** | Endpoint mới ở API v0.4.3. Chỉ đọc, lọc `feedbacks.user_id = sub` |
| `GET /organizers/:userId` | FR-33, BR-26, BR-27 | `organizer.routes.ts:7`, public ✅ | 🟧 **SAI CONTRACT** | Payload thiếu `club_name` (BR-26, thêm ở v1.0). Phần còn lại đúng: chỉ trả khi `role=organizer`, 404 nếu không, `select` ở tầng CSDL nên không lộ email/hash ✅, `events` lọc `status=active` ✅ |

**Tổng nhóm 1: 4 ĐÚNG · 3 SAI CONTRACT · 2 THIẾU LOGIC · 1 KHÔNG TỒN TẠI = 10 ✅**

---

### Nhóm 2 — Quản lý sự kiện (FR-08→13, 31, 32, 37) — 18 endpoint

#### 2a. CRUD sự kiện (6)

| Endpoint | FR / BR | Trạng thái hiện tại | Mức lệch | Ghi chú |
| --- | --- | --- | --- | --- |
| `POST /events` | FR-08, BR-28b, BR-30 | `event.routes.ts:28` | 🟧 **SAI CONTRACT** | `category` là `z.string().max(100)` tự do (`event.schema.ts:27`) — đặc tả yêu cầu **ENUM 9 giá trị** `{academic, competition, seminar_workshop, career, volunteer, arts_entertainment, sports, orientation, other}`, ngoài tập → 400 (BR-28b). BR-30 (in_person⇒location, online⇒join_url) ✅ đã chặn ở Zod. Thiếu khởi tạo bộ đếm Redis (`event.service.ts:77` TODO). Thiếu điền sẵn `club_name` từ `users.club_name` (BR-92) |
| `GET /events` | FR-13, BR-33b | `event.routes.ts:16`, public ✅ | 🟧 **SAI CONTRACT** | **Thiếu `registeredCount`** mỗi item (BR-33b, bắt buộc v1.0 — hiển thị "X người tham gia"). `ticketsRemaining` đọc từ view PG chứ không phải Redis (S3). Lọc/phân trang/sort ✅ tốt |
| `GET /events/:eventId` | FR-09, BR-33b | `event.routes.ts:37`, public ✅ | 🟧 **SAI CONTRACT** | ① **Thiếu `registeredCount`**. ② `co_hosts` trả **TẤT CẢ** co-host bất kể trạng thái (`eventCoHost.service.ts:65`) — đặc tả: **chỉ `status=accepted`**, không lộ `pending`/`declined` ra public. Không lọc được vì cột `status` chưa có trong Prisma stale (S4). ③ `schedule` ✅, `updates` 5 mới nhất ✅ |
| `PATCH /events/:eventId` | FR-10, BR-35, BR-90, BR-97 | `event.routes.ts:39`, `requireOwnership` ✅ | 🟨 **THIẾU LOGIC** | ① **BR-35 đếm SAI**: chỉ đếm `status:'confirmed'` (`event.service.ts:265`) — đặc tả yêu cầu `IN ('confirmed','pending')`, bỏ sót `pending` gây **oversell ngược**. ② Thiếu BR-90 (`INCRBY delta` bộ đếm Redis trong cùng Lua script). ③ Thiếu BR-97 (huỷ + lên lịch lại job `reminder:{eventId}` khi `start_time` đổi). ④ `category` enum như trên. Merge `location_type`/`location`/`join_url` trước khi validate ✅ xử lý tốt |
| `POST /events/:eventId/cancel` | FR-11, BR-37b/c, BR-106, BR-97 | `event.routes.ts:48`, `requireOwnership` ✅ | 🟨 **THIẾU LOGIC** | Status code đúng: 409 `EVENT_ALREADY_CANCELLED`, 422 `EVENT_ALREADY_STARTED` ✅. Thiếu: ① ghi `cancelled_by` = chủ sự kiện + `cancelled_at` = now (BR-106) — cột chưa có trong Prisma stale; ② **cascade ticket `valid`→`cancelled`** (giữ nguyên `checked_in`); ③ huỷ job nhắc lịch (BR-97). Toàn bộ phải nằm trong 1 transaction |
| `GET /events/mine` | FR-12, BR-38 | `event.routes.ts:20` | 🟧 **SAI CONTRACT** | Trả `{events:[...], meta}` phẳng — đặc tả v0.3.0 yêu cầu **`{owned, coHosting, pendingInvitations}`** (3 nhánh, `coHosting` kèm `myRole`). Đây là viết lại, không phải thêm field. Ngoài ra parse `page`/`limit` không qua Zod → `?page=abc` gây 500 (S7) |

#### 2b. Lịch trình — FR-32 (4)

| Endpoint | FR / BR | Trạng thái hiện tại | Mức lệch | Ghi chú |
| --- | --- | --- | --- | --- |
| `GET /events/:eventId/schedule` | FR-32, BR-43 | `event.routes.ts:70`, public ✅ | ✅ **ĐÚNG** | Sắp theo `sort_order` ✅ |
| `POST /events/:eventId/schedule` | FR-32, BR-42 | `event.routes.ts:72` | 🟧 **SAI CONTRACT** | Dùng `requireOwnership` — đặc tả: **`requireOwnerOrCoHost`** (S1). Co-host `accepted` bị 403 sai. Body/response (`schedule_item`, 201) ✅ |
| `PATCH /events/:eventId/schedule/:scheduleId` | FR-32, BR-42 | `event.routes.ts:81` | 🟧 **SAI CONTRACT** | Cùng lỗi phân quyền. Chặn IDOR (`findOwnedScheduleItem`) ✅ tốt, 200 ✅ |
| `DELETE /events/:eventId/schedule/:scheduleId` | FR-32, BR-42 | `event.routes.ts:90` | 🟧 **SAI CONTRACT** | Cùng lỗi phân quyền. 204 ✅ |

#### 2c. Thông báo — FR-31 (4)

| Endpoint | FR / BR | Trạng thái hiện tại | Mức lệch | Ghi chú |
| --- | --- | --- | --- | --- |
| `GET /events/:eventId/updates` | FR-31, BR-41 | `event.routes.ts:58`, public ✅ | ✅ **ĐÚNG** | `page`/`limit` + `created_at DESC` ✅ |
| `POST /events/:eventId/updates` | FR-31, BR-40 | `event.routes.ts:60` | 🟧 **SAI CONTRACT** | Dùng `requireOwnership` — đặc tả: **`requireOwnerOrCoHost`** (S1). Ngoài ra thiếu đẩy job gửi email cho người đăng ký (nghiệp vụ FR-31) |
| `PATCH /events/:eventId/updates/:updateId` | FR-31, BR-40b | — | 🟥 **KHÔNG TỒN TẠI** | Mới ở API v0.4.2. Partial `{title?, content?}` → 200. `updateId` phải thuộc `eventId`, khác → 404 `UPDATE_NOT_FOUND`. **Không gửi lại email** |
| `DELETE /events/:eventId/updates/:updateId` | FR-31, BR-40c | — | 🟥 **KHÔNG TỒN TẠI** | Mới ở API v0.4.2. 204. Cùng ràng buộc `updateId ∈ eventId` |

#### 2d. Co-host — FR-37 (4) — ⚠️ viết lại toàn diện

| Endpoint | FR / BR | Trạng thái hiện tại | Mức lệch | Ghi chú |
| --- | --- | --- | --- | --- |
| `POST /events/:eventId/co-hosts` | FR-37, BR-45b, BR-46, BR-46b | `event.routes.ts:100` | 🟧 **SAI CONTRACT** (nặng) | **Không có cơ chế trạng thái nào.** Hiện tại: có bản ghi → ném 409 `CO_HOST_ALREADY_EXISTS` (mã không tồn tại trong đặc tả); không có → INSERT → **luôn 201**. Đặc tả BR-46 yêu cầu **upsert 4 nhánh**: (a) chưa có → INSERT `pending`, **201**, gửi email; (b) `declined` → UPDATE về `pending`, **200**, gửi lại email; (c) `pending` → không đổi, **200**, có thể gửi lại email; (d) `accepted` → **409 `CO_HOST_ALREADY_ACCEPTED`**, KHÔNG reset về pending. Thiếu thêm: guard `CANNOT_INVITE_SELF` 422 (BR-45b), email mời (BR-46b), rate-limit 10/h/user. Kiểm `role=organizer` → 422 `CO_HOST_NOT_ORGANIZER` ✅ đúng. **Chặn kỹ thuật:** cột `event_co_hosts.status` chưa có trong Prisma stale (S4) |
| `DELETE /events/:eventId/co-hosts/:userId` | FR-37, BR-44 | `event.routes.ts:109` | ✅ **ĐÚNG** | 204, gỡ bất kể `status` ✅ đúng đặc tả. `requireOwnership` = `requireOwnerOnly` ✅ đúng (thao tác không uỷ quyền được) |
| `PATCH /events/:eventId/co-hosts/me/accept` | FR-37, BR-46d, UC-17b | — | 🟥 **KHÔNG TỒN TẠI** | `pending → accepted`, 200. Chỉ tác động bản ghi `user_id = req.user.id` (lấy từ JWT, **không** nhận userId từ path/body). Không có bản ghi `pending` → 404 |
| `PATCH /events/:eventId/co-hosts/me/decline` | FR-37, BR-46d | — | 🟥 **KHÔNG TỒN TẠI** | `pending → declined`, 200. Cùng ràng buộc. Ghi `responded_at` |

**Tổng nhóm 2: 3 ĐÚNG · 9 SAI CONTRACT · 2 THIẾU LOGIC · 4 KHÔNG TỒN TẠI = 18 ✅**

---

### Nhóm 3 — Đăng ký & Vé (FR-14→18, 34, 35) — 5 endpoint + 1 worker

| Endpoint | FR / BR | Trạng thái hiện tại | Mức lệch | Ghi chú |
| --- | --- | --- | --- | --- |
| `POST /events/:eventId/registrations` | FR-14, BR-87, BR-47→50, BR-88 | — | 🟥 **KHÔNG TỒN TẠI** | Guard BR-87 **trước** khi chạm Redis (role=student + `status=active` + `start_time>now`, vi phạm → 422 `EVENT_NOT_REGISTRABLE`, KHÔNG trừ vé) → Lua atomic decrement → hết vé 409 `SOLD_OUT` (không chạm PG) → còn vé: Registration `pending` + khoá `hold:{regId}` TTL 60s + job BullMQ → **202** `{registrationId, status:'pending'}`. Nhận header tuỳ chọn `Idempotency-Key` (§1.7) |
| `GET /registrations/:registrationId` | FR-15/16 | — | 🟥 **KHÔNG TỒN TẠI** | Polling, owner-only. 200 `{status, ticket?}`. `failed` → FE hiển thị `REGISTRATION_FAILED` |
| `POST /registrations/:registrationId/cancel` | **FR-34**, BR-55, BR-56 | — | 🟥 **KHÔNG TỒN TẠI** | Thứ tự bắt buộc: ① kiểm ownership + `status`; ② `≠confirmed` → 422 `REGISTRATION_NOT_CANCELLABLE`, ticket `checked_in` → 422 `CANNOT_CANCEL_CHECKED_IN_TICKET`; ③ **1 transaction PG đổi CẢ `registrations.status='cancelled'` VÀ `tickets.status='cancelled'`** (BR-56 — bản cũ chỉ đổi ticket là lỗi); ④ **SAU** khi commit mới `INCR` hoàn vé Redis (thứ tự có chủ đích); ⑤ 200. **Chặn:** enum `registration_status.cancelled` chưa có trong Prisma stale (S4) |
| `GET /users/me/tickets` | FR-17 | — | 🟥 **KHÔNG TỒN TẠI** | Danh sách vé của sinh viên |
| `GET /tickets/:ticketId` | FR-18 | — | 🟥 **KHÔNG TỒN TẠI** | Owner-only. 200 `{ticket, qrCodeDataUrl}` |
| _(worker)_ `processRegistration` | FR-16, BR-51, BR-88/89/93, BR-99 | — | 🟥 **KHÔNG TỒN TẠI** | Thành công: sinh Ticket (JWT **có `exp` = `end_time` + 24h**, BR-99), `confirmed`, xoá khoá `hold`. Thất bại/hết TTL: `UPDATE ... WHERE id=? AND status='pending'` → **1 dòng** → `INCR` hoàn vé (BR-89); **0 dòng** → KHÔNG hoàn lần hai (BR-93, idempotent) |
| _(worker)_ `sendEventReminder` | **FR-35**, BR-58, BR-97 | — | 🟥 **KHÔNG TỒN TẠI** | jobId cố định `reminder:{eventId}`. Vòng đời gắn sự kiện: huỷ + lên lịch lại khi `start_time` đổi, huỷ khi `cancelled`. Danh sách người nhận truy vấn **tại thời điểm job chạy** (`status=confirmed`) |

**Tổng nhóm 3: 0 ĐÚNG · 5 KHÔNG TỒN TẠI (+2 worker) = 5 ✅**

---

### Nhóm 4 — Người tham gia (FR-41) — 1 endpoint

| Endpoint | FR / BR | Trạng thái hiện tại | Mức lệch | Ghi chú |
| --- | --- | --- | --- | --- |
| `GET /events/:eventId/registrations` | **FR-41**, BR-113, BR-114 | — | 🟥 **KHÔNG TỒN TẠI** | ✅ Xác nhận: **module hoàn toàn mới**, không có dấu vết trong bản 0.3.1. Query `page, limit, status?, search?` (`search` khớp một phần trên `name`, không phân biệt hoa thường — ⭐ mới v0.4.5). 200 `{items:[{userId,name,email,registeredAt,regStatus,checkinStatus}], total, page, limit}`. `checkinStatus` suy ra từ `tickets.status`/`checkin_logs`. **Dùng `requireOwnerOrCoHost`** (BR-113 — chưa tồn tại, S1). ⚠️ Trả `email` = PII, tuyệt đối không public (BR-114) |

**Tổng nhóm 4: 1 KHÔNG TỒN TẠI = 1 ✅**

---

### Nhóm 5 — Check-in (FR-19→22, 36) — 4 endpoint

| Endpoint | FR / BR | Trạng thái hiện tại | Mức lệch | Ghi chú |
| --- | --- | --- | --- | --- |
| `POST /checkin/scan` | FR-19/20, BR-91, BR-99, BR-109, BR-62, BR-94 | — | 🟥 **KHÔNG TỒN TẠI** | Đồng bộ <1s. Thứ tự: xác thực chữ ký JWT (không chạm DB) → **kiểm `exp` (BR-99)** → **`SET checkin:{ticketId} <organizerId> NX EX 86400` (BR-91)** → nil ⇒ `already_checked_in`, OK ⇒ `valid` → **ghi `checkin_logs` + đổi `ticket.status` BẤT ĐỒNG BỘ sau khi trả response** (BR-62); ghi thất bại hết retry → **giải phóng khoá** (BR-94). `result` ∈ `valid \| already_checked_in \| invalid_signature \| event_mismatch \| cancelled_ticket \| expired_ticket`, **HTTP luôn 200**. `already_checked_in` trả kèm **`checkedInAt`** (⭐ v0.4.5). Chỉ áp `location_type=in_person` (BR-60). `requireOwnerOrCoHost` + rate-limit 20/s/user |
| `GET /events/:eventId/checkins` | FR-21 | — | 🟥 **KHÔNG TỒN TẠI** | Kèm `checkin_method` để phân biệt quét cổng vs tự check-in. `requireOwnerOrCoHost` |
| `GET /events/:eventId/checkins/export` | FR-22, BR-64 | — | 🟥 **KHÔNG TỒN TẠI** | 200 `Content-Type: text/csv`, xuất trực tiếp không lưu file trung gian. `requireOwnerOrCoHost` |
| `POST /tickets/:ticketId/self-checkin` | **FR-36**, BR-95 | — | 🟥 **KHÔNG TỒN TẠI** | Student + Owner. `location_type≠online` → 422 `EVENT_NOT_ONLINE`. **BR-95**: `event.status=active` VÀ now ∈ **[`start_time` − 15p, `end_time` + 30p]**; ngoài → 422 `SELF_CHECKIN_WINDOW_CLOSED`. Ghi `checkin_logs` với `organizer_id=NULL, checkin_method='self'` → 200 `{ticket}`. Không có khái niệm `result` |

**Tổng nhóm 5: 4 KHÔNG TỒN TẠI = 4 ✅**

---

### Nhóm 6 — Feedback & AI (FR-23→26) — 4 endpoint

| Endpoint | FR / BR | Trạng thái hiện tại | Mức lệch | Ghi chú |
| --- | --- | --- | --- | --- |
| `POST /events/:eventId/feedbacks` | FR-23, BR-67, **BR-68** | — | 🟥 **KHÔNG TỒN TẠI** | `rating` **bắt buộc** int 1–5, thiếu/sai → 400 `RATING_REQUIRED`. `content` **tuỳ chọn, ≤500 ký tự** → vượt 400 **`CONTENT_TOO_LONG`** (⭐ mới nhất v0.4.6 / BR-68, thực thi ở Zod, **không đổi CSDL** — `feedbacks.content` vẫn `TEXT`). Chỉ nhận khi có `ticket.status='checked_in'` cho sự kiện đó (thoả cả QR lẫn self check-in) → chưa đạt: 422 `NOT_ATTENDED`. 1 `ticket_id` chỉ 1 feedback → 409 `DUPLICATE_FEEDBACK` |
| `GET /events/:eventId/feedbacks` | FR-24 | — | 🟥 **KHÔNG TỒN TẠI** | Organizer + Owner. Query `sentiment=positive\|negative\|neutral&page=&limit=` |
| `POST /events/:eventId/feedbacks/analyze` | FR-25/26 | — | 🟥 **KHÔNG TỒN TẠI** | Gộp feedback có `content` khác rỗng **và** `analyzed_at IS NULL` thành 1 batch → gọi LLM → **202** `{jobId}`. Feedback chỉ có `rating` bỏ qua bước LLM. Chỉ mục partial `idx_feedbacks_unanalyzed` đã sẵn sàng trong schema |
| `GET /events/:eventId/feedbacks/summary` | FR-28 | — | 🟥 **KHÔNG TỒN TẠI** | 200 `{sentimentBreakdown:{positive,negative,neutral}, topKeywords:[{keyword,count}], averageRating}` |

**Tổng nhóm 6: 4 KHÔNG TỒN TẠI = 4 ✅**

---

### Nhóm 7 — Dashboard (FR-27, 28) — 1 endpoint

| Endpoint | FR / BR | Trạng thái hiện tại | Mức lệch | Ghi chú |
| --- | --- | --- | --- | --- |
| `GET /events/:eventId/dashboard` | FR-27/28, **BR-77** | — | 🟥 **KHÔNG TỒN TẠI** | 200 gộp 2 nhóm số liệu trong 1 lần gọi: `{registrations:{total,confirmed,checkedIn,remaining}, sentiment:{breakdown,topKeywords,averageRating}}`. `registrations.remaining` đọc từ **Redis** (nguồn thật). **"Điểm phản hồi AI" = `AVG(feedbacks.rating)` thô** — **KHÔNG** suy ra từ `sentiment_label` (BR-77, quyết định sản phẩm đã chốt). Gọi lại chung service layer với `/feedbacks/summary`, không trùng logic |

**Tổng nhóm 7: 1 KHÔNG TỒN TẠI = 1 ✅**

---

### Nhóm 8 — Quản trị hệ thống (FR-29, 30, 38, 39) — 5 endpoint

✅ Xác nhận: **toàn bộ nhóm chưa tồn tại** — không có `src/routes/admin.ts`, không có prefix `/admin` nào được mount trong `src/routes/index.ts`. Đúng như dự đoán: nhóm này hoàn toàn mới so với bản 0.3.1.

| Endpoint | FR / BR | Trạng thái hiện tại | Mức lệch | Ghi chú |
| --- | --- | --- | --- | --- |
| `PATCH /admin/users/:userId/status` | FR-29, BR-98, **BR-121**, BR-102 | — | 🟥 **KHÔNG TỒN TẠI** | Body `{isActive}` → 200 `{user}`. **Guard BR-121 (⭐ v0.4.3)**: từ chối **403 `CANNOT_DISABLE_ADMIN`** (MSG-49) khi target là (a) chính admin đang gọi, (b) một `role=admin` khác, (c) admin cuối cùng đang `is_active=true`. **Bắt buộc xoá cache Redis `active:{userId}` ngay** (BR-98) để thu hồi quyền có hiệu lực từ request kế tiếp. Ghi log audit (NFR-22). ⚠️ Xem mâu thuẫn **M1** về mã trạng thái |
| `POST /admin/events/:eventId/force-cancel` | FR-30, BR-96, **BR-106** | — | 🟥 **KHÔNG TỒN TẠI** | Body **bắt buộc `{reason}` 10–500 ký tự** → thiếu/ngắn 422. **KHÔNG** bị chặn bởi BR-37b (buộc huỷ được cả sự kiện đang diễn ra) nhưng **VẪN** bị chặn bởi BR-37c (đã `cancelled` → `EVENT_ALREADY_CANCELLED`). 1 transaction: `status='cancelled'` + `cancel_reason` + `cancelled_by`(=adminId) + `cancelled_at`; ticket `valid`→`cancelled`, `checked_in` giữ nguyên; huỷ job `reminder:{eventId}`; **KHÔNG hoàn vé Redis**. Bỏ qua `requireOwnerOnly`, chỉ `requireRole('admin')`. ⚠️ Xem mâu thuẫn **M2** |
| `POST /admin/organizers` | **FR-38**, BR-82→86, BR-92 | — | 🟥 **KHÔNG TỒN TẠI** | Body `{name, email, clubName?}` → **201** `{organizer:{id,name,email,role:'organizer',clubName}}`. Luồng provisioning: kiểm UNIQUE email → 409 `EMAIL_ALREADY_EXISTS` (tái dùng mã có sẵn); sinh mật khẩu ngẫu nhiên + bcrypt; plaintext **CHỈ** tồn tại trong email gửi đi, **không log, không lưu**; INSERT `role='organizer', is_active=true`, `club_name` (BR-92); đẩy job email; trả 201 ngay không đợi email. **Đây là con đường DUY NHẤT tạo tài khoản Organizer** (thay cho `organizerCode` đã bỏ) |
| `GET /admin/users` | **FR-39**, BR-100/101/102 | — | 🟥 **KHÔNG TỒN TẠI** | Query `search?, role?, isActive?, page?, limit?`. `search` khớp một phần `name` **hoặc** `email`, không phân biệt hoa thường. **Endpoint DUY NHẤT trả email của người khác**; KHÔNG bao giờ trả `password_hash`/`reset_token`. Mỗi bản ghi gắn cờ để UI khoá nút trên chính admin đang đăng nhập (BR-102) |
| `GET /admin/events` | **FR-39**, BR-103, BR-110 | — | 🟥 **KHÔNG TỒN TẠI** | Query `search?, status?, organizerId?, page?, limit?`. Trả sự kiện ở **mọi trạng thái gồm `cancelled`** (BR-103) — khác `GET /events` public chỉ trả `active`. Kèm tên/email BTC + số vé đã phát hành để đánh giá ảnh hưởng trước khi buộc huỷ (BR-110) |

**Tổng nhóm 8: 5 KHÔNG TỒN TẠI = 5 ✅**

---

### Nhóm 9 — Tiện ích dùng chung (FR-40) — 1 endpoint

✅ Xác nhận: **chưa tồn tại**. Không có `multer`/`cloudinary`/`@supabase/storage-js` trong `package.json`, không có route `/uploads`.

| Endpoint | FR / BR | Trạng thái hiện tại | Mức lệch | Ghi chú |
| --- | --- | --- | --- | --- |
| `POST /uploads/image` | **FR-40**, BR-104, BR-105, BR-111 | — | 🟥 **KHÔNG TỒN TẠI** | `multipart/form-data`, field `file` → **201** `{url}`. `requireAuth + requireActive`, **mọi role** (BR-105), rate-limit **10/giờ/tài khoản**. Kiểm **HAI LỚP** (BR-104): (a) MIME khai báo ∈ `{image/jpeg, image/png, image/webp}` → sai **422 `INVALID_FILE_TYPE`**; (b) **magic bytes** đầu tệp khớp định dạng khai báo (chống giả mạo MIME). Dung lượng ≤5MB → vượt **413 `FILE_TOO_LARGE`**. Tên tệp **tự sinh UUID** (chống path traversal). Chỉ lưu URL, **không** lưu nhị phân trên app server/PG (BR-111). Storage lỗi → **502 `UPLOAD_FAILED`**, không tạo bản ghi nào |

**Tổng nhóm 9: 1 KHÔNG TỒN TẠI = 1 ✅**

---

### Health check (ngoài 49)

| Endpoint | Trạng thái hiện tại | Mức lệch | Ghi chú |
| --- | --- | --- | --- |
| `GET /health` | `src/app.ts:12` — mount ở **root**, ngoài `/api/v1` | 🟧 **SAI CONTRACT** (nhẹ) | Trả `{success:true, data:{status:'UP', timestamp}}`; đặc tả §10: `{ "status": "ok", "uptime": <seconds> }`. Khác cả giá trị lẫn trường. Ảnh hưởng healthcheck Render (NFR-07) |

---

## 4. Danh sách endpoint/module HOÀN TOÀN CHƯA TỒN TẠI — ưu tiên "xây mới"

**26 endpoint + 2 worker + 5 hạng mục hạ tầng.** Xử lý như xây mới, không phải sửa.

### 4.1 Hạ tầng phải làm trước (chặn phần lớn phần còn lại)

| # | Hạng mục | Chặn cái gì |
| --- | --- | --- |
| H1 | `npx prisma db pull` + `npx prisma generate` (introspect-only) | BR-46, BR-56, BR-106, BR-28b, BR-92 — nhóm 2d, 3, 8 |
| H2 | `src/config/redis.ts` (ioredis client) | BR-47, 88, 89, 90, 91, 93, 94, 98 — nhóm 3, 5, 7, 8 |
| H3 | `src/config/bullmq.ts` + `src/workers/` | FR-16, 25, 35, 38 |
| H4 | `requireOwnerOrCoHost` middleware | 4 route đang sai quyền + 4 route sắp xây |
| H5 | `rate-limit-redis` store + 4 điểm áp dụng còn thiếu | §1.6 |

### 4.2 Endpoint xây mới (26)

**Nhóm 1 — Auth & Account (1)**

1. `GET /users/me/feedbacks` — FR-42, BR-122

**Nhóm 2 — Quản lý sự kiện (4)**

2. `PATCH /events/:eventId/updates/:updateId` — FR-31, BR-40b
3. `DELETE /events/:eventId/updates/:updateId` — FR-31, BR-40c
4. `PATCH /events/:eventId/co-hosts/me/accept` — FR-37, BR-46d
5. `PATCH /events/:eventId/co-hosts/me/decline` — FR-37, BR-46d

**Nhóm 3 — Đăng ký & Vé (5) — _module trống hoàn toàn_**

6. `POST /events/:eventId/registrations` — FR-14
7. `GET /registrations/:registrationId` — FR-15/16
8. `POST /registrations/:registrationId/cancel` — FR-34
9. `GET /users/me/tickets` — FR-17
10. `GET /tickets/:ticketId` — FR-18

**Nhóm 4 — Người tham gia (1) — _module trống hoàn toàn_**

11. `GET /events/:eventId/registrations` — FR-41

**Nhóm 5 — Check-in (4) — _module trống hoàn toàn_**

12. `POST /checkin/scan` — FR-19/20
13. `GET /events/:eventId/checkins` — FR-21
14. `GET /events/:eventId/checkins/export` — FR-22
15. `POST /tickets/:ticketId/self-checkin` — FR-36

**Nhóm 6 — Feedback & AI (4) — _module trống hoàn toàn_**

16. `POST /events/:eventId/feedbacks` — FR-23
17. `GET /events/:eventId/feedbacks` — FR-24
18. `POST /events/:eventId/feedbacks/analyze` — FR-25/26
19. `GET /events/:eventId/feedbacks/summary` — FR-28

**Nhóm 7 — Dashboard (1) — _module trống hoàn toàn_**

20. `GET /events/:eventId/dashboard` — FR-27/28

**Nhóm 8 — Quản trị (5) — _module trống hoàn toàn_**

21. `PATCH /admin/users/:userId/status` — FR-29
22. `POST /admin/events/:eventId/force-cancel` — FR-30
23. `POST /admin/organizers` — FR-38
24. `GET /admin/users` — FR-39
25. `GET /admin/events` — FR-39

**Nhóm 9 — Tiện ích (1) — _module trống hoàn toàn_**

26. `POST /uploads/image` — FR-40

### 4.3 Worker nền (2 bắt buộc theo đặc tả + 4 job phụ trợ)

- `workers/processRegistration.ts` — FR-16, BR-51/88/89/93/99
- `workers/sendEventReminder.ts` — FR-35, BR-58/97
- _(job phụ trợ dùng chung hạ tầng: `sendTicketEmail`, `analyzeSentiment`, `sendInvitationEmail` (BR-46b), `sendOrganizerCredentials` (FR-38))_

---

## 5. Mâu thuẫn NỘI TẠI giữa các tài liệu chuẩn

> Đây là mâu thuẫn **tài liệu ↔ tài liệu**, không phải code ↔ tài liệu. **Không tự chọn bên nào đúng** — cần người ra quyết định chốt trước khi implement.

### M1 — FR-29 tự vô hiệu hoá: **403 hay 422?**

| Nguồn | Quy định |
| --- | --- |
| SRS **BR-121** (dòng 2796) | "(a) chính tài khoản Quản trị viên đang thực hiện thao tác … Vi phạm → **HTTP 403** `CANNOT_DISABLE_ADMIN` (MSG-49)" |
| API §8 bảng endpoint | "từ chối với **403 `CANNOT_DISABLE_ADMIN`** nếu `userId` là chính admin đang gọi…" |
| SRS **BR-102** (dòng 2933) | "FR-29 từ chối request có userId trùng với req.user.id (**HTTP 422**)" |
| API §8 dòng "Lỗi đặc thù" | "⭐ **v1.0**: FR-29 từ chối `userId` trùng `req.user.id` → **422** (BR-102…)" |

Cùng một hành động (admin tự vô hiệu chính mình), hai mã trạng thái. Có vẻ BR-102 (v1.0) là bản cũ và BR-121 (v0.6.5) là bản mới bao trùm lên, nhưng **cả hai vẫn còn nguyên trong tài liệu hiện hành** — chưa có dòng nào tuyên bố BR-102 bị thay thế.

### M2 — `EVENT_ALREADY_CANCELLED`: **409 hay 422?**

| Nguồn | Quy định |
| --- | --- |
| API §3.1, FR-11 `POST /events/:id/cancel` | "nếu đã `cancelled` từ trước → **409** `EVENT_ALREADY_CANCELLED`" |
| API §8, FR-30 force-cancel, luồng bước 2 | "Sự kiện đã cancelled → **422** `EVENT_ALREADY_CANCELLED`" |
| API §8 dòng "Lỗi đặc thù" | "`EVENT_ALREADY_CANCELLED` (**422**, khi force-cancel sự kiện đã huỷ)" |
| SRS BR-37c / BR-96(b) | Chỉ ghi "trả lỗi `EVENT_ALREADY_CANCELLED` (MSG-34)" — **không nêu mã HTTP** |

Cùng một mã lỗi, hai HTTP status tuỳ endpoint. Có thể là chủ ý (409 = xung đột trạng thái theo §1.3 vs 422 = vi phạm business rule), nhưng **không có dòng nào giải thích**, và FE rẽ nhánh theo `code` sẽ gặp status không nhất quán. _(Code hiện tại dùng 409 ở FR-11 — khớp §3.1.)_

### M3 — FR-11 (chủ sự kiện tự huỷ): **có bắt buộc nhập lý do hay không?**

| Nguồn | Quy định |
| --- | --- |
| SRS §4.3.8 (tab Cài đặt, dòng 3188) | "nút **Huỷ sự kiện** kèm modal xác nhận + **bắt buộc nhập lý do** (FR-11, BR-106)" |
| API §3.1, FR-11 | `POST /events/:eventId/cancel` — **không định nghĩa request body nào** |
| SRS **BR-106** (dòng 2837) | "khi chủ sự kiện tự huỷ qua FR-11 … `cancel_reason` **có thể để trống** vì tự huỷ không cần giải trình" |
| `schema.sql` dòng 198–199 (comment) | "Chủ sự kiện tự huỷ (FR-11) **có thể để `cancel_reason` NULL**" |

Giao diện bắt buộc nhập, contract không có trường để nhận, business rule nói được để trống. Ba bên nói ba kiểu.

### M4 — §11 gán nhóm cho `GET /users/me/feedbacks` không khớp bảng thực tế

API §11 tính nhóm "Auth & Account" = **10 endpoint** _bao gồm_ `/users/me/feedbacks`, nhưng dòng endpoint này **nằm vật lý trong bảng §4 (Đăng ký & Vé)**, mà §11 lại tính nhóm đó = **5 endpoint** trong khi bảng §4 có **6 dòng**. Tổng 49 chỉ đúng khi ngầm hiểu cách gán chéo này; bản thân các bảng không nói ra. Lỗi trình bày, không ảnh hưởng phạm vi — nhưng dễ khiến người implement đếm nhầm hoặc đặt endpoint sai module.

### M5 — Casing của wire format (API-spec ↔ CLAUDE.md)

API-spec viết field dạng camelCase xuyên suốt (`locationType`, `maxTickets`, `registeredCount`, `myRole`, `checkedInAt`, `isActive`…). CLAUDE.md chốt **snake_case cho toàn bộ field và wrapper key, "không hỏi lại quyết định này"**, và tuyên bố camelCase trong API.md "chỉ mang tính diễn giải".

Đây **không phải mâu thuẫn giữa 4 tài liệu chuẩn** (CLAUDE.md không nằm trong nguồn sự thật) và đã được chốt. Ghi ở đây chỉ để nhắc: **code hiện tại đang lẫn lộn** (xem S10) — cần dọn cho nhất quán, không cần hỏi lại quyết định.

---

## 6. Thứ tự xử lý đề xuất

1. **H1–H5** (hạ tầng, mục 4.1) — chặn mọi thứ phía sau.
2. **Quyết định M1, M2, M3** — cần chốt trước khi code nhóm 2c / nhóm 8.
3. **Chốt casing (S10)** — trước khi sinh thêm field mới ở nhóm 3+.
4. **Vá nhóm 1 + 2** (12 SAI CONTRACT + 4 THIẾU LOGIC) — rẻ, và nhóm 2d (co-host status) là tiền đề cho `requireOwnerOrCoHost`.
5. **Xây nhóm 3 → 5 → 4** (Đăng ký/Vé → Check-in → Người tham gia) — chuỗi phụ thuộc dữ liệu.
6. **Xây nhóm 6 → 7** (Feedback → Dashboard).
7. **Xây nhóm 8 → 9** (Admin → Uploads).
