import { z } from 'zod';
import { paginationSchema } from './common.schema';

// FR-29: bật/tắt tài khoản người dùng
export const updateUserStatusSchema = z.object({
  is_active: z.boolean({ error: 'is_active là bắt buộc (true hoặc false)' }),
});

// FR-38 (BR-82→86): cấp phát tài khoản Ban tổ chức.
// KHÔNG nhận password — mật khẩu do hệ thống sinh ngẫu nhiên và chỉ gửi qua email (CBR 2).
export const createOrganizerSchema = z.object({
  name: z
    .string({ error: 'Họ tên là bắt buộc' })
    .trim()
    .min(1, 'Họ tên không được để trống')
    .max(150, 'Họ tên tối đa 150 ký tự'),
  email: z
    .string({ error: 'Email là bắt buộc' })
    .trim()
    .toLowerCase()
    .email('Email không hợp lệ')
    .max(255, 'Email tối đa 255 ký tự'),
  club_name: z
    .string()
    .trim()
    .max(150, 'Tên CLB tối đa 150 ký tự')
    .optional(),
});

// FR-39 (BR-101): tra cứu người dùng toàn hệ thống
export const queryAdminUsersSchema = paginationSchema.extend({
  search: z.string().trim().min(1).optional(),
  role: z.enum(['student', 'organizer', 'admin']).optional(),
  // Query string luôn là chuỗi -> nhận đúng 'true'/'false' rồi đổi sang boolean
  is_active: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional(),
});

// FR-39 (BR-110): tra cứu sự kiện toàn hệ thống, gồm cả sự kiện đã huỷ
export const queryAdminEventsSchema = paginationSchema.extend({
  search: z.string().trim().min(1).optional(),
  status: z.enum(['active', 'cancelled']).optional(),
  organizer_id: z.string().uuid('organizer_id không hợp lệ').optional(),
});

export type UpdateUserStatusInput = z.infer<typeof updateUserStatusSchema>;
export type CreateOrganizerInput = z.infer<typeof createOrganizerSchema>;
export type QueryAdminUsersInput = z.infer<typeof queryAdminUsersSchema>;
export type QueryAdminEventsInput = z.infer<typeof queryAdminEventsSchema>;
