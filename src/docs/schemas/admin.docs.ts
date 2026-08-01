// Import ĐẦU TIÊN: `.openapi()` phải tồn tại trước khi chạm vào bất kỳ schema nào.
import { z } from '../zod-openapi';
import { registry } from '../registry';
import {
  updateUserStatusSchema,
  createOrganizerSchema,
  queryAdminUsersSchema,
  queryAdminEventsSchema,
} from '../../schemas/admin.schema';
import { userSchema } from './auth.docs';
import { eventSchema, uuid, dateTime, userRoleSchema } from './common.docs';

export const updateUserStatusBodySchema = registry.register(
  'UpdateUserStatusBody',
  updateUserStatusSchema
);

export const createOrganizerBodySchema = registry.register(
  'CreateOrganizerBody',
  createOrganizerSchema
);

export const queryAdminUsersSchemaDocs = registry.register(
  'QueryAdminUsers',
  queryAdminUsersSchema
);

export const queryAdminEventsSchemaDocs = registry.register(
  'QueryAdminEvents',
  queryAdminEventsSchema
);

// Một dòng của GET /admin/users (FR-39, BR-100/101/102).
// ⚠️ Cùng với GET /events/:id/registrations, đây là MỘT TRONG HAI nơi duy nhất API trả
// email của người khác. select ở tầng CSDL là tường minh để password_hash/reset_token
// không thể lọt ra (BR-100).
export const adminUserItemSchema = registry.register(
  'AdminUserItem',
  z.object({
    id: uuid(),
    name: z.string(),
    email: z.email(),
    role: userRoleSchema,
    club_name: z.string().nullable(),
    avatar_url: z.string().nullable(),
    is_active: z.boolean(),
    created_at: dateTime(),
    is_self: z.boolean().openapi({
      description:
        'BR-102: true khi đây chính là admin đang đăng nhập — giao diện khoá nút thao tác để admin không tự vô hiệu hoá mình.',
    }),
  })
);

// Một dòng của GET /admin/events (FR-39, BR-103/110).
// BR-103: KHÔNG lọc mặc định theo status — trả sự kiện ở MỌI trạng thái, gồm cả cancelled.
// Đây là khác biệt then chốt so với GET /events công khai (chỉ trả active).
export const adminEventItemSchema = registry.register(
  'AdminEventItem',
  eventSchema.extend({
    organizer: z
      .object({
        id: uuid(),
        name: z.string(),
        email: z.email(),
      })
      .openapi({
        description:
          'BR-110: kèm tên/email BTC để admin đánh giá ảnh hưởng trước khi buộc huỷ.',
      }),
    issued_tickets: z.number().int().openapi({
      description: 'Số bản ghi registrations của sự kiện.',
    }),
  })
);

// data của PATCH /admin/users/:userId/status (FR-29)
export const adminUserResultSchema = z.object({ user: userSchema });

// data của POST /admin/events/:eventId/force-cancel (FR-30)
export const adminEventResultSchema = z.object({ event: eventSchema });

// data của POST /admin/organizers (FR-38) — con đường DUY NHẤT tạo được role=organizer.
// Mật khẩu tạm KHÔNG nằm trong response: nó được gửi thẳng qua email cho tài khoản mới.
export const createOrganizerResultSchema = z.object({ organizer: userSchema });
