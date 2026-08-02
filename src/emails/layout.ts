import { env } from '../config/env';
import { COLORS, FONT_STACK, escapeHtml } from './blocks';

export interface LayoutInput {
  /** Dòng xem trước hiện cạnh tiêu đề trong hộp thư — ẩn khỏi thân email */
  preheader: string;
  /** Tiêu đề lớn ở đầu thân email */
  title: string;
  /** Các khối nội dung đã dựng sẵn (xem blocks.ts) */
  body: string[];
}

const BRAND_NAME = 'UniEvent Flow';

// Logo: URL tuyệt đối lấy từ APP_LOGO_URL. Bỏ trống là trường hợp HỢP LỆ và là mặc định —
// khi đó dựng wordmark bằng chữ thay vì để lại một <img> gãy trong hộp thư người nhận.
const renderBrand = (): string => {
  if (env.APP_LOGO_URL) {
    return `<img src="${escapeHtml(env.APP_LOGO_URL)}" alt="${BRAND_NAME}" height="32" style="display:block;border:0;outline:none;text-decoration:none;max-height:32px;width:auto;" />`;
  }
  return `<span style="font-family:${FONT_STACK};font-size:20px;font-weight:700;letter-spacing:-0.2px;color:${COLORS.brand};">${BRAND_NAME}</span>`;
};

// Khung chung của MỌI email (E3): header logo → thân → footer.
//
// Bố cục bằng <table> lồng nhau và CSS inline 100% là CÓ CHỦ ĐÍCH, không phải mã cũ:
// Gmail loại bỏ thẻ <style>, Outlook dựng HTML bằng engine của Word nên không có flexbox/grid.
// Bảng ngoài cùng tô nền trang, bảng trong giới hạn 600px — chiều rộng an toàn với mọi client
// và vẫn đọc được trên điện thoại.
//
// Template CHỈ dựng nội dung (biến); khung nằm trọn trong file này để sửa nhận diện thương
// hiệu một chỗ là cả 6 email đổi theo.
export const renderLayout = ({
  preheader,
  title,
  body,
}: LayoutInput): string => `<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;padding:0;background-color:${COLORS.background};">
<!-- Dòng xem trước: hiện cạnh tiêu đề ở danh sách thư, không hiện trong thân email -->
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;height:0;width:0;">${escapeHtml(
  preheader
)}</div>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:${COLORS.background};">
  <tr>
    <td align="center" style="padding:24px 12px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="width:100%;max-width:600px;background-color:${COLORS.surface};border:1px solid ${COLORS.border};border-radius:8px;">
        <tr>
          <td style="padding:20px 28px;border-bottom:1px solid ${COLORS.border};">${renderBrand()}</td>
        </tr>
        <tr>
          <td style="padding:28px;">
            <h1 style="margin:0 0 20px;font-family:${FONT_STACK};font-size:22px;line-height:1.35;font-weight:700;color:${COLORS.text};">${escapeHtml(
              title
            )}</h1>
            ${body.join('\n            ')}
          </td>
        </tr>
        <tr>
          <td style="padding:18px 28px;border-top:1px solid ${COLORS.border};font-family:${FONT_STACK};font-size:12px;line-height:1.6;color:${COLORS.muted};">
            Email này được gửi tự động từ hệ thống ${BRAND_NAME} — vui lòng không trả lời.
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
