import { z } from 'zod';

// Schema phân trang danh sách phản hồi đã gửi của chính người dùng (FR-42, BR-122).
// Giữ đúng chuẩn phân trang của queryEventsSchema (API.md mục 1.5).
export const queryMyFeedbacksSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export type QueryMyFeedbacksInput = z.infer<typeof queryMyFeedbacksSchema>;
