import mongoose, { Types } from 'mongoose';
import PurchaseInvoice from '../models/PurchaseInvoice';
import PurchaseOrder from '../models/PurchaseOrder';
import Vendor from '../models/Vendor';
import Product from '../models/Product';
import StockBatch from '../models/StockBatch';
import ApprovalConfig from '../models/ApprovalConfig';
import { StockBatchService } from './stockBatch.service';
import { errors } from '../utils/errors';
import { buildPaginatedResponse } from '../utils/helpers';
import { NumberingService } from '../services/numbering.service';
import { UserRole } from '../types';

const DEFAULT_PI_APPROVER_ROLES: UserRole[] = ['accountant', 'admin', 'super_admin', 'hod'];

/** PO lines often store taxRate 0 when unset; PI uses 5% unless a positive rate is supplied. */
const resolvePurchaseInvoiceLineTaxPercent = (rate: unknown): number => {
  const n = Number(rate);
  if (Number.isFinite(n) && n > 0) return n;
  return 5;
};

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

/** Same product + variant + batch on one invoice must use one expiry (matches StockBatch.receive rules). */
function validatePiItemsIntraInvoiceBatchExpiry(items: any[]): void {
  const byKey = new Map<string, string>();
  for (const item of items) {
    const batchNumber = (item.batchNumber || '').toString().trim();
    if (!batchNumber) continue;
    const pid = item.productId?.toString?.() ?? String(item.productId);
    const vid = item.variantId?.toString?.() ?? String(item.variantId);
    if (!pid || !vid) continue;
    const expiryDate = item.expiryDate ? new Date(item.expiryDate) : null;
    if (!expiryDate || isNaN(expiryDate.getTime())) continue;
    const day = expiryDate.toISOString().split('T')[0];
    const key = `${pid}:${vid}:${batchNumber}`;
    const prev = byKey.get(key);
    if (prev && prev !== day) {
      const name = item.productName || 'item';
      throw errors.validation(
        `Batch ${batchNumber} for ${name} is used more than once on this invoice with different expiry dates (${prev} vs ${day}). Use the same expiry for that batch on every line, or use different batch numbers.`
      );
    }
    byKey.set(key, day);
  }
}

/** Same rules as inventory receive: intra-invoice batch/expiry, line fields, conflict with existing StockBatch. */
function quantityInPiecesForReceive(item: any, ppu: number): number {
  const receiveUom = (item as any).receiveUom || 'unit';
  const q = Number(item.quantity) || 0;
  const p = Math.max(1, ppu || 1);
  if (receiveUom === 'pcs') return Math.round(q);
  return Math.round(q * p);
}

function lineOrderedPiecesForPo(line: any, ppu: number): number {
  const uom = line.quantityUom || 'unit';
  const q = Number(line.quantity) || 0;
  const p = Math.max(1, ppu || 1);
  if (uom === 'pcs') return Math.max(0, Math.round(q));
  return Math.max(0, Math.round(q * p));
}

function lineReceivedPiecesForPo(line: any, ppu: number): number {
  if (line.receivedPieces != null && Number.isFinite(Number(line.receivedPieces))) {
    return Math.max(0, Math.round(Number(line.receivedPieces)));
  }
  const rq = Number(line.receivedQuantity) || 0;
  if ((line.quantityUom || 'unit') === 'pcs') return Math.max(0, Math.round(rq));
  return Math.max(0, Math.round(rq * Math.max(1, ppu || 1)));
}

/**
 * Recompute PO `receivedPieces` / `receivedQuantity` from the sum of all **received** PI lines
 * tied to this PO (`items.purchaseOrderId`). Keeps PO progress identical to posted invoices.
 */
