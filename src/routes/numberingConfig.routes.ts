import { Router } from 'express';
import { NumberingConfigController } from '../controllers/numberingConfig.controller';
import { authMiddleware } from '../middleware/auth';
import { requirePermission } from '../middleware/permissions';

const router = Router();

router.use(authMiddleware);

router.get('/', requirePermission('settings:read'), NumberingConfigController.getAll);
router.put('/bulk', requirePermission('settings:update'), NumberingConfigController.updateBulk);
router.put('/:entity', requirePermission('settings:update'), NumberingConfigController.update);

export default router;
