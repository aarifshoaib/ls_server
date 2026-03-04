import { Router } from 'express';
import { VendorController } from '../controllers/vendor.controller';
import { authMiddleware } from '../middleware/auth';
import { requirePermission } from '../middleware/permissions';

const router = Router();

router.use(authMiddleware);

router.get('/', requirePermission('vendors:read'), VendorController.getAll);
router.get('/:id', requirePermission('vendors:read'), VendorController.getById);
router.post('/', requirePermission('vendors:create'), VendorController.create);
router.put('/:id', requirePermission('vendors:update'), VendorController.update);
router.delete('/:id', requirePermission('vendors:delete'), VendorController.delete);

export default router;
