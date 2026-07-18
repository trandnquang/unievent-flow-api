import { Router } from 'express';
import { UserController } from '../controllers/user.controller';

const router = Router();

// GET /organizers/:userId - Public (BR-27), không áp requireAuth/requireActive
router.get('/:userId', UserController.getOrganizerProfile);

export default router;
