import Redis from 'ioredis';
import { env } from './env';

// Khởi tạo Redis client singleton dùng chung cho toàn ứng dụng (API.md mục 12):
// rate-limit store (mục 1.6), hàng đợi BullMQ (config/bullmq.ts), và các khoá
// nghiệp vụ sẽ thêm sau (đếm vé BR-47/88-90, khoá check-in BR-91, cache BR-98).
const globalForRedis = globalThis as unknown as {
  redis: Redis | undefined;
};

export const redis =
  globalForRedis.redis ??
  new Redis(env.REDIS_URL, {
    // Giới hạn số lần thử lại mỗi lệnh: khi Redis chết, lệnh phải BÁO LỖI thay vì
    // treo vô hạn trong hàng đợi (nếu không, request đi qua rate limiter sẽ treo theo).
    // BullMQ dùng connection riêng ở config/bullmq.ts nên không bị ràng buộc bởi tuỳ chọn này.
    maxRetriesPerRequest: 3,
  });

if (process.env.NODE_ENV !== 'production') {
  globalForRedis.redis = redis;
}

redis.on('error', (error: Error) => {
  console.error('❌ Lỗi kết nối Redis:', error.message);
});

// Kiểm tra Redis sẵn sàng lúc khởi động — Redis là phụ thuộc bắt buộc
// (rate limit, hàng đợi, đếm vé), không cho phép chạy ở trạng thái nửa vời.
// Chặn thời gian chờ: ioredis tự thử lại nền vô hạn, nếu chỉ await ping() thì
// tiến trình sẽ TREO im lặng khi Redis chết thay vì dừng hẳn với lỗi rõ ràng.
const PING_TIMEOUT_MS = 5000;

export const pingRedis = async (): Promise<void> => {
  let timer: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      redis.ping(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () =>
            reject(
              new Error(
                `Không kết nối được Redis tại ${env.REDIS_URL} sau ${PING_TIMEOUT_MS}ms`
              )
            ),
          PING_TIMEOUT_MS
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
};

// Đóng kết nối khi tắt ứng dụng (Graceful Shutdown).
// Nếu Redis đang chết, quit() có thể không bao giờ trả lời — ép ngắt để tiến trình thoát được.
export const disconnectRedis = async (): Promise<void> => {
  try {
    await redis.quit();
  } catch {
    redis.disconnect();
  }
};
