// BR-104 lớp (b): kiểm magic bytes ở đầu tệp phải khớp với MIME type client khai báo.
//
// MIME type trong multipart do CLIENT tự khai, không phải sự thật — đổi đuôi tệp .exe thành
// .png và khai image/png là qua được lớp (a). Chỉ vài byte đầu tệp mới nói đúng định dạng thật.

export const ALLOWED_IMAGE_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;

export type AllowedImageMimeType = (typeof ALLOWED_IMAGE_MIME_TYPES)[number];

export const isAllowedImageMimeType = (
  mimeType: string
): mimeType is AllowedImageMimeType =>
  (ALLOWED_IMAGE_MIME_TYPES as readonly string[]).includes(mimeType);

const startsWith = (buffer: Buffer, signature: number[]): boolean =>
  buffer.length >= signature.length &&
  signature.every((byte, index) => buffer[index] === byte);

// JPEG: FF D8 FF · PNG: 89 50 4E 47 0D 0A 1A 0A
const JPEG_SIGNATURE = [0xff, 0xd8, 0xff];
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

// WebP là container RIFF: "RIFF" ở byte 0-3, kích thước ở 4-7, "WEBP" ở byte 8-11.
// Phải kiểm CẢ HAI cụm, vì "RIFF" một mình còn là AVI và WAV.
const isWebp = (buffer: Buffer): boolean =>
  buffer.length >= 12 &&
  buffer.toString('ascii', 0, 4) === 'RIFF' &&
  buffer.toString('ascii', 8, 12) === 'WEBP';

// Đúng thì trả true. Cố tình so khớp với ĐÚNG định dạng đã khai báo (không phải "là ảnh
// bất kỳ"), để MIME khai báo và nội dung thật không mâu thuẫn nhau.
export const matchesDeclaredImageType = (
  buffer: Buffer,
  mimeType: AllowedImageMimeType
): boolean => {
  switch (mimeType) {
    case 'image/jpeg':
      return startsWith(buffer, JPEG_SIGNATURE);
    case 'image/png':
      return startsWith(buffer, PNG_SIGNATURE);
    case 'image/webp':
      return isWebp(buffer);
    default: {
      const unhandled: never = mimeType;
      throw new Error(`Định dạng ảnh chưa được xử lý: ${String(unhandled)}`);
    }
  }
};

// Đuôi tệp dùng khi đặt tên trên dịch vụ lưu trữ (tên tự sinh UUID, không dùng tên gốc)
export const extensionFor = (mimeType: AllowedImageMimeType): string =>
  mimeType === 'image/jpeg' ? 'jpg' : mimeType === 'image/png' ? 'png' : 'webp';
