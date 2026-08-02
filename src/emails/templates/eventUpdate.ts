import { renderLayout } from '../layout';
import { paragraph, heading, button, divider } from '../blocks';
import { RenderedEmail } from './types';

export interface EventUpdateVars {
  name: string;
  event_title: string;
  update_title: string;
  update_content: string;
  event_url: string;
}

// (6) Email thông báo sự kiện — FR-31, BR-40. Gửi cho từng người đăng ký status=confirmed.
//
// Lưu ý nghiệp vụ (BR-40b/40c): email đã gửi KHÔNG thu hồi hay cập nhật được khi Ban tổ chức
// sửa/xoá thông báo sau đó — sửa/xoá chỉ tác động bản hiển thị trong feed sự kiện.
//
// ⚠️ `update_title` và `update_content` là nội dung DO NGƯỜI DÙNG NHẬP (Ban tổ chức tự gõ).
// Chúng đi qua escapeHtml trong paragraph()/heading() — bản trước nội suy thô vào HTML, chỉ cần
// một dấu `<` trong tiêu đề là hỏng bố cục email.
export const renderEventUpdate = (vars: EventUpdateVars): RenderedEmail => ({
  subject: `[${vars.event_title}] ${vars.update_title}`,
  text: [
    `Chào ${vars.name},`,
    '',
    `Ban tổ chức sự kiện "${vars.event_title}" vừa đăng một thông báo mới:`,
    '',
    vars.update_title,
    vars.update_content,
    '',
    `Xem chi tiết sự kiện: ${vars.event_url}`,
    '',
    'UniEvent Flow',
  ].join('\n'),
  html: renderLayout({
    preheader: `Thông báo mới từ "${vars.event_title}".`,
    title: 'Thông báo mới từ ban tổ chức',
    body: [
      paragraph(
        `Chào ${vars.name}, ban tổ chức sự kiện "${vars.event_title}" vừa đăng một thông báo mới.`
      ),
      divider(),
      heading(vars.update_title),
      paragraph(vars.update_content),
      divider(),
      button(vars.event_url, 'Xem chi tiết sự kiện'),
    ],
  }),
});
