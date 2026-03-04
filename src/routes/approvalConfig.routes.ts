import { Router } from 'express';
import { ApprovalConfigController } from '../controllers/approvalConfig.controller';
import { authMiddleware } from '../middleware/auth';
import { requirePermission, requireRole } from '../middleware/permissions';

const router = Router();

router.use(authMiddleware);

router.get(
  '/procurement',
  requireRole('admin', 'super_admin'),
  requirePermission('users:read'),
  ApprovalConfigController.getProcurementConfigs
);

router.patch(
  '/:id',
  requireRole('admin', 'super_admin'),
  requirePermission('users:update'),
  ApprovalConfigController.updateIsActive
);

export default router;
