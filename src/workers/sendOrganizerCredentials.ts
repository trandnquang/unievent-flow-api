import { prisma } from '../config/db';
import { OrganizerCredentialsEmailJob } from '../config/queues';
import { EmailService } from '../services/email.service';

// Gửi email cấp tài khoản Ban tổ chức (FR-38, BR-86).
// Khác các job email còn lại: payload BUỘC phải mang theo mật khẩu tạm ở dạng plaintext,
// vì hệ thống chỉ lưu bản băm bcrypt và không có cách nào khôi phục lại. Mật khẩu này chỉ
// tồn tại trong payload job (Redis, tự dọn theo removeOnComplete) và trong email gửi đi —
// tuyệt đối không ghi ra log (CBR 2).
export const sendOrganizerCredentials = async (
  job: OrganizerCredentialsEmailJob
): Promise<void> => {
  const user = await prisma.users.findUnique({
    where: { id: job.user_id },
    select: { email: true, name: true },
  });

  if (!user) {
    console.warn(
      `⚠️  Bỏ qua job organizer_credentials: không còn tài khoản ${job.user_id}`
    );
    return;
  }

  await EmailService.sendOrganizerCredentialsEmail({
    to: user.email,
    name: user.name,
    temp_password: job.temp_password,
  });
};
