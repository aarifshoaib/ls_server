import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { requirePermission } from '../middleware/permissions';
import AdhocEarningDeductionController from '../controllers/adhocEarningDeduction.controller';

const router = Router();

// All routes require authentication
router.use(authMiddleware);

// Get all adhoc items (with filters)
router.get('/', requirePermission('adhoc_items:read'), AdhocEarningDeductionController.getAll);

// Get adhoc item by ID
router.get('/:id', requirePermission('adhoc_items:read'), AdhocEarningDeductionController.getById);

// Get by employee
router.get('/employee/:employeeId', requirePermission('adhoc_items:read'), AdhocEarningDeductionController.getByEmployee);

// Get by payroll period
router.get('/period/:year/:month', requirePermission('adhoc_items:read'), AdhocEarningDeductionController.getByPeriod);

// Get summary by period
router.get('/summary/:year/:month', requirePermission('adhoc_items:read'), AdhocEarningDeductionController.getSummaryByPeriod);

// Create adhoc item
router.post('/', requirePermission('adhoc_items:create'), AdhocEarningDeductionController.create);

// Update adhoc item
router.put('/:id', requirePermission('adhoc_items:update'), AdhocEarningDeductionController.update);

// Approve adhoc item
router.post('/:id/approve', requirePermission('adhoc_items:approve'), AdhocEarningDeductionController.approve);

// Reject adhoc item
router.post('/:id/reject', requirePermission('adhoc_items:approve'), AdhocEarningDeductionController.reject);

// Cancel adhoc item
router.post('/:id/cancel', requirePermission('adhoc_items:update'), AdhocEarningDeductionController.cancel);

// Delete adhoc item
router.delete('/:id', requirePermission('adhoc_items:delete'), AdhocEarningDeductionController.remove);

export default router;
