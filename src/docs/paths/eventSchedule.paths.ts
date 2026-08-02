// Import ĐẦU TIÊN (xem zod-openapi.ts).
import '../zod-openapi';
import { registry, requiresAuth } from '../registry';
import {
  errorResponse,
  noContentResponse,
  listResponse,
  wrappedResponse,
} from '../envelope';
import { validationError, eventNotFound, eventScopedErrors } from '../errors';
import { jsonBody, eventIdParam, eventScheduleIdParam } from '../helpers';
import {
  createScheduleItemBodySchema,
  updateScheduleItemBodySchema,
  scheduleItemSchema,
} from '../schemas/eventSchedule.docs';

const TAG = 'Event Schedule';

const scheduleNotFound = errorResponse('Không tìm thấy mốc lịch trình', [
  'SCHEDULE_ITEM_NOT_FOUND',
]);

// BR-43b — chặn ở EventScheduleService (Zod không truy vấn được sự kiện để so khung giờ)
const scheduleTimeOutOfRange = errorResponse(
  'Mốc lịch trình nằm ngoài khung giờ sự kiện (BR-43b)',
  ['SCHEDULE_TIME_OUT_OF_RANGE']
);

// FR-32 — GET /events/:eventId/schedule (Public)
registry.registerPath({
  method: 'get',
  path: '/events/{eventId}/schedule',
  tags: [TAG],
  summary: 'Lịch trình sự kiện (FR-32)',
  description:
    'PUBLIC. BR-43: luôn sắp theo `sort_order` tăng dần. KHÔNG phân trang — lịch trình một sự kiện ' +
    'luôn đủ ngắn để trả hết, nên response KHÔNG có khối `meta`.',
  request: { params: eventIdParam },
  responses: {
    200: listResponse('Danh sách mốc lịch trình', 'schedule', scheduleItemSchema, {
      withPagination: false,
    }),
    404: eventNotFound,
  },
});

// FR-32 — POST /events/:eventId/schedule
registry.registerPath({
  method: 'post',
  path: '/events/{eventId}/schedule',
  tags: [TAG],
  security: requiresAuth,
  summary: 'Thêm mốc lịch trình (FR-32)',
  description:
    'Chủ sự kiện HOẶC Co-host đã accepted (requireOwnerOrCoHost). ' +
    'BR-43b: `start_time` phải nằm trong `[event.start_time, event.end_time]` (BIÊN ĐÓNG — ' +
    'bằng đúng hai mốc là hợp lệ); ngoài khoảng trả 422 `SCHEDULE_TIME_OUT_OF_RANGE`.',
  request: {
    params: eventIdParam,
    body: jsonBody(createScheduleItemBodySchema, 'Mốc lịch trình mới'),
  },
  responses: {
    201: wrappedResponse(
      'Mốc lịch trình vừa tạo',
      'schedule_item',
      scheduleItemSchema
    ),
    400: validationError,
    422: scheduleTimeOutOfRange,
    ...eventScopedErrors,
  },
});

// FR-32 — PATCH /events/:eventId/schedule/:scheduleId
registry.registerPath({
  method: 'patch',
  path: '/events/{eventId}/schedule/{scheduleId}',
  tags: [TAG],
  security: requiresAuth,
  summary: 'Sửa mốc lịch trình (FR-32)',
  description:
    'Chủ sự kiện HOẶC Co-host đã accepted. BR-43b được kiểm CHỈ KHI body có gửi `start_time`; ' +
    'ngoài `[event.start_time, event.end_time]` trả 422 `SCHEDULE_TIME_OUT_OF_RANGE`.',
  request: {
    params: eventScheduleIdParam,
    body: jsonBody(updateScheduleItemBodySchema, 'Các trường cần cập nhật'),
  },
  responses: {
    200: wrappedResponse(
      'Mốc lịch trình sau khi sửa',
      'schedule_item',
      scheduleItemSchema
    ),
    400: validationError,
    422: scheduleTimeOutOfRange,
    ...eventScopedErrors,
    404: scheduleNotFound,
  },
});

// FR-32 — DELETE /events/:eventId/schedule/:scheduleId
registry.registerPath({
  method: 'delete',
  path: '/events/{eventId}/schedule/{scheduleId}',
  tags: [TAG],
  security: requiresAuth,
  summary: 'Xoá mốc lịch trình (FR-32)',
  description: 'Chủ sự kiện HOẶC Co-host đã accepted. Trả 204, KHÔNG có body.',
  request: { params: eventScheduleIdParam },
  responses: {
    204: noContentResponse('Đã xoá, không có nội dung trả về'),
    ...eventScopedErrors,
    404: scheduleNotFound,
  },
});
