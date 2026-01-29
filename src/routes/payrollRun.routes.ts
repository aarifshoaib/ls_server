import { Router } from 'express';
import { PayrollRunController } from '../controllers/payrollRun.controller';
import { authMiddleware } from '../middleware/auth';
import { requirePermission } from '../middleware/permissions';

const router = Router();

router.use(authMiddleware);

router.get('/', requirePermission('payroll_runs.read'), PayrollRunController.getAll);

router.get('/statistics', requirePermission('payroll_runs.read'), PayrollRunController.getStatistics);

router.get('/:id', requirePermission('payroll_runs.read'), PayrollRunController.getById);

router.post('/', requirePermission('payroll_runs.create'), PayrollRunController.create);

router.post('/:id/calculate', requirePermission('payroll_runs.calculate'), PayrollRunController.calculate);

router.put('/:id/approve', requirePermission('payroll_runs.approve'), PayrollRunController.approve);

router.put('/:id/finalize', requirePermission('payroll_runs.finalize'), PayrollRunController.finalize);

router.put('/:id/cancel', requirePermission('payroll_runs.update'), PayrollRunController.cancel);

router.post('/:id/rerun', requirePermission('payroll_runs.calculate'), PayrollRunController.rerun);

export default router;
