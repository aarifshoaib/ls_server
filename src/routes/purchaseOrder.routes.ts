import { Router } from 'express';
import { PurchaseOrderController } from '../controllers/purchaseOrder.controller';
import { authMiddleware } from '../middleware/auth';
import { requirePermission, requireRole } from '../middleware/permissions';

const router = Router();

router.use(authMiddleware);

router.get('/', requirePermission('purchase_orders:read'), PurchaseOrderController.getAll);
router.get('/approvals/pending', requireRole('accountant', 'admin', 'super_admin', 'hod'), requirePermission('purchase_orders:read'), PurchaseOrderController.getPendingApprovals);
router.get('/:id', requirePermission('purchase_orders:read'), PurchaseOrderController.getById);
router.post('/', requirePermission('purchase_orders:create'), PurchaseOrderController.create);
router.put('/:id', requirePermission('purchase_orders:update'), PurchaseOrderController.update);
router.post('/:id/submit', requirePermission('purchase_orders:update'), PurchaseOrderController.submit);
router.put('/:id/approve', requireRole('accountant', 'admin', 'super_admin', 'hod'), requirePermission('purchase_orders:update'), PurchaseOrderController.approve);
router.put('/:id/reject', requireRole('accountant', 'admin', 'super_admin', 'hod'), requirePermission('purchase_orders:update'), PurchaseOrderController.reject);

export default router;
