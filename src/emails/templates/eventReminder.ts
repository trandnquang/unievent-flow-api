import { renderLayout } from '../layout';
import { paragraph, infoTable, button, formatEventTime } from '../blocks';
import { RenderedEmail } from './types';

export interface EventReminderVars {
  name: string;
  event_title: string;
  event_start_time: Date;
  event_location: string;
  ticket_url: string;
}

// (2) Email nhắc lịch trước giờ sự kiện — FR-35, BR-57/58.
//
// ⚠️ Loại email DUY NHẤT không đi qua hàng đợi `email`: nó chạy trên hàng đợi `reminder` riêng
// (src/workers/sendEventReminder.ts) vì được hẹn giờ theo BR-57, không phát sinh tức thời.
// Khung hiển thị vẫn dùng chung layout để nhận diện thương hiệu không lệch.
export const renderEventReminder = (vars: EventReminderVars): RenderedEmail => {
  const startTime = formatEventTime(vars.event_start_time);

  return {
    subject: `Nhắc lịch: "${vars.event_title}" sắp diễn ra`,
    text: [
      `Chào ${vars.name},`,
      '',
      `Sự kiện "${vars.event_title}" bạn đã đăng ký sắp diễn ra.`,
      `Thời gian: ${startTime}`,
      `Địa điểm: ${vars.event_location}`,
      '',
      `Mở vé và mã QR: ${vars.ticket_url}`,
      '',
      'UniEvent Flow',
    ].join('\n'),
    html: renderLayout({
      preheader: `"${vars.event_title}" sắp bắt đầu — đừng quên mang theo vé.`,
      title: 'Sự kiện của bạn sắp diễn ra',
      body: [
        paragraph(
          `Chào ${vars.name}, đây là lời nhắc cho sự kiện bạn đã đăng ký.`
        ),
        infoTable([
          ['Sự kiện', vars.event_title],
          ['Thời gian', startTime],
          ['Địa điểm', vars.event_location],
        ]),
        paragraph('Mở vé trước khi tới cổng để sẵn sàng quét mã QR.'),
        button(vars.ticket_url, 'Mở vé và mã QR'),
      ],
    }),
  };
};
