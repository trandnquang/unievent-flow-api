import { Router } from 'express';
import authRoutes from './auth.routes';
import userRoutes from './user.routes';
import eventRoutes from './event.routes';
import organizerRoutes from './organizer.routes';

const router = Router();

// Mount các router con theo đúng prefix trong API.md
router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/events', eventRoutes);
router.use('/organizers', organizerRoutes);

export default router;
