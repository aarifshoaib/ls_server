import { Router } from 'express';
import { AdvanceController } from '../controllers/advance.controller';
import { authMiddleware } from '../middleware/auth';
import { requirePermission } from '../middleware/permissions';

const router = Router();

router.use(authMiddleware);

router.get('/', requirePermission('advances.read'), AdvanceController.getAll);

router.get('/statistics', requirePermission('advances.read'), AdvanceController.getStatistics);

router.get('/employee/:employeeId', requirePermission('advances.read'), AdvanceController.getByEmployee);

router.get('/employee/:employeeId/pending', requirePermission('advances.read'), AdvanceController.getPendingRepayments);

router.get('/:id', requirePermission('advances.read'), AdvanceController.getById);

router.post('/', requirePermission('advances.create'), AdvanceController.create);

router.put('/:id', requirePermission('advances.update'), AdvanceController.update);

router.put('/:id/approve', requirePermission('advances.approve'), AdvanceController.approve);

router.put('/:id/reject', requirePermission('advances.approve'), AdvanceController.reject);

router.put('/:id/disburse', requirePermission('advances.disburse'), AdvanceController.disburse);

router.put('/:id/record-repayment', requirePermission('advances.update'), AdvanceController.recordRepayment);

router.put('/:id/cancel', requirePermission('advances.update'), AdvanceController.cancel);

export default router;
