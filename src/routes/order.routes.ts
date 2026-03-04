import { Router } from 'express';
import { OrderController } from '../controllers/order.controller';
import { authMiddleware } from '../middleware/auth';
import { requirePermission, requireRole } from '../middleware/permissions';

const router = Router();

router.use(authMiddleware);

router.get(
	'/approvals/pending',
	requireRole('accountant', 'admin', 'super_admin', 'hod'),
	requirePermission('orders:read'),
	OrderController.getPendingApprovals
);

router.get('/', requirePermission('orders:read'), OrderController.getAll);

router.get('/:id/credit-notes', requirePermission('orders:read'), OrderController.getCreditNotes);

router.get('/:id/timeline', requirePermission('orders:read'), OrderController.getTimeline);

router.get('/:id', requirePermission('orders:read'), OrderController.getById);

router.post('/', requirePermission('orders:create'), OrderController.create);

router.put(
	'/:id/approve-create',
	requireRole('accountant', 'admin', 'super_admin', 'hod'),
	requirePermission('orders:read', 'orders:update', 'orders:change_status'),
	OrderController.approveCreate
);

router.put(
	'/:id/reject-create',
	requireRole('accountant', 'admin', 'super_admin', 'hod'),
	requirePermission('orders:read', 'orders:update', 'orders:change_status'),
	OrderController.rejectCreate
);

router.put(
	'/:id/status',
	requirePermission('orders:change_status', 'orders:update'),
	OrderController.updateStatus
);

// PDF Export endpoints
router.get('/:id/pdf', requirePermission('orders:read'), OrderController.downloadPDF);

router.get('/:id/delivery-note', requirePermission('orders:read'), OrderController.downloadDeliveryNote);

export default router;
