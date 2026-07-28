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
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Cấu hình biến môi trường không hợp lệ:', parsed.error.format());
  process.exit(1);
}

export const env = parsed.data;
