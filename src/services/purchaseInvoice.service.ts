import mongoose, { Types } from 'mongoose';
import PurchaseInvoice from '../models/PurchaseInvoice';
import PurchaseOrder from '../models/PurchaseOrder';
import Vendor from '../models/Vendor';
import ApprovalConfig from '../models/ApprovalConfig';
import { StockBatchService } from './stockBatch.service';
import { errors } from '../utils/errors';
import { buildPaginatedResponse, generateCode } from '../utils/helpers';
import { UserRole } from '../types';

const DEFAULT_PI_APPROVER_ROLES: UserRole[] = ['accountant', 'admin', 'super_admin', 'hod'];

const getPIApprovalConfig = async () => {
  return ApprovalConfig.findOne({
    type: 'custom',
    isActive: true,
    $or: [
      { name: 'purchase_invoice_approval' },
      { 'metadata.module': 'purchase_invoices' },
    ],
  }).lean();
};

const resolveApproverRoles = (fromConfig?: string[]): UserRole[] => {
  const allowed = new Set(DEFAULT_PI_APPROVER_ROLES);
  if (fromConfig?.length) {
    return [...new Set(fromConfig)].filter((r): r is UserRole => allowed.has(r as UserRole));
  }
  return DEFAULT_PI_APPROVER_ROLES;
};

export class PurchaseInvoiceService {
  static async getAll(query: Record<string, unknown>, pagination: { page: number; limit: number; skip: number }) {
    const filter: Record<string, unknown> = {};
    if (query.status) filter.status = query.status;
    if (query.vendorId) filter.vendorId = query.vendorId;
    if (query.search) {
      filter.$or = [
        { invoiceNumber: { $regex: query.search, $options: 'i' } },
        { vendorName: { $regex: query.search, $options: 'i' } },
      ];
    }

    const [invoices, total] = await Promise.all([
      PurchaseInvoice.find(filter)
        .populate('vendorId', 'name vendorCode')
        .populate('purchaseOrderIds', 'purchaseOrderNumber')
        .populate('createdBy', 'fullName email')
        .sort({ createdAt: -1 })
        .skip(pagination.skip)
        .limit(pagination.limit),
      PurchaseInvoice.countDocuments(filter),
    ]);

    return buildPaginatedResponse(invoices, total, pagination.page, pagination.limit);
  }

  static async getById(id: string) {
    const pi = await PurchaseInvoice.findById(id)
      .populate('vendorId')
      .populate('purchaseOrderIds')
      .populate('items.productId', 'name sku');
    if (!pi) throw errors.notFound('Purchase Invoice');
    return pi;
  }

  static async create(data: {
    purchaseOrderIds: string[];
    vendorId: string;
    items: any[];
    notes?: string;
  }, userId: string) {
    if (!data.items?.length) {
      throw errors.validation('At least one item is required');
    }

    const vendor = await Vendor.findById(data.vendorId);
    if (!vendor) throw errors.notFound('Vendor');

    const purchaseOrderIds = (data.purchaseOrderIds || []).map((id: string) => new Types.ObjectId(id));
    if (purchaseOrderIds.length) {
      const pos = await PurchaseOrder.find({
        _id: { $in: purchaseOrderIds },
        status: { $in: ['approved', 'partially_received'] },
      });
      if (pos.length !== purchaseOrderIds.length) {
        throw errors.validation('All Purchase Orders must exist and be approved or partially received');
      }
    }

    const count = await PurchaseInvoice.countDocuments();
    const invoiceNumber = generateCode('PI', count + 1, 6);

    const items = data.items.map((item: any) => {
      const batchNumber = (item.batchNumber || '').toString().trim();
      const expiryDate = item.expiryDate ? new Date(item.expiryDate) : null;
      if (!batchNumber) {
        throw errors.validation(`Batch number is required for ${item.productName || 'item'}`);
      }
      if (!expiryDate || isNaN(expiryDate.getTime())) {
        throw errors.validation(`Valid expiry date is required for ${item.productName || 'item'}`);
      }
      const unitPrice = item.unitPrice ?? 0;
      const taxRate = item.taxRate ?? 5;
      const lineSubtotal = unitPrice * item.quantity;
      const taxAmount = (lineSubtotal * taxRate) / 100;
      const lineTotal = lineSubtotal + taxAmount;
      return {
        ...item,
        batchNumber,
        expiryDate,
        unitPrice,
        taxRate,
        taxAmount,
        lineTotal,
      };
    });

    const subtotal = items.reduce((s: number, i: any) => s + (i.unitPrice * i.quantity), 0);
    const taxTotal = items.reduce((s: number, i: any) => s + i.taxAmount, 0);
    const grandTotal = subtotal + taxTotal;

    const pi = new PurchaseInvoice({
      invoiceNumber,
      purchaseOrderIds,
      vendorId: data.vendorId,
      vendorName: vendor.name,
      vendorCode: vendor.vendorCode,
      status: 'draft',
      items,
      pricing: { subtotal, taxTotal, grandTotal },
      notes: data.notes,
      receivedAt: new Date(),
      createdBy: userId,
      updatedBy: userId,
    });
    await pi.save();
    return pi;
  }

