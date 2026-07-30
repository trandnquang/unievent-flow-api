import { prisma } from '../config/db';
import { TicketConfirmationEmailJob } from '../config/queues';
import { EmailService } from '../services/email.service';
import { generateQrBuffer } from '../utils/qrcode';

// Địa điểm hiển thị trong email: sự kiện online thì đưa link phòng thay cho địa chỉ
const describeLocation = (
  locationType: string,
  location: string | null,
  joinUrl: string | null
): string =>
  locationType === 'online'
    ? `Trực tuyến — ${joinUrl ?? 'xem trang sự kiện'}`
    : (location ?? 'Xem trang sự kiện');

// Gửi email xác nhận vé kèm mã QR nhúng inline (FR-16, SRS §2.2.3 node Q).
// Truy vấn dữ liệu tại thời điểm job chạy, chỉ nhận ticket_id từ payload.
export const sendTicketConfirmation = async (
  job: TicketConfirmationEmailJob
): Promise<void> => {
  const ticket = await prisma.tickets.findUnique({
    where: { id: job.ticket_id },
    include: {
      registrations: {
        select: {
          users: { select: { email: true, name: true } },
          events: {
            select: {
              title: true,
              start_time: true,
              location: true,
              location_type: true,
              join_url: true,
            },
          },
        },
      },
    },
  });

  // Vé đã bị xoá (đăng ký bị gỡ) trước khi job kịp chạy -> không gửi nữa
  if (!ticket) {
    console.warn(
      `⚠️  Bỏ qua job ticket_confirmation: không còn vé ${job.ticket_id}`
    );
    return;
  }

  const { users, events } = ticket.registrations;

  // Nội dung QR chính là jwt_code của vé (BR-109: máy quét chỉ xác thực chữ ký)
  const qrBuffer = await generateQrBuffer(ticket.jwt_code);

  await EmailService.sendTicketConfirmationEmail({
    to: users.email,
    name: users.name,
    ticket_id: ticket.id,
    event_title: events.title,
    event_start_time: events.start_time,
    event_location: describeLocation(
      events.location_type,
      events.location,
      events.join_url
    ),
    qr_buffer: qrBuffer,
  });
};
