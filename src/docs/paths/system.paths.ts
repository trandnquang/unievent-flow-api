// Import ĐẦU TIÊN (xem zod-openapi.ts).
import '../zod-openapi';
import { registry } from '../registry';
import { successResponse } from '../envelope';
import { healthResultSchema } from '../schemas/system.docs';

// GET /health — endpoint DUY NHẤT nằm NGOÀI tiền tố /api/v1 (src/app.ts, cạnh /api-docs).
//
// Document khai `servers: [{ url: '/api/v1' }]` ở cấp toàn cục, nên nếu đăng ký path này như
// mọi path khác thì Swagger UI sẽ gọi /api/v1/health — một URL KHÔNG TỒN TẠI. OpenAPI 3.0.3
// cho phép ghi đè `servers` ở cấp operation, và RouteConfig của zod-to-openapi là
// `Omit<OperationObject, 'responses'>` nên trường này hợp lệ cả về kiểu lẫn về đặc tả.
//
// scripts/check-openapi.ts có một phép kiểm riêng cho đúng dòng `servers` dưới đây — bỏ nó đi
// thì tài liệu vẫn sinh ra được nhưng nút "Try it out" của /health sẽ trả 404.
registry.registerPath({
  method: 'get',
  path: '/health',
  servers: [{ url: '/', description: 'Host gốc — /health không nằm dưới /api/v1' }],
  tags: ['System'],
  summary: 'Kiểm tra sức khoẻ dịch vụ',
  description:
    'PUBLIC, không cần token. Chỉ xác nhận tiến trình API còn sống — KHÔNG kiểm PostgreSQL/Redis/BullMQ.',
  responses: {
    200: successResponse('Dịch vụ đang hoạt động', healthResultSchema),
  },
});