  static async update(id: string, data: { items?: any[]; notes?: string }, userId: string) {
    const pi = await PurchaseInvoice.findById(id);
    if (!pi) throw errors.notFound('Purchase Invoice');
    if (pi.status !== 'draft') {
      throw errors.validation('Can only update draft Purchase Invoices');
    }

    if (data.items?.length) {
      const items = data.items.map((item: any) => {
        const batchNumber = (item.batchNumber || '').toString().trim();
        const expiryDate = item.expiryDate ? new Date(item.expiryDate) : null;
        if (!batchNumber) {
          throw errors.validation(`Batch number is required for ${item.productName || 'item'}`);
        }
        if (!expiryDate || isNaN(expiryDate.getTime())) {
          throw errors.validation(`Valid expiry date is required for ${item.productName || 'item'}`);
        }
        const unitPrice = item.unitPrice ?? 0;
        const taxRate = item.taxRate ?? 5;
        const lineSubtotal = unitPrice * item.quantity;
        const taxAmount = (lineSubtotal * taxRate) / 100;
        const lineTotal = lineSubtotal + taxAmount;
        return { ...item, batchNumber, expiryDate, unitPrice, taxRate, taxAmount, lineTotal };
      });
      pi.items = items;
      pi.pricing = {
        subtotal: items.reduce((s: number, i: any) => s + (i.unitPrice * i.quantity), 0),
        taxTotal: items.reduce((s: number, i: any) => s + i.taxAmount, 0),
        grandTotal: items.reduce((s: number, i: any) => s + i.lineTotal, 0),
      };
    }
    if (data.notes !== undefined) pi.notes = data.notes;
    (pi as any).updatedBy = userId;
    await pi.save();
    return pi;
  }

  static async submit(id: string, userId: string) {
    const pi = await PurchaseInvoice.findById(id);
    if (!pi) throw errors.notFound('Purchase Invoice');
    if (pi.status !== 'draft') {
      throw errors.validation('Can only submit draft Purchase Invoices');
    }

    const approvalConfig = await getPIApprovalConfig();
    const approvalRequired = !!approvalConfig?.isActive;
    const approverRoles = resolveApproverRoles(
      approvalConfig?.levels?.map((l: any) => l.approverRole).filter(Boolean)
    );

    pi.status = approvalRequired ? 'pending_approval' : 'approved';
    if (approvalRequired) {
      pi.approval = {
        required: true,
        status: 'pending',
        approverRoles,
        submittedAt: new Date(),
        decisions: [],
      } as any;
    } else {
      pi.approval = {
        required: false,
        status: 'not_required',
        approverRoles: [],
        decisions: [],
      } as any;
    }
    (pi as any).updatedBy = userId;
    await pi.save();
    return pi;
  }

  static async approve(id: string, userId: string, userRole: string, notes?: string) {
    const pi = await PurchaseInvoice.findById(id);
    if (!pi) throw errors.notFound('Purchase Invoice');
    if (!pi.approval?.required || pi.approval.status !== 'pending') {
      throw errors.validation('Purchase Invoice does not have a pending approval');
    }

    const approverRoles = resolveApproverRoles(pi.approval.approverRoles as any);
    if (!approverRoles.includes(userRole as UserRole)) {
      throw errors.forbidden('approve this purchase invoice');
    }

    const decisions = pi.approval.decisions || [];
    const alreadyDecided = decisions.some((d: any) => d.approverId?.toString() === userId);
    if (alreadyDecided) throw errors.validation('You have already submitted a decision');

    decisions.push({
      approverId: new Types.ObjectId(userId),
      approverRole: userRole,
      decision: 'approved',
      notes,
      decidedAt: new Date(),
    });
    pi.approval.decisions = decisions;
    pi.approval.status = 'approved';
    pi.approval.approvedAt = new Date();
    (pi.approval as any).approvedBy = userId;
    pi.approval.decisionNotes = notes;
    pi.status = 'approved';
    (pi as any).updatedBy = userId;
    await pi.save();
    return pi;
  }

