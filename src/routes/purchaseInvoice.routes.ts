import { Router } from 'express';
import { PurchaseInvoiceController } from '../controllers/purchaseInvoice.controller';
import { authMiddleware } from '../middleware/auth';
import { requirePermission, requireRole } from '../middleware/permissions';

const router = Router();

router.use(authMiddleware);

router.get('/', requirePermission('purchase_invoices:read'), PurchaseInvoiceController.getAll);
router.get('/approvals/pending', requireRole('accountant', 'admin', 'super_admin', 'hod'), requirePermission('purchase_invoices:read'), PurchaseInvoiceController.getPendingApprovals);
router.get('/:id', requirePermission('purchase_invoices:read'), PurchaseInvoiceController.getById);
router.post('/', requirePermission('purchase_invoices:create'), PurchaseInvoiceController.create);
router.put('/:id', requirePermission('purchase_invoices:update'), PurchaseInvoiceController.update);
router.post('/:id/submit', requirePermission('purchase_invoices:update'), PurchaseInvoiceController.submit);
router.put('/:id/approve', requireRole('accountant', 'admin', 'super_admin', 'hod'), requirePermission('purchase_invoices:update'), PurchaseInvoiceController.approve);
router.put('/:id/reject', requireRole('accountant', 'admin', 'super_admin', 'hod'), requirePermission('purchase_invoices:update'), PurchaseInvoiceController.reject);
router.post('/:id/receive', requirePermission('purchase_invoices:update'), PurchaseInvoiceController.receive);

export default router;