async function reconcilePurchaseOrderReceiptsFromInvoices(
  poId: string,
  session: mongoose.ClientSession
): Promise<void> {
  let poOid: Types.ObjectId;
  try {
    poOid = new Types.ObjectId(String(poId));
  } catch {
    return;
  }

  const po = await PurchaseOrder.findById(poOid).session(session);
  if (!po) return;

  const invoices = await PurchaseInvoice.find({
    status: 'received',
    $or: [{ purchaseOrderIds: poOid }, { 'items.purchaseOrderId': poOid }],
  })
    .select('items')
    .session(session)
    .lean();

  const productIds = new Set<string>();
  for (const l of po.items as any[]) {
    const id = String(l.productId?._id ?? l.productId);
    if (id && Types.ObjectId.isValid(id)) productIds.add(id);
  }
  for (const inv of invoices as any[]) {
    for (const it of inv.items || []) {
      if (!it.purchaseOrderId || String(it.purchaseOrderId) !== String(poOid)) continue;
      const id = String(it.productId?._id ?? it.productId);
      if (id && Types.ObjectId.isValid(id)) productIds.add(id);
    }
  }

  if (!productIds.size) return;

  const products = await Product.find({ _id: { $in: [...productIds].map((id) => new Types.ObjectId(id)) } })
    .select('variants')
    .session(session)
    .lean();

  const pcsPerUnitMap = new Map<string, number>();
  for (const p of products as any[]) {
    for (const v of p.variants || []) {
      pcsPerUnitMap.set(`${String(p._id)}:${String(v._id)}`, Math.max(1, v.salesUom?.pcsPerUnit || 1));
    }
  }

  const totalsPieces = new Map<string, number>();
  for (const inv of invoices as any[]) {
    for (const it of inv.items || []) {
      if (!it.purchaseOrderId || String(it.purchaseOrderId) !== String(poOid)) continue;
      const pid = String(it.productId?._id ?? it.productId);
      const vid = String(it.variantId?._id ?? it.variantId);
      const ppu = pcsPerUnitMap.get(`${pid}:${vid}`) || 1;
      const pieces = quantityInPiecesForReceive(it, ppu);
      const key = `${pid}:${vid}`;
      totalsPieces.set(key, (totalsPieces.get(key) || 0) + pieces);
    }
  }

  for (const line of po.items as any[]) {
    const pid = String(line.productId?._id ?? line.productId);
    const vid = String(line.variantId?._id ?? line.variantId);
    const key = `${pid}:${vid}`;
    const ppu = pcsPerUnitMap.get(`${pid}:${vid}`) || 1;
    const totalPcs = Math.max(0, totalsPieces.get(key) || 0);
    line.receivedPieces = totalPcs;
    const lineUom = line.quantityUom || 'unit';
    if (lineUom === 'pcs') {
      line.receivedQuantity = totalPcs;
    } else {
      line.receivedQuantity = ppu > 0 ? totalPcs / ppu : totalPcs;
    }
  }

  const allReceived = (po.items as any[]).every((l: any) => {
    const pid = String(l.productId?._id ?? l.productId);
    const vid = String(l.variantId?._id ?? l.variantId);
    const ppuL = pcsPerUnitMap.get(`${pid}:${vid}`) || 1;
    return lineReceivedPiecesForPo(l, ppuL) >= lineOrderedPiecesForPo(l, ppuL);
  });
  po.status = allReceived ? 'received' : 'partially_received';
  po.markModified('items');
  await po.save({ session });
}

