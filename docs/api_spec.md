# THIẾT KẾ API — UniEvent Flow

_Tài liệu đặc tả REST API — dùng làm API contract giữa Backend (Quang) và Frontend (Dũng)_
_Phiên bản: 0.4.6 — Dựa trên SRS v0.6.8 (FR-01 → FR-42, 42 UC, 127 BR), ERD.md v0.4.1 và SCHEMA.sql v0.4.1_

> **Thay đổi v0.4.6 (Giai đoạn 2 — audit Module 5 Phản hồi):**
> **FR-23 giới hạn `content` ≤ 500 ký tự** — `POST /events/:eventId/feedbacks` nay chặn nhận xét dài quá 500 ký tự → 400 `CONTENT_TOO_LONG`. Lý do: `content` là đầu vào cho phân tích cảm xúc LLM (FR-25); giới hạn độ dài giúp kiểm soát chi phí token và chặn input rác, đồng thời khớp bộ đếm "N/500" trên giao diện gửi phản hồi (M5-S01). Không đổi CSDL (`feedbacks.content` vẫn là `TEXT`; ràng buộc thực thi ở tầng ứng dụng qua Zod). SRS đồng bộ ở BR-68 (v0.6.8).

> **Thay đổi v0.4.5 (Giai đoạn 2 — audit Module 2 Check-in, khớp giao diện ↔ contract):**
> 1. **FR-41 thêm query `search`** — `GET /events/:eventId/registrations` nhận thêm `search?` (khớp một phần trên `name`, không phân biệt hoa thường), phục vụ ô "Tìm theo tên…" ở tab Người tham gia (tương tự `search` của FR-39). Không đổi PII/quyền (vẫn `requireOwnerOrCoHost`, BR-113/114).
> 2. **`/checkin/scan` — result `already_checked_in` trả thêm `checkedInAt`** = `checkin_logs.checkin_time` của lần check-in gốc, để màn "ĐÃ CHECK-IN" hiển thị đúng thời điểm vào lần đầu (giải quyết tranh chấp tại cổng). Không thêm cột CSDL (cột đã có sẵn). Màn "HỢP LỆ" **bỏ** hiển thị mã vé — không cần thêm field.
> Không đụng SCHEMA/ERD (cột `checkin_logs.checkin_time` đã tồn tại). SRS đồng bộ 1 dòng ở BR-114 (v0.6.7).

> **Thay đổi v0.4.4 (Giai đoạn 1 — đồng bộ hoá chéo 4 tài liệu, không đổi contract):**
> 1. **Sửa số liệu tổng ở §11** — bảng FR↔Endpoint cộng ra **49 endpoint REST nghiệp vụ** (không phải 45); tổng đúng là **42 FR → 49 endpoint REST + `GET /health` = 50 endpoint** + 1 worker nền (FR-35). Không thêm/bớt endpoint nào — chỉ sửa con số tổng bị lệch so với chính bảng liệt kê.
> 2. **Cross-reference version** trỏ tới SRS v0.6.6 / ERD v0.4.1 / SCHEMA v0.4.1 (các mục "Đổi gì so với vX" phía dưới là ảnh chụp lịch sử, giữ nguyên số liệu tại thời điểm đó).
> Không đụng SCHEMA/ERD; không đổi bất kỳ đường dẫn/method/body endpoint nào.

> **Thay đổi v0.4.3 (gộp từ đợt rà soát 6 module):**
> 1. **FR-29 thêm guard BR-121** — `PATCH /admin/users/:id/status` trả 403 `CANNOT_DISABLE_ADMIN` khi cố vô hiệu chính mình / admin khác / admin cuối cùng.
> 2. **FR-42 mới** — `GET /users/me/feedbacks` (sinh viên xem phản hồi mình đã gửi, chỉ đọc, BR-122).
> Không đụng SCHEMA/ERD.

> **Thay đổi v0.4.2:** thêm `PATCH` và `DELETE /events/:eventId/updates/:updateId` (sửa/xoá thông báo — FR-31, SRS BR-40b/BR-40c). Đồng bộ với SRS v0.6.4 (workspace 7 tab; bỏ "Lưu nháp" — không có trạng thái `draft`).

---

## 0a. Đổi gì so với v0.1.0 (28 FR → 37 FR)

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

## 0b. Đổi gì so với v0.2.2 (37 FR → 38 FR + rà soát scope 21/07/2026) ⭐ mới

| Nhóm                    | Thay đổi                                                                                                                                                                                                                                                                                                                                                                                                       |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Auth & Account          | `POST /auth/register` **bỏ hẳn** `role`/`organizerCode` khỏi body — chỉ còn tạo tài khoản `student`. `PATCH /users/me` — bộ khoá `socialLinks` đổi thành `{facebook, website, tiktok, discord, instagram, zalo}`.                                                                                                                                                                                              |
| **Quản trị hệ thống**   | Thêm mới `POST /admin/organizers` (FR-38, Provisioning-based) — Admin tạo trực tiếp tài khoản Organizer, thay thế hoàn toàn cho mô hình `organizerCode` cũ.                                                                                                                                                                                                                                                    |
| Quản lý sự kiện         | `POST/PATCH /events` — `category` giờ phải thuộc 1 trong 9 giá trị ENUM cố định (không còn free-text).                                                                                                                                                                                                                                                                                                         |
| **Co-host (FR-37)**     | Viết lại toàn diện: `POST /events/:eventId/co-hosts` đổi từ "gắn ngay" sang **upsert theo trạng thái** (4 nhánh, xem mục 3.4); thêm mới `PATCH /events/:eventId/co-hosts/me/accept` và `.../decline`; Co-host `accepted` giờ có quyền gọi các endpoint đăng thông báo (FR-31), lịch trình (FR-32), check-in (FR-19→22) — đổi Auth từ `Organizer + Owner` thành `Organizer + Owner-or-CoHost` cho các nhóm này. |
| Quản lý sự kiện (FR-12) | `GET /events/mine` mở rộng: trả thêm sự kiện Co-host `accepted`, field `myRole`, và mảng `pendingInvitations`.                                                                                                                                                                                                                                                                                                 |

Mã lỗi mới: `CO_HOST_ALREADY_ACCEPTED` (409), `CANNOT_INVITE_SELF` (422). Mã lỗi **nghỉ hưu** (không còn phát sinh): `INVALID_ORGANIZER_CODE` — giữ nguyên tên trong lịch sử, không tái sử dụng cho lỗi khác.

---

## 0c. Đổi gì so với v0.3.0 (38 FR → 40 FR, gộp 4 đợt rà soát tài liệu — SRS v0.5.0 → v0.6.3) ⭐ mới

Đây là bản cập nhật lớn nhất kể từ v0.1.0, dồn toàn bộ thay đổi của 4 đợt rà soát vào một lần để tránh sửa API contract nhiều lần. **SRS v1.0 là nguồn có thẩm quyền cao nhất; nơi nào tài liệu này mâu thuẫn với SRS thì lấy SRS làm chuẩn.**

