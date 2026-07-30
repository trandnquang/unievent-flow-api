import { Job, Worker } from 'bullmq';
import { prisma } from '../config/db';
import { bullConnection } from '../config/bullmq';
import { EventReminderJob, REMINDER_QUEUE_NAME } from '../config/queues';
import { EmailService } from '../services/email.service';

const describeLocation = (
  locationType: string,
  location: string | null,
  joinUrl: string | null
): string =>
  locationType === 'online'
    ? `Trực tuyến — ${joinUrl ?? 'xem trang sự kiện'}`
    : (location ?? 'Xem trang sự kiện');

// Worker gửi email nhắc lịch trước giờ sự kiện (FR-35).
// Producer (lên lịch/huỷ/lên lịch lại theo BR-97) đã có sẵn ở services/reminder.service.ts.
export const reminderWorker = new Worker<EventReminderJob>(
  REMINDER_QUEUE_NAME,
  async (job: Job<EventReminderJob>) => {
    const event = await prisma.events.findUnique({
      where: { id: job.data.event_id },
      select: {
        id: true,
        title: true,
        status: true,
        start_time: true,
        location: true,
        location_type: true,
        join_url: true,
      },
    });

    if (!event) {
      console.warn(
        `⚠️  Bỏ qua job nhắc lịch: không còn sự kiện ${job.data.event_id}`
      );
      return;
    }

    // BR-97: nếu thao tác huỷ job lúc sự kiện bị cancelled thất bại, job vẫn có thể chạy.
    // Đây là lớp phòng vệ được BR-58 nhắc tới — chặn ở đây thay vì gửi nhầm.
    if (event.status === 'cancelled') {
      console.warn(
        `⚠️  Sự kiện ${event.id} đã huỷ — không gửi email nhắc lịch`
      );
      return;
    }

    // BR-58 (Recipient Rule): truy vấn người nhận TẠI THỜI ĐIỂM JOB CHẠY, không phải lúc
    // lên lịch. Nhờ vậy người đã tự huỷ (cancelled, BR-56) và người đăng ký thất bại
    // (failed, BR-89) tự động rơi khỏi danh sách mà không cần huỷ job riêng cho từng người.
    const registrations = await prisma.registrations.findMany({
      where: { event_id: event.id, status: 'confirmed' },
      select: {
        users: { select: { email: true, name: true } },
        tickets: { select: { id: true } },
      },
    });

    const location = describeLocation(
      event.location_type,
      event.location,
      event.join_url
    );

    // Gửi tuần tự để không dội SMTP; mỗi vé nhận 1 email (BR-58)
    for (const registration of registrations) {
      await EmailService.sendEventReminderEmail({
        to: registration.users.email,
        name: registration.users.name,
        event_id: event.id,
        ticket_id: registration.tickets?.id ?? '',
        event_title: event.title,
        event_start_time: event.start_time,
        event_location: location,
      });
    }

    console.log(
      `⏰ Đã gửi email nhắc lịch "${event.title}" tới ${registrations.length} người đăng ký`
    );
  },
  { connection: bullConnection }
);

reminderWorker.on('failed', (job, error) => {
  console.error(
    `❌ Gửi email nhắc lịch thất bại job ${job?.id ?? 'không rõ'} (lần thử ${job?.attemptsMade ?? 0}):`,
    error.message
  );
});
