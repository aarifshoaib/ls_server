import { Types } from 'mongoose';
import Requisition from '../models/Requisition';
import Product from '../models/Product';
import ApprovalConfig from '../models/ApprovalConfig';
import { errors } from '../utils/errors';
import { buildPaginatedResponse, generateCode } from '../utils/helpers';
import { UserRole } from '../types';

const DEFAULT_REQUISITION_APPROVER_ROLES: UserRole[] = ['accountant', 'admin', 'super_admin', 'hod'];

const getRequisitionApprovalConfig = async () => {
  return ApprovalConfig.findOne({
    type: 'custom',
    isActive: true,
    $or: [
      { name: 'requisition_approval' },
      { 'metadata.module': 'requisitions' },
    ],
  }).lean();
};

const resolveApproverRoles = (fromConfig?: string[]): UserRole[] => {
  const allowed = new Set(DEFAULT_REQUISITION_APPROVER_ROLES);
  if (fromConfig?.length) {
    return [...new Set(fromConfig)].filter((r): r is UserRole => allowed.has(r as UserRole));
  }
  return DEFAULT_REQUISITION_APPROVER_ROLES;
};

export class RequisitionService {
  static async getAll(query: Record<string, unknown>, pagination: { page: number; limit: number; skip: number }) {
    const filter: Record<string, unknown> = {};
    if (query.status) filter.status = query.status;
    if (query.search) {
      filter.$or = [
        { requisitionNumber: { $regex: query.search, $options: 'i' } },
      ];
    }

    const [requisitions, total] = await Promise.all([
      Requisition.find(filter)
        .populate('requestedBy', 'fullName email')
        .populate('createdBy', 'fullName email')
        .sort({ createdAt: -1 })
        .skip(pagination.skip)
        .limit(pagination.limit),
      Requisition.countDocuments(filter),
    ]);

    return buildPaginatedResponse(requisitions, total, pagination.page, pagination.limit);
  }

  static async getById(id: string) {
    const requisition = await Requisition.findById(id)
      .populate('requestedBy', 'fullName email')
      .populate('items.productId', 'name sku');
    if (!requisition) throw errors.notFound('Requisition');
    return requisition;
  }

  static async create(data: { items: any[] }, userId: string) {
    const count = await Requisition.countDocuments();
    const requisitionNumber = generateCode('REQ', count + 1, 6);

    const itemsWithDetails = await this.enrichItems(data.items);

    const requisition = new Requisition({
      requisitionNumber,
      status: 'draft',
      items: itemsWithDetails,
      requestedBy: userId,
      createdBy: userId,
      updatedBy: userId,
    });
    await requisition.save();
    return requisition;
  }

  static async update(id: string, data: { items?: any[] }, userId: string) {
    const requisition = await Requisition.findById(id);
    if (!requisition) throw errors.notFound('Requisition');
    if (requisition.status !== 'draft') {
      throw errors.validation('Can only update draft requisitions');
    }

    if (data.items) {
      requisition.items = await this.enrichItems(data.items);
    }
    (requisition as any).updatedBy = userId;
    await requisition.save();
    return requisition;
  }

  static async submit(id: string, userId: string) {
    const requisition = await Requisition.findById(id);
    if (!requisition) throw errors.notFound('Requisition');
    if (requisition.status !== 'draft') {
      throw errors.validation('Can only submit draft requisitions');
    }
    if (!requisition.items?.length) {
      throw errors.validation('Add at least one item before submitting');
    }

    const approvalConfig = await getRequisitionApprovalConfig();
    const approvalRequired = !!approvalConfig?.isActive;
    const approverRoles = resolveApproverRoles(
      approvalConfig?.levels?.map((l: any) => l.approverRole).filter(Boolean)
    );

    requisition.status = approvalRequired ? 'pending_approval' : 'approved';
    requisition.submittedAt = new Date();
    if (approvalRequired) {
      requisition.approval = {
        required: true,
        status: 'pending',
        approverRoles,
        submittedAt: new Date(),
        decisions: [],
      } as any;
    } else {
      requisition.approval = {
        required: false,
        status: 'not_required',
        approverRoles: [],
        decisions: [],
      } as any;
    }
    (requisition as any).updatedBy = userId;
    await requisition.save();
    return requisition;
  }