| Nhóm                                      | Thay đổi                                                                                                                                                                                                                                                                   |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Chống bán vượt / bù trừ vé** (FR-14/15) | Thêm cơ chế **hoàn vé** khi worker thất bại hoặc hết TTL giữ chỗ 60s (SRS BR-88/89/93); **đồng bộ bộ đếm Redis** khi sửa `maxTickets` (BR-90). `GET /registrations/:id` nay có thể trả `status=failed` kèm gợi ý đăng ký lại (`REGISTRATION_FAILED`).                      |
| **Đăng ký lại sau huỷ** (FR-34)           | `POST /registrations/:id/cancel` nay đổi **cả** `registration.status=cancelled` **và** `ticket.status=cancelled` trong 1 transaction (trước đó chỉ đổi ticket) — nhờ đó sinh viên đăng ký lại được, email nhắc lịch không gửi nhầm, dashboard đếm đúng (BR-56).            |
| **Check-in nguyên tử** (FR-19)            | Thêm khoá Redis `SET checkin:{ticketId} NX EX 86400` chốt kết quả trước khi trả response (BR-91); thêm giá trị `result = expired_ticket` do JWT vé nay **bắt buộc có `exp` = end_time + 24h** (BR-99).                                                                     |
| **Tự check-in online** (FR-36)            | Thêm **cửa sổ thời gian** `[start-15p, end+30p]` và yêu cầu `event.status=active` (BR-95); ngoài khoảng → `SELF_CHECKIN_WINDOW_CLOSED`.                                                                                                                                    |
| **Buộc huỷ sự kiện** (FR-30)              | `POST /admin/events/:id/force-cancel` nay **bắt buộc** body `{reason}` (10–500 ký tự, BR-106), ghi vào 3 cột mới `events.cancel_reason/cancelled_by/cancelled_at`; bỏ qua chặn "đã bắt đầu" (BR-37b) nhưng vẫn chặn "đã huỷ" (BR-37c); huỷ vé + huỷ job nhắc lịch (BR-96). |
| **Thu hồi quyền tức thời** (FR-29)        | `requireActive` nay chạy trên **mọi** request đã xác thực, cache Redis `active:{userId}` TTL 60s, xoá cache ngay khi đổi trạng thái (BR-98, CBR 7) — trước đó tài khoản bị vô hiệu hoá vẫn thao tác được tối đa 2h.                                                        |
| **Tra cứu quản trị (FR-39)** ⭐ FR mới    | Thêm nhóm mới: `GET /admin/users` và `GET /admin/events` — lấp lỗ hổng khiến FR-29/FR-30 không dùng được vì Admin không có cách tra `userId`/`eventId` (mục 8).                                                                                                            |
| **Tải ảnh lên (FR-40)** ⭐ FR mới         | Thêm `POST /uploads/image` — tải tệp ảnh lên dịch vụ bên thứ ba, trả URL để gán cho `coverImage`/`avatarUrl` (mục 9).                                                                                                                                                      |
| Auth & Account                            | `PATCH /users/me` thêm trường `clubName` (chỉ áp dụng khi role=organizer, BR-17); `GET /organizers/:userId` trả thêm `clubName` (BR-26).                                                                                                                                   |
| `GET /events/mine`                        | Chốt hình dạng response là **hai mảng tách rời** `{owned, coHosting, pendingInvitations}` (khớp v0.3.0), khắc phục mâu thuẫn với mô tả "mảng phẳng kèm myRole" từng có ở SRS.                                                                                              |

Mã lỗi mới: `REGISTRATION_FAILED` (nghiệp vụ, hiển thị khi poll), `SELF_CHECKIN_WINDOW_CLOSED` (422), `FILE_TOO_LARGE` (413), `INVALID_FILE_TYPE` (422), `UPLOAD_FAILED` (502). Giá trị `result` mới cho `/checkin/scan`: `expired_ticket`.

**Tổng: 40 FR → 46 endpoint REST** (từ 38 FR/42 endpoint: +2 FR, +4 endpoint — `/admin/users`, `/admin/events`, `/uploads/image`, và tách `GET /events/mine` giữ nguyên) + 1 worker nền (FR-35).

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
- **JWT của vé điện tử (khác accessToken)** ⭐ mới v1.0: payload `{ registrationId, eventId, ticketId, iat, exp }`, **`exp` = `event.end_time` + 24 giờ** (SRS BR-99). Bắt buộc có `exp` để một secret bị lộ không khiến toàn bộ vé lịch sử giả mạo được; vé quá hạn khi quét → `result = expired_ticket`. Lưu ý: chữ ký JWT chỉ xác thực tính toàn vẹn; **trạng thái** vé (valid/checked_in/cancelled) luôn tra từ bảng `tickets` (BR-109).
- Middleware:
  - `requireAuth` — bắt buộc có token hợp lệ
  - `requireRole('organizer' | 'admin')` — kiểm tra role
  - `requireOwnerOnly` ⭐ đổi tên từ `requireOwnership` (v0.3.0, SRS CBR 6) — so `event.organizer_id` (hoặc `registration.user_id`, `ticket` sở hữu gián tiếp qua registration) với `req.user.id`. Dùng cho các thao tác **không thể uỷ quyền cho Co-host**: sửa/huỷ sự kiện (FR-10/11), thêm/xoá Co-host (FR-37).
  - `requireOwnerOrCoHost` ⭐ mới (v0.3.0, SRS CBR 6) — cho qua nếu `event.organizer_id = req.user.id` **HOẶC** tồn tại bản ghi `event_co_hosts` với `user_id = req.user.id` VÀ `status = 'accepted'`. Dùng cho các thao tác Co-host được phép thực hiện: đăng thông báo (FR-31), quản lý lịch trình (FR-32), check-in (FR-19→22). Co-host ở `status = pending`/`declined` **không** thoả điều kiện này.
  - `requireActive` ⭐ **sửa v1.0 (SRS CBR 7, BR-98)** — chạy **ngay sau `requireAuth` trên MỌI endpoint yêu cầu xác thực**, không chỉ ở bước đăng nhập. Kiểm `users.is_active = true`; tài khoản đã vô hiệu hoá → 403 `ACCOUNT_DISABLED`. Để tránh 1 truy vấn CSDL mỗi request, cache trạng thái trên Redis khoá `active:{userId}` TTL 60s, **xoá cache ngay** khi `PATCH /admin/users/:userId/status` đổi trạng thái. Nhờ vậy việc thu hồi quyền có hiệu lực từ request kế tiếp (độ trễ tối đa 60s nếu xoá cache thất bại), thay vì phải chờ accessToken hết hạn tối đa 2 giờ như thiết kế cũ.
- **Ngoại lệ duy nhất**: các endpoint dưới `/admin/*` dùng `requireRole('admin')` và **bỏ qua** `requireOwnerOnly`/`requireOwnerOrCoHost` một cách có chủ đích (ví dụ buộc huỷ sự kiện không thuộc sở hữu) — xem SRS CBR 4. Riêng `POST /admin/organizers` (FR-38) không liên quan ownership của resource nào cả, chỉ cần `requireRole('admin')`.

### 1.5 Phân trang & lọc

Query chuẩn cho mọi list endpoint: `?page=1&limit=20&sort=-created_at`
Lọc riêng theo domain (vd `?category=&club_name=&from=&to=` cho `/events`).

### 1.6 Rate limiting

Áp dụng `express-rate-limit` + store Redis (`rate-limit-redis`) — tái dùng Redis đã có sẵn cho nghiệp vụ đếm vé, không cần thêm hạ tầng. Áp cho:

- `POST /auth/login` — chống brute-force mật khẩu
- `POST /auth/register` — rate-limit theo IP để chống spam tạo tài khoản hàng loạt. ⭐ **Sửa v0.3.0**: lý do ban đầu (chống dò `organizerCode` tĩnh) không còn áp dụng vì `organizerCode` đã bị loại bỏ hoàn toàn (xem mục 0b) — vẫn giữ rate-limit vì lý do chung là chống spam/bot đăng ký, không riêng gì organizerCode nữa.
- `POST /checkin/scan` — theo NFR-01 (≥5 lượt quét/giây/cổng vẫn phải mượt, rate limit chỉ chặn spam bất thường, không chặn quét hợp lệ)
- `POST /events/:eventId/co-hosts` — rate-limit nhẹ theo user để chống spam mời/mời lại liên tục (mỗi lần mời lại đều gửi email, xem mục 3.4).
- `POST /uploads/image` ⭐ mới v1.0 — **10 lần/giờ/tài khoản** để endpoint không trở thành nơi lưu trữ miễn phí cho bên thứ ba; đây là endpoint duy nhất nhận dữ liệu nhị phân (SRS BR-105).

Ngưỡng đề xuất (cấu hình qua env, SRS mục B19-20): login 5 lần/phút/IP · register 3 lần/giờ/IP · mời co-host 10 lần/giờ/user · `/checkin/scan` 20 lần/giây/user · upload 10 lần/giờ/user.

### 1.7 Idempotency (khuyến nghị bổ sung)

