import rateLimit from 'express-rate-limit';

// TODO [Tuần 3-6]: Chuyển store từ in-memory sang Redis store (rate-limit-redis) theo đúng API.md mục 1.6
export const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 phút
  max: 10, // Giới hạn tối đa 10 lượt đăng nhập sai/thử mỗi IP trong 15 phút
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: 'TOO_MANY_REQUESTS',
      message: 'Bạn đã thử đăng nhập quá nhiều lần. Vui lòng thử lại sau 15 phút.',
    },
  },
});
