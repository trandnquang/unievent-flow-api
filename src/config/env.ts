import 'dotenv/config';
import { z } from 'zod';

// Schema kiểm tra biến môi trường bắt buộc cho ứng dụng
const envSchema = z.object({
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL là bắt buộc'),
  JWT_SECRET: z.string().min(10, 'JWT_SECRET tối thiểu 10 ký tự'),
  // Hạn access token tính bằng GIÂY - nguồn duy nhất cho cả jwt.sign lẫn expires_in
  // trả về client (API.md mục 1.4: 2 giờ = 7200 giây)
  JWT_EXPIRES_IN: z.coerce.number().int().positive().default(7200),
  // BR-51/BR-99: secret ký JWT của VÉ, tách riêng khỏi JWT_SECRET của access token.
  // Vé sống tới end_time + 24h và được in ra mã QR phát tán công khai — tách secret để
  // một secret bị lộ không kéo theo giả mạo phiên đăng nhập, và ngược lại.
  TICKET_JWT_SECRET: z.string().min(10, 'TICKET_JWT_SECRET tối thiểu 10 ký tự'),
  // BR-88: thời gian giữ chỗ cho một đăng ký đang chờ worker xử lý. Dùng chung cho cả
  // TTL của khoá hold:{registrationId} lẫn độ trễ của job kiểm tra quá hạn.
  REGISTRATION_HOLD_TTL_SECONDS: z.coerce.number().int().positive().default(60),
  // Redis phục vụ rate-limit store (API.md mục 1.6), hàng đợi BullMQ và các khoá nghiệp vụ
  REDIS_URL: z.string().min(1, 'REDIS_URL là bắt buộc'),
  // Cấu hình SMTP cho worker gửi email (SRS mục 5.6 - kiến trúc: email nằm ở phía Worker).
  // Mặc định trỏ Mailpit/MailHog chạy cục bộ để không chặn khởi động khi dev chưa cấu hình.
  SMTP_HOST: z.string().default('localhost'),
  SMTP_PORT: z.coerce.number().int().positive().default(1025),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().default('UniEvent Flow <no-reply@unievent.local>'),
  // Gốc đường dẫn trang đặt lại mật khẩu phía FE (FR-07) - worker ghép token vào link này
  APP_RESET_URL: z.string().default('http://localhost:5173/reset-password'),
  // Gốc đường dẫn trang chi tiết sự kiện phía FE - dùng trong email thông báo (FR-31)
  // và email mời Co-host (BR-46b)
  APP_EVENT_URL: z.string().default('http://localhost:5173/events'),
  // Gốc đường dẫn trang vé phía FE (FR-18) - email xác nhận vé ghép ticketId vào link này
  APP_TICKET_URL: z.string().default('http://localhost:5173/tickets'),
  // Trang đăng nhập phía FE - email cấp tài khoản Ban tổ chức (FR-38) trỏ về đây
  APP_LOGIN_URL: z.string().default('http://localhost:5173/login'),
  // BR-57: job nhắc lịch chạy trước start_time N giờ (N cấu hình được)
  REMINDER_LEAD_TIME_HOURS: z.coerce.number().int().positive().default(24),
  // BR-98 (CBR 7): cache trạng thái tài khoản trên Redis để requireActive không phải
  // truy vấn CSDL mỗi request. Xoá cache ngay khi FR-29 đổi trạng thái.
  ACTIVE_CACHE_TTL_SECONDS: z.coerce.number().int().positive().default(60),
  // BR-91: khoá nguyên tử chống check-in trùng. 86400s = 24h, khớp với biên hết hạn
  // của vé ở BR-99 (end_time + 24h) để hai cơ chế cùng hết hiệu lực một lúc.
  CHECKIN_LOCK_TTL_SECONDS: z.coerce.number().int().positive().default(86400),
  // Danh sách origin được phép gọi API, phân tách bằng dấu phẩy (API.md mục 1).
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  // FR-25/26: phân tích cảm xúc bằng Google Gemini.
  // Để optional ở tầng env vì chỉ 1/50 endpoint cần — thiếu khoá thì API vẫn khởi động
  // bình thường, chỉ riêng luồng phân tích báo lỗi rõ ràng (xem sentiment.service.ts).
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().default('gemini-2.5-flash'),
  // FR-40 (BR-111): lưu trữ ảnh trên Cloudinary. Cùng lý do optional như Gemini.
  CLOUDINARY_CLOUD_NAME: z.string().optional(),
  CLOUDINARY_API_KEY: z.string().optional(),
  CLOUDINARY_API_SECRET: z.string().optional(),
  CLOUDINARY_FOLDER: z.string().default('unievent'),
  // BR-104: dung lượng ảnh tối đa cho POST /uploads/image
  MAX_UPLOAD_SIZE_MB: z.coerce.number().positive().default(5),
  // Assumption #11: tài khoản Quản trị viên đầu tiên tạo bằng `npm run seed:admin`,
  // KHÔNG qua endpoint public nào. Chỉ script seed đọc 3 biến này.
  ADMIN_SEED_EMAIL: z.string().optional(),
  ADMIN_SEED_PASSWORD: z.string().optional(),
  ADMIN_SEED_NAME: z.string().default('Quản trị viên hệ thống'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Cấu hình biến môi trường không hợp lệ:', parsed.error.format());
  process.exit(1);
}

export const env = parsed.data;

// Cảnh báo (không chặn khởi động) khi dịch vụ bên thứ ba chưa cấu hình — tránh trường hợp
// triển khai thật mà tới lúc người dùng bấm mới phát hiện thiếu khoá.
if (!env.GEMINI_API_KEY) {
  console.warn(
    '⚠️  Thiếu GEMINI_API_KEY — POST /events/:id/feedbacks/analyze (FR-25) sẽ báo lỗi khi được gọi.'
  );
}

if (
  !env.CLOUDINARY_CLOUD_NAME ||
  !env.CLOUDINARY_API_KEY ||
  !env.CLOUDINARY_API_SECRET
) {
  console.warn(
    '⚠️  Thiếu cấu hình Cloudinary — POST /uploads/image (FR-40) sẽ báo lỗi khi được gọi.'
  );
}