`POST /events/:eventId/registrations` nên chấp nhận header tuỳ chọn `Idempotency-Key` để tránh sinh 2 Registration nếu sinh viên bấm nút đăng ký 2 lần do mạng chậm. Áp dụng nguyên tắc tương tự cho `POST /registrations/:registrationId/cancel` và `POST /tickets/:ticketId/self-checkin` — cả hai đều là chuyển trạng thái một chiều nên có thể thiết kế **idempotent theo bản chất** (gọi lại lần 2 khi đã ở trạng thái đích không nên trả lỗi 500, mà trả lỗi nghiệp vụ rõ ràng — xem mã lỗi `REGISTRATION_NOT_CANCELLABLE` ở mục 4).

---

## 2. Nhóm Auth & Account — FR-01 → FR-07, FR-33

| Method | Endpoint                | Auth       | FR        | Mô tả                                                                                                                                                                                                                                                                |
| ------ | ----------------------- | ---------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| POST   | `/auth/register`        | Public     | FR-01     | Body: `{name, email, password}` → 201 `{user}`. ⭐ **Sửa v0.3.0**: không còn nhận `role`/`organizerCode` — server luôn gán cứng `role='student'`. Tài khoản Organizer chỉ được tạo qua `POST /admin/organizers` (FR-38, mục 8)                                       |
| POST   | `/auth/login`           | Public     | FR-02     | Body: `{email, password}` → 200 `{accessToken, expiresIn, user}`. Chặn nếu `is_active=false`                                                                                                                                                                         |
| POST   | `/auth/logout`          | Auth       | FR-03     | 204. Stateless JWT nên chỉ cần client xoá token                                                                                                                                                                                                                      |
| POST   | `/auth/forgot-password` | Public     | FR-07     | Body: `{email}` → luôn trả 202 dù email có tồn tại hay không (chống dò email)                                                                                                                                                                                        |
| POST   | `/auth/reset-password`  | Public     | FR-07     | Body: `{token, newPassword}` → 200. `token` là `reset_token` lưu ở `users`, có `reset_token_expires`                                                                                                                                                                 |
| POST   | `/auth/change-password` | Auth       | FR-04     | Body: `{oldPassword, newPassword}` → 200. NFR-08: hash lại bằng bcrypt trước khi lưu                                                                                                                                                                                 |
| GET    | `/users/me`             | Auth       | FR-05     | 200 `{user}` (không trả `password_hash`)                                                                                                                                                                                                                             |
| PATCH  | `/users/me`             | Auth       | FR-06     | Body: `{name?, avatarUrl?, bio?, socialLinks?, clubName?}` → 200 `{user}`. ⭐ **v1.0**: `clubName` chỉ có ý nghĩa & chỉ được chấp nhận khi `role=organizer` (BR-17) — role khác gửi thì bỏ qua, không báo lỗi. Không cho sửa `email/role/password` qua endpoint này  |
| GET    | `/organizers/:userId`   | **Public** | **FR-33** | 200 `{organizer: {name, clubName, avatarUrl, bio, socialLinks}, events: [...]}` — ⭐ **v1.0** thêm `clubName` (BR-26); chỉ trả nếu `user.role=organizer`; 404 nếu không phải hoặc không tồn tại. `events` chỉ gồm sự kiện `status=active` do organizer này phụ trách |

**Body chi tiết `PATCH /users/me`:**

```json
{
  "name": "Trần Đình Nhật Quang",
  "avatarUrl": "https://cdn.../avatar.png",
  "bio": "Backend & kiến trúc hệ thống — K47 CNPM",
  "socialLinks": {
    "facebook": "https://facebook.com/...",
    "website": "https://...",
    "zalo": "https://zalo.me/..."
  }
}
```

⭐ **Sửa v0.3.0**: `socialLinks` chỉ chấp nhận khoá thuộc đúng tập cố định **`{facebook, website, tiktok, discord, instagram, zalo}`** (SRS mục 5.2, BR-18) — khoá ngoài tập này (kể cả bộ cũ `instagram/x/youtube/tiktok`) bị từ chối ở tầng Zod schema, HTTP 400. Không bắt buộc điền đủ 6 khoá — khoá vắng mặt thì icon tương ứng ẩn trên trang công khai (`GET /organizers/:userId`).

**Lỗi đặc thù nhóm này:** `EMAIL_ALREADY_EXISTS` (409), `INVALID_CREDENTIALS` (401), `RESET_TOKEN_EXPIRED` (400), `ACCOUNT_DISABLED` (403). ⭐ **Nghỉ hưu v0.3.0**: `INVALID_ORGANIZER_CODE` không còn phát sinh (organizerCode đã bị loại bỏ, xem mục 0b).

---

## 3. Nhóm Quản lý sự kiện — FR-08 → FR-13, FR-31, FR-32, FR-37

### 3.1 CRUD sự kiện cơ bản

| Method | Endpoint                  | Auth              | FR    | Mô tả                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ------ | ------------------------- | ----------------- | ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| POST   | `/events`                 | Organizer         | FR-08 | Body: `{title, description?, coverImage?, locationType, location?, joinUrl?, category?, clubName?, startTime, endTime, maxTickets}` → 201 `{event}`. `locationType=in_person` ⇒ `location` bắt buộc; `locationType=online` ⇒ `joinUrl` bắt buộc. ⭐ **v0.3.0**: `category` (nếu gửi) phải thuộc đúng 9 giá trị ENUM cố định (xem mục 5.2 SRS) — giá trị ngoài tập → 400                                                                                                                                                                                                                                                           |
| GET    | `/events`                 | Public            | FR-13 | Query: `q, category, club_name, from, to, page, limit` → 200 danh sách + `ticketsRemaining` mỗi item (đọc từ Redis) + `registeredCount` mỗi item. ⭐ **v0.3.0**: `category` lọc so khớp chính xác giá trị ENUM, không còn so khớp chuỗi con tự do. ⭐ **v1.0 (T3)**: `registeredCount` = số đăng ký đang chiếm chỗ (`registrations.status IN ('confirmed','pending')`), hiển thị công khai dạng "X người tham gia" trên thẻ sự kiện (SRS BR-33b). Không hỗ trợ lọc/sắp theo "sắp hết vé" — giao diện chỉ thể hiện 2 trạng thái đăng ký được / hết vé (`ticketsRemaining = 0`)                                                     |
| GET    | `/events/:eventId`        | Public            | FR-09 | 200 `{event, ticketsRemaining, registeredCount, schedule: [...], updates: [...] (5 mới nhất), coHosts: [...]}` — số vé còn lại lấy real-time từ Redis, không phải PostgreSQL. ⭐ **v1.0 (T3)**: `registeredCount` (`status IN ('confirmed','pending')`) để hiển thị "X người tham gia" (SRS BR-33b); khi `ticketsRemaining = 0` giao diện hiển thị trạng thái **hết vé** (SOLD_OUT/MSG-23), nút đăng ký khoá. `coHosts` chỉ gồm Co-host `status=accepted` (không lộ danh sách đang `pending`/`declined` ra public)                                                                                                                |
| PATCH  | `/events/:eventId`        | Organizer + Owner | FR-10 | Body: `{title?, description?, coverImage?, locationType?, location?, joinUrl?, category?, clubName?, startTime?, endTime?, maxTickets?}` (partial — chỉ gửi trường muốn sửa) → 200 `{event}`. ⭐ **v1.0**: nếu đặt `maxTickets` nhỏ hơn số `registrations.status IN ('confirmed','pending')` hiện tại → 422 `MAX_TICKETS_BELOW_CONFIRMED` (đếm cả `pending` — BR-35). Khi `maxTickets` đổi, hệ thống `INCRBY delta` lên bộ đếm Redis trong cùng Lua script để thay đổi có hiệu lực thực tế (BR-90). Nếu đổi `startTime` → huỷ và lên lịch lại job nhắc lịch (BR-97). Dùng `requireOwnerOnly` — **Co-host không được sửa sự kiện** |
| POST   | `/events/:eventId/cancel` | Organizer + Owner | FR-11 | 200 `{event}` — đổi `status → cancelled` (soft-cancel), **không** dùng `DELETE`. Chỉ cho phép khi `start_time > now`; nếu sự kiện đã bắt đầu/kết thúc → 422 `EVENT_ALREADY_STARTED`; nếu đã `cancelled` từ trước → 409 `EVENT_ALREADY_CANCELLED`. ⭐ **v1.0**: ghi `cancelled_by`=chủ sự kiện, `cancelled_at`=now (BR-106); toàn bộ ticket `valid`→`cancelled` (ticket `checked_in` giữ nguyên); huỷ job nhắc lịch (BR-97). Dùng `requireOwnerOnly` — **Co-host không được huỷ sự kiện**                                                                                                                                          |
| GET    | `/events/mine`            | Organizer         | FR-12 | ⭐ **Mở rộng v0.3.0** (SRS BR-38): 200 `{ owned: [...], coHosting: [...], pendingInvitations: [...] }` — `owned` là sự kiện `organizer_id=req.user.id`; `coHosting` là sự kiện có `event_co_hosts.status=accepted` cho user này (kèm field `myRole: "co-host"` mỗi item); `pendingInvitations` là các lời mời `status=pending` đang chờ user này xác nhận, dùng để hiển thị banner (xem mục 3.4)                                                                                                                                                                                                                                  |

