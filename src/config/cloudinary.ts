import { v2 as cloudinary } from 'cloudinary';
import { env } from './env';

// Cấu hình SDK Cloudinary một lần lúc nạp module (FR-40, BR-111).
// Đây là dịch vụ lưu trữ ảnh bên thứ ba đã chốt ở SRS Assumption #13.
// Chỉ truyền khoá đã có giá trị: kiểu ConfigOptions của SDK không nhận `undefined`
// dưới exactOptionalPropertyTypes.
cloudinary.config({
  ...(env.CLOUDINARY_CLOUD_NAME
    ? { cloud_name: env.CLOUDINARY_CLOUD_NAME }
    : {}),
  ...(env.CLOUDINARY_API_KEY ? { api_key: env.CLOUDINARY_API_KEY } : {}),
  ...(env.CLOUDINARY_API_SECRET
    ? { api_secret: env.CLOUDINARY_API_SECRET }
    : {}),
  secure: true,
});

// Thiếu bất kỳ khoá nào thì upload chắc chắn hỏng — kiểm trước để trả lỗi cấu hình rõ ràng
// thay vì để SDK ném lỗi xác thực khó hiểu.
export const isCloudinaryConfigured = (): boolean =>
  Boolean(
    env.CLOUDINARY_CLOUD_NAME &&
      env.CLOUDINARY_API_KEY &&
      env.CLOUDINARY_API_SECRET
  );

export { cloudinary };
