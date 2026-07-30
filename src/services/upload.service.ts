import { randomUUID } from 'crypto';
import type { UploadApiResponse } from 'cloudinary';
import { cloudinary, isCloudinaryConfigured } from '../config/cloudinary';
import { env } from '../config/env';
import { AppError } from '../utils/errors';
import {
  extensionFor,
  isAllowedImageMimeType,
  matchesDeclaredImageType,
} from '../utils/imageType';

export class UploadService {
  // Tải ảnh lên dịch vụ lưu trữ bên thứ ba (FR-40, BR-104/111).
  // Trả về URL công khai; hệ thống KHÔNG lưu tệp nhị phân trên máy chủ ứng dụng hay PostgreSQL.
  public static async uploadImage(
    buffer: Buffer,
    declaredMimeType: string
  ): Promise<{ url: string }> {
    // BR-104 lớp (a): MIME type do client khai báo phải nằm trong danh sách cho phép
    if (!isAllowedImageMimeType(declaredMimeType)) {
      throw new AppError(
        422,
        'INVALID_FILE_TYPE',
        'Định dạng tệp không được hỗ trợ. Chỉ chấp nhận JPG, PNG hoặc WEBP.'
      );
    }

    // BR-104 lớp (b): magic bytes đầu tệp phải KHỚP với định dạng vừa khai báo.
    // Lớp (a) một mình không đủ: đổi đuôi tệp rồi khai image/png là qua được.
    if (!matchesDeclaredImageType(buffer, declaredMimeType)) {
      throw new AppError(
        422,
        'INVALID_FILE_TYPE',
        'Nội dung tệp không khớp với định dạng ảnh đã khai báo.'
      );
    }

    if (!isCloudinaryConfigured()) {
      throw new AppError(
        502,
        'UPLOAD_FAILED',
        'Dịch vụ lưu trữ ảnh chưa được cấu hình.'
      );
    }

    // Tên tệp TỰ SINH bằng UUID, không bao giờ dùng tên gốc do client gửi lên
    // (chống path traversal và chống ghi đè tệp của người khác).
    const publicId = `${randomUUID()}.${extensionFor(declaredMimeType)}`;

    try {
      const result = await this.uploadBuffer(buffer, publicId);
      // BR-111: CHỈ giữ lại URL. Việc gán URL vào sự kiện/hồ sơ là một request riêng.
      return { url: result.secure_url };
    } catch (error) {
      // BR-111: dịch vụ lưu trữ lỗi -> 502, KHÔNG tạo bản ghi nào trong CSDL
      console.error(
        '❌ [ERROR] Tải ảnh lên Cloudinary thất bại:',
        error instanceof Error ? error.message : error
      );
      throw new AppError(
        502,
        'UPLOAD_FAILED',
        'Tải ảnh lên thất bại. Vui lòng thử lại sau ít phút.'
      );
    }
  }

  // upload_stream của SDK dùng callback nên phải bọc lại thành Promise
  private static uploadBuffer(
    buffer: Buffer,
    publicId: string
  ): Promise<UploadApiResponse> {
    return new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder: env.CLOUDINARY_FOLDER,
          public_id: publicId,
          resource_type: 'image',
        },
        (error, result) => {
          if (error || !result) {
            reject(error ?? new Error('Cloudinary không trả về kết quả'));
            return;
          }
          resolve(result);
        }
      );

      stream.end(buffer);
    });
  }
}
