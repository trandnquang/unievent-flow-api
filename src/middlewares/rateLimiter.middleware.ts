import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import type { Request } from 'express';
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

// Đếm theo TÀI KHOẢN thay vì IP - dùng cho các limiter đặt sau requireAuth (API.md mục 1.6:
// "10 lần/giờ/user"). Rơi về IP chỉ là lưới an toàn phòng khi middleware bị mắc sai thứ tự;
// ipKeyGenerator chuẩn hoá IPv6 về /64 theo khuyến nghị của express-rate-limit v8.
const userOrIpKey = (req: Request): string =>
  req.user?.id ?? ipKeyGenerator(req.ip ?? '');

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

// API.md mục 1.6: mời Co-host tối đa 10 lần/giờ/user - chống spam mời/mời lại liên tục,
// vì mỗi lần mời lại đều đẩy một job gửi email (BR-46b). Phải đặt SAU requireAuth để
// req.user tồn tại, nếu không limiter sẽ đếm nhầm theo IP.
export const coHostInviteRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 giờ
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: userOrIpKey,
  store: createRedisStore('rl:cohost-invite:'),
  message: {
    success: false,
    error: {
      code: 'TOO_MANY_REQUESTS',
      message: 'Bạn đã gửi quá nhiều lời mời đồng tổ chức. Vui lòng thử lại sau 1 giờ.',
    },
  },
});

// API.md mục 1.6 / NFR-01: quét vé tối đa 20 lần/GIÂY/user. Ngưỡng này chỉ chặn spam bất
// thường — một cổng bận rộn quét ~5 lượt/giây nên vẫn còn dư gấp 4 lần.
export const checkinScanRateLimiter = rateLimit({
  windowMs: 1000, // 1 giây
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: userOrIpKey,
  store: createRedisStore('rl:checkin-scan:'),
  message: {
    success: false,
    error: {
      code: 'TOO_MANY_REQUESTS',
      message: 'Quét vé quá nhanh. Vui lòng thử lại sau giây lát.',
    },
  },
});

// BR-105 / API.md mục 1.6: tải ảnh tối đa 10 lần/giờ/tài khoản, để endpoint này không trở
// thành nơi lưu trữ miễn phí cho bên thứ ba. Đây là endpoint duy nhất nhận dữ liệu nhị phân.
export const uploadRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 giờ
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: userOrIpKey,
  store: createRedisStore('rl:upload:'),
  message: {
    success: false,
    error: {
      code: 'TOO_MANY_REQUESTS',
      message: 'Bạn đã tải lên quá nhiều ảnh. Vui lòng thử lại sau 1 giờ.',
    },
  },
});
