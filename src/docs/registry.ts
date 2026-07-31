// Import ĐẦU TIÊN: vá `.openapi()` lên prototype Zod trước mọi thứ khác trong cây docs.
import './zod-openapi';
import { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';

// Registry dùng chung cho TOÀN BỘ tài liệu OpenAPI. Mỗi nhóm endpoint đăng ký path của mình
// vào đây (lượt này mới có Auth & Account — api_spec.md mục 2); các nhóm sau chỉ cần thêm
// một file src/docs/paths/*.paths.ts rồi import trong src/docs/index.ts, không phải đụng file này.
export const registry = new OpenAPIRegistry();

// Xác thực Bearer JWT (api_spec.md mục 1.4). Áp cho từng route qua `security` trong registerPath,
// KHÔNG đặt security toàn cục — phần lớn endpoint của nhóm auth là public.
export const bearerAuth = registry.registerComponent(
  'securitySchemes',
  'bearerAuth',
  {
    type: 'http',
    scheme: 'bearer',
    bearerFormat: 'JWT',
    description:
      'Access token lấy từ POST /auth/login. Hết hạn sau JWT_EXPIRES_IN giây (mặc định 7200 = 2 giờ).',
  }
);

// Khối `security` gắn vào các route yêu cầu đăng nhập.
export const requiresAuth = [{ [bearerAuth.name]: [] }];
