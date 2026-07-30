import { prisma } from '../config/db';
import { CoHostInvitationEmailJob } from '../config/queues';
import { EmailService } from '../services/email.service';

// Gửi email mời làm Co-host (FR-37, BR-46b).
// Nội dung truy vấn tại thời điểm job chạy để không gửi lời mời cho bản ghi đã bị gỡ.
export const sendCoHostInvitation = async (
  job: CoHostInvitationEmailJob
): Promise<void> => {
  const coHost = await prisma.event_co_hosts.findUnique({
    where: {
      event_id_user_id: { event_id: job.event_id, user_id: job.user_id },
    },
    include: {
      users: { select: { email: true, name: true } },
      events: {
        select: { title: true, users: { select: { name: true } } },
      },
    },
  });

  // Chủ sự kiện đã gỡ Co-host (BR-44) trước khi job kịp chạy -> không gửi nữa
  if (!coHost) {
    console.warn(
      `⚠️  Bỏ qua job co_host_invitation: không còn bản ghi (${job.event_id}, ${job.user_id})`
    );
    return;
  }

  await EmailService.sendCoHostInvitationEmail({
    to: coHost.users.email,
    name: coHost.users.name,
    event_id: job.event_id,
    event_title: coHost.events.title,
    inviter_name: coHost.events.users.name,
  });
};
