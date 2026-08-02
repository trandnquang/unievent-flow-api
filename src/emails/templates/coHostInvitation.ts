import { renderLayout } from '../layout';
import { paragraph, buttonPair } from '../blocks';
import { RenderedEmail } from './types';

export interface CoHostInvitationVars {
  name: string;
  event_title: string;
  inviter_name: string;
  event_url: string;
}

// (3) Email mời làm Co-host — FR-37, BR-46b. Gửi ở cả ba nhánh: (a) mời mới, (b) mời lại sau
// khi bị từ chối, (c) mời lặp khi đang pending.
//
// Hai nút chấp nhận / từ chối cùng dẫn về trang sự kiện trong ứng dụng, KHÔNG phải hai endpoint
// nhận/từ chối trực tiếp: thao tác đổi trạng thái cần đăng nhập để xác định danh tính, và link
// hành động một-chạm trong email có thể bị công cụ quét thư của máy chủ bấm hộ.
export const renderCoHostInvitation = (
  vars: CoHostInvitationVars
): RenderedEmail => ({
  subject: `Lời mời đồng tổ chức sự kiện "${vars.event_title}"`,
  text: [
    `Chào ${vars.name},`,
    '',
    `${vars.inviter_name} mời bạn làm đơn vị đồng tổ chức (Co-host) của sự kiện "${vars.event_title}".`,
    '',
    'Sau khi chấp nhận, bạn có thể đăng thông báo, quản lý lịch trình và check-in cho sự kiện này.',
    `Vào trang "Sự kiện của tôi" để chấp nhận hoặc từ chối lời mời: ${vars.event_url}`,
    '',
    'UniEvent Flow',
  ].join('\n'),
  html: renderLayout({
    preheader: `${vars.inviter_name} mời bạn đồng tổ chức "${vars.event_title}".`,
    title: 'Lời mời đồng tổ chức',
    body: [
      paragraph(
        `Chào ${vars.name}, ${vars.inviter_name} mời bạn làm đơn vị đồng tổ chức (Co-host) của sự kiện "${vars.event_title}".`
      ),
      paragraph(
        'Sau khi chấp nhận, bạn có thể đăng thông báo, quản lý lịch trình và check-in cho sự kiện này.'
      ),
      buttonPair(
        { href: vars.event_url, label: 'Chấp nhận lời mời' },
        { href: vars.event_url, label: 'Từ chối' }
      ),
      paragraph(
        'Hai nút trên đưa bạn tới trang sự kiện; hãy đăng nhập để xác nhận lựa chọn.'
      ),
    ],
  }),
});
