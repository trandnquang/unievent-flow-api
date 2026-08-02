// Các khối nội dung dùng chung cho mọi email (E3).
//
// Ràng buộc chung của HTML email — lý do mã ở đây trông "cũ" hơn web thường:
//   · Gmail LOẠI BỎ thẻ <style> và mọi class ⇒ CSS phải inline 100% trên từng thẻ.
//   · Outlook (Word engine) không hỗ trợ flexbox/grid, bỏ qua border-radius trên <a>, và
//     tính chiều rộng <div> không nhất quán ⇒ bố cục bằng <table> lồng nhau.
//   · Không dùng đơn vị rem/vw — nhiều client không nhận.

// Bảng màu dùng chung, khai báo một chỗ để 6 template không trôi mỗi nơi một sắc
export const COLORS = {
  text: '#1f2933',
  muted: '#6b7280',
  border: '#e5e7eb',
  background: '#f4f5f7',
  surface: '#ffffff',
  brand: '#2563eb',
  brandText: '#ffffff',
  warningBg: '#fff7ed',
  warningBorder: '#fdba74',
} as const;

export const FONT_STACK =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif";

// Chống XSS/vỡ bố cục: nội dung do người dùng nhập (tiêu đề & nội dung thông báo của Ban tổ
// chức, tên người dùng, tên sự kiện...) BẮT BUỘC đi qua hàm này trước khi nội suy vào HTML.
// Bản trước nội suy thô — một dấu `<` trong tiêu đề thông báo là đủ làm hỏng email.
export const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

// Đoạn văn thường. `html` = true khi chuỗi đã được dựng sẵn từ các mảnh ĐÃ escape.
export const paragraph = (content: string, html = false): string =>
  `<p style="margin:0 0 16px;font-family:${FONT_STACK};font-size:15px;line-height:1.6;color:${COLORS.text};">${
    html ? content : escapeHtml(content)
  }</p>`;

// Tiêu đề phụ trong thân email
export const heading = (content: string): string =>
  `<h2 style="margin:0 0 12px;font-family:${FONT_STACK};font-size:18px;line-height:1.4;font-weight:700;color:${COLORS.text};">${escapeHtml(
    content
  )}</h2>`;

// Nút bấm "bulletproof": bọc trong <table> vì Outlook không tô nền cho <a> có padding.
export const button = (href: string, label: string): string => `
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 16px;">
  <tr>
    <td align="center" bgcolor="${COLORS.brand}" style="border-radius:6px;">
      <a href="${escapeHtml(href)}" target="_blank" style="display:inline-block;padding:12px 24px;font-family:${FONT_STACK};font-size:15px;font-weight:600;color:${COLORS.brandText};text-decoration:none;border-radius:6px;">${escapeHtml(
        label
      )}</a>
    </td>
  </tr>
</table>`;

// Hai nút đặt cạnh nhau (email mời Co-host: Chấp nhận / Từ chối)
export const buttonPair = (
  primary: { href: string; label: string },
  secondary: { href: string; label: string }
): string => `
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 16px;">
  <tr>
    <td align="center" bgcolor="${COLORS.brand}" style="border-radius:6px;">
      <a href="${escapeHtml(primary.href)}" target="_blank" style="display:inline-block;padding:12px 24px;font-family:${FONT_STACK};font-size:15px;font-weight:600;color:${COLORS.brandText};text-decoration:none;border-radius:6px;">${escapeHtml(
        primary.label
      )}</a>
    </td>
    <td style="width:12px;">&nbsp;</td>
    <td align="center" style="border:1px solid ${COLORS.border};border-radius:6px;">
      <a href="${escapeHtml(secondary.href)}" target="_blank" style="display:inline-block;padding:11px 23px;font-family:${FONT_STACK};font-size:15px;font-weight:600;color:${COLORS.text};text-decoration:none;border-radius:6px;">${escapeHtml(
        secondary.label
      )}</a>
    </td>
  </tr>
</table>`;

// Khối "nhãn: giá trị" cho thông tin sự kiện (thời gian, địa điểm, email đăng nhập...)
export const infoTable = (rows: Array<[string, string]>): string => `
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 16px;border:1px solid ${COLORS.border};border-radius:6px;">
  ${rows
    .map(
      ([label, value], index) => `<tr>
    <td style="padding:10px 14px;font-family:${FONT_STACK};font-size:14px;line-height:1.5;color:${COLORS.muted};white-space:nowrap;vertical-align:top;${
      index > 0 ? `border-top:1px solid ${COLORS.border};` : ''
    }">${escapeHtml(label)}</td>
    <td style="padding:10px 14px;font-family:${FONT_STACK};font-size:14px;line-height:1.5;color:${COLORS.text};font-weight:600;${
      index > 0 ? `border-top:1px solid ${COLORS.border};` : ''
    }">${escapeHtml(value)}</td>
  </tr>`
    )
    .join('')}
</table>`;

// Khối nhấn mạnh (mật khẩu tạm, hạn hiệu lực của link đặt lại mật khẩu)
export const calloutBox = (content: string, html = false): string => `
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 16px;">
  <tr>
    <td style="padding:14px;background-color:${COLORS.warningBg};border:1px solid ${COLORS.warningBorder};border-radius:6px;font-family:${FONT_STACK};font-size:14px;line-height:1.6;color:${COLORS.text};">${
      html ? content : escapeHtml(content)
    }</td>
  </tr>
</table>`;

// Chuỗi cần hiển thị nguyên văn (mật khẩu tạm) — dùng font đơn cách cho dễ chép tay
export const codeText = (value: string): string =>
  `<span style="font-family:'SFMono-Regular',Consolas,'Liberation Mono',Menlo,monospace;font-size:15px;font-weight:700;letter-spacing:0.5px;color:${COLORS.text};">${escapeHtml(
    value
  )}</span>`;

// Ảnh căn giữa. Dùng cho mã QR vé (BR-51) với src="cid:ticket-qr".
export const centeredImage = (
  src: string,
  alt: string,
  size: number
): string => `
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 16px;">
  <tr>
    <td align="center" style="padding:8px 0;">
      <img src="${escapeHtml(src)}" alt="${escapeHtml(alt)}" width="${size}" height="${size}" style="display:block;border:0;outline:none;text-decoration:none;max-width:100%;height:auto;" />
    </td>
  </tr>
</table>`;

export const divider = (): string =>
  `<div style="height:1px;line-height:1px;font-size:0;background-color:${COLORS.border};margin:0 0 16px;">&nbsp;</div>`;

// Định dạng thời gian theo giờ Việt Nam — dùng chung cho mọi email có mốc thời gian
export const formatEventTime = (value: Date): string =>
  value.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
