// Import ĐẦU TIÊN: `.openapi()` phải tồn tại trước khi chạm vào bất kỳ schema nào.
import { z } from '../zod-openapi';
import { registry } from '../registry';
import { createEventCoHostSchema } from '../../schemas/eventCoHost.schema';
import { uuid, dateTime, nullableDateTime, coHostStatusSchema } from './common.docs';

export const createCoHostBodySchema = registry.register(
  'CreateCoHostBody',
  createEventCoHostSchema
);

// ⚠️ HAI SHAPE CO-HOST, TUYỆT ĐỐI KHÔNG GỘP.
//
// Gộp lại tức là tài liệu hoá `status` / `responded_at` thành dữ liệu CÔNG KHAI, trong khi
// eventCoHost.service.ts cố tình giấu chúng khỏi endpoint public.

// (1) Bản CÔNG KHAI — nhúng trong GET /events/:eventId. Chỉ Co-host đã `accepted`.
export const coHostPublicSchema = registry.register(
  'CoHostPublic',
  z
    .object({
      id: uuid(),
      name: z.string(),
      avatar_url: z.string().nullable(),
    })
    .openapi({
      description:
        'Bản công khai: KHÔNG có `status`. GET /events/:eventId chỉ trả Co-host đã accepted nên trạng thái là thừa, và lộ pending/declined ra public là rò rỉ thông tin quản trị.',
    })
);

// (2) Bản QUẢN TRỊ — GET/POST /events/:eventId/co-hosts và accept/decline (owner-only,
// hoặc chính người được mời). SRS §4.3.6b.
export const coHostViewSchema = registry.register(
  'CoHostView',
  z
    .object({
      id: uuid(),
      name: z.string(),
      avatar_url: z.string().nullable(),
      status: coHostStatusSchema,
      added_at: dateTime('Thời điểm được mời.'),
      responded_at: nullableDateTime(
        'Thời điểm chấp nhận/từ chối; null khi còn đang pending.'
      ),
    })
    .openapi({
      description:
        'Bản đầy đủ kèm trạng thái lời mời — dành cho chủ sự kiện (requireOwnerOnly) và cho chính người được mời.',
    })
);

// data của POST /events/:eventId/co-hosts. `created` phân biệt hai nhánh BR-46:
// lời mời MỚI (201) và lời mời gửi lại cho quan hệ đã tồn tại (200).
export const createCoHostResultSchema = z.object({
  co_host: coHostViewSchema,
  created: z.boolean().openapi({
    description:
      'true = vừa tạo quan hệ mới (HTTP 201) · false = quan hệ đã tồn tại, chỉ gửi lại email mời (HTTP 200). BR-46.',
  }),
});

// data của PATCH /events/:eventId/co-hosts/me/accept | /decline
export const coHostResultSchema = z.object({ co_host: coHostViewSchema });
