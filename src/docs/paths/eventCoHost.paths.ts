// Import ĐẦU TIÊN (xem zod-openapi.ts).
import '../zod-openapi';
import { registry, requiresAuth } from '../registry';
import {
  successResponse,
  errorResponse,
  noContentResponse,
  listResponse,
} from '../envelope';
import {
  validationError,
  rateLimited,
  eventScopedErrors,
} from '../errors';
import { jsonBody, eventIdParam, eventCoHostIdParam } from '../helpers';
import {
  createCoHostBodySchema,
  coHostViewSchema,
  createCoHostResultSchema,
  coHostResultSchema,
} from '../schemas/eventCoHost.docs';

const TAG = 'Co-hosts';

const coHostNotFound = errorResponse(
  'Không tìm thấy CLB/Ban tổ chức đồng hành này trong sự kiện',
  ['CO_HOST_NOT_FOUND']
);

// FR-37 — GET /events/:eventId/co-hosts ⭐ v0.4.7
registry.registerPath({
  method: 'get',
  path: '/events/{eventId}/co-hosts',
  tags: [TAG],
  security: requiresAuth,
  summary: 'Danh sách Co-host kèm trạng thái (FR-37)',
  description:
    'CHỈ chủ sự kiện (requireOwnerOnly) — đây là dữ liệu QUẢN TRỊ: ai đang chờ, ai đã từ chối. ' +
    'Khác với `co_hosts` nhúng trong GET /events/:eventId (public, chỉ gồm accepted và KHÔNG có `status`). ' +
    'KHÔNG phân trang — response không có khối `meta`. Phục vụ SRS §4.3.6b.',
  request: { params: eventIdParam },
  responses: {
    200: listResponse('Danh sách Co-host', 'co_hosts', coHostViewSchema, {
      withPagination: false,
    }),
    ...eventScopedErrors,
  },
});

// FR-37 — POST /events/:eventId/co-hosts
registry.registerPath({
  method: 'post',
  path: '/events/{eventId}/co-hosts',
  tags: [TAG],
  security: requiresAuth,
  summary: 'Mời Co-host (FR-37)',
  description:
    'CHỈ chủ sự kiện. BR-46 có ba nhánh: (a) quan hệ mới → **201** · (b) quan hệ đã `declined` được ' +
    'mời lại → **200** · (c) đang `pending`, bấm lại → **200**, không tạo bản ghi trùng. ' +
    'Cả ba nhánh đều gửi email mời (BR-46b). Đọc `created` trong body để biết nhánh nào. ' +
    'BR-46e: KHÔNG gửi thông báo ngược cho chủ sự kiện khi người kia phản hồi. Rate limit áp riêng.',
  request: {
    params: eventIdParam,
    body: jsonBody(createCoHostBodySchema, 'Ban tổ chức được mời'),
  },
  responses: {
    201: successResponse('Đã tạo lời mời MỚI', createCoHostResultSchema),
    200: successResponse(
      'Quan hệ đã tồn tại — chỉ gửi lại email mời (created = false)',
      createCoHostResultSchema
    ),
    400: validationError,
    422: errorResponse('Không thể mời tài khoản này', [
      'INVALID_CO_HOST',
      'CANNOT_INVITE_SELF',
    ]),
    ...eventScopedErrors,
    429: rateLimited,
  },
});

// FR-37 — PATCH /events/:eventId/co-hosts/me/accept
registry.registerPath({
  method: 'patch',
  path: '/events/{eventId}/co-hosts/me/accept',
  tags: [TAG],
  security: requiresAuth,
  summary: 'Chấp nhận lời mời đồng tổ chức (FR-37)',
  description:
    'Do CHÍNH người được mời gọi — cố ý KHÔNG áp requireOwnerOnly, vì người gọi chưa phải chủ sự kiện. ' +
    'Sau khi accepted, tài khoản có đúng MỘT gói quyền cố định của Co-host (BR-113).',
  request: { params: eventIdParam },
  responses: {
    200: successResponse('Quan hệ sau khi chấp nhận', coHostResultSchema),
    ...eventScopedErrors,
    404: errorResponse('Không có lời mời nào đang chờ bạn xác nhận', [
      'CO_HOST_INVITATION_NOT_FOUND',
    ]),
  },
});

// FR-37 — PATCH /events/:eventId/co-hosts/me/decline
registry.registerPath({
  method: 'patch',
  path: '/events/{eventId}/co-hosts/me/decline',
  tags: [TAG],
  security: requiresAuth,
  summary: 'Từ chối lời mời đồng tổ chức (FR-37)',
  description:
    'Do CHÍNH người được mời gọi. Quan hệ chuyển `declined` nhưng KHÔNG bị xoá — chủ sự kiện mời lại được (BR-46 nhánh b).',
  request: { params: eventIdParam },
  responses: {
    200: successResponse('Quan hệ sau khi từ chối', coHostResultSchema),
    ...eventScopedErrors,
    404: errorResponse('Không có lời mời nào đang chờ bạn xác nhận', [
      'CO_HOST_INVITATION_NOT_FOUND',
    ]),
  },
});

// FR-37 (BR-44) — DELETE /events/:eventId/co-hosts/:userId
registry.registerPath({
  method: 'delete',
  path: '/events/{eventId}/co-hosts/{userId}',
  tags: [TAG],
  security: requiresAuth,
  summary: 'Gỡ Co-host (FR-37, BR-44)',
  description:
    'CHỈ chủ sự kiện. BR-44: gỡ được bất kể trạng thái hiện tại (pending / accepted / declined). ' +
    'Trả 204, KHÔNG có body.',
  request: { params: eventCoHostIdParam },
  responses: {
    204: noContentResponse('Đã gỡ, không có nội dung trả về'),
    ...eventScopedErrors,
    404: coHostNotFound,
  },
});
