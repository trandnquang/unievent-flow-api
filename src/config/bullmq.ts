import { Queue, QueueOptions, JobsOptions, ConnectionOptions } from 'bullmq';
import { env } from './env';

// Cấu hình kết nối cho BullMQ — trỏ về CÙNG một Redis với config/redis.ts (chung REDIS_URL).
// Không truyền thẳng instance ioredis dùng chung: bullmq đóng gói bản ioredis riêng
// (node_modules/bullmq/node_modules/ioredis) nên type không tương thích dưới strict mode;
// ngoài ra BullMQ khuyến nghị mỗi Queue/Worker giữ connection riêng vì có lệnh blocking.
export const bullConnection: ConnectionOptions = {
  url: env.REDIS_URL,
  // Bắt buộc với BullMQ: không giới hạn số lần thử lại cho lệnh blocking
  maxRetriesPerRequest: null,
};

// Tuỳ chọn mặc định cho mọi job: thử lại có backoff, dọn job cũ để Redis không phình.
export const defaultJobOptions: JobsOptions = {
  attempts: 3,
  backoff: {
    type: 'exponential',
    delay: 1000,
  },
  removeOnComplete: 100,
  removeOnFail: 1000,
};

export const queueOptions: QueueOptions = {
  connection: bullConnection,
  defaultJobOptions,
};

// Factory tạo hàng đợi dùng chung cấu hình trên.
// CHƯA khai báo hàng đợi nghiệp vụ nào ở giai đoạn hạ tầng — xem src/workers/index.ts.
export const createQueue = <T = unknown>(name: string): Queue<T> =>
  new Queue<T>(name, queueOptions);
