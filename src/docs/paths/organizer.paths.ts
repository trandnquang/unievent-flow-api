// Import ĐẦU TIÊN (xem zod-openapi.ts).
import '../zod-openapi';
import { registry, requiresAuth } from '../registry';
import { successResponse, errorResponse, listResponse } from '../envelope';
import { unauthorized, forbidden } from '../errors';
import { userIdParam } from '../helpers';
import {
  queryOrganizersSchemaDocs,
  organizerListItemSchema,
  organizerProfileResultSchema,
} from '../schemas/organizer.docs';

const TAG = 'Organizers';

// FR-33/37 — GET /organizers ⭐ mới v1.1.0
registry.registerPath({
  method: 'get',
  path: '/organizers',
  tags: [TAG],
  security: requiresAuth,
  summary: 'Tra cứu Ban tổ chức để mời làm Co-host (FR-33/37)',
  description:
    'Chỉ role=organizer. `search` khớp một phần trên `name` HOẶC `club_name`, không phân biệt hoa thường. ' +
    'Chỉ liệt kê tài khoản có role=organizer VÀ is_active=true — hai điều kiện này ghim cứng ở tầng service, ' +
    'client KHÔNG lọc được. ⚠️ Response CỐ TÌNH không chứa `email` hay bất kỳ PII nào: đây là danh bạ nội bộ ' +
    'cho màn M4-S07, khác hẳn GET /admin/users (FR-39) vốn chỉ dành cho Quản trị viên.',
  request: { query: queryOrganizersSchemaDocs },
  responses: {
    200: listResponse('Danh sách Ban tổ chức', 'items', organizerListItemSchema),
    401: unauthorized,
    403: forbidden,
  },
});

// FR-33 — GET /organizers/:userId (Public, BR-27)
registry.registerPath({
  method: 'get',
  path: '/organizers/{userId}',
  tags: [TAG],
  summary: 'Hồ sơ công khai Ban tổ chức (FR-33)',
  description:
    'PUBLIC — không cần đăng nhập (BR-27). BR-26: tập trường trả về giới hạn ở tầng CSDL, ' +
    'KHÔNG BAO GIỜ có email/password_hash. Kèm danh sách sự kiện đang `active` của Ban tổ chức này. ' +
    'userId trỏ tới tài khoản không phải organizer → 404 (không phải 403), để không lộ role của người khác.',
  request: { params: userIdParam },
  responses: {
    200: successResponse('Hồ sơ công khai', organizerProfileResultSchema),
    404: errorResponse('Không tìm thấy Ban tổ chức', ['USER_NOT_FOUND']),
  },
});
