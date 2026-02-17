import { Router } from 'express';
import { EarningDeductionController } from '../controllers/earningDeduction.controller';
import { authMiddleware } from '../middleware/auth';
import { requirePermission } from '../middleware/permissions';

const router = Router();

router.use(authMiddleware);

router.get('/', requirePermission('earning_deductions:read'), EarningDeductionController.getAll);

router.get('/active', requirePermission('earning_deductions:read'), EarningDeductionController.getActiveComponents);

router.get('/code/:code', requirePermission('earning_deductions:read'), EarningDeductionController.getByCode);

router.get('/:id', requirePermission('earning_deductions:read'), EarningDeductionController.getById);

router.post('/', requirePermission('earning_deductions:create'), EarningDeductionController.create);

router.put('/:id', requirePermission('earning_deductions:update'), EarningDeductionController.update);

router.delete('/:id', requirePermission('earning_deductions:delete'), EarningDeductionController.delete);

export default router;
