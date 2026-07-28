import { createQueue } from './bullmq';

// Kiểu dữ liệu job của hàng đợi 'email'. Dùng discriminant `type` để các FR sau
// (FR-16 gửi vé, FR-35 nhắc lịch, FR-38 cấp tài khoản, BR-46b mời co-host) dùng
// chung một hàng đợi thay vì mỗi loại một queue riêng.
export type PasswordResetEmailJob = {
  type: 'password_reset';
  to: string;
  name: string;
  reset_token: string;
};

export type EmailJobData = PasswordResetEmailJob;

export const EMAIL_QUEUE_NAME = 'email';

// Bên PRODUCER (tiến trình API) chỉ đẩy job vào hàng đợi này; việc gửi email thật
// nằm ở tiến trình worker (SRS mục 5.6 - worker tách biệt với API).
export const emailQueue = createQueue<EmailJobData>(EMAIL_QUEUE_NAME);
