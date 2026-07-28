import rateLimit from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import { redis } from '../config/redis';

// Store Redis dùng chung cho mọi rate limiter (API.md mục 1.6, NFR 6.1) — bắt buộc
// khi chạy nhiều instance trên Render, vì store in-memory đếm riêng từng tiến trình.
const createRedisStore = (prefix: string): RedisStore =>
  new RedisStore({
    sendCommand: (command: string, ...args: string[]) =>
      redis.call(command, ...args) as Promise<never>,
    prefix,
  });

// API.md mục 1.6: đăng ký tối đa 3 lần/giờ/IP để chống spam/bot tạo tài khoản hàng loạt
export const registerRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 giờ
  limit: 3,
  standardHeaders: true,
  legacyHeaders: false,
  store: createRedisStore('rl:register:'),
  message: {
    success: false,
    error: {
      code: 'TOO_MANY_REQUESTS',
      message: 'Bạn đã đăng ký quá nhiều lần. Vui lòng thử lại sau 1 giờ.',
    },
  },
});

// BR NFR 6.1 / API.md mục 1.6: đăng nhập tối đa 5 lần/phút/IP để chống dò mật khẩu
export const loginRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 phút
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  store: createRedisStore('rl:login:'),
  message: {
    success: false,
    error: {
      code: 'TOO_MANY_REQUESTS',
      message: 'Bạn đã thử đăng nhập quá nhiều lần. Vui lòng thử lại sau 1 phút.',
    },
  },
});
