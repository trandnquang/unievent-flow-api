import { Job, Worker } from 'bullmq';
import { prisma } from '../config/db';
import { redis } from '../config/redis';
import { bullConnection } from '../config/bullmq';
import { CHECKIN_QUEUE_NAME, CheckinJobData } from '../config/queues';
import { checkinLockKey } from '../services/checkin.service';

// BR-62 (Async Write Rule): ghi lịch sử check-in SAU KHI máy quét đã nhận kết quả.
// Tách khỏi luồng đồng bộ để giữ ràng buộc <1s của NFR-01; an toàn vì tính đúng đắn của
// kết quả đã được chốt bằng khoá Redis ở BR-91 trước đó.
export const checkinWorker = new Worker<CheckinJobData>(
  CHECKIN_QUEUE_NAME,
  async (job: Job<CheckinJobData>) => {
    const { ticket_id, organizer_id } = job.data;

    await prisma.$transaction(async (tx) => {
      // Điều kiện status='valid' nằm trong câu UPDATE: job chạy lại (retry) hoặc một
      // luồng khác đã ghi xong thì count=0 và ta bỏ qua, không ghi log trùng.
      const changed = await tx.tickets.updateMany({
        where: { id: ticket_id, status: 'valid' },
        data: { status: 'checked_in' },
      });

      if (changed.count === 0) {
        console.warn(
          `⚠️  Vé ${ticket_id} đã được ghi check-in bởi luồng khác — bỏ qua job`
        );
        return;
      }

      // organizer_id NOT NULL ở đây là bắt buộc: CHECK constraint
      // chk_checkin_method_organizer yêu cầu qr_scan phải đi kèm người quét.
      await tx.checkin_logs.create({
        data: {
          ticket_id,
          organizer_id,
          checkin_method: 'qr_scan',
        },
      });
    });
  },
  { connection: bullConnection }
);

checkinWorker.on('failed', (job, error) => {
  console.error(
    `❌ Ghi lịch sử check-in thất bại job ${job?.id ?? 'không rõ'} (lần thử ${job?.attemptsMade ?? 0}):`,
    error.message
  );

  if (!job) return;

  const maxAttempts = job.opts.attempts ?? 1;
  if (job.attemptsMade < maxAttempts) return;

  // BR-94 (Write Failure Recovery Rule): hết retry mà vẫn không ghi được lịch sử thì vé
  // đang ở trạng thái "đã bị đánh dấu dùng rồi nhưng không có bằng chứng". Giải phóng khoá
  // để nhân viên cổng quét lại được, và ghi log ERROR để đối soát — tuyệt đối không im lặng.
  void redis
    .del(checkinLockKey(job.data.ticket_id))
    .then(() => {
      console.error(
        `❌ [ERROR] Đã giải phóng khoá checkin:${job.data.ticket_id} sau khi ghi log thất bại — cần quét lại vé này`
      );
    })
    .catch((releaseError: unknown) => {
      console.error(
        `❌ [ERROR] Không giải phóng được khoá checkin:${job.data.ticket_id}:`,
        releaseError instanceof Error ? releaseError.message : releaseError
      );
    });
});
