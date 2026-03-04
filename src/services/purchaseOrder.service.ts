import { Types } from 'mongoose';
import PurchaseOrder from '../models/PurchaseOrder';
import Requisition from '../models/Requisition';
import Vendor from '../models/Vendor';
import ApprovalConfig from '../models/ApprovalConfig';
import { errors } from '../utils/errors';
import { buildPaginatedResponse } from '../utils/helpers';
import { NumberingService } from '../services/numbering.service';
import { UserRole } from '../types';

const DEFAULT_PO_APPROVER_ROLES: UserRole[] = ['accountant', 'admin', 'super_admin', 'hod'];

const getPOApprovalConfig = async () => {
  return ApprovalConfig.findOne({
    type: 'custom',
    isActive: true,
    $or: [
      { name: 'purchase_order_approval' },
      { 'metadata.module': 'purchase_orders' },
    ],
  }).lean();
};

const resolveApproverRoles = (fromConfig?: string[]): UserRole[] => {
  const allowed = new Set(DEFAULT_PO_APPROVER_ROLES);
  if (fromConfig?.length) {
    return [...new Set(fromConfig)].filter((r): r is UserRole => allowed.has(r as UserRole));
  }
  return DEFAULT_PO_APPROVER_ROLES;
};

export class PurchaseOrderService {
  static async getAll(query: Record<string, unknown>, pagination: { page: number; limit: number; skip: number }) {
    const filter: Record<string, unknown> = {};
    if (query.status) {
      const statusVal = query.status as string;
      filter.status = statusVal.includes(',')
        ? { $in: statusVal.split(',').map((s: string) => s.trim()).filter(Boolean) }
        : statusVal;
    }
    if (query.vendorId) filter.vendorId = query.vendorId;
    if (query.requisitionId) filter.requisitionId = query.requisitionId;
    if (query.search) {
      filter.$or = [
        { purchaseOrderNumber: { $regex: query.search, $options: 'i' } },
        { vendorName: { $regex: query.search, $options: 'i' } },
      ];
    }

    const [orders, total] = await Promise.all([
      PurchaseOrder.find(filter)
        .populate('vendorId', 'name vendorCode')
        .populate('requisitionId', 'requisitionNumber')
        .populate('createdBy', 'fullName email')
        .sort({ createdAt: -1 })
        .skip(pagination.skip)
        .limit(pagination.limit),
      PurchaseOrder.countDocuments(filter),
    ]);

    return buildPaginatedResponse(orders, total, pagination.page, pagination.limit);
  }

  static async getById(id: string) {
    const po = await PurchaseOrder.findById(id)
      .populate('vendorId')
      .populate('requisitionId')
      .populate('items.productId', 'name sku');
    if (!po) throw errors.notFound('Purchase Order');
    return po;
  }

  static async create(data: { requisitionId: string; vendorId: string; items?: any[]; notes?: string }, userId: string) {
    const requisition = await Requisition.findById(data.requisitionId).lean();
    if (!requisition) throw errors.notFound('Requisition');
    if (requisition.status !== 'approved') {
      throw errors.validation('Requisition must be approved before creating Purchase Order');
    }

    const vendor = await Vendor.findById(data.vendorId);
    if (!vendor) throw errors.notFound('Vendor');
    if (vendor.status !== 'active') {
      throw errors.validation('Vendor must be active');
    }

    const existingPO = await PurchaseOrder.findOne({ requisitionId: data.requisitionId });
    if (existingPO) {
      throw errors.validation('Purchase Order already exists for this requisition');
    }

    const purchaseOrderNumber = await NumberingService.getNextCode('purchase_order');

    let items: any[];
    if (data.items && data.items.length > 0) {
      items = data.items;
    } else {
      items = [];
      for (const reqItem of requisition.items) {
        const qty = reqItem.quantity;
        const quantityUom = (reqItem.quantityUom || 'unit') as 'unit' | 'pcs';
        items.push({
          productId: reqItem.productId,
          variantId: reqItem.variantId,
          sku: reqItem.sku,
          variantSku: reqItem.variantSku,
          productName: reqItem.productName,
          variantName: reqItem.variantName,
          displaySize: reqItem.displaySize,
          quantity: qty,
          quantityUom,
          unitPrice: 0,
          taxRate: 0,
          taxAmount: 0,
          lineTotal: 0,
        });
      }
    }

    const enrichedItems = items.map((item: any) => ({
      ...item,
      receivedQuantity: 0,
      taxAmount: 0,
      lineTotal: 0,
    }));

    const subtotal = 0;
    const taxTotal = 0;
    const grandTotal = 0;

    const po = new PurchaseOrder({
      purchaseOrderNumber,
      requisitionId: data.requisitionId,
      vendorId: data.vendorId,
      vendorName: vendor.name,
      vendorCode: vendor.vendorCode,
      status: 'draft',
      items: enrichedItems,
      pricing: { subtotal, taxTotal, grandTotal },
      notes: data.notes,
      createdBy: userId,
      updatedBy: userId,
    });
    await po.save();
    return po;
  }

