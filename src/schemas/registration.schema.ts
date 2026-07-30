import { z } from 'zod';
import { paginationSchema } from './common.schema';

// Query danh sách người đăng ký của một sự kiện (FR-41, BR-114).
// `status` khớp đúng enum registration_status; `search` khớp một phần trên tên.
export const queryEventRegistrationsSchema = paginationSchema.extend({
  status: z
    .enum(['pending', 'confirmed', 'failed', 'cancelled'], {
      error: 'Trạng thái đăng ký không hợp lệ',
    })
    .optional(),
  search: z.string().trim().min(1).optional(),
});

export type QueryEventRegistrationsInput = z.infer<
  typeof queryEventRegistrationsSchema
>;
