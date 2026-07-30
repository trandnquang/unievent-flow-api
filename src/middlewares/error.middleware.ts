import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { MulterError } from 'multer';
import { AppError } from '../utils/errors';

// Middleware xử lý lỗi toàn cục theo định dạng chuẩn API.md mục 1.2
export const errorHandler = (
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void => {
  // Lỗi do Zod validate request
  if (err instanceof ZodError) {
    res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Dữ liệu đầu vào không hợp lệ',
        details: err.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      },
    });
    return;
  }

  // Lỗi nghiệp vụ AppError đã định nghĩa mã lỗi rõ ràng
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      success: false,
      error: {
        code: err.code,
        message: err.message,
        ...(err.details ? { details: err.details } : {}),
      },
    });
    return;
  }

  // Lỗi do multer khi nhận tệp tải lên (FR-40). Không có nhánh này thì file vượt dung
  // lượng rơi vào fallback 500 thay vì 413 như BR-104 yêu cầu.
  if (err instanceof MulterError) {
    const isTooLarge = err.code === 'LIMIT_FILE_SIZE';
    res.status(isTooLarge ? 413 : 422).json({
      success: false,
      error: {
        code: isTooLarge ? 'FILE_TOO_LARGE' : 'INVALID_FILE_TYPE',
        message: isTooLarge
          ? 'Tệp ảnh vượt quá dung lượng cho phép.'
          : 'Tệp tải lên không hợp lệ.',
      },
    });
    return;
  }

  // Lỗi cú pháp JSON trong request body
  if (err instanceof SyntaxError && 'body' in err) {
    res.status(400).json({
      success: false,
      error: {
        code: 'BAD_REQUEST',
        message: 'Cú pháp JSON không hợp lệ',
      },
    });
    return;
  }

  // Log lỗi hệ thống chưa bắt được (500)
  console.error('[INTERNAL_SERVER_ERROR]:', err);

  res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Lỗi hệ thống máy chủ',
    },
  });
};