  static async delete(id: string, _userId: string) {
    const po = await PurchaseOrder.findById(id);
    if (!po) throw errors.notFound('Purchase Order');
    if (po.status !== 'draft') {
      throw errors.validation('Can only delete draft Purchase Orders');
    }
    await PurchaseOrder.findByIdAndDelete(id);
  }

  static async update(id: string, data: { items?: any[]; notes?: string }, userId: string) {
    const po = await PurchaseOrder.findById(id);
    if (!po) throw errors.notFound('Purchase Order');
    if (!['draft'].includes(po.status)) {
      throw errors.validation('Can only update draft Purchase Orders');
    }

    if (data.items?.length) {
      const enrichedItems = data.items.map((item: any) => ({
        ...item,
        receivedQuantity: item.receivedQuantity ?? 0,
        unitPrice: 0,
        taxRate: 0,
        taxAmount: 0,
        lineTotal: 0,
      }));
      po.items = enrichedItems;
      po.pricing = { subtotal: 0, taxTotal: 0, grandTotal: 0 };
    }
    if (data.notes !== undefined) po.notes = data.notes;
    (po as any).updatedBy = userId;
    await po.save();
    return po;
  }

  static async submit(id: string, userId: string) {
    const po = await PurchaseOrder.findById(id);
    if (!po) throw errors.notFound('Purchase Order');
    if (po.status !== 'draft') {
      throw errors.validation('Can only submit draft Purchase Orders');
    }

    const approvalConfig = await getPOApprovalConfig();
    const approvalRequired = !!approvalConfig?.isActive;
    const approverRoles = resolveApproverRoles(
      approvalConfig?.levels?.map((l: any) => l.approverRole).filter(Boolean)
    );

    po.status = approvalRequired ? 'pending_approval' : 'approved';
    if (approvalRequired) {
      po.approval = {
        required: true,
        status: 'pending',
        approverRoles,
        submittedAt: new Date(),
        decisions: [],
      } as any;
    } else {
      po.approval = {
        required: false,
        status: 'not_required',
        approverRoles: [],
        decisions: [],
      } as any;
    }
    (po as any).updatedBy = userId;
    await po.save();
    return po;
  }

  static async approve(id: string, userId: string, userRole: string, notes?: string) {
    const po = await PurchaseOrder.findById(id);
    if (!po) throw errors.notFound('Purchase Order');
    if (!po.approval?.required || po.approval.status !== 'pending') {
      throw errors.validation('Purchase Order does not have a pending approval');
    }

    const approverRoles = resolveApproverRoles(po.approval.approverRoles as any);
    if (!approverRoles.includes(userRole as UserRole)) {
      throw errors.forbidden('approve this purchase order');
    }

    const decisions = po.approval.decisions || [];
    const alreadyDecided = decisions.some((d: any) => d.approverId?.toString() === userId);
    if (alreadyDecided) throw errors.validation('You have already submitted a decision');

    decisions.push({
      approverId: new Types.ObjectId(userId),
      approverRole: userRole,
      decision: 'approved',
      notes,
      decidedAt: new Date(),
    });
    po.approval.decisions = decisions;
    po.approval.status = 'approved';
    po.approval.approvedAt = new Date();
    (po.approval as any).approvedBy = userId;
    po.approval.decisionNotes = notes;
    po.status = 'approved';
    (po as any).updatedBy = userId;
    await po.save();
    return po;
  }

  static async reject(id: string, userId: string, userRole: string, notes: string) {
    const po = await PurchaseOrder.findById(id);
    if (!po) throw errors.notFound('Purchase Order');
    if (!po.approval?.required || po.approval.status !== 'pending') {
      throw errors.validation('Purchase Order does not have a pending approval');
    }

    const approverRoles = resolveApproverRoles(po.approval.approverRoles as any);
    if (!approverRoles.includes(userRole as UserRole)) {
      throw errors.forbidden('reject this purchase order');
    }

    const decisions = po.approval.decisions || [];
    const alreadyDecided = decisions.some((d: any) => d.approverId?.toString() === userId);
    if (alreadyDecided) throw errors.validation('You have already submitted a decision');

    decisions.push({
      approverId: new Types.ObjectId(userId),
      approverRole: userRole,
      decision: 'rejected',
      notes,
      decidedAt: new Date(),
    });
    po.approval.decisions = decisions;
    po.approval.status = 'rejected';
    po.approval.rejectedAt = new Date();
    (po.approval as any).rejectedBy = userId;
    po.approval.decisionNotes = notes;
    po.status = 'rejected';
    (po as any).updatedBy = userId;
    await po.save();
    return po;
  }

  static async getPendingApprovals(pagination: { page: number; limit: number; skip: number }) {
    const filter = {
      status: 'pending_approval',
      'approval.required': true,
      'approval.status': 'pending',
    };
    const [orders, total] = await Promise.all([
      PurchaseOrder.find(filter)
        .populate('vendorId', 'name vendorCode')
        .populate('requisitionId', 'requisitionNumber')
        .populate('createdBy', 'fullName email')
        .sort({ createdAt: -1 })
        .skip(pagination.skip)
        .limit(pagination.limit),
      PurchaseOrder.countDocuments(filter),
    ]);
    return buildPaginatedResponse(orders, total, pagination.page, pagination.limit);
  }
}
