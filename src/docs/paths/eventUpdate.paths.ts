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
import { jsonBody, eventIdParam, eventUpdateIdParam } from '../helpers';
import {
  createEventUpdateBodySchema,
  updateEventUpdateBodySchema,
  queryEventUpdatesSchemaDocs,
  eventUpdateSchema,
} from '../schemas/eventUpdate.docs';

const TAG = 'Event Updates';

const updateNotFound = errorResponse('Không tìm thấy thông báo', [
  'EVENT_UPDATE_NOT_FOUND',
]);

// FR-31 — GET /events/:eventId/updates (Public)
registry.registerPath({
  method: 'get',
  path: '/events/{eventId}/updates',
  tags: [TAG],
  summary: 'Thông báo cập nhật của sự kiện (FR-31)',
  description:
    'PUBLIC. Sắp theo created_at giảm dần. GET /events/:eventId nhúng sẵn 5 thông báo mới nhất; ' +
    'endpoint này dùng khi cần xem đầy đủ có phân trang.',
  request: { params: eventIdParam, query: queryEventUpdatesSchemaDocs },
  responses: {
    200: listResponse('Danh sách thông báo', 'updates', eventUpdateSchema),
    404: eventNotFound,
  },
});

// FR-31 — POST /events/:eventId/updates
registry.registerPath({
  method: 'post',
  path: '/events/{eventId}/updates',
  tags: [TAG],
  security: requiresAuth,
  summary: 'Đăng thông báo cập nhật (FR-31)',
  description:
    'BR-40: chủ sự kiện HOẶC Co-host đã accepted. Không có trạng thái nháp — đăng là công khai ngay.',
  request: {
    params: eventIdParam,
    body: jsonBody(createEventUpdateBodySchema, 'Nội dung thông báo'),
  },
  responses: {
    201: wrappedResponse('Thông báo vừa đăng', 'update', eventUpdateSchema),
    400: validationError,
    ...eventScopedErrors,
  },
});

// FR-31 (BR-40b) — PATCH /events/:eventId/updates/:updateId
registry.registerPath({
  method: 'patch',
  path: '/events/{eventId}/updates/{updateId}',
  tags: [TAG],
  security: requiresAuth,
  summary: 'Sửa thông báo (FR-31, BR-40b)',
  description: 'Chủ sự kiện HOẶC Co-host đã accepted.',
  request: {
    params: eventUpdateIdParam,
    body: jsonBody(updateEventUpdateBodySchema, 'Các trường cần cập nhật'),
  },
  responses: {
    200: wrappedResponse('Thông báo sau khi sửa', 'update', eventUpdateSchema),
    400: validationError,
    ...eventScopedErrors,
    404: updateNotFound,
  },
});

// FR-31 (BR-40c) — DELETE /events/:eventId/updates/:updateId
registry.registerPath({
  method: 'delete',
  path: '/events/{eventId}/updates/{updateId}',
  tags: [TAG],
  security: requiresAuth,
  summary: 'Xoá thông báo (FR-31, BR-40c)',
  description: 'Chủ sự kiện HOẶC Co-host đã accepted. Trả 204, KHÔNG có body.',
  request: { params: eventUpdateIdParam },
  responses: {
    204: noContentResponse('Đã xoá, không có nội dung trả về'),
    ...eventScopedErrors,
    404: updateNotFound,
  },
});