### 3.2 Lịch trình sự kiện — FR-32 ⭐ mới

| Method | Endpoint                                | Auth                                      | Mô tả                                                                                                                                                                 |
| ------ | --------------------------------------- | ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/events/:eventId/schedule`             | Public                                    | 200 danh sách mốc lịch trình, sắp theo `sort_order` (cũng đã nhúng sẵn trong `GET /events/:eventId`, endpoint riêng dùng khi cần tải lại độc lập, ví dụ sau khi edit) |
| POST   | `/events/:eventId/schedule`             | Organizer + **Owner-or-CoHost** ⭐ v0.3.0 | Body: `{startTime, title, location?, sortOrder?}` → 201 `{scheduleItem}`. Dùng `requireOwnerOrCoHost` (SRS BR-42)                                                     |
| PATCH  | `/events/:eventId/schedule/:scheduleId` | Organizer + **Owner-or-CoHost** ⭐ v0.3.0 | 200 `{scheduleItem}`                                                                                                                                                  |
| DELETE | `/events/:eventId/schedule/:scheduleId` | Organizer + **Owner-or-CoHost** ⭐ v0.3.0 | 204                                                                                                                                                                   |

### 3.3 Thông báo sự kiện — FR-31 ⭐ mới

> ⭐ **v1.0 (T5) — thuật ngữ:** nhãn hiển thị trên giao diện là **"Thông báo"** (không dùng từ "Cập nhật"). Giữ nguyên path `/events/:id/updates` và bảng `event_updates` ở tầng code — chỉ đổi nhãn tiếng Việt hiển thị cho người dùng.

| Method | Endpoint                   | Auth                                      | Mô tả                                                                              |
| ------ | -------------------------- | ----------------------------------------- | ---------------------------------------------------------------------------------- |
| GET    | `/events/:eventId/updates`             | Public                                    | Query `page, limit` → 200 danh sách, `created_at DESC`                             |
| POST   | `/events/:eventId/updates`             | Organizer + **Owner-or-CoHost** ⭐ v0.3.0 | Body: `{title, content}` → 201 `{update}`. Dùng `requireOwnerOrCoHost` (SRS BR-40) |
| PATCH  | `/events/:eventId/updates/:updateId`   | Organizer + **Owner-or-CoHost** ⭐ v0.4.2 | Body: `{title?, content?}` (partial) → 200 `{update}`. Sửa nội dung thông báo đã đăng. Dùng `requireOwnerOrCoHost` (SRS BR-40b). ⚠️ **Việc sửa KHÔNG gửi lại email** — email đã gửi ở lần đăng đầu không thu hồi/không cập nhật được; chỉ sửa bản hiển thị trong feed sự kiện. `updateId` phải thuộc đúng `eventId` (khác → 404 `UPDATE_NOT_FOUND`) |
| DELETE | `/events/:eventId/updates/:updateId`   | Organizer + **Owner-or-CoHost** ⭐ v0.4.2 | 204 — xoá thông báo khỏi feed. Dùng `requireOwnerOrCoHost` (SRS BR-40c). ⚠️ Email đã gửi trước đó **không thu hồi được**; xoá chỉ gỡ khỏi danh sách hiển thị. `updateId` phải thuộc đúng `eventId` (khác → 404 `UPDATE_NOT_FOUND`) |

### 3.4 Co-host — FR-37 ⭐ **viết lại toàn diện v0.3.0** (trước đây "CLB/Ban tổ chức đồng hành", thuần hiển thị)

**a) Chủ sự kiện mời / xoá Co-host** — dùng `requireOwnerOnly` (SRS BR-44)

| Method | Endpoint                            | Auth              | Mô tả                                                            |
| ------ | ----------------------------------- | ----------------- | ---------------------------------------------------------------- |
| POST   | `/events/:eventId/co-hosts`         | Organizer + Owner | Body: `{userId}` → xem logic upsert 4 nhánh bên dưới (SRS BR-46) |
| DELETE | `/events/:eventId/co-hosts/:userId` | Organizer + Owner | 204 — gỡ Co-host bất kỳ lúc nào, bất kể `status` hiện tại là gì  |

**Logic `POST /events/:eventId/co-hosts` (upsert theo trạng thái, SRS BR-46):**

```
1. Kiểm tra userId có role=organizer (không thì 422 CO_HOST_NOT_ORGANIZER)
2. Kiểm tra userId ≠ event.organizer_id (không thì 422 CANNOT_INVITE_SELF — ⭐ mới)
3. Tra bản ghi event_co_hosts hiện có cho (event_id, userId):
   a. Không có bản ghi        → INSERT status='pending' → 201 {coHost}, gửi email mời
   b. Có, status='declined'   → UPDATE status='pending' → 200 {coHost}, gửi lại email mời
   c. Có, status='pending'    → không đổi gì, có thể gửi lại email → 200 {coHost}
   d. Có, status='accepted'   → 409 CO_HOST_ALREADY_ACCEPTED (⭐ mới) — KHÔNG tự động
      reset về pending, tránh vô tình tước quyền đang có hiệu lực
