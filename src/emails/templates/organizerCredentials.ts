import { renderLayout } from '../layout';
import {
  paragraph,
  infoTable,
  calloutBox,
  codeText,
  button,
  escapeHtml,
} from '../blocks';
import { RenderedEmail } from './types';

export interface OrganizerCredentialsVars {
  name: string;
  email: string;
  temp_password: string;
  login_url: string;
}

// (4) Email cấp tài khoản Ban tổ chức — FR-38, BR-86.
//
// ⚠️ CBR 2: đây là NƠI DUY NHẤT mật khẩu tạm tồn tại ở dạng plaintext. Tuyệt đối KHÔNG ghi log,
// KHÔNG trả về response. Sinh bằng CSPRNG ở AdminService, chỉ đi qua payload job rồi tới đây.
export const renderOrganizerCredentials = (
  vars: OrganizerCredentialsVars
): RenderedEmail => ({
  subject: 'Tài khoản Ban tổ chức UniEvent Flow của bạn',
  text: [
    `Chào ${vars.name},`,
    '',
    'Quản trị viên đã cấp cho bạn một tài khoản Ban tổ chức trên UniEvent Flow.',
    '',
    `Email đăng nhập: ${vars.email}`,
    `Mật khẩu tạm:    ${vars.temp_password}`,
    '',
    `Đăng nhập tại: ${vars.login_url}`,
    'Vui lòng đổi mật khẩu ngay sau lần đăng nhập đầu tiên.',
    '',
    'UniEvent Flow',
  ].join('\n'),
  html: renderLayout({
    preheader: 'Thông tin đăng nhập tài khoản Ban tổ chức của bạn.',
    title: 'Tài khoản Ban tổ chức đã sẵn sàng',
    body: [
      paragraph(
        `Chào ${vars.name}, quản trị viên đã cấp cho bạn một tài khoản Ban tổ chức trên UniEvent Flow.`
      ),
      infoTable([['Email đăng nhập', vars.email]]),
      calloutBox(
        `Mật khẩu tạm: ${codeText(vars.temp_password)}<br />Mật khẩu này chỉ xuất hiện trong email — hãy đổi ngay sau lần đăng nhập đầu tiên.`,
        true
      ),
      button(vars.login_url, 'Đăng nhập ngay'),
      paragraph(
        `Nếu nút trên không hoạt động, mở đường dẫn: ${escapeHtml(vars.login_url)}`,
        true
      ),
    ],
  }),
});
