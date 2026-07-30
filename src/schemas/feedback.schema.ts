import { z } from 'zod';
import { paginationSchema } from './common.schema';

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
