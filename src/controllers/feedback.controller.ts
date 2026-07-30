import { Request, Response, NextFunction } from 'express';
import { FeedbackService } from '../services/feedback.service';
import {
  createFeedbackSchema,
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

      // rating/content sai định dạng -> ZodError -> 400 VALIDATION_ERROR (RATING_REQUIRED
      // và CONTENT_TOO_LONG theo API.md đều là 400, khác các lỗi nghiệp vụ 422 bên dưới)
      const input = createFeedbackSchema.parse(req.body);
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

      const jobId = await FeedbackService.requestAnalysis(eventId);

      // 202: worker gọi LLM ở tiến trình nền, API không đợi.
      // FE theo dõi tiến độ bằng cách gọi lại GET /feedbacks/summary.
      res.status(202).json({
        success: true,
        data: { job_id: jobId },
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
