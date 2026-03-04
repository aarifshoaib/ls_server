import { Router } from 'express';
import { RequisitionController } from '../controllers/requisition.controller';
import { authMiddleware } from '../middleware/auth';
import { requirePermission, requireRole } from '../middleware/permissions';

const router = Router();

router.use(authMiddleware);

router.get('/', requirePermission('requisitions:read'), RequisitionController.getAll);
router.get('/approvals/pending', requireRole('accountant', 'admin', 'super_admin', 'hod'), requirePermission('requisitions:read'), RequisitionController.getPendingApprovals);
router.get('/:id', requirePermission('requisitions:read'), RequisitionController.getById);
router.post('/', requirePermission('requisitions:create'), RequisitionController.create);
router.put('/:id', requirePermission('requisitions:update'), RequisitionController.update);
router.delete('/:id', requirePermission('requisitions:update'), RequisitionController.delete);
router.post('/:id/submit', requirePermission('requisitions:update'), RequisitionController.submit);
router.put('/:id/approve', requireRole('accountant', 'admin', 'super_admin', 'hod'), requirePermission('requisitions:update'), RequisitionController.approve);
router.put('/:id/reject', requireRole('accountant', 'admin', 'super_admin', 'hod'), requirePermission('requisitions:update'), RequisitionController.reject);

export default router;
