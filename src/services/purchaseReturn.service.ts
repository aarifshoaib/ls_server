import mongoose, { Types } from 'mongoose';
import PurchaseReturn from '../models/PurchaseReturn';
import Vendor from '../models/Vendor';
import Product from '../models/Product';
import ApprovalConfig from '../models/ApprovalConfig';
import { StockBatchService } from './stockBatch.service';
import { errors } from '../utils/errors';
import { buildPaginatedResponse } from '../utils/helpers';
import { NumberingService } from '../services/numbering.service';
import { UserRole } from '../types';

const DEFAULT_PR_APPROVER_ROLES: UserRole[] = ['accountant', 'admin', 'super_admin', 'hod'];

const getPRApprovalConfig = async () => {
  return ApprovalConfig.findOne({
    type: 'custom',
    isActive: true,
    $or: [
      { name: 'purchase_return_approval' },
      { 'metadata.module': 'purchase_returns' },
    ],
  }).lean();
};

const resolveApproverRoles = (fromConfig?: string[]): UserRole[] => {
  const allowed = new Set(DEFAULT_PR_APPROVER_ROLES);
  if (fromConfig?.length) {
    return [...new Set(fromConfig)].filter((r): r is UserRole => allowed.has(r as UserRole));
  }
  return DEFAULT_PR_APPROVER_ROLES;
};

export class PurchaseReturnService {
  static async getAll(query: Record<string, unknown>, pagination: { page: number; limit: number; skip: number }) {
    const filter: Record<string, unknown> = {};
    if (query.status) filter.status = query.status;
    if (query.vendorId) filter.vendorId = query.vendorId;
    if (query.search) {
      filter.$or = [
        { returnNumber: { $regex: query.search, $options: 'i' } },
        { vendorName: { $regex: query.search, $options: 'i' } },
      ];
    }

    const [returns, total] = await Promise.all([
      PurchaseReturn.find(filter)
        .populate('vendorId', 'name vendorCode')
        .populate('createdBy', 'fullName email')
        .sort({ createdAt: -1 })
        .skip(pagination.skip)
        .limit(pagination.limit),
      PurchaseReturn.countDocuments(filter),
    ]);

    return buildPaginatedResponse(returns, total, pagination.page, pagination.limit);
  }

  static async getById(id: string) {
    const pr = await PurchaseReturn.findById(id)
      .populate('vendorId')
      .populate('items.batchId')
      .populate('items.productId', 'name sku');
    if (!pr) throw errors.notFound('Purchase Return');
    return pr;
  }

  static async create(data: { vendorId: string; items: any[]; notes?: string }, userId: string) {
    if (!data.items?.length) {
      throw errors.validation('At least one item is required');
    }

    const vendor = await Vendor.findById(data.vendorId);
    if (!vendor) throw errors.notFound('Vendor');
    if (vendor.status !== 'active') {
      throw errors.validation('Vendor must be active');
    }

    const productIds = [...new Set(data.items.map((i: any) => i.productId?.toString()).filter(Boolean))];
    const products = await Product.find({ _id: { $in: productIds } }).select('variants');
    const pcsPerUnitMap = new Map<string, number>();
    for (const p of products) {
      for (const v of (p.variants as any[]) || []) {
        pcsPerUnitMap.set(`${p._id}:${v._id}`, Math.max(1, v.salesUom?.pcsPerUnit || 1));
      }
    }

    const items = data.items.map((item: any) => {
      const batchId = item.batchId;
      const batchNumber = (item.batchNumber || '').toString().trim();
      const expiryDate = item.expiryDate ? new Date(item.expiryDate) : null;
      if (!batchId) throw errors.validation(`Batch is required for ${item.productName || 'item'}`);
      if (!batchNumber) throw errors.validation(`Batch number is required for ${item.productName || 'item'}`);
      if (!expiryDate || isNaN(expiryDate.getTime())) {
        throw errors.validation(`Valid expiry date is required for ${item.productName || 'item'}`);
      }
      const returnUom = (item.returnUom || 'unit') as 'unit' | 'pcs';
      return {
        ...item,
        batchId: new Types.ObjectId(batchId),
        batchNumber,
        expiryDate,
        returnUom,
      };
    });

    const returnNumber = await NumberingService.getNextCode('purchase_return');

    const pr = new PurchaseReturn({
      returnNumber,
      vendorId: data.vendorId,
      vendorName: vendor.name,
      vendorCode: vendor.vendorCode,
      status: 'draft',
      items,
      notes: data.notes,
      createdBy: userId,
      updatedBy: userId,
    });
    await pr.save();
    return pr;
  }

