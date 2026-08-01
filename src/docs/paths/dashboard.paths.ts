// Import ĐẦU TIÊN (xem zod-openapi.ts).
import '../zod-openapi';
import { registry, requiresAuth } from '../registry';
import { successResponse } from '../envelope';
import { eventScopedErrors } from '../errors';
import { eventIdParam } from '../helpers';
import { dashboardResultSchema } from '../schemas/dashboard.docs';

// FR-27/28 — GET /events/:eventId/dashboard
registry.registerPath({
  method: 'get',
  path: '/events/{eventId}/dashboard',
  tags: ['Dashboard'],
  security: requiresAuth,
  summary: 'Dashboard sự kiện (FR-27/28)',
  description:
    'CHỈ chủ sự kiện (requireOwnerOnly). BR-77: gộp 2 nhóm số liệu trong MỘT lần gọi để giao diện không ' +
    'phải ghép từ nhiều endpoint; khối `sentiment` tái dùng nguyên vẹn service của ' +
    'GET /events/:eventId/feedbacks/summary.\n\n' +
    '⚠️ Endpoint này là owner-only, trong khi GET /events/:eventId/checkins là owner-or-cohost — đó chính ' +
    'là lý do `summary { confirmed, checked_in }` được thêm vào endpoint kia ở v1.1.0, để Co-host cũng ' +
    'hiển thị được bộ đếm tại cổng.\n\n' +
    '`registrations.remaining` đọc từ bộ đếm Redis (nguồn thật của luồng trừ/hoàn vé, BR-33/BR-47); ' +
    'cột tickets_remaining_db của view v_event_registration_stats chỉ dùng để đối soát và làm giá trị lùi.',
  request: { params: eventIdParam },
  responses: {
    200: successResponse('Số liệu tổng hợp của sự kiện', dashboardResultSchema),
    ...eventScopedErrors,
  },
});
