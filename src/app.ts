import express, { Request, Response, NextFunction } from 'express';
import apiV1Router from './routes';
import { errorHandler } from './middlewares/error.middleware';
import { AppError } from './utils/errors';

const app = express();

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

// Gắn toàn bộ endpoint API v1
app.use('/api/v1', apiV1Router);

// Xử lý route không tồn tại (404 Not Found)
app.use((_req: Request, _res: Response, next: NextFunction) => {
  next(new AppError(404, 'NOT_FOUND', 'Endpoint không tồn tại'));
});

// Middleware xử lý lỗi toàn cục theo chuẩn API.md
app.use(errorHandler);

export default app;