  static async update(id: string, data: { items?: any[]; notes?: string }, userId: string) {
    const pr = await PurchaseReturn.findById(id);
    if (!pr) throw errors.notFound('Purchase Return');
    if (pr.status !== 'draft') {
      throw errors.validation('Can only update draft purchase returns');
    }

    if (data.items?.length) {
      const items = data.items.map((item: any) => {
        const batchId = item.batchId;
        const batchNumber = (item.batchNumber || '').toString().trim();
        const expiryDate = item.expiryDate ? new Date(item.expiryDate) : null;
        if (!batchId) throw errors.validation(`Batch is required for ${item.productName || 'item'}`);
        if (!batchNumber) throw errors.validation(`Batch number is required for ${item.productName || 'item'}`);
        if (!expiryDate || isNaN(expiryDate.getTime())) {
          throw errors.validation(`Valid expiry date is required for ${item.productName || 'item'}`);
        }
        return {
          ...item,
          batchId: new Types.ObjectId(batchId),
          batchNumber,
          expiryDate,
          returnUom: item.returnUom || 'unit',
        };
      });
      pr.items = items;
    }
    if (data.notes !== undefined) pr.notes = data.notes;
    (pr as any).updatedBy = userId;
    await pr.save();
    return pr;
  }

  static async delete(id: string, _userId: string) {
    const pr = await PurchaseReturn.findById(id);
    if (!pr) throw errors.notFound('Purchase Return');
    if (pr.status !== 'draft') {
      throw errors.validation('Can only delete draft purchase returns');
    }
    await PurchaseReturn.findByIdAndDelete(id);
  }

  static async submit(id: string, userId: string) {
    const pr = await PurchaseReturn.findById(id);
    if (!pr) throw errors.notFound('Purchase Return');
    if (pr.status !== 'draft') {
      throw errors.validation('Can only submit draft purchase returns');
    }

    const approvalConfig = await getPRApprovalConfig();
    const approverRoles = resolveApproverRoles(
      approvalConfig?.levels?.map((l: any) => l.approverRole).filter(Boolean)
    );

    // Always require approval before inventory deduction
    pr.status = 'pending_approval';
    pr.submittedAt = new Date();
    (pr as any).approval = {
      required: true,
      status: 'pending',
      approverRoles,
      submittedAt: new Date(),
      decisions: [],
    };
    (pr as any).updatedBy = userId;
    await pr.save();

    return pr;
  }

  static async approve(id: string, userId: string, userRole: string, notes?: string) {
    const pr = await PurchaseReturn.findById(id);
    if (!pr) throw errors.notFound('Purchase Return');
    if (!pr.approval?.required || pr.approval.status !== 'pending') {
      throw errors.validation('Purchase Return does not have a pending approval');
    }

    const approverRoles = resolveApproverRoles(pr.approval.approverRoles as any);
    if (!approverRoles.includes(userRole as UserRole)) {
      throw errors.forbidden('approve this purchase return');
    }

    const decisions = pr.approval.decisions || [];
    const alreadyDecided = decisions.some((d: any) => d.approverId?.toString() === userId);
    if (alreadyDecided) throw errors.validation('You have already submitted a decision');

    decisions.push({
      approverId: new Types.ObjectId(userId),
      approverRole: userRole,
      decision: 'approved',
      notes,
      decidedAt: new Date(),
    });
    pr.approval.decisions = decisions;
    pr.approval.status = 'approved';
    pr.approval.approvedAt = new Date();
    (pr.approval as any).approvedBy = userId;
    pr.approval.decisionNotes = notes;
    pr.status = 'approved';
    (pr as any).updatedBy = userId;
    await pr.save();

    await this.deductInventory(id, userId);
    return pr;
  }

