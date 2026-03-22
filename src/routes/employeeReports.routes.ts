import { Router } from 'express';
import { EmployeeController } from '../controllers/employee.controller';
import { authMiddleware } from '../middleware/auth';
import { requirePermission } from '../middleware/permissions';

const router = Router();

router.use(authMiddleware);

router.get(
  '/document-expiry',
  requirePermission('employees:read'),
  EmployeeController.getDocumentExpiry
);

export default router;