```

**b) Người được mời tự xác nhận** ⭐ hoàn toàn mới v0.3.0 — dùng `requireAuth` + kiểm tra bản ghi thuộc về `req.user.id` (SRS BR-46d, UC-17b)

| Method | Endpoint                               | Auth                             | Mô tả                                                                                                                 |
| ------ | -------------------------------------- | -------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| PATCH  | `/events/:eventId/co-hosts/me/accept`  | Organizer (chính người được mời) | Chuyển bản ghi của `req.user.id` từ `pending → accepted` → 200 `{coHost}`. Không có bản ghi `pending` tương ứng → 404 |
| PATCH  | `/events/:eventId/co-hosts/me/decline` | Organizer (chính người được mời) | Chuyển `pending → declined` → 200 `{coHost}`. Không có bản ghi `pending` tương ứng → 404                              |

Sau khi `accepted`, Co-host có quyền gọi các endpoint dùng `requireOwnerOrCoHost`: đăng thông báo (mục 3.3), quản lý lịch trình (mục 3.2), check-in (mục 5). **Không** có quyền: sửa/huỷ sự kiện (mục 3.1), thêm/xoá Co-host khác (mục 3.4a).

Co-host **không có** endpoint chỉnh sửa "mức quyền" riêng — chỉ có đúng 1 gói quyền cố định khi `accepted` (không phải hệ thống phân quyền tuỳ biến từng cấp). Dùng chung `GET /organizers/:userId` (mục 2) để click-to-profile.

**Không gửi thông báo ngược cho chủ sự kiện** khi Co-host accept/decline (SRS BR-46e) — chủ sự kiện tự `GET /events/mine` (field `coHosting`) hoặc xem danh sách Co-host trong `GET /events/:eventId` để biết trạng thái.

**Lỗi đặc thù nhóm này:** `EVENT_NOT_FOUND` (404), `FORBIDDEN_NOT_OWNER` (403), `CO_HOST_NOT_ORGANIZER` (422), `CANNOT_INVITE_SELF` (422, ⭐ mới v0.3.0), `CO_HOST_ALREADY_ACCEPTED` (409, ⭐ mới v0.3.0).

---

## 4. Nhóm Đăng ký & Vé điện tử — FR-14 → FR-18, FR-34, FR-35

Đây là nhóm quan trọng nhất về mặt kỹ thuật (chống oversell), nên thiết kế API phản ánh đúng luồng bất đồng bộ ở SRS mục 2.2.3 / BR-47→BR-58.

| Method | Endpoint                                | Auth            | FR               | Mô tả                                                                                                                                                                                                                                               |
| ------ | --------------------------------------- | --------------- | ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| POST   | `/events/:eventId/registrations`        | Student         | FR-14            | Xem chi tiết luồng bên dưới                                                                                                                                                                                                                         |
| GET    | `/registrations/:registrationId`        | Owner           | FR-15/16         | Polling trạng thái xử lý → 200 `{status: pending\|confirmed\|failed, ticket?}`                                                                                                                                                                      |
| POST   | `/registrations/:registrationId/cancel` | Student + Owner | **FR-34** ⭐ mới | Chỉ khi `status=confirmed` và `ticket.status=valid` → 200 `{registration, ticket}`, hoàn 1 vé về Redis. Vé đã `checked_in` → 422 `CANNOT_CANCEL_CHECKED_IN_TICKET`; registration đã `cancelled/failed/pending` → 422 `REGISTRATION_NOT_CANCELLABLE` |
| GET    | `/users/me/tickets`                     | Student         | FR-17            | 200 danh sách vé của sinh viên                                                                                                                                                                                                                      |
| GET    | `/users/me/feedbacks`                   | Student         | FR-42 ⭐ v0.4.3   | 200 danh sách **phản hồi do chính người dùng đã gửi** (`{eventName, rating, content, createdAt}`), chỉ đọc. Lọc theo `feedbacks.user_id = sub` (JWT). Phục vụ màn "Phản hồi đã gửi" (SRS §4.6.3, BR-122). Khác `GET /events/:id/feedbacks` (FR-24, dành cho Ban tổ chức) |
| GET    | `/tickets/:ticketId`                    | Owner           | FR-18            | 200 `{ticket, qrCodeDataUrl}`                                                                                                                                                                                                                       |

### Luồng `POST /events/:eventId/registrations` (bám theo SRS §2.2.3, BR-87→50)

```
0. ⭐ v1.0 (BR-87): kiểm requireRole('student') + event.status='active' + start_time>now
   → vi phạm bất kỳ điều nào: 422 EVENT_NOT_REGISTRABLE, KHÔNG chạm Redis
   (đặt TRƯỚC bước giảm đếm để request vào sự kiện đã huỷ không trừ mất 1 vé)
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

### Luồng `POST /registrations/:registrationId/cancel` (BR-55, BR-56) ⭐ sửa v1.0

```
1. Kiểm tra ownership (registration.user_id = req.user.id) + status hiện tại
2. status ≠ confirmed          → 422 REGISTRATION_NOT_CANCELLABLE (MSG-32)
   ticket.status = checked_in  → 422 CANNOT_CANCEL_CHECKED_IN_TICKET (MSG-25)
3. Hợp lệ → trong 1 transaction PostgreSQL: registration.status = cancelled
   VÀ ticket.status = cancelled  (⭐ v1.0: bản trước chỉ đổi ticket, khiến bản ghi
   registration vẫn nằm ở 'confirmed' → chặn đăng ký lại, gửi nhầm email nhắc lịch,
   dashboard đếm sai — BR-56)
4. SAU KHI commit thành công mới INCR 1 đơn vị bộ đếm vé về Redis (thứ tự có chủ đích:
   hoàn vé trước rồi transaction fail sẽ phát dư 1 suất)
5. Trả 200 ngay — không cần xử lý bất đồng bộ
```

Sinh viên được **đăng ký lại** sự kiện sau khi huỷ: unique index `uq_registration_active_per_user_event` chỉ chặn bản ghi `pending`/`confirmed`, nên bản ghi `cancelled` tự động rơi ra khỏi ràng buộc (BR-49).

### Bù trừ tồn kho vé — ⭐ mới v1.0 (BR-88/89/93)

Worker xử lý đăng ký (`processRegistration`) phải hoàn vé khi thất bại, nếu không mỗi lỗi làm mất vĩnh viễn 1 vé (undersell):

```
- Đồng thời khi tạo Registration: đặt khoá hold:{registrationId} TTL 60s trên Redis (BR-88)
- Worker thành công → sinh Ticket, registration=confirmed, XOÁ khoá hold (BR-51)
- Worker thất bại HOẶC hết TTL 60s mà vẫn pending:
    UPDATE registrations SET status='failed' WHERE id=? AND status='pending'
    - Nếu ảnh hưởng 1 dòng → INCR hoàn 1 vé về Redis (BR-89)
    - Nếu ảnh hưởng 0 dòng → đã xử lý bởi luồng khác, KHÔNG hoàn vé lần hai (BR-93, idempotent)
```

`GET /registrations/:id` khi đó trả `status=failed`; frontend hiển thị `REGISTRATION_FAILED` (MSG-43) kèm gợi ý thử lại.

### Worker nền — FR-35 (không có endpoint)

`workers/sendEventReminder.ts` — job BullMQ (jobId cố định `reminder:{eventId}`) lên lịch theo `event.start_time - N giờ`. ⭐ **v1.0 (BR-97)**: vòng đời job gắn với sự kiện — **huỷ & lên lịch lại** khi `startTime` đổi; **huỷ** khi sự kiện `cancelled`. Danh sách người nhận truy vấn `registrations.status=confirmed` **tại thời điểm job chạy** (không phải lúc lên lịch), nên người đã huỷ/thất bại tự động bị loại (BR-58).

**Lỗi đặc thù nhóm này:** `SOLD_OUT` (409), `DUPLICATE_REGISTRATION` (409), `EVENT_NOT_REGISTRABLE` (422, ⭐ mới v1.0 — BR-87: sai role / sự kiện không active / đã bắt đầu), `CANNOT_CANCEL_CHECKED_IN_TICKET` (422), `REGISTRATION_NOT_CANCELLABLE` (422), `REGISTRATION_FAILED` (nghiệp vụ khi poll, ⭐ mới v1.0).

---

## 4b. Danh sách người đăng ký — FR-41 ⭐ mới v1.0