  static async reject(id: string, userId: string, userRole: string, notes: string) {
    const pr = await PurchaseReturn.findById(id);
    if (!pr) throw errors.notFound('Purchase Return');
    if (!pr.approval?.required || pr.approval.status !== 'pending') {
      throw errors.validation('Purchase Return does not have a pending approval');
    }

    const approverRoles = resolveApproverRoles(pr.approval.approverRoles as any);
    if (!approverRoles.includes(userRole as UserRole)) {
      throw errors.forbidden('reject this purchase return');
    }

    const decisions = pr.approval.decisions || [];
    const alreadyDecided = decisions.some((d: any) => d.approverId?.toString() === userId);
    if (alreadyDecided) throw errors.validation('You have already submitted a decision');

    decisions.push({
      approverId: new Types.ObjectId(userId),
      approverRole: userRole,
      decision: 'rejected',
      notes,
      decidedAt: new Date(),
    });
    pr.approval.decisions = decisions;
    pr.approval.status = 'rejected';
    pr.approval.rejectedAt = new Date();
    (pr.approval as any).rejectedBy = userId;
    pr.approval.decisionNotes = notes;
    pr.status = 'rejected';
    (pr as any).updatedBy = userId;
    await pr.save();
    return pr;
  }

  private static async deductInventory(prId: string, userId: string) {
    const pr = await PurchaseReturn.findById(prId);
    if (!pr) throw errors.notFound('Purchase Return');
    if (pr.status !== 'approved') {
      throw errors.validation('Purchase return must be approved before deducting inventory');
    }

    const products = await Product.find({
      _id: { $in: [...new Set(pr.items.map((i: any) => i.productId?.toString()))] },
    }).select('variants');
    const pcsPerUnitMap = new Map<string, number>();
    for (const p of products) {
      for (const v of (p.variants as any[]) || []) {
        pcsPerUnitMap.set(`${p._id}:${v._id}`, Math.max(1, v.salesUom?.pcsPerUnit || 1));
      }
    }

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      for (const item of pr.items) {
        const returnUom = (item as any).returnUom || 'unit';
        const ppu = pcsPerUnitMap.get(`${item.productId}:${item.variantId}`) || 1;
        const quantityInPieces = returnUom === 'pcs'
          ? Math.round(item.quantity)
          : Math.round(item.quantity * ppu);

        const batchIdStr = (item as any).batchId?._id
          ? (item as any).batchId._id.toString()
          : ((item as any).batchId?.toString?.() || (item as any).batchId);
        await StockBatchService.deductFromBatchForPurchaseReturn(
          batchIdStr,
          quantityInPieces,
          pr._id as Types.ObjectId,
          pr.returnNumber,
          userId,
          session
        );
      }

      pr.status = 'completed';
      (pr as any).updatedBy = userId;
      await pr.save({ session });

      await session.commitTransaction();
      return pr;
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  static async getPendingApprovals(pagination: { page: number; limit: number; skip: number }) {
    const filter = { status: 'pending_approval' };
    const [returns, total] = await Promise.all([
      PurchaseReturn.find(filter)
        .populate('vendorId', 'name vendorCode')
        .populate('createdBy', 'fullName email')
        .sort({ 'approval.submittedAt': -1 })
        .skip(pagination.skip)
        .limit(pagination.limit),
      PurchaseReturn.countDocuments(filter),
    ]);
    return buildPaginatedResponse(returns, total, pagination.page, pagination.limit);
  }
}
