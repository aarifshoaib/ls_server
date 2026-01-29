import { Router } from 'express';
import { OrderController } from '../controllers/order.controller';
import { authMiddleware } from '../middleware/auth';
import { requirePermission } from '../middleware/permissions';

const router = Router();

router.use(authMiddleware);

router.get('/', requirePermission('orders.read'), OrderController.getAll);

router.get('/:id', requirePermission('orders.read'), OrderController.getById);

router.post('/', requirePermission('orders.create'), OrderController.create);

router.put('/:id/status', requirePermission('orders.change_status'), OrderController.updateStatus);

// PDF Export endpoints
router.get('/:id/pdf', requirePermission('orders.read'), OrderController.downloadPDF);

router.get('/:id/delivery-note', requirePermission('orders.read'), OrderController.downloadDeliveryNote);

export default router;
