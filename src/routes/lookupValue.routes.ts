import { Router } from 'express';
import { LookupValueController } from '../controllers/lookupValue.controller';
import { authMiddleware } from '../middleware/auth';
import { requirePermission } from '../middleware/permissions';

const router = Router();

router.use(authMiddleware);

router.get('/', LookupValueController.getAll);

router.get('/categories', LookupValueController.getCategories);

router.get('/category/:category', LookupValueController.getByCategory);

router.get('/code/:category/:code', LookupValueController.getByCode);

router.get('/:id', LookupValueController.getById);

router.post('/', requirePermission('lookup_values:create'), LookupValueController.create);

router.post('/bulk', requirePermission('lookup_values:create'), LookupValueController.bulkCreate);

router.put('/:id', requirePermission('lookup_values:update'), LookupValueController.update);

router.delete('/:id', requirePermission('lookup_values:delete'), LookupValueController.delete);

export default router;
