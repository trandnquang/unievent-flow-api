import 'dotenv/config';
import { z } from 'zod';

// Schema kiểm tra biến môi trường bắt buộc cho ứng dụng
const envSchema = z.object({
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL là bắt buộc'),
  JWT_SECRET: z.string().min(10, 'JWT_SECRET tối thiểu 10 ký tự'),
  JWT_EXPIRES_IN: z.string().default('2h'),
  // Redis chưa tích hợp trong Tuần 1-2, placeholder theo API.md
  REDIS_URL: z.string().default('redis://localhost:6379'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Cấu hình biến môi trường không hợp lệ:', parsed.error.format());
  process.exit(1);
}

export const env = parsed.data;
