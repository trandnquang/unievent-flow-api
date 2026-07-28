import nodemailer, { Transporter } from 'nodemailer';
import { env } from '../config/env';
import { PasswordResetEmailJob } from '../config/queues';

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
}
