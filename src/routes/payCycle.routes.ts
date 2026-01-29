import { Router } from 'express';
import { PayCycleController } from '../controllers/payCycle.controller';
import { authMiddleware } from '../middleware/auth';
import { requirePermission } from '../middleware/permissions';

const router = Router();

router.use(authMiddleware);

router.get('/', requirePermission('paycycles.read'), PayCycleController.getAll);

router.get('/active', requirePermission('paycycles.read'), PayCycleController.getActive);

router.get('/default', requirePermission('paycycles.read'), PayCycleController.getDefault);

router.get('/code/:code', requirePermission('paycycles.read'), PayCycleController.getByCode);

// Period management routes (must come before /:id)
router.get('/:id/period-info', requirePermission('paycycles.read'), PayCycleController.getPeriodInfo);
router.get('/:id/employees', requirePermission('paycycles.read'), PayCycleController.getEmployees);
router.post('/:id/initialize-period', requirePermission('paycycles.update'), PayCycleController.initializePeriod);
router.put('/:id/period-status', requirePermission('paycycles.update'), PayCycleController.setPeriodStatus);

router.get('/:id', requirePermission('paycycles.read'), PayCycleController.getById);

router.post('/', requirePermission('paycycles.create'), PayCycleController.create);

router.post('/calculate-period', requirePermission('paycycles.read'), PayCycleController.calculatePeriodDates);

router.put('/:id', requirePermission('paycycles.update'), PayCycleController.update);

router.put('/:id/set-default', requirePermission('paycycles.update'), PayCycleController.setDefault);

router.delete('/:id', requirePermission('paycycles.delete'), PayCycleController.delete);

export default router;
