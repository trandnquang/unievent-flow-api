import { renderLayout } from '../layout';
import { paragraph, button, calloutBox, escapeHtml } from '../blocks';
import { RenderedEmail } from './types';

export interface PasswordResetVars {
  name: string;
  reset_url: string;
  /** BR-22: số phút còn hiệu lực, khớp với cột reset_token_expires */
  expires_in_minutes: number;
}

// (5) Email đặt lại mật khẩu — FR-07, BR-22.
//
// Hạn hiệu lực nêu trong email PHẢI khớp mốc ghi ở cột `reset_token_expires` (AuthService đặt
// now + 20 phút). Ghi cứng con số ở hai nơi rồi lệch nhau thì người dùng bấm link "còn hạn"
// theo email nhưng backend đã từ chối bằng RESET_TOKEN_EXPIRED — nên số phút được truyền vào.
export const renderPasswordReset = (vars: PasswordResetVars): RenderedEmail => ({
  subject: 'Đặt lại mật khẩu UniEvent Flow',
  text: [
    `Chào ${vars.name},`,
    '',
    'Chúng tôi nhận được yêu cầu đặt lại mật khẩu cho tài khoản của bạn.',
    `Nhấn vào đường dẫn sau để đặt lại mật khẩu (hiệu lực ${vars.expires_in_minutes} phút): ${vars.reset_url}`,
    '',
    'Nếu bạn không yêu cầu, hãy bỏ qua email này — mật khẩu hiện tại vẫn an toàn.',
    '',
    'UniEvent Flow',
  ].join('\n'),
  html: renderLayout({
    preheader: `Đường dẫn đặt lại mật khẩu, hiệu lực ${vars.expires_in_minutes} phút.`,
    title: 'Đặt lại mật khẩu',
    body: [
      paragraph(
        `Chào ${vars.name}, chúng tôi nhận được yêu cầu đặt lại mật khẩu cho tài khoản của bạn.`
      ),
      button(vars.reset_url, 'Đặt lại mật khẩu'),
      calloutBox(
        `Đường dẫn chỉ có hiệu lực trong ${vars.expires_in_minutes} phút. Hết hạn thì hãy yêu cầu lại từ trang đăng nhập.`
      ),
      paragraph(
        `Nếu nút trên không hoạt động, mở đường dẫn: ${escapeHtml(vars.reset_url)}`,
        true
      ),
      paragraph(
        'Nếu bạn không yêu cầu đặt lại mật khẩu, hãy bỏ qua email này — mật khẩu hiện tại vẫn an toàn.'
      ),
    ],
  }),
});
