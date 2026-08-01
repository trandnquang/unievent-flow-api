// Import ĐẦU TIÊN: `.openapi()` phải tồn tại trước khi chạm vào bất kỳ schema nào.
import { z } from '../zod-openapi';
import { registry } from '../registry';
import { queryOrganizersSchema } from '../../schemas/organizer.schema';
import { socialLinksSchema } from './auth.docs';
import { eventSchema, uuid } from './common.docs';

export const queryOrganizersSchemaDocs = registry.register(
  'QueryOrganizers',
  queryOrganizersSchema
);

// Một dòng của GET /organizers (FR-33/37, ⭐ mới v1.1.0).
//
// ⚠️ SCHEMA NÀY CỐ TÌNH KHÔNG CÓ FIELD `email`. Endpoint dùng để một Ban tổ chức bất kỳ tra
// cứu Ban tổ chức khác nhằm mời làm Co-host (màn M4-S07), khác hẳn GET /admin/users vốn chỉ
// dành cho Quản trị viên. Contract OpenAPI ở đây là lớp phòng thủ thứ ba, sau (1) select
// tường minh 4 cột ở tầng CSDL và (2) predicate role='organizer' AND is_active=true ghim
// cứng trong service — thêm `email` vào đây là phá cả ba lớp cùng lúc.
export const organizerListItemSchema = registry.register(
  'OrganizerListItem',
  z
    .object({
      id: uuid(),
      name: z.string().openapi({ example: 'Trần Thị Bình' }),
      club_name: z.string().nullable().openapi({ example: 'CLB Tin học' }),
      avatar_url: z.string().nullable(),
    })
    .openapi({
      description:
        'KHÔNG chứa email hay bất kỳ PII nào khác. Chỉ liệt kê tài khoản role=organizer VÀ is_active=true — mời một tài khoản đã bị vô hiệu hoá (FR-29) là mời một chỗ trống.',
    })
);

// `organizer` của GET /organizers/:userId — hồ sơ CÔNG KHAI (FR-33, BR-26/27)
export const organizerProfileSchema = registry.register(
  'OrganizerProfile',
  z
    .object({
      name: z.string(),
      club_name: z.string().nullable(),
      avatar_url: z.string().nullable(),
      bio: z.string().nullable(),
      social_links: socialLinksSchema.nullable(),
    })
    .openapi({
      description:
        'BR-26: tập trường được giới hạn ngay ở tầng CSDL (select tường minh) — KHÔNG BAO GIỜ trả email/password_hash.',
    })
);

// data của GET /organizers/:userId
export const organizerProfileResultSchema = z.object({
  organizer: organizerProfileSchema,
  events: z.array(eventSchema).openapi({
    description:
      'BR-27: CHỈ sự kiện đang active của Ban tổ chức này, sắp theo start_time tăng dần. Không phân trang.',
  }),
});
