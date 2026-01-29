import { Router } from 'express';
import { InventoryController } from '../controllers/inventory.controller';
import { authMiddleware } from '../middleware/auth';
import { requirePermission } from '../middleware/permissions';

const router = Router();

router.use(authMiddleware);

router.get('/summary', requirePermission('inventory.read'), InventoryController.getSummary);

router.get('/transactions', requirePermission('inventory.read'), InventoryController.getTransactions);

router.post('/adjust', requirePermission('inventory.manage_inventory'), InventoryController.adjust);

export default router;
