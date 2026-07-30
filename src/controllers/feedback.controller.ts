import { Request, Response, NextFunction } from 'express';
import { FeedbackService } from '../services/feedback.service';
import {
  parseCreateFeedback,
  queryEventFeedbacksSchema,
} from '../schemas/feedback.schema';
import { AppError } from '../utils/errors';

const getParam = (req: Request, name: string): string => {
  const raw = req.params[name];
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value) {
    throw new AppError(400, 'BAD_REQUEST', `Thiếu tham số ${name}`);
  }
  return value;
};

const requireUser = (req: Request): { id: string } => {
  if (!req.user) {
    throw new AppError(401, 'UNAUTHORIZED', 'Vui lòng đăng nhập');
  }
  return req.user;
};

export class FeedbackController {
  // Gửi phản hồi (POST /events/:eventId/feedbacks - FR-23, Student)
  public static async create(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const eventId = getParam(req, 'eventId');
      const user = requireUser(req);

      // RATING_REQUIRED / CONTENT_TOO_LONG là hai mã RIÊNG ở 400 (API.md mục 6), khác các
      // lỗi nghiệp vụ 422 mà service ném ra bên dưới.
      const input = parseCreateFeedback(req.body);
      const feedback = await FeedbackService.createFeedback(
        eventId,
        user.id,
        input
      );

      res.status(201).json({
        success: true,
        data: { feedback },
      });
    } catch (error) {
      next(error);
    }
  }

  // Danh sách phản hồi (GET /events/:eventId/feedbacks - FR-24, Owner)
  public static async list(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const eventId = getParam(req, 'eventId');
      const query = queryEventFeedbacksSchema.parse(req.query);

      const result = await FeedbackService.listEventFeedbacks(eventId, query);

      res.status(200).json({
        success: true,
        data: { feedbacks: result.feedbacks },
        meta: result.meta,
      });
    } catch (error) {
      next(error);
    }
  }

  // Kích hoạt phân tích cảm xúc (POST /events/:eventId/feedbacks/analyze - FR-25/26, Owner)
  public static async analyze(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const eventId = getParam(req, 'eventId');

      // Chưa cấu hình GEMINI_API_KEY -> ném 503 SENTIMENT_UNAVAILABLE ngay tại đây,
      // KHÔNG nhận job (API.md mục 6).
      await FeedbackService.requestAnalysis(eventId);

      // 202: worker gọi LLM ở tiến trình nền, API không đợi.
      // KHÔNG trả job_id: không có endpoint nào tra cứu được id đó, để lại chỉ là field
      // vô dụng trong contract. FE theo dõi tiến độ bằng cách gọi lại GET /feedbacks/summary.
      res.status(202).json({
        success: true,
        data: {},
      });
    } catch (error) {
      next(error);
    }
  }

  // Tổng hợp phản hồi (GET /events/:eventId/feedbacks/summary - FR-28, Owner)
  public static async summary(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const eventId = getParam(req, 'eventId');

      const summary = await FeedbackService.getSummary(eventId);

      res.status(200).json({
        success: true,
        data: summary,
      });
    } catch (error) {
      next(error);
    }
  }
}
