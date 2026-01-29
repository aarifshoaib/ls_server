import { Router } from 'express';
import { AttendanceController } from '../controllers/attendance.controller';
import { authMiddleware } from '../middleware/auth';
import { requirePermission } from '../middleware/permissions';

const router = Router();

router.use(authMiddleware);

// Employee self-service routes
router.post('/clock-in', AttendanceController.clockIn);
router.post('/clock-out', AttendanceController.clockOut);
router.get('/today', AttendanceController.getTodayStatus);
router.get('/my', AttendanceController.getMyAttendance);

// Dashboard stats route
router.get('/stats', AttendanceController.getStats);

// PayCycle period-based routes (must come before /:id routes)
router.get('/pay-cycle/:payCycleId/period', requirePermission('attendance.read'), AttendanceController.getForPayCyclePeriod);
router.get('/pay-cycle/:payCycleId/grid', requirePermission('attendance.read'), AttendanceController.getAttendanceGrid);

// Bulk operations with period validation
router.post('/period/create', requirePermission('attendance.create'), AttendanceController.createWithPeriodValidation);
router.post('/period/bulk-create', requirePermission('attendance.create'), AttendanceController.bulkCreateWithPeriodValidation);
router.put('/period/bulk-update', requirePermission('attendance.update'), AttendanceController.bulkUpdateWithPeriodValidation);
router.post('/period/bulk-delete', requirePermission('attendance.delete'), AttendanceController.bulkDeleteWithPeriodValidation);
router.post('/period/mark-all-present', requirePermission('attendance.create'), AttendanceController.markAllPresent);

// Admin/Manager routes
router.get('/', requirePermission('attendance.read'), AttendanceController.getAll);
router.get('/summary/:userId', requirePermission('attendance.read'), AttendanceController.getSummary);
router.get('/:id', requirePermission('attendance.read'), AttendanceController.getById);
router.put('/:id', requirePermission('attendance.update'), AttendanceController.update);
router.delete('/:id', requirePermission('attendance.delete'), AttendanceController.delete);

// Payroll-specific routes
router.get('/payroll-summary/:employeeId', requirePermission('attendance.read'), AttendanceController.getPayrollSummary);
router.post('/bulk', requirePermission('attendance.create'), AttendanceController.bulkCreate);
router.put('/lock', requirePermission('attendance.manage'), AttendanceController.lockForPayroll);
router.put('/unlock', requirePermission('attendance.manage'), AttendanceController.unlock);
router.put('/:id/payroll-overtime', requirePermission('attendance.update'), AttendanceController.updatePayrollOvertime);

export default router;
