import { Router } from 'express';
import authRoutes from './auth.routes';
import productRoutes from './product.routes';
import categoryRoutes from './category.routes';
import orderRoutes from './order.routes';
import vendorRoutes from './vendor.routes';
import requisitionRoutes from './requisition.routes';
import purchaseOrderRoutes from './purchaseOrder.routes';
import purchaseInvoiceRoutes from './purchaseInvoice.routes';
import purchaseReturnRoutes from './purchaseReturn.routes';
import { OrderController } from '../controllers/order.controller';
import { PurchaseOrderController } from '../controllers/purchaseOrder.controller';
import { PurchaseInvoiceController } from '../controllers/purchaseInvoice.controller';
import { authMiddleware } from '../middleware/auth';
import { requirePermission, requireRole } from '../middleware/permissions';
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
import companyRoutes from './company.routes';
import employeeReportsRoutes from './employeeReports.routes';
import { EmployeeController } from '../controllers/employee.controller';
import advanceRoutes from './advance.routes';
import payrollRunRoutes from './payrollRun.routes';
import payrollArchiveRoutes from './payrollArchive.routes';
import adhocEarningDeductionRoutes from './adhocEarningDeduction.routes';
import holidayRoutes from './holiday.routes';
import roleRoutes from './role.routes';
import paymentRoutes from './payment.routes';
import approvalConfigRoutes from './approvalConfig.routes';
import aiRoutes from './ai.routes';
import numberingConfigRoutes from './numberingConfig.routes';

const router = Router();

router.use('/auth', authRoutes);
router.use('/products', productRoutes);
router.use('/categories', categoryRoutes);
// Explicit route - must be before /orders mount to avoid any nested routing issues
router.get(
  '/orders/approvals/pending',
  authMiddleware,
  requireRole('accountant', 'admin', 'super_admin', 'hod'),
  requirePermission('orders:read'),
  OrderController.getPendingApprovals
);
router.use('/orders', orderRoutes);
router.use('/vendors', vendorRoutes);
router.use('/requisitions', requisitionRoutes);
router.get(
  '/purchase-orders/approvals/pending',
  authMiddleware,
  requireRole('accountant', 'admin', 'super_admin', 'hod'),
  requirePermission('purchase_orders:read'),
  PurchaseOrderController.getPendingApprovals
);
router.use('/purchase-orders', purchaseOrderRoutes);
router.get(
  '/purchase-invoices/approvals/pending',
  authMiddleware,
  requireRole('accountant', 'admin', 'super_admin', 'hod'),
  requirePermission('purchase_invoices:read'),
  PurchaseInvoiceController.getPendingApprovals
);
router.use('/purchase-invoices', purchaseInvoiceRoutes);
router.use('/purchase-returns', purchaseReturnRoutes);
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
router.use('/companies', companyRoutes);
router.use('/employees', employeeRoutes);
// Explicit route for document-expiry - must be before sub-router for reliable matching
router.get(
  '/employee-reports/document-expiry',
  authMiddleware,
  requirePermission('employees:read'),
  EmployeeController.getDocumentExpiry
);
router.use('/employee-reports', employeeReportsRoutes);
router.use('/advances', advanceRoutes);
router.use('/payroll-runs', payrollRunRoutes);
router.use('/payroll-archives', payrollArchiveRoutes);
router.use('/adhoc-items', adhocEarningDeductionRoutes);
router.use('/holidays', holidayRoutes);
router.use('/roles', roleRoutes);
router.use('/payments', paymentRoutes);
router.use('/approval-configs', approvalConfigRoutes);
router.use('/ai', aiRoutes);
router.use('/numbering-config', numberingConfigRoutes);

// Health check
router.get('/health', (_req, res) => {
  res.json({
    success: true,
    message: 'OMS API is running',
    timestamp: new Date().toISOString(),
  });
});

export default router;
