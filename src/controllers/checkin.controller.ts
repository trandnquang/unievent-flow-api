import { Request, Response, NextFunction } from 'express';
import { CheckinService } from '../services/checkin.service';
import {
  scanCheckinSchema,
  queryCheckinsSchema,
} from '../schemas/checkin.schema';
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

export class CheckinController {
  // Quét vé tại cổng (POST /events/:eventId/checkin/scan - FR-19/20)
  public static async scan(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const eventId = getParam(req, 'eventId');
      const user = requireUser(req);

      const input = scanCheckinSchema.parse(req.body);
      const outcome = await CheckinService.scan(
        eventId,
        user.id,
        input.qr_token
      );

      // HTTP luôn 200 cho mọi giá trị `result` (API.md mục 5): request kỹ thuật là hợp lệ,
      // chỉ nội dung vé mới sai. Giao diện cổng rẽ nhánh màn hình theo `result`.
      res.status(200).json({
        success: true,
        data: outcome,
      });
    } catch (error) {
      next(error);
    }
  }

  // Lịch sử check-in (GET /events/:eventId/checkins - FR-21)
  public static async list(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const eventId = getParam(req, 'eventId');
      const query = queryCheckinsSchema.parse(req.query);

      const result = await CheckinService.listCheckins(eventId, query);

      res.status(200).json({
        success: true,
        // ⭐ v1.1.0 (api_spec.md §5): khoá `items` (trước là `checkins`) + khối `summary`
        data: { items: result.items, summary: result.summary },
        meta: result.meta,
      });
    } catch (error) {
      next(error);
    }
  }

  // Xuất CSV (GET /events/:eventId/checkins/export - FR-22, BR-64)
  public static async exportCsv(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const eventId = getParam(req, 'eventId');

      const csv = await CheckinService.exportCheckinsCsv(eventId);

      // Trả thẳng nội dung, KHÔNG ghi file trung gian trên server (BR-64).
      // Đây là endpoint duy nhất không dùng envelope JSON của API.md mục 1.2.
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="checkins-${eventId}.csv"`
      );
      res.status(200).send(csv);
    } catch (error) {
      next(error);
    }
  }

  // Sinh viên bấm "Vào phòng họp" (POST /tickets/:ticketId/self-checkin - FR-36).
  // BR-107: mở join_url ĐỒNG THỜI ghi nhận tham dự — một hành động duy nhất ở client.
  // Body RỖNG có chủ đích: không nhận mốc thời gian/bằng chứng từ client nên không cần
  // Zod schema; mọi dữ kiện lấy từ params + req.user, checkin_time do server ghi.
  public static async selfCheckin(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const ticketId = getParam(req, 'ticketId');
      const user = requireUser(req);

      const result = await CheckinService.selfCheckin(ticketId, user.id);

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
}
