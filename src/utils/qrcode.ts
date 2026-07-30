import QRCode from 'qrcode';

// Sinh mã QR từ chuỗi JWT của vé (FR-18). Sinh tại chỗ, không gọi dịch vụ ngoài — nội dung
// QR chính là jwt_code nên máy quét ở cổng chỉ cần xác thực chữ ký, không phải tra cứu gì thêm.
const QR_OPTIONS = {
  errorCorrectionLevel: 'M' as const,
  margin: 1,
  width: 320,
};

// Data URL (base64 PNG) - dùng cho response JSON của GET /tickets/:ticketId
export const generateQrDataUrl = (payload: string): Promise<string> =>
  QRCode.toDataURL(payload, QR_OPTIONS);

// Buffer PNG - dùng cho phần đính kèm inline (cid) của email xác nhận vé
export const generateQrBuffer = (payload: string): Promise<Buffer> =>
  QRCode.toBuffer(payload, QR_OPTIONS);
