import { randomUUID } from 'crypto';
import jwt from 'jsonwebtoken';
import { Job, Worker } from 'bullmq';
import { prisma } from '../config/db';
import { env } from '../config/env';
import { redis } from '../config/redis';
import { bullConnection } from '../config/bullmq';
import {
  emailQueue,
  registrationQueue,
  registrationTimeoutJobId,
  REGISTRATION_QUEUE_NAME,
  RegistrationJobData,
} from '../config/queues';
import { holdKey, RegistrationService } from '../services/registration.service';

// BR-99: biên 24 giờ sau khi sự kiện kết thúc, khớp với TTL khoá check-in ở BR-91
// để hai cơ chế cùng hết hiệu lực một lúc.
const TICKET_EXPIRY_GRACE_SECONDS = 24 * 60 * 60;

// Sentinel để thoát transaction mà không coi là lỗi hệ thống (xem giải thích ở dưới)
const ALREADY_SETTLED = Symbol('registration_already_settled');

// Sinh vé cho một đăng ký đang pending (FR-16, BR-51, BR-99)
const generateTicket = async (registrationId: string): Promise<void> => {
  const registration = await prisma.registrations.findUnique({
    where: { id: registrationId },
    include: { events: { select: { id: true, end_time: true } } },
  });

  if (!registration) {
    console.warn(
      `⚠️  Bỏ qua job process: không còn đăng ký ${registrationId}`
    );
    return;
  }

  // Sinh id vé ở tầng ứng dụng vì payload JWT cần ticket_id, mà bản ghi thì chưa tồn tại
  const ticketId = randomUUID();

  // BR-51: payload CHỈ gồm 3 định danh, không nhét thêm bất kỳ thông tin cá nhân nào —
  // mã QR bị chụp lại/chia sẻ là chuyện thường, payload phải vô hại khi lộ.
  // BR-99: exp là mốc TUYỆT ĐỐI = end_time + 24h. Cố tình KHÔNG dùng option `expiresIn`
  // vì option đó tính từ thời điểm ký, hoàn toàn khác ý nghĩa "hết hạn theo giờ sự kiện".
  const exp =
    Math.floor(registration.events.end_time.getTime() / 1000) +
    TICKET_EXPIRY_GRACE_SECONDS;

  const jwtCode = jwt.sign(
    {
      registration_id: registration.id,
      event_id: registration.events.id,
      ticket_id: ticketId,
      exp,
    },
    env.TICKET_JWT_SECRET
  );

  try {
    await prisma.$transaction(async (tx) => {
      // Điều kiện status='pending' nằm NGAY TRONG câu UPDATE — đây là mặt đối xứng của
      // BR-93 ở phía thành công. Nếu confirm vô điều kiện, một đăng ký đã bị job timeout
      // đánh 'failed' VÀ đã hoàn vé vẫn có thể được confirm sau đó => phát dư 1 vé.
      const confirmed = await tx.registrations.updateMany({
        where: { id: registrationId, status: 'pending' },
        data: { status: 'confirmed', processed_at: new Date() },
      });

      if (confirmed.count === 0) throw ALREADY_SETTLED;

      await tx.tickets.create({
        data: {
          id: ticketId,
          registration_id: registrationId,
          jwt_code: jwtCode,
          status: 'valid',
        },
      });
    });
  } catch (error) {
    if (error === ALREADY_SETTLED) {
      console.warn(
        `⚠️  Đăng ký ${registrationId} đã được luồng khác kết thúc — không sinh vé, không gửi email`
      );
      return;
    }
    throw error;
  }

  // BR-51: xoá khoá giữ chỗ để bên đối soát không hiểu nhầm bản ghi đã confirmed vẫn đang treo
  await redis.del(holdKey(registrationId));

  // Gỡ job hẹn giờ cho đỡ một truy vấn no-op. Gỡ không được cũng vô hại vì
  // compensateFailedRegistration là idempotent (BR-93).
  try {
    await registrationQueue.remove(registrationTimeoutJobId(registrationId));
  } catch {
    /* job đã chạy hoặc đã bị dọn - bỏ qua */
  }

  await emailQueue.add('ticket_confirmation', {
    type: 'ticket_confirmation',
    ticket_id: ticketId,
  });

  console.log(`🎟️  Đã sinh vé ${ticketId} cho đăng ký ${registrationId}`);
};

// Worker xử lý đăng ký vé (SRS mục 5.6). Chạy ở tiến trình riêng: `npm run worker`.
export const registrationWorker = new Worker<RegistrationJobData>(
  REGISTRATION_QUEUE_NAME,
  async (job: Job<RegistrationJobData>) => {
    switch (job.data.type) {
      case 'process':
        // Cố tình KHÔNG bắt lỗi ở đây: để lỗi ném ra cho BullMQ retry theo defaultJobOptions.
        // Bù trừ chỉ chạy khi đã hết số lần retry — xem listener 'failed' bên dưới (BR-89).
        await generateTicket(job.data.registration_id);
        break;

      case 'timeout':
        // BR-88/89/93: tới hạn giữ chỗ. Đăng ký đã confirmed thì UPDATE ảnh hưởng 0 dòng
        // và hàm tự kết thúc êm — đây là nhánh bình thường, không phải lỗi.
        await RegistrationService.compensateFailedRegistration(
          job.data.registration_id
        );
        break;

      default: {
        // Chặn ở tầng kiểu: thêm loại job mới mà quên xử lý sẽ lỗi biên dịch
        const unhandled: never = job.data;
        throw new Error(
          `Loại registration job chưa được xử lý: ${JSON.stringify(unhandled)}`
        );
      }
    }
  },
  { connection: bullConnection }
);

registrationWorker.on('failed', (job, error) => {
  console.error(
    `❌ Xử lý đăng ký thất bại job ${job?.id ?? 'không rõ'} (lần thử ${job?.attemptsMade ?? 0}):`,
    error.message
  );

  if (!job || job.data.type !== 'process') return;

  // BR-89: "worker xử lý thất bại (lỗi CSDL, HẾT SỐ LẦN RETRY của BullMQ)" — bù trừ ở đây
  // chứ không phải ngay lần lỗi đầu, nếu không một trục trặc thoáng qua của CSDL sẽ đánh
  // hỏng đăng ký trong khi retry có thể cứu được. Với attempts=3 + backoff luỹ thừa thì
  // toàn bộ chuỗi retry kết thúc trong vài giây, còn xa mốc giữ chỗ 60 giây.
  const maxAttempts = job.opts.attempts ?? 1;
  if (job.attemptsMade < maxAttempts) return;

  // Lối thoát cuối là job hẹn giờ 'timeout': nếu cả tiến trình worker chết thì listener này
  // cũng không chạy, và job kia vẫn bù trừ khi tới hạn (BR-88).
  void RegistrationService.compensateFailedRegistration(
    job.data.registration_id
  ).catch((compensateError: unknown) => {
    console.error(
      `❌ [ERROR] Không bù trừ được đăng ký ${job.data.registration_id}:`,
      compensateError instanceof Error ? compensateError.message : compensateError
    );
  });
});
