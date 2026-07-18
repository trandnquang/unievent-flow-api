import { z } from 'zod';

// Schema thêm mốc lịch trình sự kiện (FR-32) - BR-43: start_time và title bắt buộc,
// sort_order quyết định thứ tự hiển thị (không gửi -> lấy theo DB default = 0)
export const createEventScheduleSchema = z.object({
  start_time: z.coerce.date({
    error: 'Thời gian mốc lịch trình là bắt buộc và phải đúng định dạng ngày tháng',
  }),
  title: z
    .string({ error: 'Tiêu đề mốc lịch trình là bắt buộc' })
    .min(1, 'Tiêu đề không được để trống')
    .max(255, 'Tiêu đề tối đa 255 ký tự'),
  location: z
    .string()
    .max(255, 'Địa điểm tối đa 255 ký tự')
    .optional(),
  sort_order: z.coerce.number().int('sort_order phải là số nguyên').optional(),
});

// Schema sửa mốc lịch trình sự kiện (FR-32, partial update)
export const updateEventScheduleSchema = z.object({
  start_time: z.coerce.date().optional(),
  title: z
    .string()
    .min(1, 'Tiêu đề không được để trống')
    .max(255, 'Tiêu đề tối đa 255 ký tự')
    .optional(),
  location: z
    .string()
    .max(255, 'Địa điểm tối đa 255 ký tự')
    .optional(),
  sort_order: z.coerce.number().int('sort_order phải là số nguyên').optional(),
});

export type CreateEventScheduleInput = z.infer<typeof createEventScheduleSchema>;
export type UpdateEventScheduleInput = z.infer<typeof updateEventScheduleSchema>;
