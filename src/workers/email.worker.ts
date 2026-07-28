import { Job, Worker } from 'bullmq';
import { bullConnection } from '../config/bullmq';
import { EMAIL_QUEUE_NAME, EmailJobData } from '../config/queues';
import { EmailService } from '../services/email.service';

// Worker gửi email (SRS mục 5.6). Chạy ở tiến trình riêng: `npm run worker`.
// Số lần thử lại + backoff lấy theo defaultJobOptions ở config/bullmq.ts.
export const emailWorker = new Worker<EmailJobData>(
  EMAIL_QUEUE_NAME,
  async (job: Job<EmailJobData>) => {
    switch (job.data.type) {
      case 'password_reset':
        await EmailService.sendPasswordResetEmail(job.data);
        break;
      default: {
        // Chặn ở tầng kiểu: thêm loại job mới mà quên xử lý sẽ lỗi biên dịch
        const unhandled: never = job.data.type;
        throw new Error(`Loại email job chưa được xử lý: ${String(unhandled)}`);
      }
    }
  },
  { connection: bullConnection }
);

emailWorker.on('completed', (job) => {
  console.log(`✅ Đã gửi email job ${job.id} (${job.data.type})`);
});

emailWorker.on('failed', (job, error) => {
  console.error(
    `❌ Gửi email thất bại job ${job?.id ?? 'không rõ'} (lần thử ${job?.attemptsMade ?? 0}):`,
    error.message
  );
});
