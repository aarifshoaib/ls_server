import { Router } from 'express';
import { PaymentController } from '../controllers/payment.controller';
import { authMiddleware } from '../middleware/auth';
import { requirePermission, requireRole } from '../middleware/permissions';

const router = Router();

router.use(authMiddleware);

// Allow payments:update (sales/delivery) to submit for approval, or payments:process_payment (approvers) to record directly
router.post('/', requirePermission('payments:process_payment', 'payments:update'), PaymentController.create);

// Approval routes - only accountant, admin, super_admin
router.get('/approvals/pending', requireRole('accountant', 'admin', 'super_admin'), requirePermission('payments:read'), PaymentController.getPendingApprovals);
router.put('/:id/approve', requireRole('accountant', 'admin', 'super_admin'), requirePermission('payments:update', 'payments:process_payment'), PaymentController.approve);
router.put('/:id/reject', requireRole('accountant', 'admin', 'super_admin'), requirePermission('payments:update', 'payments:process_payment'), PaymentController.reject);

export default router;
