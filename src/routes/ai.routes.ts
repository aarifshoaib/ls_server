import { Router } from 'express';
import { body } from 'express-validator';
import { AIController } from '../controllers/ai.controller';
import { authMiddleware } from '../middleware/auth';
import { requireRole } from '../middleware/permissions';
import { validate } from '../middleware/validate';

const router = Router();

// All AI routes require auth and admin/super_admin role
router.use(authMiddleware);
router.use(requireRole('admin', 'super_admin'));

router.post(
  '/chat',
  validate([body('message').trim().notEmpty().withMessage('Message is required'), body('threadId').optional().isMongoId()]),
  AIController.chat
);

router.get('/threads', AIController.listThreads);

router.post(
  '/threads',
  validate([body('title').optional().isString().trim()]),
  AIController.createThread
);

router.get('/threads/:id', AIController.getThread);

export default router;
