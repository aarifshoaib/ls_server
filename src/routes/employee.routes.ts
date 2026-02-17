import { Router } from 'express';
import { EmployeeController } from '../controllers/employee.controller';
import { authMiddleware } from '../middleware/auth';
import { requirePermission } from '../middleware/permissions';

const router = Router();

router.use(authMiddleware);

router.get('/', requirePermission('employees:read'), EmployeeController.getAll);

router.get('/dropdown', requirePermission('employees:read'), EmployeeController.getForDropdown);

router.get('/statistics', requirePermission('employees:read'), EmployeeController.getStatistics);

router.get('/pay-cycle/:payCycleId', requirePermission('employees:read'), EmployeeController.getByPayCycle);

router.get('/code/:code', requirePermission('employees:read'), EmployeeController.getByCode);

router.get('/user/:userId', requirePermission('employees:read'), EmployeeController.getByUserId);

router.get('/:id', requirePermission('employees:read'), EmployeeController.getById);

router.post('/', requirePermission('employees:create'), EmployeeController.create);

router.put('/:id', requirePermission('employees:update'), EmployeeController.update);

router.put('/:id/salary', requirePermission('employees:update'), EmployeeController.updateSalary);

router.put('/:id/components', requirePermission('employees:update'), EmployeeController.assignComponents);

router.put('/:id/terminate', requirePermission('employees:update'), EmployeeController.terminate);

router.put('/:id/link-user', requirePermission('employees:update'), EmployeeController.linkToUser);

router.put('/:id/unlink-user', requirePermission('employees:update'), EmployeeController.unlinkFromUser);

router.delete('/:id', requirePermission('employees:delete'), EmployeeController.delete);

export default router;
