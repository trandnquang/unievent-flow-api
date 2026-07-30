import { Request, Response, NextFunction } from 'express';
import { UploadService } from '../services/upload.service';
import { AppError } from '../utils/errors';

export class UploadController {
  // Tải ảnh lên (POST /uploads/image - FR-40, mọi role đã đăng nhập)
  public static async uploadImage(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      // multer.memoryStorage() gán tệp vào req.file. Không có tệp nghĩa là client gửi sai
      // định dạng multipart hoặc sai tên field.
      const file = req.file;

      if (!file) {
        throw new AppError(
          400,
          'BAD_REQUEST',
          'Thiếu tệp tải lên (field `file` trong multipart/form-data).'
        );
      }

      const result = await UploadService.uploadImage(
        file.buffer,
        file.mimetype
      );

      res.status(201).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
}
