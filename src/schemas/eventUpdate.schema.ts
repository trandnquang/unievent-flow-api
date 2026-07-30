import { z } from 'zod';
import { paginationSchema } from './common.schema';

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

// Schema sửa thông báo đã đăng (FR-31, BR-40b) - partial, không đổi được event_id/organizer_id
export const updateEventUpdateSchema = z
  .object({
    title: z
      .string()
      .min(1, 'Tiêu đề không được để trống')
      .max(255, 'Tiêu đề tối đa 255 ký tự')
      .optional(),
    content: z.string().min(1, 'Nội dung không được để trống').optional(),
  })
  .refine((data) => data.title !== undefined || data.content !== undefined, {
    message: 'Cần ít nhất một trường để cập nhật (title hoặc content)',
  });

// Schema phân trang danh sách thông báo cập nhật (chuẩn chung API.md mục 1.5)
export const queryEventUpdatesSchema = paginationSchema;

export type CreateEventUpdateInput = z.infer<typeof createEventUpdateSchema>;
export type UpdateEventUpdateInput = z.infer<typeof updateEventUpdateSchema>;
export type QueryEventUpdatesInput = z.infer<typeof queryEventUpdatesSchema>;
