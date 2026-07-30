import { z } from 'zod';
import { paginationSchema } from './common.schema';
import { AppError } from '../utils/errors';

// Schema phân trang danh sách phản hồi đã gửi của chính người dùng (FR-42, BR-122)
export const queryMyFeedbacksSchema = paginationSchema;

// BR-68 (Rating Required Rule): rating BẮT BUỘC, số nguyên 1-5 (khớp CHECK constraint
// `rating BETWEEN 1 AND 5` chỉ tồn tại ở SQL — Prisma không biểu diễn nên phải chặn ở đây,
// nếu không CSDL ném lỗi thô thành 500).
// BR-69: content TUỲ CHỌN — sinh viên được phép chỉ chấm sao mà không viết nhận xét.
// BR-68 (v0.6.8): content tối đa 500 ký tự để kiểm soát chi phí token khi phân tích LLM.
export const createFeedbackSchema = z.object({
  rating: z.coerce
    .number({ error: 'Vui lòng chọn số sao đánh giá (1–5)' })
    .int('Số sao phải là số nguyên')
    .min(1, 'Số sao phải từ 1 đến 5')
    .max(5, 'Số sao phải từ 1 đến 5'),
  content: z.string().trim().max(500, 'Nhận xét tối đa 500 ký tự').optional(),
});

// API.md mục 6 đòi hai mã lỗi RIÊNG ở HTTP 400 cho luồng gửi phản hồi, thay vì gộp chung vào
// VALIDATION_ERROR — frontend rẽ nhánh theo `code` (mục 1.2) nên cần phân biệt được "chưa
// chấm sao" với "nhận xét quá dài" để hiện đúng thông báo dưới đúng ô nhập.
//   - rating thiếu/sai  -> RATING_REQUIRED   (BR-68)
//   - content quá 500   -> CONTENT_TOO_LONG  (MSG-53)
// Các lỗi còn lại giữ nguyên VALIDATION_ERROR mặc định.
export const parseCreateFeedback = (data: unknown): CreateFeedbackInput => {
  const result = createFeedbackSchema.safeParse(data);
  if (result.success) return result.data;

  const details = result.error.issues.map((issue) => ({
    path: issue.path.join('.'),
    message: issue.message,
  }));

  const issues = result.error.issues;
  const hasRatingIssue = issues.some((issue) => issue.path[0] === 'rating');
  // Chỉ nhận đúng ca "vượt độ dài"; content sai KIỂU là lỗi cú pháp thường, không phải MSG-53
  const hasContentTooLong = issues.some(
    (issue) => issue.path[0] === 'content' && issue.code === 'too_big'
  );

  if (hasRatingIssue) {
    throw new AppError(
      400,
      'RATING_REQUIRED',
      'Vui lòng chọn số sao đánh giá (1–5).',
      details
    );
  }

  if (hasContentTooLong) {
    throw new AppError(
      400,
      'CONTENT_TOO_LONG',
      'Nhận xét tối đa 500 ký tự.',
      details
    );
  }

  throw new AppError(
    400,
    'VALIDATION_ERROR',
    'Dữ liệu đầu vào không hợp lệ',
    details
  );
};

// BR-71: danh sách phản hồi của sự kiện, lọc theo nhãn cảm xúc + phân trang
export const queryEventFeedbacksSchema = paginationSchema.extend({
  sentiment: z
    .enum(['positive', 'negative', 'neutral'], {
      error: 'Nhãn cảm xúc không hợp lệ',
    })
    .optional(),
});

export type QueryMyFeedbacksInput = z.infer<typeof queryMyFeedbacksSchema>;
export type CreateFeedbackInput = z.infer<typeof createFeedbackSchema>;
export type QueryEventFeedbacksInput = z.infer<
  typeof queryEventFeedbacksSchema
>;