| Method | Endpoint                         | Auth                            | FR    | Mô tả                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ------ | -------------------------------- | ------------------------------- | ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/events/:eventId/registrations` | Organizer + **Owner-or-CoHost** | FR-41 | Query `page, limit, status?, search?` (`status` ∈ `confirmed\|pending\|cancelled\|failed`; `search` khớp một phần trên `name`, không phân biệt hoa thường — ⭐ **mới v0.4.5**, phục vụ ô "Tìm theo tên…") → 200 `{ items: [{ userId, name, email, registeredAt, regStatus, checkinStatus }], total, page, limit }`. Trả danh sách người đã đăng ký của sự kiện, phục vụ tab "Người tham gia & Check-in". `checkinStatus` suy ra từ `tickets.status`/`checkin_logs` (`not_checked_in\|checked_in`). Dùng `requireOwnerOrCoHost` (SRS BR-113). ⚠️ Trả `email` là dữ liệu cá nhân (PII) — chỉ lộ cho chủ sự kiện/Co-host đã `accepted`, không public (SRS BR-114) |

`registeredCount` công khai (FR-09/FR-13) và endpoint FR-41 này khác nhau về mục đích: `registeredCount` chỉ là **con số** hiển thị công khai; FR-41 là **danh sách chi tiết kèm PII**, chỉ dành cho người vận hành sự kiện. Tab UI gộp danh sách này với nút Quét QR (FR-19) và lịch sử check-in (FR-21) — xem SRS §4.3 (tab "Người tham gia & Check-in").

## 5. Nhóm Check-in tại cổng — FR-19 → FR-22, FR-36

| Method | Endpoint                           | Auth                                      | FR        | Mô tả                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ------ | ---------------------------------- | ----------------------------------------- | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| POST   | `/checkin/scan`                    | Organizer + **Owner-or-CoHost** ⭐ v0.3.0 | FR-19/20  | Body: `{qrToken}` → xác thực chữ ký JWT + kiểm `exp` (BR-99), trả kết quả **đồng bộ** trong <1s. ⭐ **v1.0 (BR-91)**: trước khi trả kết quả, đặt khoá `SET checkin:{ticketId} NX EX 86400` trên Redis để chốt nguyên tử — hai lần quét cùng vé chỉ 1 lần nhận `valid`, lần sau `already_checked_in`. Ghi `checkin_logs` + đổi `ticket.status` làm **bất đồng bộ** sau khi trả response (BR-62); nếu ghi thất bại sau retry → giải phóng khoá để quét lại (BR-94). **Chỉ áp dụng cho `location_type=in_person`** (BR-60). Dùng `requireOwnerOrCoHost` |
| GET    | `/events/:eventId/checkins`        | Organizer + **Owner-or-CoHost** ⭐ v0.3.0 | FR-21     | 200 danh sách check-in (gồm cả `checkin_method` để phân biệt quét tại cổng và tự check-in online)                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| GET    | `/events/:eventId/checkins/export` | Organizer + **Owner-or-CoHost** ⭐ v0.3.0 | FR-22     | 200, `Content-Type: text/csv` — xuất file trực tiếp, không cần lưu file trung gian                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| POST   | `/tickets/:ticketId/self-checkin`  | Student + Owner                           | **FR-36** | Chỉ hoạt động nếu `event.location_type=online` (ngược lại 422 `EVENT_NOT_ONLINE`). ⭐ **v1.0 (BR-95)**: chỉ chấp nhận khi `event.status=active` VÀ thời điểm hiện tại trong khoảng **[start_time − 15p, end_time + 30p]**; ngoài khoảng → 422 `SELF_CHECKIN_WINDOW_CLOSED`. Ghi `checkin_logs` với `organizer_id=NULL, checkin_method=self`, đổi `ticket.status=checked_in` → 200 `{ticket}`                                                                                                                                                         |

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

Các giá trị `result`: `valid` | `already_checked_in` | `invalid_signature` | `event_mismatch` | `cancelled_ticket` | `expired_ticket` (⭐ mới v1.0, khi quá `exp` = end_time + 24h). Trả `result` thay vì chỉ mã HTTP giúp organizer UI hiển thị đúng loại lỗi (vé dùng lại vs vé giả vs vé hết hạn) mà vẫn giữ HTTP 200 cho một request kỹ thuật hợp lệ.

⭐ **v0.4.5** — khi `result = already_checked_in`, `data` trả kèm `checkedInAt` (= `checkin_logs.checkin_time` của lần check-in gốc) để màn "ĐÃ CHECK-IN" hiển thị đúng thời điểm vào lần đầu:

```json
{ "success": true, "data": { "result": "already_checked_in", "attendee": { "name": "...", "eventTitle": "..." }, "checkedInAt": "2026-07-30T18:04:00+07:00" } }
```

Ánh xạ **màn kết quả** (Module 2): `valid` → HỢP LỆ (xanh); `already_checked_in` → ĐÃ CHECK-IN (hổ phách, kèm `checkedInAt`); `invalid_signature` / `event_mismatch` / `cancelled_ticket` / `expired_ticket` → TỪ CHỐI (đỏ) với phụ đề đổi theo `result` — lần lượt "Vé không hợp lệ." / "Vé thuộc sự kiện khác." / "Vé đã bị huỷ." / "Vé đã hết hiệu lực." (MSG-45). Các chuỗi phụ đề này có thể bổ sung vào bảng MSG ở lần cập nhật SRS sau.

**Response `/tickets/:ticketId/self-checkin`:**

```json
{
  "success": true,
  "data": { "ticket": { "id": "...", "status": "checked_in" } }
}
```

Không có khái niệm `result` như luồng quét QR vì đây là hành động chủ động của chính sinh viên (không có khả năng "vé giả"/"nhầm sự kiện" như khi tổ chức quét cho người khác) — chỉ cần 200 hoặc lỗi nghiệp vụ rõ ràng.

**Lỗi đặc thù nhóm này:** `EVENT_NOT_ONLINE` (422), `SELF_CHECKIN_WINDOW_CLOSED` (422, ⭐ mới v1.0), ngoài ra dùng chung `result` codes ở trên cho `/checkin/scan`.

---

## 6. Nhóm Feedback & Phân tích cảm xúc AI — FR-23 → FR-26, FR-28

| Method | Endpoint                             | Auth                                          | FR       | Mô tả                                                                                                                                                                                                                                                                                            |
| ------ | ------------------------------------ | --------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| POST   | `/events/:eventId/feedbacks`         | Student                                       | FR-23    | Body: `{rating, content?}`. `rating` **bắt buộc**, số nguyên 1–5; thiếu/sai khoảng → 400 `RATING_REQUIRED`. `content` **tuỳ chọn**, tối đa **500 ký tự** — vượt → 400 `CONTENT_TOO_LONG` (⭐ v0.4.6). Chỉ chấp nhận nếu sinh viên có `ticket.status=checked_in` cho sự kiện đó (điều kiện "đã tham dự" — thoả cả với luồng quét QR lẫn tự check-in online ở FR-36) |
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

## 8. Nhóm Quản trị hệ thống (Admin) — FR-29, FR-30, FR-38, FR-39 ⭐ FR-39 mới v1.0

| Method | Endpoint                              | Auth  | FR               | Mô tả                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ------ | ------------------------------------- | ----- | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PATCH  | `/admin/users/:userId/status`         | Admin | FR-29            | Body: `{isActive: boolean}` → 200 `{user}`. `isActive=false` khiến tài khoản không đăng nhập được (dù mật khẩu đúng) từ request kế tiếp. ⭐ **v0.4.3 (BR-121):** từ chối với **403 `CANNOT_DISABLE_ADMIN`** nếu `userId` là chính admin đang gọi, là một tài khoản `role=admin` khác, hoặc là admin cuối cùng đang `is_active=true`. Giao diện phải khoá/ẩn công tắc trên các dòng đó (SRS §4.8.1) |
| POST   | `/admin/events/:eventId/force-cancel` | Admin | FR-30            | ⭐ **v1.0**: Body **bắt buộc** `{reason}` (10–500 ký tự, BR-106) → 200 `{event}`. Bỏ qua `requireOwnerOnly`, chỉ cần `requireRole('admin')`. Xem luồng chi tiết bên dưới                                                                                                                                                                                                                                                                  |
| POST   | `/admin/organizers`                   | Admin | **FR-38**        | Body: `{name, email, clubName?}` → 201 `{organizer: {id, name, email, role: "organizer", clubName}}` — ⭐ **v1.0**: `clubName` nay được lưu vào `users.club_name` (BR-92). Xem luồng chi tiết bên dưới                                                                                                                                                                                                                                    |
| GET    | `/admin/users`                        | Admin | **FR-39** ⭐ mới | Query: `search?, role?, isActive?, page?, limit?` → 200 danh sách + phân trang. Lọc `search` khớp một phần trên `name` hoặc `email` (không phân biệt hoa thường), `role ∈ {student,organizer,admin}`, `isActive ∈ {true,false}`. **Endpoint DUY NHẤT trả email của người khác** (BR-100/101); KHÔNG bao giờ trả `password_hash`/`reset_token`. Mỗi bản ghi gắn cờ để UI vô hiệu hoá nút thao tác trên chính Admin đang đăng nhập (BR-102) |
| GET    | `/admin/events`                       | Admin | **FR-39** ⭐ mới | Query: `search?, status?, organizerId?, page?, limit?` → 200 danh sách + phân trang. ⭐ Trả sự kiện ở **mọi trạng thái, gồm cả `cancelled`** (BR-103) — khác `GET /events` public vốn chỉ trả `active`. Mỗi bản ghi kèm tên/email BTC và số vé đã phát hành để đánh giá ảnh hưởng trước khi buộc huỷ (BR-110)                                                                                                                             |

**Luồng `POST /admin/events/:eventId/force-cancel` (⭐ mới v1.0, SRS BR-96/106):**

```
1. Validate body {reason}: bắt buộc, 10-500 ký tự (BR-106) → thiếu/ngắn: 422
2. Sự kiện đã cancelled → 422 EVENT_ALREADY_CANCELLED (giữ chặn BR-37c)
   (⭐ KHÁC FR-11: Admin KHÔNG bị chặn bởi "đã bắt đầu" BR-37b — buộc huỷ được cả
    sự kiện đang diễn ra, vì vi phạm chính sách thường lộ ra SAU khi bắt đầu — BR-96)
