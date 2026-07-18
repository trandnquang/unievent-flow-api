import { z } from 'zod';

// Schema gắn CLB/Ban tổ chức đồng hành (FR-37) - BR-45: user_id bắt buộc,
// điều kiện role=organizer đã tồn tại được kiểm tra ở tầng service
export const createEventCoHostSchema = z.object({
  user_id: z
    .string({ error: 'user_id là bắt buộc' })
    .min(1, 'user_id không được để trống'),
});

export type CreateEventCoHostInput = z.infer<typeof createEventCoHostSchema>;
