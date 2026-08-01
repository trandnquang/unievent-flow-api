// Import ĐẦU TIÊN: `.openapi()` phải tồn tại trước khi chạm vào bất kỳ schema nào.
import { z } from '../zod-openapi';
import { registry } from '../registry';
import {
  createEventSchema,
  updateEventSchema,
  queryEventsSchema,
  queryMyEventsSchema,
  cancelEventSchema,
} from '../../schemas/event.schema';
import { eventSchema, eventStatusSchema, dateTime } from './common.docs';
import { scheduleItemSchema } from './eventSchedule.docs';
import { eventUpdateSchema } from './eventUpdate.docs';
import { coHostPublicSchema } from './eventCoHost.docs';

// === REQUEST =================================================================
//
// Tái dùng schema validate thật. `registry.register()` gọi `.openapi(refId)` tạo BẢN SAO,
// nên src/schemas/event.schema.ts giữ nguyên vai trò nguồn validate duy nhất.

// `z.coerce.date()` nhận đầu vào `unknown` nên zod-to-openapi suy ra `nullable: true` cho cả
// field BẮT BUỘC — sai về mặt tài liệu (Swagger hiện "string | null" cho một field bắt buộc).
// Ghi đè kiểu Ở TẦNG TÀI LIỆU; schema validate không đổi.
//
// ⚠️ PHẢI dùng `.safeExtend()` chứ KHÔNG phải `.extend()`: createEventSchema/updateEventSchema
// kết thúc bằng chuỗi `.refine()` (BR-30), và Zod 4 NÉM LỖI khi `.extend()` GHI ĐÈ một khoá đã
// có trên schema có refinement — "Cannot overwrite keys on object schemas containing
// refinements". Lỗi xảy ra lúc IMPORT nên nó làm chết cả `npm run dev`, không chỉ tài liệu.
// (Thêm khoá MỚI bằng `.extend()` thì vẫn hợp lệ — chỉ ghi đè mới hỏng.)
const dateTimeInput = (description: string) =>
  z.coerce.date().openapi({ type: 'string', format: 'date-time', description });

export const createEventBodySchema = registry.register(
  'CreateEventBody',
  createEventSchema.safeExtend({
    start_time: dateTimeInput('Thời điểm bắt đầu, ISO-8601.'),
    end_time: dateTimeInput('Thời điểm kết thúc, BẮT BUỘC sau start_time (BR-30).'),
  })
);

export const updateEventBodySchema = registry.register(
  'UpdateEventBody',
  updateEventSchema.safeExtend({
    start_time: dateTimeInput('Thời điểm bắt đầu, ISO-8601.').optional(),
    end_time: dateTimeInput('Thời điểm kết thúc.').optional(),
  })
);

export const queryEventsSchemaDocs = registry.register(
  'QueryEvents',
  queryEventsSchema.safeExtend({
    from: dateTimeInput('Lọc sự kiện bắt đầu TỪ mốc này.').optional(),
    to: dateTimeInput('Lọc sự kiện bắt đầu ĐẾN mốc này.').optional(),
  })
);

export const queryMyEventsSchemaDocs = registry.register(
  'QueryMyEvents',
  queryMyEventsSchema
);

export const cancelEventBodySchema = registry.register(
  'CancelEventBody',
  cancelEventSchema
);

// === RESPONSE (docs-only) ====================================================

// BR-33: hai chỉ số công khai, SUY RA ở tầng ứng dụng chứ không phải cột CSDL.
export const eventWithStatsSchema = registry.register(
  'EventWithStats',
  eventSchema
    .extend({
      tickets_remaining: z.number().int().openapi({
        description:
          'BR-33: đọc TRỰC TIẾP từ bộ đếm Redis tại thời điểm request, không phải từ PostgreSQL.',
        example: 42,
      }),
      registered_count: z.number().int().openapi({
        description: 'BR-33b: số đăng ký đang chiếm chỗ, để hiển thị "X người tham gia".',
        example: 158,
      }),
    })
    .openapi({
      description:
        'Sự kiện kèm 2 chỉ số hiển thị công khai. Cả hai là giá trị TÍNH, không có cột tương ứng trong CSDL.',
    })
);

export const coHostingEventSchema = registry.register(
  'CoHostingEvent',
  eventSchema.extend({
    my_role: z.literal('co-host').openapi({
      description:
        'Hằng số: Co-host chỉ có đúng MỘT gói quyền cố định khi accepted, không phải phân quyền tuỳ biến (api_spec.md mục 3.4).',
    }),
  })
);

export const pendingInvitationSchema = registry.register(
  'PendingInvitation',
  z.object({
    event: eventSchema,
    invited_at: dateTime('event_co_hosts.added_at — thời điểm được mời.'),
  })
);

// data của GET /events/:eventId — sự kiện kèm 3 nhóm dữ liệu nhúng (api_spec.md mục 3.1)
export const eventDetailResultSchema = z.object({
  event: eventSchema,
  tickets_remaining: z.number().int(),
  registered_count: z.number().int(),
  schedule: z.array(scheduleItemSchema),
  updates: z.array(eventUpdateSchema).openapi({
    description: '5 thông báo mới nhất (FR-31), không phân trang ở đây.',
  }),
  co_hosts: z.array(coHostPublicSchema).openapi({
    description:
      'CHỈ Co-host đã `accepted` — endpoint này là public, không được lộ danh sách pending/declined.',
  }),
});

// data của POST /events, PATCH /events/:id, POST /events/:id/cancel
export const eventResultSchema = z.object({ event: eventSchema });
