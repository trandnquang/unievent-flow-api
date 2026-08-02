import { Job, Worker } from 'bullmq';
import { bullConnection } from '../config/bullmq';
import { EMAIL_QUEUE_NAME, EmailJobData } from '../config/queues';
import { EmailService } from '../services/email.service';
import { sendUpdateNotification } from './sendUpdateNotification';
import { sendCoHostInvitation } from './sendCoHostInvitation';
import { sendTicketConfirmation } from './sendTicketConfirmation';
import { sendOrganizerCredentials } from './sendOrganizerCredentials';

// Worker gửi email (SRS mục 5.6). Chạy ở tiến trình riêng: `npm run worker`.
// Số lần thử lại + backoff lấy theo defaultJobOptions ở config/bullmq.ts.
export const emailWorker = new Worker<EmailJobData>(
  EMAIL_QUEUE_NAME,
  async (job: Job<EmailJobData>) => {
    switch (job.data.type) {
      case 'password_reset':
        await EmailService.sendPasswordResetEmail(job.data);
        break;
      case 'event_update':
        await sendUpdateNotification(job.data);
        break;
      case 'co_host_invitation':
        await sendCoHostInvitation(job.data);
        break;
      case 'ticket_confirmation':
        await sendTicketConfirmation(job.data);
        break;
      case 'organizer_credentials':
        await sendOrganizerCredentials(job.data);
        break;
      default: {
        // Chặn ở tầng kiểu: thêm loại job mới mà quên xử lý sẽ lỗi biên dịch
        const unhandled: never = job.data;
        // CBR 2: CHỈ in `type`, TUYỆT ĐỐI không JSON.stringify cả payload. Nhánh này hôm nay
        // không tới được, nhưng payload email chứa mật khẩu tạm (organizer_credentials) và
        // token đặt lại mật khẩu — thêm loại job thứ 6 mà quên `case` là đổ thẳng chúng ra log.
        throw new Error(
          `Loại email job chưa được xử lý: ${(unhandled as { type: string }).type}`
        );
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
