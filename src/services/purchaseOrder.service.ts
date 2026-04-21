import mongoose, { Types } from 'mongoose';
import PurchaseOrder from '../models/PurchaseOrder';
import Product from '../models/Product';
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

function idsEqual(a: unknown, b: unknown): boolean {
  if (a == null || b == null) return false;
  try {
    return new mongoose.Types.ObjectId(String(a)).equals(new mongoose.Types.ObjectId(String(b)));
  } catch {
    return String(a) === String(b);
  }
}

/** Set pcsPerUnit + unitLabel from catalog when the variant has a pack size; otherwise leave unset. */
async function enrichPurchaseOrderItemsWithPcsPerUnit(items: any[]): Promise<void> {
  if (!items?.length) return;
  const rawIds = items
    .map((i: any) => String(i.productId?._id || i.productId || ''))
    .filter((id: string) => id && Types.ObjectId.isValid(id));
  const productIds = [...new Set(rawIds)].map((id) => new Types.ObjectId(id));
  if (!productIds.length) return;

  const products = await Product.find({ _id: { $in: productIds } }).select('variants').lean();
  const productById = new Map(products.map((p: any) => [String(p._id), p]));

  const pickVariant = (item: any, variants: any[]): any | undefined => {
    if (!variants?.length) return undefined;
    const vid = item.variantId?._id ?? item.variantId;
    let v = variants.find((x: any) => idsEqual(x._id, vid));
    if (!v && item.variantSku) v = variants.find((x: any) => String(x.variantSku) === String(item.variantSku));
    if (!v && item.sku) v = variants.find((x: any) => String(x.variantSku) === String(item.sku));
    return v;
  };

  const applyVariantPack = (item: any, v: any) => {
    const ppu = v?.salesUom?.pcsPerUnit != null ? Number(v.salesUom.pcsPerUnit) : 0;
    if (ppu > 0) {
      item.pcsPerUnit = Math.floor(ppu);
      item.unitLabel = String(v.salesUom?.unitLabel || 'unit').trim() || 'unit';
    } else {
      delete item.pcsPerUnit;
      delete item.unitLabel;
    }
  };

  for (const item of items) {
    const pid = String(item.productId?._id || item.productId || '');
    const pdoc = productById.get(pid);
    let v = pickVariant(item, (pdoc?.variants || []) as any[]);
    if (!v && Array.isArray((item.productId as any)?.variants)) {
      v = pickVariant(item, (item.productId as any).variants);
    }
    if (v) applyVariantPack(item, v);
    else {
      delete item.pcsPerUnit;
      delete item.unitLabel;
    }
  }

  const stillMissing = items.filter((i: any) => !(Number(i.pcsPerUnit) > 0));
  if (stillMissing.length) {
    const variantIds = [
      ...new Set(
        stillMissing
          .map((i: any) => i.variantId?._id ?? i.variantId)
          .filter((id: any) => id != null && Types.ObjectId.isValid(String(id)))
          .map((id: any) => new Types.ObjectId(String(id)))
      ),
    ];
    if (variantIds.length) {
      const byVariant = await Product.find({ 'variants._id': { $in: variantIds } }).select('variants').lean();
      for (const p of byVariant) {
        for (const v of (p as any).variants || []) {
          if (!v?.salesUom?.pcsPerUnit || !(Number(v.salesUom.pcsPerUnit) > 0)) continue;
          for (const item of stillMissing) {
            if (idsEqual(v._id, item.variantId?._id ?? item.variantId)) {
              applyVariantPack(item, v);
            }
          }
        }
      }
    }
  }

  /** Prefer pack from populated `productId.variants` (same source as product UI) so PO lines never lag master after edits. */
  for (const item of items) {
    const emb = (item.productId as any)?.variants;
    if (!Array.isArray(emb) || !emb.length) continue;
    const v = pickVariant(item, emb as any[]);
    if (v) applyVariantPack(item, v);
  }

  /** When catalog pack is known, derive integer pieces from stored unit progress for consistent PO display. */
  for (const item of items) {
    const ppu = Number(item.pcsPerUnit);
    if (!(ppu > 0)) continue;
    if (item.receivedPieces != null && item.receivedPieces !== undefined) continue;
    const rq = Number(item.receivedQuantity);
    if (!(rq > 0)) continue;
    const qu = (item.quantityUom || 'unit') as string;
    if (qu === 'pcs') {
      item.receivedPieces = Math.round(rq);
    } else {
      item.receivedPieces = Math.round(rq * ppu);
    }
  }
}

/**
 * API-only fields: split received stock into whole units + loose pcs from catalog pack.
 * Uses `receivedPieces` when set, else derives from `receivedQuantity` × `pcsPerUnit` (unit lines) or `receivedQuantity` (pcs lines).
 */
function attachReceivedBreakdown(items: any[]): void {
  if (!items?.length) return;
  for (const item of items) {
    delete item.receivedBreakdown;
    const uom = (item.quantityUom || 'unit') as string;
    const rq = Number(item.receivedQuantity) || 0;
    const ppuRaw = Math.floor(Number(item.pcsPerUnit) || 0);
    const pack = Math.max(1, ppuRaw);
    const unitLabel = String(item.unitLabel || 'unit').trim() || 'unit';

    let totalPcs: number | null = null;
    if (item.receivedPieces != null && item.receivedPieces !== undefined && Number.isFinite(Number(item.receivedPieces))) {
      totalPcs = Math.max(0, Math.round(Number(item.receivedPieces)));
    } else if (uom === 'pcs') {
      if (rq > 0) totalPcs = Math.max(0, Math.round(rq));
    } else if (ppuRaw > 0 && rq > 0) {
      totalPcs = Math.max(0, Math.round(rq * pack));
    }

    if (totalPcs == null) {
      if (rq <= 0) {
        item.receivedBreakdown = {
          wholeUnits: 0,
          loosePcs: 0,
          pcsPerUnit: pack,
          totalPcs: 0,
          unitLabel,
        };
      }
      continue;
    }

    if (uom === 'pcs') {
      item.receivedBreakdown = {
        wholeUnits: 0,
        loosePcs: totalPcs,
        pcsPerUnit: pack,
        totalPcs,
        unitLabel: unitLabel === 'unit' ? 'pcs' : unitLabel,
      };
      continue;
    }

    if (ppuRaw <= 0) {
      item.receivedBreakdown = {
        wholeUnits: totalPcs,
        loosePcs: 0,
        pcsPerUnit: 1,
        totalPcs,
        unitLabel,
      };
      continue;
    }

    const wholeUnits = Math.floor(totalPcs / pack);
    const loosePcs = totalPcs % pack;
    item.receivedBreakdown = {
      wholeUnits,
      loosePcs,
      pcsPerUnit: pack,
      totalPcs,
      unitLabel,
    };
  }
}

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
      .populate('items.productId', 'name sku variants');
    if (!po) throw errors.notFound('Purchase Order');
    const plain = po.toObject({ flattenMaps: true }) as any;
    await enrichPurchaseOrderItemsWithPcsPerUnit(plain.items || []);
    attachReceivedBreakdown(plain.items || []);
    return plain;
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
          receivedPieces: 0,
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
      receivedPieces: 0,
      taxAmount: 0,
      lineTotal: 0,
    }));
    await enrichPurchaseOrderItemsWithPcsPerUnit(enrichedItems);

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
        receivedPieces: item.receivedPieces ?? 0,
        unitPrice: 0,
        taxRate: 0,
        taxAmount: 0,
        lineTotal: 0,
      }));
      await enrichPurchaseOrderItemsWithPcsPerUnit(enrichedItems);
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
