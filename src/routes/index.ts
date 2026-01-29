import { Router } from 'express';
import authRoutes from './auth.routes';
import productRoutes from './product.routes';
import categoryRoutes from './category.routes';
import orderRoutes from './order.routes';
import customerRoutes from './customer.routes';
import inventoryRoutes from './inventory.routes';
import dashboardRoutes from './dashboard.routes';
import userRoutes from './user.routes';
import attendanceRoutes from './attendance.routes';
import leaveRoutes from './leave.routes';
import shopVisitRoutes from './shopVisit.routes';
import lookupValueRoutes from './lookupValue.routes';
import earningDeductionRoutes from './earningDeduction.routes';
import payCycleRoutes from './payCycle.routes';
import employeeRoutes from './employee.routes';
import advanceRoutes from './advance.routes';
import payrollRunRoutes from './payrollRun.routes';
import payrollArchiveRoutes from './payrollArchive.routes';
import adhocEarningDeductionRoutes from './adhocEarningDeduction.routes';
import holidayRoutes from './holiday.routes';
import roleRoutes from './role.routes';
import paymentRoutes from './payment.routes';

const router = Router();

router.use('/auth', authRoutes);
router.use('/products', productRoutes);
router.use('/categories', categoryRoutes);
router.use('/orders', orderRoutes);
router.use('/customers', customerRoutes);
router.use('/inventory', inventoryRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/users', userRoutes);
router.use('/attendance', attendanceRoutes);
router.use('/leaves', leaveRoutes);
router.use('/shop-visits', shopVisitRoutes);
router.use('/lookup-values', lookupValueRoutes);
router.use('/earning-deductions', earningDeductionRoutes);
router.use('/pay-cycles', payCycleRoutes);
router.use('/employees', employeeRoutes);
router.use('/advances', advanceRoutes);
router.use('/payroll-runs', payrollRunRoutes);
router.use('/payroll-archives', payrollArchiveRoutes);
router.use('/adhoc-items', adhocEarningDeductionRoutes);
router.use('/holidays', holidayRoutes);
router.use('/roles', roleRoutes);
router.use('/payments', paymentRoutes);

// Health check
router.get('/health', (_req, res) => {
  res.json({
    success: true,
    message: 'OMS API is running',
    timestamp: new Date().toISOString(),
  });
});

export default router;
