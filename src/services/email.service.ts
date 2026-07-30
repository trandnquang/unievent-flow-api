import nodemailer, { Transporter } from 'nodemailer';
import { env } from '../config/env';
import { PasswordResetEmailJob } from '../config/queues';

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

// Định dạng thời gian theo giờ Việt Nam cho nội dung email
const formatEventTime = (value: Date): string =>
  value.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });

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

    await transporter.sendMail({
      from: env.SMTP_FROM,
      to: job.to,
      subject: 'Đặt lại mật khẩu UniEvent Flow',
      text: [
        `Chào ${job.name},`,
        '',
        'Chúng tôi nhận được yêu cầu đặt lại mật khẩu cho tài khoản của bạn.',
        `Nhấn vào đường dẫn sau để đặt lại mật khẩu (hiệu lực 20 phút): ${resetLink}`,
        '',
        'Nếu bạn không yêu cầu, hãy bỏ qua email này — mật khẩu hiện tại vẫn an toàn.',
        '',
        'UniEvent Flow',
      ].join('\n'),
      html: [
        `<p>Chào <strong>${job.name}</strong>,</p>`,
        '<p>Chúng tôi nhận được yêu cầu đặt lại mật khẩu cho tài khoản của bạn.</p>',
        `<p><a href="${resetLink}">Đặt lại mật khẩu</a> (đường dẫn có hiệu lực trong 20 phút).</p>`,
        '<p>Nếu bạn không yêu cầu, hãy bỏ qua email này — mật khẩu hiện tại vẫn an toàn.</p>',
        '<p>UniEvent Flow</p>',
      ].join(''),
    });
  }

  // Email thông báo sự kiện (FR-31, BR-40) - gửi cho từng người đăng ký status=confirmed.
  // Lưu ý nghiệp vụ (BR-40b/40c): email đã gửi KHÔNG thu hồi hay cập nhật được khi Ban tổ
  // chức sửa/xoá thông báo sau đó — sửa/xoá chỉ tác động bản hiển thị trong feed sự kiện.
  public static async sendEventUpdateEmail(
    payload: EventUpdateEmailPayload
  ): Promise<void> {
    const eventLink = `${env.APP_EVENT_URL}/${payload.event_id}`;

    await transporter.sendMail({
      from: env.SMTP_FROM,
      to: payload.to,
      subject: `[${payload.event_title}] ${payload.update_title}`,
      text: [
        `Chào ${payload.name},`,
        '',
        `Ban tổ chức sự kiện "${payload.event_title}" vừa đăng một thông báo mới:`,
        '',
        payload.update_title,
        payload.update_content,
        '',
        `Xem chi tiết sự kiện: ${eventLink}`,
        '',
        'UniEvent Flow',
      ].join('\n'),
      html: [
        `<p>Chào <strong>${payload.name}</strong>,</p>`,
        `<p>Ban tổ chức sự kiện <strong>${payload.event_title}</strong> vừa đăng một thông báo mới:</p>`,
        `<h3>${payload.update_title}</h3>`,
        `<p>${payload.update_content}</p>`,
        `<p><a href="${eventLink}">Xem chi tiết sự kiện</a></p>`,
        '<p>UniEvent Flow</p>',
      ].join(''),
    });
  }

  // Email mời làm Co-host (FR-37, BR-46b) - gửi ở nhánh (a) tạo mới và (b) mời lại sau khi
  // từ chối, và cả nhánh (c) mời lặp khi đang pending
  public static async sendCoHostInvitationEmail(
    payload: CoHostInvitationEmailPayload
  ): Promise<void> {
    const eventLink = `${env.APP_EVENT_URL}/${payload.event_id}`;

    await transporter.sendMail({
      from: env.SMTP_FROM,
      to: payload.to,
      subject: `Lời mời đồng tổ chức sự kiện "${payload.event_title}"`,
      text: [
        `Chào ${payload.name},`,
        '',
        `${payload.inviter_name} mời bạn làm đơn vị đồng tổ chức (Co-host) của sự kiện "${payload.event_title}".`,
        '',
        'Sau khi chấp nhận, bạn có thể đăng thông báo, quản lý lịch trình và check-in cho sự kiện này.',
        `Vào trang "Sự kiện của tôi" để chấp nhận hoặc từ chối lời mời: ${eventLink}`,
        '',
        'UniEvent Flow',
      ].join('\n'),
      html: [
        `<p>Chào <strong>${payload.name}</strong>,</p>`,
        `<p><strong>${payload.inviter_name}</strong> mời bạn làm đơn vị đồng tổ chức (Co-host) của sự kiện <strong>${payload.event_title}</strong>.</p>`,
        '<p>Sau khi chấp nhận, bạn có thể đăng thông báo, quản lý lịch trình và check-in cho sự kiện này.</p>',
        `<p><a href="${eventLink}">Chấp nhận hoặc từ chối lời mời</a></p>`,
        '<p>UniEvent Flow</p>',
      ].join(''),
    });
  }

  // Email xác nhận vé (FR-16, SRS §2.2.3 node Q "gửi email xác nhận kèm QR").
  // Ảnh QR nhúng inline qua Content-ID để sinh viên mở email là quét được ngay tại cổng,
  // không phải đăng nhập lại; đồng thời kèm link trang vé để xem trên web khi cần.
  public static async sendTicketConfirmationEmail(
    payload: TicketConfirmationEmailPayload
  ): Promise<void> {
    const ticketLink = `${env.APP_TICKET_URL}/${payload.ticket_id}`;
    const startTime = formatEventTime(payload.event_start_time);

    await transporter.sendMail({
      from: env.SMTP_FROM,
      to: payload.to,
      subject: `Vé điện tử của bạn — ${payload.event_title}`,
      text: [
        `Chào ${payload.name},`,
        '',
        `Bạn đã đăng ký thành công sự kiện "${payload.event_title}".`,
        `Thời gian: ${startTime}`,
        `Địa điểm: ${payload.event_location}`,
        '',
        `Xem vé và mã QR tại: ${ticketLink}`,
        'Vui lòng xuất trình mã QR tại cổng để check-in.',
        '',
        'UniEvent Flow',
      ].join('\n'),
      html: [
        `<p>Chào <strong>${payload.name}</strong>,</p>`,
        `<p>Bạn đã đăng ký thành công sự kiện <strong>${payload.event_title}</strong>.</p>`,
        `<p><strong>Thời gian:</strong> ${startTime}<br/>`,
        `<strong>Địa điểm:</strong> ${payload.event_location}</p>`,
        '<p>Xuất trình mã QR dưới đây tại cổng để check-in:</p>',
        '<p><img src="cid:ticket-qr" alt="Mã QR vé" width="240" height="240" /></p>',
        `<p>Hoặc mở trên web: <a href="${ticketLink}">Xem vé của tôi</a></p>`,
        '<p>UniEvent Flow</p>',
      ].join(''),
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
    const startTime = formatEventTime(payload.event_start_time);

    await transporter.sendMail({
      from: env.SMTP_FROM,
      to: payload.to,
      subject: `Nhắc lịch: "${payload.event_title}" sắp diễn ra`,
      text: [
        `Chào ${payload.name},`,
        '',
        `Sự kiện "${payload.event_title}" bạn đã đăng ký sắp diễn ra.`,
        `Thời gian: ${startTime}`,
        `Địa điểm: ${payload.event_location}`,
        '',
        `Mở vé và mã QR: ${ticketLink}`,
        '',
        'UniEvent Flow',
      ].join('\n'),
      html: [
        `<p>Chào <strong>${payload.name}</strong>,</p>`,
        `<p>Sự kiện <strong>${payload.event_title}</strong> bạn đã đăng ký sắp diễn ra.</p>`,
        `<p><strong>Thời gian:</strong> ${startTime}<br/>`,
        `<strong>Địa điểm:</strong> ${payload.event_location}</p>`,
        `<p><a href="${ticketLink}">Mở vé và mã QR</a></p>`,
        '<p>UniEvent Flow</p>',
      ].join(''),
    });
  }

  // Email cấp tài khoản Ban tổ chức (FR-38, BR-86). Đây là NƠI DUY NHẤT mật khẩu tạm ở
  // dạng plaintext xuất hiện — tuyệt đối không ghi log, không trả về response (CBR 2).
  public static async sendOrganizerCredentialsEmail(
    payload: OrganizerCredentialsEmailPayload
  ): Promise<void> {
    await transporter.sendMail({
      from: env.SMTP_FROM,
      to: payload.to,
      subject: 'Tài khoản Ban tổ chức UniEvent Flow của bạn',
      text: [
        `Chào ${payload.name},`,
        '',
        'Quản trị viên đã cấp cho bạn một tài khoản Ban tổ chức trên UniEvent Flow.',
        '',
        `Email đăng nhập: ${payload.to}`,
        `Mật khẩu tạm:    ${payload.temp_password}`,
        '',
        `Đăng nhập tại: ${env.APP_LOGIN_URL}`,
        'Vui lòng đổi mật khẩu ngay sau lần đăng nhập đầu tiên.',
        '',
        'UniEvent Flow',
      ].join('\n'),
      html: [
        `<p>Chào <strong>${payload.name}</strong>,</p>`,
        '<p>Quản trị viên đã cấp cho bạn một tài khoản Ban tổ chức trên UniEvent Flow.</p>',
        `<p><strong>Email đăng nhập:</strong> ${payload.to}<br/>`,
        `<strong>Mật khẩu tạm:</strong> <code>${payload.temp_password}</code></p>`,
        `<p><a href="${env.APP_LOGIN_URL}">Đăng nhập ngay</a></p>`,
        '<p>Vui lòng đổi mật khẩu ngay sau lần đăng nhập đầu tiên.</p>',
        '<p>UniEvent Flow</p>',
      ].join(''),
    });
  }
}
