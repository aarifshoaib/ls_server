import { Router } from 'express';
import { LeaveController } from '../controllers/leave.controller';
import { authMiddleware } from '../middleware/auth';
import { requirePermission } from '../middleware/permissions';

const router = Router();

router.use(authMiddleware);

// Employee self-service routes
router.post('/', LeaveController.create);
router.get('/my', LeaveController.getMyLeaves);
router.get('/my/balance', LeaveController.getMyBalance);
router.get('/balance', LeaveController.getMyBalance);  // Alias for /my/balance
router.post('/:id/cancel', LeaveController.cancel);

// Approver routes
router.get('/pending-approvals', LeaveController.getPendingApprovals);
router.post('/:id/approve', LeaveController.approve);
router.post('/:id/reject', LeaveController.reject);

// Admin/Manager routes
router.get('/', requirePermission('leave.read'), LeaveController.getAll);
router.get('/balance/:userId', requirePermission('leave.read'), LeaveController.getBalance);
router.get('/:id', requirePermission('leave.read'), LeaveController.getById);
router.put('/balance/:id', requirePermission('leave.update'), LeaveController.updateBalance);

export default router;
