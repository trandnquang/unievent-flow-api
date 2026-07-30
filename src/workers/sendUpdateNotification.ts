import { prisma } from '../config/db';
import { EventUpdateEmailJob } from '../config/queues';
import { EmailService } from '../services/email.service';

// Gửi email thông báo sự kiện cho toàn bộ người đăng ký (FR-31, BR-40).
//
// Danh sách người nhận được truy vấn TẠI THỜI ĐIỂM JOB CHẠY (cùng nguyên tắc BR-58 của
// job nhắc lịch): người đã tự huỷ đăng ký (cancelled) hoặc đăng ký thất bại (failed) tự
// rơi khỏi danh sách mà không cần cơ chế huỷ job riêng cho từng người.
export const sendUpdateNotification = async (
  job: EventUpdateEmailJob
): Promise<void> => {
  const update = await prisma.event_updates.findFirst({
    where: { id: job.update_id, event_id: job.event_id },
    include: { events: { select: { title: true } } },
  });

  // Thông báo đã bị xoá trước khi job chạy (BR-40c) -> không gửi gì nữa
  if (!update) {
    console.warn(
      `⚠️  Bỏ qua job event_update: không còn thông báo ${job.update_id} của sự kiện ${job.event_id}`
    );
    return;
  }

  const registrations = await prisma.registrations.findMany({
    where: { event_id: job.event_id, status: 'confirmed' },
    select: { users: { select: { email: true, name: true } } },
  });

  // Gửi tuần tự để không dội SMTP; số người đăng ký một sự kiện trong phạm vi hệ thống
  // là hàng trăm, chưa cần cơ chế chia lô.
  for (const registration of registrations) {
    await EmailService.sendEventUpdateEmail({
      to: registration.users.email,
      name: registration.users.name,
      event_id: job.event_id,
      event_title: update.events.title,
      update_title: update.title,
      update_content: update.content,
    });
  }

  console.log(
    `📨 Đã gửi thông báo "${update.title}" tới ${registrations.length} người đăng ký`
  );
};
