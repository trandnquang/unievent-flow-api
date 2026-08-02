import nodemailer, { Transporter } from 'nodemailer';
import { env } from '../config/env';
import { PasswordResetEmailJob } from '../config/queues';
// Nội dung email (biến) tách khỏi khung hiển thị (layout) — xem src/emails/.
// File này chỉ còn lo: dựng payload cho template + gọi transporter.
import { renderTicketConfirmation } from '../emails/templates/ticketConfirmation';
import { renderEventReminder } from '../emails/templates/eventReminder';
import { renderCoHostInvitation } from '../emails/templates/coHostInvitation';
import { renderOrganizerCredentials } from '../emails/templates/organizerCredentials';
import { renderPasswordReset } from '../emails/templates/passwordReset';
import { renderEventUpdate } from '../emails/templates/eventUpdate';

// BR-22: hạn hiệu lực của token đặt lại mật khẩu, khớp mốc AuthService ghi vào
// reset_token_expires (now + 20 phút). Khai báo ở đây để nội dung email không lệch với CSDL.
const RESET_TOKEN_TTL_MINUTES = 20;

// Nội dung email thông báo sự kiện (FR-31) - dữ liệu do worker truy vấn tại thời điểm chạy
export interface EventUpdateEmailPayload {
  to: string;
  name: string;
  event_id: string;
  event_title: string;
  update_title: string;
  update_content: string;
}

// Nội dung email mời làm Co-host (BR-46b)
export interface CoHostInvitationEmailPayload {
  to: string;
  name: string;
  event_id: string;
  event_title: string;
  inviter_name: string;
}

// Nội dung email xác nhận vé (FR-16) - kèm ảnh QR nhúng inline
export interface TicketConfirmationEmailPayload {
  to: string;
  name: string;
  ticket_id: string;
  event_title: string;
  event_start_time: Date;
  event_location: string;
  qr_buffer: Buffer;
}

// Nội dung email nhắc lịch trước sự kiện (FR-35, BR-58)
export interface EventReminderEmailPayload {
  to: string;
  name: string;
  event_id: string;
  ticket_id: string;
  event_title: string;
  event_start_time: Date;
  event_location: string;
}

// Nội dung email cấp tài khoản Ban tổ chức (FR-38, BR-86)
export interface OrganizerCredentialsEmailPayload {
  to: string;
  name: string;
  temp_password: string;
}

// Transporter SMTP singleton - CHỈ tiến trình worker import file này, tiến trình API
// không bao giờ gọi trực tiếp (SRS mục 5.6: tác vụ phụ thuộc dịch vụ ngoài nằm ở worker).
const globalForMailer = globalThis as unknown as {
  transporter: Transporter | undefined;
};

const buildTransporter = (): Transporter =>
  nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    // Cổng 465 dùng SMTPS; các cổng khác (587, 1025) dùng STARTTLS hoặc không mã hoá
    secure: env.SMTP_PORT === 465,
    // Máy chủ SMTP cục bộ (Mailpit/MailHog) không yêu cầu xác thực -> bỏ qua auth
    ...(env.SMTP_USER
      ? { auth: { user: env.SMTP_USER, pass: env.SMTP_PASS ?? '' } }
      : {}),
  });

export const transporter =
  globalForMailer.transporter ?? (globalForMailer.transporter = buildTransporter());

export class EmailService {
  // Email đặt lại mật khẩu (FR-07, BR-22) - token hết hạn sau 20 phút
  public static async sendPasswordResetEmail(
    job: PasswordResetEmailJob
  ): Promise<void> {
    const resetLink = `${env.APP_RESET_URL}?token=${encodeURIComponent(job.reset_token)}`;

    const email = renderPasswordReset({
      name: job.name,
      reset_url: resetLink,
      expires_in_minutes: RESET_TOKEN_TTL_MINUTES,
    });

    await transporter.sendMail({
      from: env.SMTP_FROM,
      to: job.to,
      ...email,
    });
  }

