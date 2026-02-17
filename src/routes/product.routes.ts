import { Router } from 'express';
import { ProductController } from '../controllers/product.controller';
import { authMiddleware } from '../middleware/auth';
import { requirePermission } from '../middleware/permissions';

const router = Router();

router.use(authMiddleware);

router.get('/', requirePermission('products:read'), ProductController.getAll);

router.get('/low-stock', requirePermission('products:read'), ProductController.getLowStock);

router.get('/:id', requirePermission('products:read'), ProductController.getById);

router.get('/sku/:sku', requirePermission('products:read'), ProductController.getBySku);

router.post('/', requirePermission('products:create'), ProductController.create);

router.put('/:id', requirePermission('products:update'), ProductController.update);

router.delete('/:id', requirePermission('products:delete'), ProductController.delete);

export default router;
