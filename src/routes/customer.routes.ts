import { Router } from 'express';
import { CustomerController } from '../controllers/customer.controller';
import { authMiddleware } from '../middleware/auth';
import { requirePermission } from '../middleware/permissions';

const router = Router();

router.use(authMiddleware);

router.get('/', requirePermission('customers:read'), CustomerController.getAll);

router.get('/:id', requirePermission('customers:read'), CustomerController.getById);

router.post('/', requirePermission('customers:create'), CustomerController.create);

router.put('/:id', requirePermission('customers:update'), CustomerController.update);

export default router;
