import { Request, Response, NextFunction } from 'express';
import { TicketService } from '../services/ticket.service';
import { paginationSchema } from '../schemas/common.schema';
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

export class TicketController {
  // Vé của chính mình (GET /users/me/tickets - FR-17, Student)
  public static async listMine(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const user = requireUser(req);
      const query = paginationSchema.parse(req.query);

      const result = await TicketService.listMyTickets(user.id, query);

      res.status(200).json({
        success: true,
        data: { tickets: result.tickets },
        meta: result.meta,
      });
    } catch (error) {
      next(error);
    }
  }

  // Chi tiết vé kèm QR (GET /tickets/:ticketId - FR-18, Owner)
  public static async getDetail(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const ticketId = getParam(req, 'ticketId');
      const user = requireUser(req);

      const result = await TicketService.getTicketForUser(ticketId, user.id);

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
}
