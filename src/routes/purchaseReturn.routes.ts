import { Router } from 'express';
import { PurchaseReturnController } from '../controllers/purchaseReturn.controller';
import { authMiddleware } from '../middleware/auth';
import { requirePermission, requireRole } from '../middleware/permissions';

const router = Router();

router.use(authMiddleware);

router.get('/', requirePermission('purchase_returns:read'), PurchaseReturnController.getAll);
router.get('/approvals/pending', requireRole('accountant', 'admin', 'super_admin', 'hod'), requirePermission('purchase_returns:read'), PurchaseReturnController.getPendingApprovals);
router.get('/:id', requirePermission('purchase_returns:read'), PurchaseReturnController.getById);
router.post('/', requirePermission('purchase_returns:create'), PurchaseReturnController.create);
router.put('/:id', requirePermission('purchase_returns:update'), PurchaseReturnController.update);
router.delete('/:id', requirePermission('purchase_returns:update'), PurchaseReturnController.delete);
router.post('/:id/submit', requirePermission('purchase_returns:update'), PurchaseReturnController.submit);
router.put('/:id/approve', requireRole('accountant', 'admin', 'super_admin', 'hod'), requirePermission('purchase_returns:update'), PurchaseReturnController.approve);
router.put('/:id/reject', requireRole('accountant', 'admin', 'super_admin', 'hod'), requirePermission('purchase_returns:update'), PurchaseReturnController.reject);

export default router;
