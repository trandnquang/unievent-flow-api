import { $Enums, events } from '../../generated/prisma/client';

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        role: $Enums.user_role;
      };
      event?: events;
    }
  }
}
