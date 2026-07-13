# UniEvent Flow API — Hệ thống Đặt lịch Sự kiện & Check-in Học đường

> **Đồ án tốt nghiệp** — Giai đoạn Tuần 1–2 (MVP Core Services: Authentication, User Profile & Event Management).

UniEvent Flow API là hệ thống backend cung cấp các dịch vụ quản lý sự kiện học đường, phân quyền theo vai trò (`student` và `organizer`), đăng ký sự kiện và kiểm tra vé vào cổng.

---

## 🛠 Công nghệ Sử dụng

- **Runtime**: Node.js v20+
- **Framework**: Express 5 (TypeScript 5.8+)
- **ORM / Database layer**: Prisma 7 (`@prisma/client` + `@prisma/adapter-pg`) kết nối **PostgreSQL**
- **Validation**: Zod v4 (nghiêm ngặt `exactOptionalPropertyTypes`)
- **Authentication & Security**: JSON Web Token (`jsonwebtoken`), Bcrypt (`bcrypt`), Rate Limiting (`express-rate-limit`)

---

## 📦 Hướng dẫn Cài đặt & Chạy Dự án

### 1. Chuẩn bị môi trường (`.env`)
Sao chép file mẫu cấu hình môi trường:
```bash
cp .env.example .env
```

Nội dung các biến môi trường chính trong `.env`:
```ini
PORT=3000
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/unievent?schema=public"
JWT_SECRET="unievent-flow-super-secret-key-2026"
JWT_EXPIRES_IN="2h"
REDIS_URL="redis://localhost:6379"
```

### 2. Cài đặt Dependencies & Sinh Prisma Client
```bash
npm install
npx prisma generate
```

### 3. Kiểm tra kiểu tĩnh TypeScript
Kiểm duyệt toàn bộ mã nguồn không phát sinh lỗi kiểu dữ liệu:
```bash
npx tsc --noEmit
```

### 4. Khởi chạy Server ở chế độ Phát triển (Development)
Dùng `ts-node-dev` để chạy trực tiếp TypeScript và tự động nạp lại khi sửa code:
```bash
npx ts-node-dev --respawn --transpile-only src/server.ts
```
> Hoặc biên dịch ra JavaScript production:
> ```bash
> npx tsc
> node dist/server.js
> ```

---

## 🏛 Cấu trúc Thư mục Dự án

```text
src/
├── config/
│   ├── env.ts              # Kiểm tra & chuẩn hóa biến môi trường bằng Zod
│   └── db.ts               # Singleton PrismaClient với driver adapter PrismaPg
├── schemas/
│   ├── auth.schema.ts      # Zod validation schemas cho Auth & Profile (FR-01 → FR-07)
│   └── event.schema.ts     # Zod validation schemas cho Event (FR-08 → FR-13)
├── middlewares/
│   ├── auth.middleware.ts  # requireAuth (JWT), requireRole, requireOwnership
│   ├── error.middleware.ts # errorHandler chuẩn hóa envelope response API.md §1.2
│   └── rateLimiter.middleware.ts # loginRateLimiter cho POST /auth/login
├── services/
│   ├── auth.service.ts     # Nghiệp vụ đăng ký, đăng nhập, khôi phục mật khẩu
│   ├── user.service.ts     # Nghiệp vụ tra cứu và cập nhật hồ sơ cá nhân
│   └── event.service.ts    # Nghiệp vụ quản lý sự kiện & đối soát vé
├── controllers/
│   ├── auth.controller.ts  # Controller xử lý request/response Auth
│   ├── user.controller.ts  # Controller xử lý request/response User
│   └── event.controller.ts # Controller xử lý request/response Event
├── routes/
│   ├── auth.routes.ts      # Router /api/v1/auth
│   ├── user.routes.ts      # Router /api/v1/users
│   ├── event.routes.ts     # Router /api/v1/events
│   └── index.ts            # Tổng hợp API v1
├── utils/
│   ├── errors.ts           # AppError chuẩn hóa mã lỗi nghiệp vụ
│   └── user.ts             # sanitizeUser loại bỏ trường bảo mật (password_hash, token)
├── app.ts                  # Cấu hình Express application & middlewares
└── server.ts               # Khởi động máy chủ & Graceful Shutdown
```