3. Trong 1 transaction: status='cancelled', ghi cancel_reason/cancelled_by(=adminId)/cancelled_at
4. Toàn bộ ticket 'valid' → 'cancelled'; ticket 'checked_in' GIỮ NGUYÊN (dữ liệu tham dự thật)
5. Huỷ job nhắc lịch reminder:{eventId} (BR-97). KHÔNG hoàn vé Redis (sự kiện không nhận ĐK nữa)
6. Trả 200 {event}
```

**Luồng `POST /admin/organizers` (Provisioning-based, SRS BR-82→86):**

```
1. Validate {name, email} (CBR1); email KHÔNG bắt buộc do trường cấp phát chính thức —
   chỉ cần là email cá nhân/công vụ mà người được cấp tài khoản kiểm soát được.
2. Kiểm tra UNIQUE trên email (chung 1 ràng buộc với /auth/register) → trùng thì
   409 EMAIL_ALREADY_EXISTS (tái sử dụng mã lỗi có sẵn, không tạo mã riêng)
3. Sinh mật khẩu ngẫu nhiên (không đoán được), hash bằng bcrypt trước khi lưu.
   Mật khẩu plaintext CHỈ tồn tại trong nội dung email gửi đi bước 5 — không log,
   không lưu ở bất kỳ đâu khác (CBR2).
4. INSERT users với role='organizer', is_active=true.
5. Đẩy job gửi email (BullMQ, dùng chung hạ tầng với FR-16/FR-35) chứa email +
   mật khẩu tạm. Không chặn response chính.
6. Trả 201 ngay, không đợi email gửi xong (giống pattern FR-16 sinh vé).
```

Tài khoản Organizer tạo qua endpoint này **luôn độc lập** với bất kỳ tài khoản Student nào của cùng một người (nếu có) — không có cơ chế "nâng cấp"/hợp nhất 2 tài khoản (SRS Assumption #8, mục 6.9).

⭐ **v1.0**: lỗ hổng "Admin không có cách tra `userId`/`eventId`" nêu ở v0.3.0 nay đã được xử lý bằng nhóm FR-39 (`GET /admin/users`, `GET /admin/events`) ở bảng trên — FR-29/FR-30 nay dùng được thực tế, không chỉ đúng trên giấy.

**Lỗi đặc thù nhóm này:** dùng chung `403 FORBIDDEN` (sai role) và `404` (user/event không tồn tại); `EMAIL_ALREADY_EXISTS` (409, tái sử dụng cho FR-38); `EVENT_ALREADY_CANCELLED` (422, khi force-cancel sự kiện đã huỷ). ⭐ **v1.0**: FR-29 từ chối `userId` trùng `req.user.id` → 422 (BR-102, Admin không tự khoá được chính mình vì không có luồng tạo lại Admin ngoài script seed).

---

## 9. Nhóm Tiện ích dùng chung — FR-40 ⭐ mới v1.0

| Method | Endpoint         | Auth                     | FR               | Mô tả                                                                                                                                                                                                                                    |
| ------ | ---------------- | ------------------------ | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| POST   | `/uploads/image` | Auth + Active (mọi role) | **FR-40** ⭐ mới | `multipart/form-data`, field `file` → 201 `{url}`. Tải tệp ảnh lên dịch vụ lưu trữ bên thứ ba (Cloudinary/Supabase Storage), trả về URL công khai để client gán vào `coverImage` (FR-08/31) hoặc `avatarUrl` (FR-06) ở request tiếp theo |

**Luồng `POST /uploads/image` (SRS BR-104/105/111):**

```
1. requireAuth + requireActive (không giới hạn role); rate-limit 10 lần/giờ/user (BR-105)
2. Kiểm tra HAI LỚP (BR-104):
   a. MIME type khai báo ∈ {image/jpeg, image/png, image/webp}  → sai: 422 INVALID_FILE_TYPE
   b. Magic bytes đầu tệp khớp định dạng khai báo (chống giả mạo MIME)
   Dung lượng ≤ 5 MB → vượt: 413 FILE_TOO_LARGE
   Tên tệp tự sinh theo UUID (KHÔNG dùng tên gốc — chống path traversal)
3. Đẩy tệp lên dịch vụ lưu trữ bên thứ ba; CHỈ lưu URL trả về, không lưu tệp nhị phân
   trên máy chủ ứng dụng / PostgreSQL (BR-111)