async function validatePiItemsForStockReceive(items: any[]): Promise<void> {
  if (!items?.length) {
    throw errors.validation('At least one item is required');
  }
  validatePiItemsIntraInvoiceBatchExpiry(items);
  for (const item of items) {
    const batchNumber = (item.batchNumber || '').toString().trim();
    const expiryDate = item.expiryDate ? new Date(item.expiryDate) : null;
    const name = item.productName || 'item';
    if (!batchNumber) {
      throw errors.validation(`Batch number is required for ${name}`);
    }
    if (!expiryDate || isNaN(expiryDate.getTime())) {
      throw errors.validation(`Valid expiry date is required for ${name}`);
    }
    const productId = item.productId;
    const variantId = item.variantId;
    if (!productId || !variantId) {
      throw errors.validation(`Product and variant are required for ${name}`);
    }
    const batch = await StockBatch.findOne({
      productId,
      variantId,
      batchNumber,
    });
    if (batch) {
      const existingExpiry = new Date(batch.expiryDate).toISOString().split('T')[0];
      const newExpiry = new Date(expiryDate).toISOString().split('T')[0];
      if (existingExpiry !== newExpiry) {
        throw errors.validation(
          `Batch ${batchNumber} already exists for this product/variant with expiry ${existingExpiry}. Use the same expiry date or a different batch number.`
        );
      }
    }
  }
}

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

    const invoiceNumber = await NumberingService.getNextCode('purchase_invoice');

    const productIds = [...new Set(data.items.map((i: any) => i.productId?.toString()).filter(Boolean))];
    const products = await Product.find({ _id: { $in: productIds } }).select('variants');
    const pcsPerUnitMap = new Map<string, number>();
    for (const p of products) {
      for (const v of (p.variants as any[]) || []) {
        const key = `${p._id}:${v._id}`;
        pcsPerUnitMap.set(key, Math.max(1, v.salesUom?.pcsPerUnit || 1));
      }
    }

    const items = data.items.map((item: any) => {
      const batchNumber = (item.batchNumber || '').toString().trim();
      const expiryDate = item.expiryDate ? new Date(item.expiryDate) : null;
      if (!batchNumber) {
        throw errors.validation(`Batch number is required for ${item.productName || 'item'}`);
      }
      if (!expiryDate || isNaN(expiryDate.getTime())) {
        throw errors.validation(`Valid expiry date is required for ${item.productName || 'item'}`);
      }
      const receiveUom = item.receiveUom || 'unit';
      const ppu = pcsPerUnitMap.get(`${item.productId}:${item.variantId}`) || 1;
      const qtyInUnits = receiveUom === 'pcs' ? (item.quantity || 0) / ppu : (item.quantity || 0);
      const unitPrice = item.unitPrice ?? 0;
      const taxRate = resolvePurchaseInvoiceLineTaxPercent(item.taxRate);
      const lineSubtotal = unitPrice * qtyInUnits;
      const taxAmount = (lineSubtotal * taxRate) / 100;
      const lineTotal = lineSubtotal + taxAmount;
      return {
        ...item,
        receiveUom,
        batchNumber,
        expiryDate,
        unitPrice,
        taxRate,
        taxAmount,
        lineTotal,
      };
    });

    await validatePiItemsForStockReceive(items);

    const subtotal = items.reduce((s: number, i: any) => {
      const receiveUom = i.receiveUom || 'unit';
      const ppu = pcsPerUnitMap.get(`${i.productId}:${i.variantId}`) || 1;
      const qtyInUnits = receiveUom === 'pcs' ? (i.quantity || 0) / ppu : (i.quantity || 0);
      return s + (i.unitPrice * qtyInUnits);
    }, 0);
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
      const productIds = [...new Set(data.items.map((i: any) => i.productId?.toString()).filter(Boolean))];
      const products = await Product.find({ _id: { $in: productIds } }).select('variants');
      const pcsPerUnitMap = new Map<string, number>();
      for (const p of products) {
        for (const v of (p.variants as any[]) || []) {
          pcsPerUnitMap.set(`${String(p._id)}:${String(v._id)}`, Math.max(1, v.salesUom?.pcsPerUnit || 1));
        }
      }
      const items = data.items.map((item: any) => {
        const batchNumber = (item.batchNumber || '').toString().trim();
        const expiryDate = item.expiryDate ? new Date(item.expiryDate) : null;
        if (!batchNumber) {
          throw errors.validation(`Batch number is required for ${item.productName || 'item'}`);
        }
        if (!expiryDate || isNaN(expiryDate.getTime())) {
          throw errors.validation(`Valid expiry date is required for ${item.productName || 'item'}`);
        }
        const receiveUom = item.receiveUom || 'unit';
        const ppu = pcsPerUnitMap.get(`${item.productId}:${item.variantId}`) || 1;
        const qtyInUnits = receiveUom === 'pcs' ? (item.quantity || 0) / ppu : (item.quantity || 0);
        const unitPrice = item.unitPrice ?? 0;
        const taxRate = resolvePurchaseInvoiceLineTaxPercent(item.taxRate);
        const lineSubtotal = unitPrice * qtyInUnits;
        const taxAmount = (lineSubtotal * taxRate) / 100;
        const lineTotal = lineSubtotal + taxAmount;
        return { ...item, receiveUom, batchNumber, expiryDate, unitPrice, taxRate, taxAmount, lineTotal };
      });
      await validatePiItemsForStockReceive(items);
      pi.items = items;
      pi.pricing = {
        subtotal: items.reduce((s: number, i: any) => {
          const receiveUom = i.receiveUom || 'unit';
          const ppu = pcsPerUnitMap.get(`${i.productId}:${i.variantId}`) || 1;
          const qtyInUnits = receiveUom === 'pcs' ? (i.quantity || 0) / ppu : (i.quantity || 0);
          return s + (i.unitPrice * qtyInUnits);
        }, 0),
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

    await validatePiItemsForStockReceive(pi.items as any[]);

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

    await validatePiItemsForStockReceive(pi.items as any[]);

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

    await validatePiItemsForStockReceive(pi.items as any[]);

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const affectedPoIds = new Set<string>();

      for (const item of pi.items) {
        const batchNumber = (item.batchNumber || '').toString().trim();
        const expiryDate = new Date(item.expiryDate);
        const receiveUom = (item as any).receiveUom || 'unit';

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
          session,
          receiveUom
        );

        if (item.purchaseOrderId) {
          affectedPoIds.add(String((item as any).purchaseOrderId?._id ?? item.purchaseOrderId));
        }
      }

      pi.status = 'received';
      pi.receivedAt = new Date();
      (pi as any).updatedBy = userId;
      await pi.save({ session });

      for (const poIdStr of affectedPoIds) {
        if (!poIdStr || !Types.ObjectId.isValid(poIdStr)) continue;
        await reconcilePurchaseOrderReceiptsFromInvoices(poIdStr, session);
      }

      await session.commitTransaction();
      return pi;
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  static async delete(id: string, _userId: string) {
    const pi = await PurchaseInvoice.findById(id);
    if (!pi) throw errors.notFound('Purchase Invoice');
    if (pi.status !== 'draft') {
      throw errors.validation('Can only delete draft Purchase Invoices');
    }
    await PurchaseInvoice.findByIdAndDelete(id);
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
