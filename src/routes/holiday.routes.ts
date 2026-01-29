import { Router } from 'express';
import { HolidayController } from '../controllers/holiday.controller';
import { authMiddleware } from '../middleware/auth';
import { requirePermission } from '../middleware/permissions';

const router = Router();

router.use(authMiddleware);

// Get all holidays with pagination and filters
router.get('/', requirePermission('holidays.read'), HolidayController.getAll);

// Get holiday statistics
router.get('/statistics', requirePermission('holidays.read'), HolidayController.getStatistics);

// Get holidays for a specific period (date range)
router.get('/period', requirePermission('holidays.read'), HolidayController.getForPeriod);

// Check if a date is a holiday
router.get('/check', requirePermission('holidays.read'), HolidayController.checkIsHoliday);

// Get holidays by year
router.get('/year/:year', requirePermission('holidays.read'), HolidayController.getByYear);

// Get statistics
router.get('/statistics', requirePermission('holidays.read'), HolidayController.getStatistics);

// Get holiday by ID
router.get('/:id', requirePermission('holidays.read'), HolidayController.getById);

// Create holiday
router.post('/', requirePermission('holidays.create'), HolidayController.create);

// Bulk create holidays
router.post('/bulk', requirePermission('holidays.create'), HolidayController.bulkCreate);

// Update holiday
router.put('/:id', requirePermission('holidays.update'), HolidayController.update);

// Delete holiday
router.delete('/:id', requirePermission('holidays.delete'), HolidayController.delete);

export default router;
