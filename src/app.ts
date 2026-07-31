// PHẢI là import đầu tiên: vá `.openapi()` lên prototype Zod trước khi bất kỳ module schema
// nào được nạp (xem src/docs/zod-openapi.ts).
import './docs/zod-openapi';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import apiV1Router from './routes';
import { mountApiDocs } from './docs';
import { env } from './config/env';
import { errorHandler } from './middlewares/error.middleware';
import { AppError } from './utils/errors';

const app = express();

// CORS phải đứng TRƯỚC mọi handler: request preflight OPTIONS cần được trả lời trước khi
// đi vào bất kỳ tầng xác thực hay parse body nào (API.md mục 1).
app.use(
  cors({
    origin: env.CORS_ORIGIN.split(',').map((origin) => origin.trim()),
    credentials: true,
  })
);

// Middleware parse JSON body
app.use(express.json());

// Endpoint kiểm tra sức khỏe dịch vụ (Health Check)
app.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({
    success: true,
    data: {
      status: 'UP',
      timestamp: new Date().toISOString(),
    },
  });
});

// Tài liệu OpenAPI: Swagger UI ở /api-docs, spec thô ở /api-docs.json. Đặt ở host gốc,
// NGOÀI tiền tố /api/v1 giống /health (api_spec.md mục 13).
mountApiDocs(app);

// Gắn toàn bộ endpoint API v1
app.use('/api/v1', apiV1Router);

// Xử lý route không tồn tại (404 Not Found)
app.use((_req: Request, _res: Response, next: NextFunction) => {
  next(new AppError(404, 'NOT_FOUND', 'Endpoint không tồn tại'));
});

// Middleware xử lý lỗi toàn cục theo chuẩn API.md
app.use(errorHandler);

export default app;
