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

// FR-31 (BR-40): thông báo sự kiện mới đăng -> gửi cho toàn bộ người đăng ký confirmed.
// BR-46b: lời mời Co-host (nhánh a/b của BR-46).
// Cả hai chỉ mang ID: worker tự truy vấn nội dung và danh sách người nhận TẠI THỜI ĐIỂM
// CHẠY (cùng nguyên tắc BR-58) nên payload không bị ôi khi job nằm chờ trong hàng đợi.
export type EventUpdateEmailJob = {
  type: 'event_update';
  event_id: string;
  update_id: string;
};

export type CoHostInvitationEmailJob = {
  type: 'co_host_invitation';
  event_id: string;
  user_id: string;
};

// FR-16 (BR-51): email xác nhận vé sau khi worker sinh vé thành công. Chỉ mang ticket_id,
// worker tự truy vấn vé + sự kiện + người nhận và tự sinh mã QR lúc chạy.
export type TicketConfirmationEmailJob = {
  type: 'ticket_confirmation';
  ticket_id: string;
};

// FR-38 (BR-86): gửi thông tin đăng nhập cho tài khoản Ban tổ chức vừa được cấp phát.
// Mật khẩu plaintext CHỈ đi qua job này rồi vào email — không log, không lưu ở đâu khác (CBR 2).
export type OrganizerCredentialsEmailJob = {
  type: 'organizer_credentials';
  user_id: string;
  temp_password: string;
};

export type EmailJobData =
  | PasswordResetEmailJob
  | EventUpdateEmailJob
  | CoHostInvitationEmailJob
  | TicketConfirmationEmailJob
  | OrganizerCredentialsEmailJob;

export const EMAIL_QUEUE_NAME = 'email';

// Bên PRODUCER (tiến trình API) chỉ đẩy job vào hàng đợi này; việc gửi email thật
// nằm ở tiến trình worker (SRS mục 5.6 - worker tách biệt với API).
export const emailQueue = createQueue<EmailJobData>(EMAIL_QUEUE_NAME);

// Hàng đợi nhắc lịch trước sự kiện (FR-35). Tách khỏi hàng đợi 'email' vì đây là job
// CÓ ĐỘ TRỄ (delay tới sát giờ diễn ra) và có vòng đời riêng: bị huỷ/lên lịch lại theo
// event.start_time (BR-97), khác hẳn các job email chạy ngay.
export type EventReminderJob = {
  event_id: string;
};

export const REMINDER_QUEUE_NAME = 'reminder';

// BR-97: quy ước jobId cố định suy ra từ eventId để tra cứu và huỷ mà không cần bảng ánh xạ.
// LƯU Ý KỸ THUẬT: đặc tả viết `reminder:{eventId}` nhưng BullMQ CẤM dấu ':' trong custom
// job id ("Custom Id cannot contain :") vì đó là ký tự phân tách khoá Redis của thư viện.
// Dùng dấu '-' để giữ đúng tinh thần quy ước; khoá Redis thực tế là
// bull:reminder:reminder-{eventId}, vẫn tra cứu/huỷ được y hệt.
export const reminderJobId = (eventId: string): string => `reminder-${eventId}`;

export const reminderQueue = createQueue<EventReminderJob>(REMINDER_QUEUE_NAME);

// Hàng đợi xử lý đăng ký vé (FR-14→16). Tách khỏi 'email' vì đây là nghiệp vụ lõi có
// transaction CSDL và bù trừ tồn kho, không phải tác vụ gửi thông báo.
//   - 'process': sinh vé + confirm registration, chạy ngay (BR-51)
//   - 'timeout': tới hạn giữ chỗ thì bù trừ nếu vẫn còn pending (BR-88/89/93).
//     Dùng job hẹn giờ thay vì trông chờ TTL khoá Redis tự hết hạn, vì Redis chỉ phát tín
//     hiệu key hết hạn khi bật keyspace notifications — không đảm bảo trên Redis managed.
export type RegistrationJobData =
  | { type: 'process'; registration_id: string }
  | { type: 'timeout'; registration_id: string };

export const REGISTRATION_QUEUE_NAME = 'registration';

// jobId cố định cho job hẹn giờ để không tạo trùng và có thể gỡ khi worker xong sớm
export const registrationTimeoutJobId = (registrationId: string): string =>
  `timeout-${registrationId}`;

export const registrationQueue = createQueue<RegistrationJobData>(
  REGISTRATION_QUEUE_NAME
);

// BR-62 (Async Write Rule): ghi checkin_logs + đổi ticket.status SAU KHI đã trả response
// cho máy quét, để giữ đúng ràng buộc <1s của NFR-01. Ghi bất đồng bộ chỉ an toàn vì tính
// đúng đắn của kết quả trả về đã được chốt đồng bộ bằng khoá Redis ở BR-91.
export type CheckinJobData = {
  ticket_id: string;
  event_id: string;
  organizer_id: string;
};

export const CHECKIN_QUEUE_NAME = 'checkin';

export const checkinQueue = createQueue<CheckinJobData>(CHECKIN_QUEUE_NAME);

// FR-25/26: phân tích cảm xúc hàng loạt bằng LLM. Tách hàng đợi riêng vì đây là tác vụ
// chậm, phụ thuộc dịch vụ ngoài và có thể tốn nhiều giây cho một batch lớn.
export type FeedbackJobData = {
  type: 'analyze';
  event_id: string;
};

export const FEEDBACK_QUEUE_NAME = 'feedback';

export const feedbackQueue = createQueue<FeedbackJobData>(FEEDBACK_QUEUE_NAME);
