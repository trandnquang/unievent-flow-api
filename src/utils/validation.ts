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
): z.infer<T> => parseOrCode(schema, data, 422, code, message);

// Bản tổng quát của parseOr422: giữ nguyên hình dạng details[] nhưng cho chọn HTTP status.
//
// Cần thiết vì không phải mã lỗi riêng nào cũng là 422. API.md mục 6 xếp RATING_REQUIRED và
// CONTENT_TOO_LONG (MSG-53) vào 400 — sai CÚ PHÁP đầu vào, không phải vi phạm business rule
// — nhưng vẫn đòi mã riêng để frontend rẽ nhánh theo `code` (mục 1.2), không gộp chung vào
// VALIDATION_ERROR.
export const parseOrCode = <T extends z.ZodType>(
  schema: T,
  data: unknown,
  statusCode: number,
  code: string,
  message: string
): z.infer<T> => {
  const result = schema.safeParse(data);

  if (!result.success) {
    throw new AppError(
      statusCode,
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
