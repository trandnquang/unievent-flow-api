import { z } from 'zod';
import { AppError } from './errors';

// Parse body nhưng trả HTTP 422 kèm mã lỗi nghiệp vụ riêng, thay vì 400 VALIDATION_ERROR
// mặc định của Zod.
//
// Dùng cho các trường mà đặc tả xếp việc thiếu/sai vào nhóm "vi phạm business rule" chứ
// không phải "sai cú pháp": lý do huỷ sự kiện của FR-11 và FR-30 (BR-106, CBR 1) trả
// CANCEL_REASON_REQUIRED. Cả hai luồng huỷ dùng chung hàm này để mã lỗi và hình dạng
// details[] không lệch nhau (API.md mục 1.3).
export const parseOr422 = <T extends z.ZodType>(
  schema: T,
  data: unknown,
  code: string,
  message: string
): z.infer<T> => {
  const result = schema.safeParse(data);

  if (!result.success) {
    throw new AppError(
      422,
      code,
      message,
      result.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      }))
    );
  }

  return result.data;
};