4. Dịch vụ lưu trữ lỗi/không phản hồi → 502 UPLOAD_FAILED, KHÔNG tạo bản ghi nào
5. Trả 201 { url }
```

**Response:**

```json
{
  "success": true,
  "data": { "url": "https://res.cloudinary.com/.../abc123.png" }
}
```

Endpoint chỉ trả URL; việc gán URL vào sự kiện/hồ sơ là request riêng (tách 2 bước để người dùng xem trước ảnh trước khi lưu, và tránh một lần tải ảnh lỗi làm hỏng cả thao tác tạo sự kiện). Ảnh đã tải lên **không** bị xoá tự động khi sự kiện/tài khoản bị huỷ (SRS Assumption #13 — dọn thủ công định kỳ, ngoài phạm vi 7 tuần).

**Lỗi đặc thù nhóm này:** `INVALID_FILE_TYPE` (422), `FILE_TOO_LARGE` (413), `UPLOAD_FAILED` (502) — tất cả ⭐ mới v1.0.

---

## 10. Health check

```
GET /health  → 200 { "status": "ok", "uptime": <seconds> }
```

Dùng cho Render healthcheck khi deploy (NFR-07, nay là mục 6.4/6.6 trong SRS).

---

## 11. Bảng tổng hợp FR ↔ Endpoint

| Nhóm FR                                   | Số lượng FR   | Endpoint tương ứng                                                                                                                                                   |
| ----------------------------------------- | ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Auth & Account (FR-01→07, 33, 42)         | 9             | 10 endpoint (`/auth/*`, `/users/me`, `/users/me/feedbacks` ⭐ v0.4.3, `/organizers/:userId`)                                                                          |
| Quản lý sự kiện (FR-08→13, 31, 32, 37)    | 9             | **18 endpoint** ⭐ v0.4.2 (`/events*`, `/events/:id/schedule*`, `/events/:id/updates*` **gồm PATCH/DELETE mới**, `/events/:id/co-hosts*` **+ `/co-hosts/me/accept`, `/co-hosts/me/decline`**) |
| Đăng ký & Vé (FR-14→18, 34, 35)           | 7             | 5 endpoint (`/registrations*`, `/tickets/:id`) + 1 worker nền không endpoint                                                                                         |
| Người tham gia (FR-41) ⭐ mới v1.0        | 1             | 1 endpoint (`GET /events/:id/registrations`) — danh sách người đăng ký, gộp UI với Check-in                                                                          |
| Check-in (FR-19→22, 36)                   | 5             | 4 endpoint (`/checkin/scan`, `/events/:id/checkins*`, `/tickets/:id/self-checkin`)                                                                                   |
| Feedback & AI (FR-23→26)                  | 4             | 4 endpoint (`/events/:id/feedbacks*`)                                                                                                                                |
| Dashboard (FR-27, 28)                     | 2             | 1 endpoint (`/events/:id/dashboard`, tái dùng `/feedbacks/summary`)                                                                                                  |
| **Quản trị hệ thống (FR-29, 30, 38, 39)** | **4** ⭐ v1.0 | **5 endpoint** ⭐ v1.0 (`/admin/users/:id/status`, `/admin/events/:id/force-cancel`, `/admin/organizers`, **`GET /admin/users`, `GET /admin/events`**)               |
| **Tiện ích dùng chung (FR-40)** ⭐ v1.0   | **1**         | **1 endpoint** (`POST /uploads/image`)                                                                                                                               |

Tổng: **42 FR → 49 endpoint REST nghiệp vụ + `GET /health` = 50 endpoint** (cộng trực tiếp từ cột "Số lượng" của bảng trên: 10 + 18 + 5 + 1 + 4 + 4 + 1 + 5 + 1 = 49) + 1 worker nền không lộ endpoint (FR-35). _Lịch sử tăng trưởng: 28 FR (v0.1.0) → 37 → 38 → 40 → 42 FR; các mốc trước là ảnh chụp lịch sử ở các mục "Đổi gì so với vX"._ Một số FR nền tảng/hệ thống (FR-15, FR-16, FR-20, FR-25, FR-26) không có endpoint riêng vì được thực hiện bên trong luồng của endpoint cha hoặc trong worker nền; FR-35 là worker thuần.

---

## 12. Cấu trúc thư mục backend đề xuất

```
src/
  config/          # env, db, redis, bullmq connection
  schemas/         # zod schema — dùng chung cho validate request + sinh OpenAPI
  routes/          # express Router theo domain (auth, events, registrations, checkin, feedbacks, dashboard, admin)
  controllers/      # nhận req, gọi service, trả response theo envelope chuẩn
  services/        # business logic (redis atomic decrement, jwt sign/verify, llm call...)
  workers/         # BullMQ worker: processRegistration, sendTicketEmail, sendEventReminder, analyzeSentiment
  middlewares/     # requireAuth, requireRole, requireOwnerOnly, requireOwnerOrCoHost, requireActive, errorHandler, rateLimiter
  docs/            # openapi registry + generator (xem phần 12)
  server.ts
```

⭐ **v1.0**: thêm `routes/uploads.ts` (FR-40) và mở rộng `routes/admin.ts` với 2 route tra cứu (FR-39). `middlewares/requireActive.ts` nay áp cho **mọi** route đã xác thực với cache Redis (CBR 7). Worker `processRegistration` bổ sung nhánh bù trừ vé (BR-89/93); worker `analyzeSentiment` giữ nguyên. Các domain còn lại mở rộng route con trong file/router hiện có, không cần domain mới.

---

## 13. Đề xuất công cụ xuất API Document (tương đương Springdoc OpenAPI)

Springdoc trong Spring hoạt động theo kiểu **code-first**: đọc annotation trực tiếp trên controller/DTO, tự sinh OpenAPI spec + Swagger UI, không cần viết YAML tay. Với stack Node/Express/TypeScript hiện tại của nhóm (đã dùng **zod** để validate), có 3 lựa chọn tương đương, xếp theo mức độ phù hợp:

| Giải pháp                                                                  | Cách hoạt động                                                                                                                      | Ưu điểm                                                                                                                            | Nhược điểm                                                                                                                                                               |
| -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **`@asteasolutions/zod-to-openapi` + `swagger-ui-express`** ⭐ khuyến nghị | Định nghĩa schema bằng zod (đã có sẵn trong stack) → gắn `.openapi()` → generator tự sinh spec từ chính schema dùng để validate     | 1 nguồn sự thật duy nhất (schema = validation + docs, không lệch nhau); gần với triết lý "chỉ viết code, docs tự ra" của Springdoc | Cần đăng ký path thủ công qua `registry.registerPath()` (không quét tự động như annotation Spring)                                                                       |
| `swagger-jsdoc` + `swagger-ui-express`                                     | Viết comment JSDoc `@openapi` phía trên mỗi route, tool quét comment sinh spec                                                      | Cài nhanh, không đổi kiến trúc code hiện tại                                                                                       | Comment và code (zod schema) là 2 nguồn riêng biệt → dễ lệch nhau khi sửa gấp, không tận dụng được zod đã có                                                             |
| `tsoa` (decorator-based)                                                   | Viết controller dạng class + decorator (`@Route`, `@Post`, `@Body`...), tool build-time tự sinh routes **và** OpenAPI spec cùng lúc | Trải nghiệm gần Springdoc nhất (thật sự tự động, không cần đăng ký path thủ công)                                                  | Phải chuyển toàn bộ route sang class + decorator, cần bật `experimentalDecorators` — khối lượng refactor không đáng trong 7 tuần vì team đã chọn kiến trúc Express thuần |

**Khuyến nghị: dùng phương án 1.** Lý do ngắn gọn: nhóm đã có `zod` trong danh sách thư viện dự kiến dùng để validate input — tận dụng lại chính schema đó để sinh OpenAPI thay vì viết thêm một bộ định nghĩa riêng, vừa tiết kiệm thời gian (quan trọng với deadline 7 tuần), vừa đảm bảo docs không bao giờ lệch với validate thật. Với 46 endpoint (tăng từ 26), việc dùng chung 1 nguồn schema càng quan trọng hơn để tránh docs lệch khi khối lượng route tăng gần gấp đôi.

Cài đặt:

```bash
npm install zod @asteasolutions/zod-to-openapi swagger-ui-express
npm install -D @types/swagger-ui-express
```

> Lưu ý version: `zod-to-openapi` bản mới nhất (≥8.x) yêu cầu **Zod v4**. Nếu team dùng Zod v3, cài `@asteasolutions/zod-to-openapi@7.3.4` và gọi `extendZodWithOpenApi(z)` một lần khi khởi động app.

Kết quả: Swagger UI phục vụ tại `GET /api-docs` (tương đương `/swagger-ui.html` của Springdoc), và JSON spec thô tại `GET /api-docs.json` — Dũng có thể dùng file này để sinh typed API client cho phía React bằng `openapi-typescript`.

---

## 14. Ghi chú cho buổi bảo vệ

Hai điểm kỹ thuật khó nhất của đề tài (chống oversell qua Redis atomic decrement, check-in <1s qua JWT tự xác thực) đều được thể hiện rõ trong thiết kế API ở mục 4 và mục 5 — có thể dùng trực tiếp 2 sequence đó làm slide giải thích kiến trúc khi phản biện. Lưu ý riêng cho phần mở rộng 9 FR mới: NFR-01 (<1s) **chỉ áp dụng cho `/checkin/scan`** (luồng in_person), không áp dụng cho `/tickets/:ticketId/self-checkin` (luồng online, không có ràng buộc "cổng" vật lý) — cần nói rõ điểm này nếu hội đồng hỏi về hiệu năng của toàn bộ nhóm check-in.

**⭐ Ghi chú thêm cho v0.3.0 (rà soát scope 21/07/2026):**

- **Provisioning-based (FR-38)**: nếu hội đồng hỏi "ai xác nhận Ban tổ chức là thật", câu trả lời có sẵn — Admin tạo trực tiếp tài khoản qua `POST /admin/organizers`, không còn dựa vào mã tĩnh dùng chung. Demo tốt nhất: đăng nhập Admin → tạo tài khoản Organizer → đăng xuất → đăng nhập bằng tài khoản vừa tạo (mật khẩu lấy từ email test) → cho thấy quyền Organizer ngay.
- **Co-host (FR-37)**: đây là ví dụ tốt cho câu hỏi "hệ thống xử lý phân quyền uỷ thác như thế nào" — 2 middleware `requireOwnerOnly` vs `requireOwnerOrCoHost` (mục 1.4) là điểm để giải thích tư duy tách bạch "quyền không thể uỷ quyền" (sửa/huỷ sự kiện) khỏi "quyền có thể uỷ quyền" (vận hành: thông báo/lịch trình/check-in). Cơ chế upsert 4 nhánh ở `POST /events/:eventId/co-hosts` (mục 3.4) cũng là ví dụ tốt về xử lý race condition/edge case tại tầng logic nghiệp vụ, không chỉ ở tầng dữ liệu.
- **category ENUM**: nếu hội đồng hỏi vì sao không dùng bảng `categories` riêng (chuẩn hoá hơn) — lý do là 9 giá trị cố định, không cần CRUD cho danh mục trong phạm vi 7 tuần; ENUM cấp CSDL đã đủ chặt và đơn giản hơn nhiều so với thêm 1 bảng + quan hệ FK mới.