  static async approve(id: string, userId: string, userRole: string, notes?: string) {
    const requisition = await Requisition.findById(id);
    if (!requisition) throw errors.notFound('Requisition');
    if (!requisition.approval?.required || requisition.approval.status !== 'pending') {
      throw errors.validation('Requisition does not have a pending approval');
    }

    const approverRoles = resolveApproverRoles(requisition.approval.approverRoles as any);
    if (!approverRoles.includes(userRole as UserRole)) {
      throw errors.forbidden('approve this requisition');
    }

    const decisions = requisition.approval.decisions || [];
    const alreadyDecided = decisions.some((d: any) => d.approverId?.toString() === userId);
    if (alreadyDecided) {
      throw errors.validation('You have already submitted a decision');
    }

    decisions.push({
      approverId: new Types.ObjectId(userId),
      approverRole: userRole,
      decision: 'approved',
      notes,
      decidedAt: new Date(),
    });
    requisition.approval.decisions = decisions;
    requisition.approval.status = 'approved';
    requisition.approval.approvedAt = new Date();
    (requisition.approval as any).approvedBy = userId;
    requisition.approval.decisionNotes = notes;
    requisition.status = 'approved';
    (requisition as any).updatedBy = userId;
    await requisition.save();
    return requisition;
  }

  static async reject(id: string, userId: string, userRole: string, notes: string) {
    const requisition = await Requisition.findById(id);
    if (!requisition) throw errors.notFound('Requisition');
    if (!requisition.approval?.required || requisition.approval.status !== 'pending') {
      throw errors.validation('Requisition does not have a pending approval');
    }

    const approverRoles = resolveApproverRoles(requisition.approval.approverRoles as any);
    if (!approverRoles.includes(userRole as UserRole)) {
      throw errors.forbidden('reject this requisition');
    }

    const decisions = requisition.approval.decisions || [];
    const alreadyDecided = decisions.some((d: any) => d.approverId?.toString() === userId);
    if (alreadyDecided) {
      throw errors.validation('You have already submitted a decision');
    }

    decisions.push({
      approverId: new Types.ObjectId(userId),
      approverRole: userRole,
      decision: 'rejected',
      notes,
      decidedAt: new Date(),
    });
    requisition.approval.decisions = decisions;
    requisition.approval.status = 'rejected';
    requisition.approval.rejectedAt = new Date();
    (requisition.approval as any).rejectedBy = userId;
    requisition.approval.decisionNotes = notes;
    requisition.status = 'rejected';
    (requisition as any).updatedBy = userId;
    await requisition.save();
    return requisition;
  }

  static async getPendingApprovals(pagination: { page: number; limit: number; skip: number }) {
    const filter = {
      status: 'pending_approval',
      'approval.required': true,
      'approval.status': 'pending',
    };
    const [requisitions, total] = await Promise.all([
      Requisition.find(filter)
        .populate('requestedBy', 'fullName email')
        .populate('createdBy', 'fullName email')
        .sort({ submittedAt: -1 })
        .skip(pagination.skip)
        .limit(pagination.limit),
      Requisition.countDocuments(filter),
    ]);
    return buildPaginatedResponse(requisitions, total, pagination.page, pagination.limit);
  }

  private static async enrichItems(items: any[]) {
    const enriched = [];
    for (const item of items) {
      const product = await Product.findById(item.productId).select('name sku variants');
      if (!product) throw errors.notFound(`Product ${item.productId}`);
      const variant = (product.variants as any).id(item.variantId);
      if (!variant) throw errors.notFound(`Variant ${item.variantId}`);
      enriched.push({
        productId: item.productId,
        variantId: item.variantId,
        sku: variant.variantSku,
        variantSku: variant.variantSku,
        productName: product.name,
        variantName: variant.name,
        displaySize: variant.displaySize,
        quantity: item.quantity,
        reason: item.reason,
      });
    }
    return enriched;
  }
}
