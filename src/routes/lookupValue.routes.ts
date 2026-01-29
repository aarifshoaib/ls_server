import { Router } from 'express';
import { LookupValueController } from '../controllers/lookupValue.controller';
import { authMiddleware } from '../middleware/auth';
import { requirePermission } from '../middleware/permissions';

const router = Router();

router.use(authMiddleware);

router.get('/', requirePermission('lookup_values.read'), LookupValueController.getAll);

router.get('/categories', requirePermission('lookup_values.read'), LookupValueController.getCategories);

router.get('/category/:category', requirePermission('lookup_values.read'), LookupValueController.getByCategory);

router.get('/code/:category/:code', requirePermission('lookup_values.read'), LookupValueController.getByCode);

router.get('/:id', requirePermission('lookup_values.read'), LookupValueController.getById);

router.post('/', requirePermission('lookup_values.create'), LookupValueController.create);

router.post('/bulk', requirePermission('lookup_values.create'), LookupValueController.bulkCreate);

router.put('/:id', requirePermission('lookup_values.update'), LookupValueController.update);

router.delete('/:id', requirePermission('lookup_values.delete'), LookupValueController.delete);

export default router;