---

## 🚀 Danh sách Endpoints Đã Hoàn thành (Tuần 1–2 Scope)

Toàn bộ phản hồi API tuân thủ envelope chuẩn:
```json
{
  "success": true,
  "data": { ... },
  "meta": { ... } // (tùy chọn với phân trang)
}
```

### 1. Dịch vụ Hệ thống
| Method | Endpoint | Mô tả | Quyền |
| :--- | :--- | :--- | :--- |
| **GET** | `/health` | Kiểm tra tình trạng hoạt động (Health Check) | Public |

### 2. Nhóm Authentication & Tài khoản (FR-01 → FR-07)
| Method | Endpoint | FR | Mô tả | Quyền |
| :--- | :--- | :--- | :--- | :--- |
| **POST** | `/api/v1/auth/register` | FR-01 | Đăng ký tài khoản (`student` hoặc `organizer`) | Public |
| **POST** | `/api/v1/auth/login` | FR-02 | Đăng nhập bằng Email/Password nhận Access Token | Public (`RateLimit`) |
| **POST** | `/api/v1/auth/logout` | FR-03 | Đăng xuất tài khoản | Bearer JWT |
| **POST** | `/api/v1/auth/forgot-password` | FR-07 | Yêu cầu gửi link/token khôi phục mật khẩu | Public |
| **POST** | `/api/v1/auth/reset-password` | FR-07 | Đặt lại mật khẩu mới bằng `reset_token` | Public |
| **POST** | `/api/v1/auth/change-password` | FR-04 | Đổi mật khẩu khi đang đăng nhập | Bearer JWT |
| **GET** | `/api/v1/users/me` | FR-05 | Xem thông tin hồ sơ cá nhân | Bearer JWT |
| **PATCH** | `/api/v1/users/me` | FR-06 | Cập nhật thông tin cá nhân (`name`) | Bearer JWT |

### 3. Nhóm Quản lý Sự kiện (FR-08 → FR-13)
| Method | Endpoint | FR | Mô tả | Quyền |
| :--- | :--- | :--- | :--- | :--- |
| **GET** | `/api/v1/events` | FR-13 | Lọc, tìm kiếm từ khóa, phân trang danh sách sự kiện | Public |
| **GET** | `/api/v1/events/mine` | FR-12 | Danh sách sự kiện do chính Organizer tạo | Organizer |
| **POST** | `/api/v1/events` | FR-08 | Tạo sự kiện mới | Organizer |
| **GET** | `/api/v1/events/:eventId` | FR-09 | Xem chi tiết sự kiện & số vé còn lại | Public |
| **PATCH** | `/api/v1/events/:eventId` | FR-10 | Cập nhật thông tin sự kiện | Organizer + Owner |
| **POST** | `/api/v1/events/:eventId/cancel` | FR-11 | Hủy sự kiện (không cho phép nếu đã bắt đầu) | Organizer + Owner |

---

## 📌 Lộ trình Kỹ thuật & TODO (Tuần 3–6)

- **Redis Rate Limiting**: Chuyển middleware `loginRateLimiter` từ in-memory sang Redis store theo đúng `API.md` mục 1.6.
- **Quản lý tồn kho vé (Ticket Counter)**: Chuyển đối soát `ticketsRemaining` từ view SQL (`v_event_registration_stats`) sang bộ đếm nguyên tử (Atomic Counter) trên Redis theo SRS §5.2.
- **Hàng đợi tác vụ bất đồng bộ**: Tích hợp BullMQ worker để gửi email đặt lại mật khẩu và thông báo sự kiện.