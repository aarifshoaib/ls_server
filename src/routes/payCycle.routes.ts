import { Router } from 'express';
import { PayCycleController } from '../controllers/payCycle.controller';
import { authMiddleware } from '../middleware/auth';
import { requirePermission } from '../middleware/permissions';

const router = Router();

router.use(authMiddleware);

router.get('/', requirePermission('pay_cycles:read'), PayCycleController.getAll);

router.get('/active', requirePermission('pay_cycles:read'), PayCycleController.getActive);

router.get('/default', requirePermission('pay_cycles:read'), PayCycleController.getDefault);

router.get('/code/:code', requirePermission('pay_cycles:read'), PayCycleController.getByCode);

// Period management routes (must come before /:id)
router.get('/:id/period-info', requirePermission('pay_cycles:read'), PayCycleController.getPeriodInfo);
router.get('/:id/employees', requirePermission('pay_cycles:read'), PayCycleController.getEmployees);
router.post('/:id/initialize-period', requirePermission('pay_cycles:update'), PayCycleController.initializePeriod);
router.put('/:id/period-status', requirePermission('pay_cycles:update'), PayCycleController.setPeriodStatus);

router.get('/:id', requirePermission('pay_cycles:read'), PayCycleController.getById);

router.post('/', requirePermission('pay_cycles:create'), PayCycleController.create);

router.post('/calculate-period', requirePermission('pay_cycles:read'), PayCycleController.calculatePeriodDates);

router.put('/:id', requirePermission('pay_cycles:update'), PayCycleController.update);

router.put('/:id/set-default', requirePermission('pay_cycles:update'), PayCycleController.setDefault);

router.delete('/:id', requirePermission('pay_cycles:delete'), PayCycleController.delete);

export default router;
