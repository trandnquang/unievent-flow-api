import { z } from 'zod';
import { paginationSchema } from './common.schema';

// FR-33/37 (api_spec.md mục 2, ⭐ v1.1.0): tra cứu Ban tổ chức để mời làm Co-host (màn M4-S07).
//
// Cùng khuôn với queryAdminUsersSchema (admin.schema.ts) nhưng CỐ TÌNH KHÔNG có `role` và
// `is_active`: hai điều kiện đó bị ghim cứng ở tầng service (role='organizer' AND
// is_active=true), client không được phép nới. Cho lọc `role` ở đây tức là biến endpoint này
// thành bản GET /admin/users không cần quyền admin.
export const queryOrganizersSchema = paginationSchema.extend({
  // Khớp một phần trên name HOẶC club_name, không phân biệt hoa thường
  search: z.string().trim().min(1).optional(),
});

export type QueryOrganizersInput = z.infer<typeof queryOrganizersSchema>;