  static async reject(id: string, userId: string, userRole: string, notes: string) {
    const pi = await PurchaseInvoice.findById(id);
    if (!pi) throw errors.notFound('Purchase Invoice');
    if (!pi.approval?.required || pi.approval.status !== 'pending') {
      throw errors.validation('Purchase Invoice does not have a pending approval');
    }

    const approverRoles = resolveApproverRoles(pi.approval.approverRoles as any);
    if (!approverRoles.includes(userRole as UserRole)) {
      throw errors.forbidden('reject this purchase invoice');
    }

    const decisions = pi.approval.decisions || [];
    const alreadyDecided = decisions.some((d: any) => d.approverId?.toString() === userId);
    if (alreadyDecided) throw errors.validation('You have already submitted a decision');

    decisions.push({
      approverId: new Types.ObjectId(userId),
      approverRole: userRole,
      decision: 'rejected',
      notes,
      decidedAt: new Date(),
    });
    pi.approval.decisions = decisions;
    pi.approval.status = 'rejected';
    pi.approval.rejectedAt = new Date();
    (pi.approval as any).rejectedBy = userId;
    pi.approval.decisionNotes = notes;
    pi.status = 'rejected';
    (pi as any).updatedBy = userId;
    await pi.save();
    return pi;
  }

  static async receive(id: string, userId: string) {
    const pi = await PurchaseInvoice.findById(id);
    if (!pi) throw errors.notFound('Purchase Invoice');
    if (pi.status !== 'approved') {
      throw errors.validation('Purchase Invoice must be approved before receiving');
    }

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      for (const item of pi.items) {
        const batchNumber = (item.batchNumber || '').toString().trim();
        const expiryDate = item.expiryDate ? new Date(item.expiryDate) : null;
        if (!batchNumber) {
          throw errors.validation(`Batch number missing for ${item.productName || 'item'} - cannot receive into inventory`);
        }
        if (!expiryDate || isNaN(expiryDate.getTime())) {
          throw errors.validation(`Valid expiry date missing for ${item.productName || 'item'} - cannot receive into inventory`);
        }
        await StockBatchService.addStockFromPurchase(
          item.productId as Types.ObjectId,
          item.variantId as Types.ObjectId,
          item.variantSku,
          batchNumber,
          expiryDate,
          item.quantity,
          pi._id as Types.ObjectId,
          pi.invoiceNumber,
          userId,
          session
        );

        if (item.purchaseOrderId) {
          const po = await PurchaseOrder.findById(item.purchaseOrderId).session(session);
          if (po) {
            const line = po.items.find(
              (l: any) =>
                String(l.productId) === String(item.productId) &&
                String(l.variantId) === String(item.variantId)
            );
            if (line) {
              const currentReceived = line.receivedQuantity || 0;
              line.receivedQuantity = currentReceived + item.quantity;
            }
            const allReceived = po.items.every((l: any) => (l.receivedQuantity || 0) >= l.quantity);
            po.status = allReceived ? 'received' : 'partially_received';
            po.markModified('items');
            await po.save({ session });
          }
        }
      }

      pi.status = 'received';
      pi.receivedAt = new Date();
      (pi as any).updatedBy = userId;
      await pi.save({ session });

      await session.commitTransaction();
      return pi;
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  static async getPendingApprovals(pagination: { page: number; limit: number; skip: number }) {
    const filter = {
      status: 'pending_approval',
      'approval.required': true,
      'approval.status': 'pending',
    };
    const [invoices, total] = await Promise.all([
      PurchaseInvoice.find(filter)
        .populate('vendorId', 'name vendorCode')
        .populate('purchaseOrderIds', 'purchaseOrderNumber')
        .populate('createdBy', 'fullName email')
        .sort({ createdAt: -1 })
        .skip(pagination.skip)
        .limit(pagination.limit),
      PurchaseInvoice.countDocuments(filter),
    ]);
    return buildPaginatedResponse(invoices, total, pagination.page, pagination.limit);
  }
}
