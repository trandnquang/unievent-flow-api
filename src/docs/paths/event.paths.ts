// Import ĐẦU TIÊN (xem zod-openapi.ts).
import '../zod-openapi';
import { registry, requiresAuth } from '../registry';
import { successResponse, errorResponse, listResponse } from '../envelope';
import {
  unauthorized,
  forbidden,
  validationError,
  eventNotFound,
  eventScopedErrors,
} from '../errors';
import { jsonBody, eventIdParam } from '../helpers';
import {
  createEventBodySchema,
  updateEventBodySchema,
  cancelEventBodySchema,
  queryEventsSchemaDocs,
  queryMyEventsSchemaDocs,
  eventWithStatsSchema,
  coHostingEventSchema,
  pendingInvitationSchema,
  eventDetailResultSchema,
  eventResultSchema,
} from '../schemas/event.docs';
import { eventSchema } from '../schemas/common.docs';
import { z } from '../zod-openapi';

const TAG = 'Events';

// FR-08 — GET /events (Public)
registry.registerPath({
  method: 'get',
  path: '/events',
  tags: [TAG],
  summary: 'Danh sách sự kiện công khai (FR-08)',
  description:
    'PUBLIC. Chỉ trả sự kiện `status=active` — đây là khác biệt then chốt so với GET /admin/events (BR-103). ' +
    '`sort` nhận created_at | start_time | title, tiền tố `-` là giảm dần (mặc định `-created_at`). ' +
    'Mỗi item kèm tickets_remaining (đọc từ bộ đếm Redis, BR-33) và registered_count (BR-33b).',
  request: { query: queryEventsSchemaDocs },
  responses: {
    200: listResponse('Danh sách sự kiện', 'events', eventWithStatsSchema),
    400: validationError,
  },
});

// FR-11 — POST /events
registry.registerPath({
  method: 'post',
  path: '/events',
  tags: [TAG],
  security: requiresAuth,
  summary: 'Tạo sự kiện (FR-11)',
  description:
    'Chỉ role=organizer. BR-30: end_time phải sau start_time. Ràng buộc SQL chk_event_location_fields ' +
    'yêu cầu in_person ⇒ có `location`, online ⇒ có `join_url` — tầng Zod chặn trước để lỗi ra dạng ' +
    'nghiệp vụ thay vì HTTP 500. Bộ đếm vé trên Redis được khởi tạo ngay sau khi tạo (BR-47).',
  request: { body: jsonBody(createEventBodySchema, 'Thông tin sự kiện') },
  responses: {
    201: successResponse('Sự kiện vừa tạo', eventResultSchema),
    400: validationError,
    401: unauthorized,
    403: forbidden,
  },
});

// FR-12 — GET /events/mine
registry.registerPath({
  method: 'get',
  path: '/events/mine',
  tags: [TAG],
  security: requiresAuth,
  summary: 'Sự kiện của tôi (FR-12)',
  description:
    'Chỉ role=organizer. BR-38: trả 3 nhánh TÁCH BIỆT. ⚠️ `meta.pagination` CHỈ áp cho `owned`; ' +
    '`co_hosting` và `pending_invitations` luôn trả ĐỦ, không phân trang — frontend dùng chúng để dựng ' +
    'banner lời mời đang chờ ở đầu trang (SRS §4.3.3).',
  request: { query: queryMyEventsSchemaDocs },
  responses: {
    200: successResponse(
      'Ba nhánh sự kiện liên quan tới tôi',
      z.object({
        owned: z.array(eventSchema),
        co_hosting: z.array(coHostingEventSchema),
        pending_invitations: z.array(pendingInvitationSchema),
      }),
      { withPagination: true }
    ),
    401: unauthorized,
    403: forbidden,
  },
});

// FR-09 — GET /events/:eventId (Public)
registry.registerPath({
  method: 'get',
  path: '/events/{eventId}',
  tags: [TAG],
  summary: 'Chi tiết sự kiện (FR-09)',
  description:
    'PUBLIC. Nhúng kèm lịch trình (FR-32), 5 thông báo mới nhất (FR-31) và Co-host (FR-37) — ' +
    'tái dùng service của từng nhóm, không viết lại truy vấn. `co_hosts` CHỈ gồm Co-host đã `accepted`: ' +
    'endpoint này là public nên không được lộ danh sách pending/declined.',
  request: { params: eventIdParam },
  responses: {
    200: successResponse('Chi tiết sự kiện', eventDetailResultSchema),
    404: eventNotFound,
  },
});

// FR-10 — PATCH /events/:eventId
registry.registerPath({
  method: 'patch',
  path: '/events/{eventId}',
  tags: [TAG],
  security: requiresAuth,
  summary: 'Cập nhật sự kiện (FR-10)',
  description:
    'Chỉ CHỦ sự kiện (requireOwnerOnly) — Co-host KHÔNG sửa được thông tin sự kiện. ' +
    'Giảm max_tickets xuống dưới số vé đã phát → 422 (bộ đếm Redis được điều chỉnh đồng bộ).',
  request: {
    params: eventIdParam,
    body: jsonBody(updateEventBodySchema, 'Các trường cần cập nhật'),
  },
  responses: {
    200: successResponse('Sự kiện sau khi cập nhật', eventResultSchema),
    400: validationError,
    422: errorResponse('Vi phạm ràng buộc nghiệp vụ khi cập nhật', [
      'INVALID_MAX_TICKETS',
      'EVENT_NOT_EDITABLE',
    ]),
    ...eventScopedErrors,
  },
});

// FR-13 — POST /events/:eventId/cancel
registry.registerPath({
  method: 'post',
  path: '/events/{eventId}/cancel',
  tags: [TAG],
  security: requiresAuth,
  summary: 'Huỷ sự kiện (FR-13)',
  description:
    'Chỉ CHỦ sự kiện. BR-37b chặn huỷ sự kiện đã bắt đầu/kết thúc — Quản trị viên vượt được ' +
    'ràng buộc này qua POST /admin/events/:eventId/force-cancel (BR-96a). ' +
    'Cascade: mọi vé chuyển `cancelled`, email thông báo đẩy vào hàng đợi.',
  request: {
    params: eventIdParam,
    body: jsonBody(cancelEventBodySchema, 'Lý do huỷ (hiển thị cho người đã đăng ký)'),
  },
  responses: {
    200: successResponse('Sự kiện sau khi huỷ', eventResultSchema),
    400: validationError,
    422: errorResponse('Sự kiện không ở trạng thái huỷ được (BR-37b)', [
      'EVENT_NOT_CANCELLABLE',
    ]),
    ...eventScopedErrors,
  },
});
