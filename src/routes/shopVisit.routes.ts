import { Router } from 'express';
import { ShopVisitController } from '../controllers/shopVisit.controller';
import { authMiddleware } from '../middleware/auth';
import { requirePermission } from '../middleware/permissions';

const router = Router();

router.use(authMiddleware);

// Salesman self-service routes
router.post('/check-in', ShopVisitController.checkIn);
router.post('/:id/check-out', ShopVisitController.checkOut);
router.post('/:id/activity', ShopVisitController.addActivity);
router.get('/active', ShopVisitController.getActiveVisit);
router.get('/today', ShopVisitController.getTodayVisits);
router.get('/my', ShopVisitController.getMyVisits);
router.put('/:id', ShopVisitController.update);
router.post('/:id/cancel', ShopVisitController.cancel);

// Manager/Admin routes
router.get('/', requirePermission('shop_visits.read'), ShopVisitController.getAll);
router.get('/stats/:userId', requirePermission('shop_visits.read'), ShopVisitController.getStats);
router.get('/nearby', requirePermission('shop_visits.read'), ShopVisitController.getNearby);
router.get('/customer/:customerId', requirePermission('shop_visits.read'), ShopVisitController.getCustomerHistory);
router.get('/:id', requirePermission('shop_visits.read'), ShopVisitController.getById);

export default router;
