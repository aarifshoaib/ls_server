import { Router } from 'express';
import { PayrollArchiveController } from '../controllers/payrollArchive.controller';
import { authMiddleware } from '../middleware/auth';
import { requirePermission } from '../middleware/permissions';

const router = Router();

router.use(authMiddleware);

router.get('/', requirePermission('payroll_archives:read'), PayrollArchiveController.getAll);

router.get('/statistics', requirePermission('payroll_archives:read'), PayrollArchiveController.getStatistics);

router.get('/payroll-run/:payrollRunId', requirePermission('payroll_archives:read'), PayrollArchiveController.getByPayrollRunId);

router.get('/employee/:employeeId/history', requirePermission('payroll_archives:read'), PayrollArchiveController.getEmployeePayslipHistory);

router.get('/:id', requirePermission('payroll_archives:read'), PayrollArchiveController.getById);

router.get('/:id/payslip/:employeeId', requirePermission('payroll_archives:read'), PayrollArchiveController.getEmployeePayslip);

router.get('/:id/export', requirePermission('payroll_archives:export'), PayrollArchiveController.exportArchive);

router.post('/from-payroll-run/:payrollRunId', requirePermission('payroll_archives:create'), PayrollArchiveController.createFromPayrollRun);

router.put('/:id/lock', requirePermission('payroll_archives:update'), PayrollArchiveController.lock);

router.put('/:id/files', requirePermission('payroll_archives:update'), PayrollArchiveController.updateFiles);

export default router;
