# UniEvent Flow API

Nền tảng backend xử lý sự kiện học đường, tích hợp cơ chế chống bán vượt vé (oversell) qua Redis, xác thực QR/JWT tốc độ cao và phân tích cảm xúc phản hồi bằng AI.

## 1. Kiến trúc Hệ thống (Bullet-proof Architecture)

Hệ thống được thiết kế theo mô hình 3 lớp (3-tier) với trọng tâm là hiệu năng và khả năng chịu tải đột biến:
- **Ngôn ngữ & Framework:** Node.js, Express, TypeScript.
- **Cơ sở dữ liệu chính:** PostgreSQL (lưu trữ bền vững Event, Registration, Ticket, Feedback, CheckinLog).
- **Bộ đệm & Hàng đợi:** Redis + BullMQ (xử lý atomic decrement chống oversell, hàng đợi cấp vé và gửi email).
- **Tích hợp AI:** LLM API (Gemini/OpenAI) cho Prompt Engineering phân tích cảm xúc.

## 2. Các Quyết định Thiết kế (Architecture Decision Records)

| Vấn đề | Giải pháp thông thường | Giải pháp áp dụng tại UniEvent Flow | Lợi ích / Lý do |
| :--- | :--- | :--- | :--- |
| **Chống bán vượt (Oversell)** | Dùng Transaction/Row Lock trên PostgreSQL | **Redis Atomic Decrement + TTL** | Loại bỏ thắt cổ chai I/O, thời gian phản hồi tính bằng mili-giây, bảo vệ DB khỏi bão request. |
| **Xử lý đăng ký vé** | Ghi DB & Gửi Email đồng bộ trên luồng chính | **Hàng đợi bất đồng bộ (BullMQ)** | Tách bạch luồng tiếp nhận và luồng xử lý; server không bị treo khi bên thứ 3 (Email) phản hồi chậm. |
| **Xác thực Check-in** | Quét QR -> Query CSDL kiểm tra trạng thái vé | **Mã hoá vé bằng JWT, xác thực Stateless** | Phản hồi < 1 giây. Backend chỉ cần giải mã JWT bằng Secret Key để xác thực hợp lệ, sau đó đẩy tác vụ ghi log check-in vào background. |

## 3. Hướng dẫn Cài đặt & Khởi chạy (Bullet-proof Setup)

Dự án áp dụng tiêu chuẩn **"Infrastructure as Code"** và **"Deterministic Dependency"** để đảm bảo môi trường phát triển đồng nhất 100% giữa các thành viên, triệt tiêu lỗi "chạy được trên máy tôi nhưng lỗi trên máy khác". 

Không cần cập nhật README.md khi thêm thư viện mới. Toàn bộ phiên bản đã được khoá cứng (lock).

### Yêu cầu tiên quyết
- **Node.js** (v18.x hoặc cao hơn)
- **Docker & Docker Compose** (Bắt buộc dùng để giả lập môi trường hạ tầng local)
- Git

### Các bước khởi chạy (Zero-Friction)

**Bước 1: Khởi tạo biến môi trường**
Sao chép file cấu hình mẫu và điền các thông tin bảo mật (Secret keys, LLM API keys không được commit lên Git).
```bash
cp .env.example .env
```

**Bước 2: Khởi động Hạ tầng (Cơ sở dữ liệu & Cache)**
Sử dụng Docker để tự động tải và chạy PostgreSQL, Redis mà không cần cài đặt cục bộ.
```bash
docker-compose up -d
```

**Bước 3: Cài đặt Thư viện chặt chẽ (Deterministic Install)**
**KHÔNG dùng `npm install`**. Sử dụng lệnh sau để cài đặt chính xác các phiên bản đã được chốt trong `package-lock.json`, bỏ qua việc tự động cập nhật phiên bản phụ.
```bash
npm ci
```
*Ghi chú: Bất kỳ thư viện nào mới được thêm vào (qua `npm install <package>`) sẽ tự động cập nhật `package.json` và `package-lock.json`. Người clone repo chỉ cần chạy lại `npm ci` là đồng bộ, không cần sửa đổi tài liệu.*

**Bước 4: Chạy Migration CSDL**
Áp dụng lược đồ (Schema) vào PostgreSQL theo ERD đã thiết kế.
```bash
npm run db:migrate
```

**Bước 5: Khởi động API Server**
```bash
npm run dev
```
Server sẽ chạy tại `http://localhost:3000`. Cấu hình Swagger/Postman tại `/api-docs`.

## 4. Quy ước Phát triển (Development Workflow)
- **Phân tách luồng:** Front-end và Back-end phải thống nhất API Contract (Định dạng Request/Response JSON) trước khi code.
- **Bảo mật:** Không bao giờ log plaintext password. Toàn bộ mật khẩu phải qua `bcrypt`. Secret key của JWT phải có độ phức tạp cao.
- **Xử lý lỗi:** Mọi Route/Controller phải được bọc trong bộ bắt lỗi (Error Handler) trung tâm để trả về mã HTTP chuẩn xác (400, 401, 403, 404, 500) kèm JSON message rõ ràng, không làm crash node process.

## 5. Cấu trúc Thư mục (Project Structure)
```text
src/
├── config/           # Cấu hình môi trường, Database, Redis, LLM
├── controllers/      # Tiếp nhận Request, gọi Services, trả Response
├── services/         # Chứa Business Logic (Oversell, QR, AI Logic)
├── models/           # Định nghĩa Schema/Entities cho PostgreSQL (Prisma/TypeORM)
├── queues/           # Định nghĩa Worker & Processors cho BullMQ
├── middlewares/      # Interceptors (Auth JWT, Rate Limiting, Error Handler)
├── routes/           # Định tuyến API endpoints
└── utils/            # Hàm hỗ trợ tiện ích (JWT generator, Hash, Logger)
```