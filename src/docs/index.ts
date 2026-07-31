// Import ĐẦU TIÊN (xem zod-openapi.ts).
import './zod-openapi';
import type { Express, Request, Response } from 'express';
import swaggerUi from 'swagger-ui-express';
import { OpenApiGeneratorV3 } from '@asteasolutions/zod-to-openapi';
import { registry } from './registry';

// Nạp các file path để chúng chạy registerPath vào registry dùng chung. Mỗi nhóm endpoint
// thêm đúng một dòng import ở đây.
import './paths/auth.paths';

// Sinh document một lần lúc khởi động — spec là hằng số sau khi mã nguồn đã nạp xong,
// không cần dựng lại mỗi request.
export const openApiDocument = new OpenApiGeneratorV3(
  registry.definitions
).generateDocument({
  openapi: '3.0.3',
  info: {
    title: 'UniEvent Flow API',
    version: '1.0.0',
    description: [
      'Tài liệu sinh trực tiếp từ chính Zod schema dùng để validate request (api_spec.md mục 13),',
      'nên không thể lệch với hành vi thật của server.',
      '',
      '**Wire format: snake_case** cho toàn bộ field và wrapper key.',
      '',
      '**Envelope (mục 1.2)** — thành công: `{ success: true, data, meta? }`;',
      'lỗi: `{ success: false, error: { code, message, details? } }`.',
      'Frontend rẽ nhánh theo `error.code`, không parse `message`.',
      '',
      'Phạm vi hiện tại: nhóm **Auth & Account** (mục 2). Các nhóm còn lại sẽ được đăng ký dần.',
    ].join('\n'),
  },
  // Path đăng ký trong document KHÔNG kèm tiền tố — tiền tố nằm ở đây, đúng một chỗ.
  servers: [{ url: '/api/v1', description: 'Base URL (api_spec.md mục 1.1)' }],
  tags: [
    { name: 'Auth', description: 'Đăng ký, đăng nhập, mật khẩu — FR-01 → FR-04, FR-07' },
    { name: 'Account', description: 'Hồ sơ cá nhân — FR-05, FR-06' },
  ],
});

// Mount tài liệu ở HOST GỐC, ngoài tiền tố /api/v1 (giống GET /health):
//   GET /api-docs      -> Swagger UI
//   GET /api-docs.json -> spec thô cho `openapi-typescript` phía frontend
//
// Chỉ THÊM route mới, không đụng chuỗi middleware sẵn có.
export const mountApiDocs = (app: Express): void => {
  app.get('/api-docs.json', (_req: Request, res: Response) => {
    res.status(200).json(openApiDocument);
  });

  app.use(
    '/api-docs',
    swaggerUi.serve,
    swaggerUi.setup(openApiDocument, {
      customSiteTitle: 'UniEvent Flow API — OpenAPI',
      swaggerOptions: { persistAuthorization: true },
    })
  );
};