  // Email thông báo sự kiện (FR-31, BR-40) - gửi cho từng người đăng ký status=confirmed.
  // Lưu ý nghiệp vụ (BR-40b/40c): email đã gửi KHÔNG thu hồi hay cập nhật được khi Ban tổ
  // chức sửa/xoá thông báo sau đó — sửa/xoá chỉ tác động bản hiển thị trong feed sự kiện.
  public static async sendEventUpdateEmail(
    payload: EventUpdateEmailPayload
  ): Promise<void> {
    const eventLink = `${env.APP_EVENT_URL}/${payload.event_id}`;

    const email = renderEventUpdate({
      name: payload.name,
      event_title: payload.event_title,
      update_title: payload.update_title,
      update_content: payload.update_content,
      event_url: eventLink,
    });

    await transporter.sendMail({
      from: env.SMTP_FROM,
      to: payload.to,
      ...email,
    });
  }

  // Email mời làm Co-host (FR-37, BR-46b) - gửi ở nhánh (a) tạo mới và (b) mời lại sau khi
  // từ chối, và cả nhánh (c) mời lặp khi đang pending
  public static async sendCoHostInvitationEmail(
    payload: CoHostInvitationEmailPayload
  ): Promise<void> {
    const eventLink = `${env.APP_EVENT_URL}/${payload.event_id}`;

    const email = renderCoHostInvitation({
      name: payload.name,
      event_title: payload.event_title,
      inviter_name: payload.inviter_name,
      event_url: eventLink,
    });

    await transporter.sendMail({
      from: env.SMTP_FROM,
      to: payload.to,
      ...email,
    });
  }

  // Email xác nhận vé (FR-16, SRS §2.2.3 node Q "gửi email xác nhận kèm QR").
  // Ảnh QR nhúng inline qua Content-ID để sinh viên mở email là quét được ngay tại cổng,
  // không phải đăng nhập lại; đồng thời kèm link trang vé để xem trên web khi cần.
  public static async sendTicketConfirmationEmail(
    payload: TicketConfirmationEmailPayload
  ): Promise<void> {
    const ticketLink = `${env.APP_TICKET_URL}/${payload.ticket_id}`;

    const email = renderTicketConfirmation({
      name: payload.name,
      event_title: payload.event_title,
      event_start_time: payload.event_start_time,
      event_location: payload.event_location,
      ticket_url: ticketLink,
    });

    await transporter.sendMail({
      from: env.SMTP_FROM,
      to: payload.to,
      ...email,
      // BR-51: cid PHẢI khớp `src="cid:ticket-qr"` trong template — đổi một bên là ảnh QR
      // biến thành ô trống, người nhận không có gì để quét ở cổng.
      attachments: [
        {
          filename: 'ticket-qr.png',
          content: payload.qr_buffer,
          cid: 'ticket-qr',
        },
      ],
    });
  }

  // Email nhắc lịch trước giờ sự kiện (FR-35, BR-57/58)
  public static async sendEventReminderEmail(
    payload: EventReminderEmailPayload
  ): Promise<void> {
    const ticketLink = `${env.APP_TICKET_URL}/${payload.ticket_id}`;

    const email = renderEventReminder({
      name: payload.name,
      event_title: payload.event_title,
      event_start_time: payload.event_start_time,
      event_location: payload.event_location,
      ticket_url: ticketLink,
    });

    await transporter.sendMail({
      from: env.SMTP_FROM,
      to: payload.to,
      ...email,
    });
  }

  // Email cấp tài khoản Ban tổ chức (FR-38, BR-86). Đây là NƠI DUY NHẤT mật khẩu tạm ở
  // dạng plaintext xuất hiện — tuyệt đối không ghi log, không trả về response (CBR 2).
  public static async sendOrganizerCredentialsEmail(
    payload: OrganizerCredentialsEmailPayload
  ): Promise<void> {
    const email = renderOrganizerCredentials({
      name: payload.name,
      email: payload.to,
      temp_password: payload.temp_password,
      login_url: env.APP_LOGIN_URL,
    });

    await transporter.sendMail({
      from: env.SMTP_FROM,
      to: payload.to,
      ...email,
    });
  }
}
