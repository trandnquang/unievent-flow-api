import { z } from 'zod';

// Schema đăng thông báo cập nhật sự kiện (FR-31) - BR-41: title và content bắt buộc, không để trống
export const createEventUpdateSchema = z.object({
  title: z
    .string({ error: 'Tiêu đề thông báo là bắt buộc' })
    .min(1, 'Tiêu đề không được để trống')
    .max(255, 'Tiêu đề tối đa 255 ký tự'),
  content: z
    .string({ error: 'Nội dung thông báo là bắt buộc' })
    .min(1, 'Nội dung không được để trống'),
});

// Schema phân trang danh sách thông báo cập nhật (giống queryEventsSchema)
export const queryEventUpdatesSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export type CreateEventUpdateInput = z.infer<typeof createEventUpdateSchema>;
export type QueryEventUpdatesInput = z.infer<typeof queryEventUpdatesSchema>;
