import { renderLayout } from '../layout';
import {
  paragraph,
  infoTable,
  button,
  centeredImage,
  formatEventTime,
} from '../blocks';
import { RenderedEmail } from './types';

export interface TicketConfirmationVars {
  name: string;
  event_title: string;
  event_start_time: Date;
  event_location: string;
  ticket_url: string;
}

// (1) Email xác nhận vé — FR-16, SRS §2.2.3 node Q "gửi email xác nhận kèm QR".
//
// BR-51: ảnh QR nhúng INLINE qua Content-ID `ticket-qr` (không phải URL ngoài) để sinh viên mở
// email là quét được ngay tại cổng, không phải đăng nhập lại và không phụ thuộc việc client có
// chặn ảnh ngoài hay không. Phần đính kèm tương ứng do EmailService gắn vào.
export const renderTicketConfirmation = (
  vars: TicketConfirmationVars
): RenderedEmail => {
  const startTime = formatEventTime(vars.event_start_time);

  return {
    subject: `Vé điện tử của bạn — ${vars.event_title}`,
    text: [
      `Chào ${vars.name},`,
      '',
      `Bạn đã đăng ký thành công sự kiện "${vars.event_title}".`,
      `Thời gian: ${startTime}`,
      `Địa điểm: ${vars.event_location}`,
      '',
      `Xem vé và mã QR tại: ${vars.ticket_url}`,
      'Vui lòng xuất trình mã QR tại cổng để check-in.',
      '',
      'UniEvent Flow',
    ].join('\n'),
    html: renderLayout({
      preheader: `Vé của bạn cho "${vars.event_title}" đã sẵn sàng.`,
      title: 'Đăng ký thành công',
      body: [
        paragraph(`Chào ${vars.name}, bạn đã đăng ký thành công sự kiện dưới đây.`),
        infoTable([
          ['Sự kiện', vars.event_title],
          ['Thời gian', startTime],
          ['Địa điểm', vars.event_location],
        ]),
        paragraph('Xuất trình mã QR dưới đây tại cổng để check-in:'),
        centeredImage('cid:ticket-qr', 'Mã QR vé', 240),
        button(vars.ticket_url, 'Xem vé của tôi'),
        paragraph('Bạn cũng có thể mở lại vé bất cứ lúc nào trong mục "Vé của tôi".'),
      ],
    }),
  };
};
