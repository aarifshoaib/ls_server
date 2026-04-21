import { Response, NextFunction } from 'express';
import { IAuthRequest } from '../types';
import Order from '../models/Order';
import Product from '../models/Product';
import Customer from '../models/Customer';
import CustomerLedger from '../models/CustomerLedger';
import ApprovalConfig from '../models/ApprovalConfig';
import { errors } from '../utils/errors';
import { parsePagination, buildPaginatedResponse, addDays } from '../utils/helpers';
import { ORDER_VAT_PERCENT } from '../utils/constants';
import {
  buildPricedOrderItems,
  buildFulfillmentReleaseFromParentScaled,
  enrichMissingUomFromProduct,
  rollupSubOrderPricingFromPricedSubset,
} from '../utils/orderPricing';
import { NumberingService } from '../services/numbering.service';
import { InventoryService } from '../services/inventory.service';
import { StockBatchService } from '../services/stockBatch.service';
import { PDFService } from '../services/pdf.service';
import mongoose from 'mongoose';
import { UserRole } from '../types';

const DEFAULT_ORDER_APPROVER_ROLES: UserRole[] = ['accountant', 'admin', 'super_admin', 'hod'];

const normalizeOrderApproverRoles = (roles: string[]): UserRole[] => {
  const allowed = new Set(DEFAULT_ORDER_APPROVER_ROLES);
  return [...new Set(roles)]
    .filter((role): role is UserRole => allowed.has(role as UserRole));
};

const resolveApproverRoles = (roles?: string[]): UserRole[] => {
  const normalized = normalizeOrderApproverRoles(roles || []);
  return normalized.length > 0 ? normalized : DEFAULT_ORDER_APPROVER_ROLES;
};

const getOrderApprovalConfig = async () => {
  return ApprovalConfig.findOne({
    type: 'custom',
    isActive: true,
    $or: [
      { name: 'order_creation_approval' },
      { 'metadata.module': 'orders' },
    ],
  }).lean();
};

/**
 * Posts customer ledger + outstanding for this order document (sales or fulfillment sub-order).
 * Returns debit amount posted, or 0 if skipped. Sub-orders use their own referenceId so partial
 * releases book AR; parent balanceDue is reduced separately when a sub posts.
 */
async function ensureOrderInvoiceReceivableRecorded(
  order: any,
  session: mongoose.ClientSession,
  userId: string
): Promise<number> {
  const outstanding = Number(order.balanceDue ?? order.pricing?.grandTotal ?? 0) || 0;
  if (outstanding <= 0) return 0;
  if (order.paymentStatus === 'paid' && (Number(order.paidAmount) || 0) >= outstanding) return 0;

  const existingLedger = await CustomerLedger.findOne({
    referenceType: 'order',
    referenceId: order._id,
    transactionType: 'invoice',
  }).session(session);

  if (existingLedger) return 0;

  const customer = await Customer.findById(order.customerId).session(session);
  if (!customer) return 0;

  const creditDays = order.creditInfo?.creditDays || customer.creditInfo?.creditTermDays || 30;
  const invoiceNumber = order.creditInfo?.invoiceNumber || `INV-${order.orderNumber}`;
  const balanceAfter = (customer.creditInfo?.currentOutstanding || 0) + outstanding;

  const isSub = order.isFulfillmentSubOrder === true;
  const description = isSub
    ? `Invoice for fulfillment ${order.orderNumber} (sales order ${order.sourceOrderNumber || ''})`
    : `Invoice for order ${order.orderNumber}`;

  const ledgerEntry = await CustomerLedger.create(
    [
      {
        customerId: customer._id,
        customerCode: customer.customerCode,
        transactionType: 'invoice',
        transactionDate: new Date(),
        referenceType: 'order',
        referenceId: order._id,
        referenceNumber: invoiceNumber,
        debitAmount: outstanding,
        creditAmount: 0,
        balanceAfter,
        invoiceDetails: {
          dueDate: addDays(new Date(), creditDays),
          paymentTerms: `${creditDays} days`,
          isPaid: false,
          paidAmount: 0,
          isOverdue: false,
          daysOverdue: 0,
        },
        description,
        createdBy: userId as any,
        updatedBy: userId as any,
      },
    ],
    { session }
  );

  customer.creditInfo.currentOutstanding = balanceAfter;
  customer.creditInfo.availableCredit = (customer.creditInfo.creditLimit || 0) - balanceAfter;
  customer.financialSummary.totalOutstanding =
    (customer.financialSummary.totalOutstanding || 0) + outstanding;
  customer.financialSummary.totalOrderValue =
    (customer.financialSummary.totalOrderValue || 0) + (order.pricing?.grandTotal || 0);
  if (!isSub) {
    customer.financialSummary.totalOrders = (customer.financialSummary.totalOrders || 0) + 1;
  }
  customer.financialSummary.lastOrderDate = new Date();

  order.creditInfo = {
    ...(order.creditInfo || { isCreditSale: false, creditDays }),
    dueDate: addDays(new Date(), creditDays),
    invoiceNumber,
    ledgerEntryId: ledgerEntry[0]._id,
  } as any;

  await customer.save({ session });
  return outstanding;
}

/** Mutates parent sales order in memory so the next save persists reduced balanceDue (avoids stale overwrite). */
function reduceParentBalanceDueInMemory(parent: any, amountPosted: number): void {
  if (!amountPosted || !parent) return;
  const prev =
    parent.balanceDue != null && parent.balanceDue !== undefined
      ? Number(parent.balanceDue)
      : Number(parent.pricing?.grandTotal) || 0;
  parent.balanceDue = Math.max(0, Math.round((prev - amountPosted) * 100) / 100);
}

function clonePlain<T>(v: T): T {
  if (v == null) return v;
  return JSON.parse(JSON.stringify(v)) as T;
}

function piecesForOrderLineQty(line: any, qty: number): number {
  const sellBy = line.sellBy || 'unit';
  const ppu = Math.max(1, Number(line.pcsPerUnit) || 1);
  if (sellBy === 'unit') return Math.round(Number(qty) * ppu);
  return Math.round(Number(qty));
}

function buildBatchSelectionsFromRelease(
  order: any,
  release: Array<{ itemIndex: number; quantity: number; batchId?: string }>
): Array<{ productId: any; variantId: any; allocations: Array<{ batchId: any; quantity: number }> }> {
  const map = new Map<
    string,
    { productId: any; variantId: any; allocations: Array<{ batchId: any; quantity: number }> }
  >();
  for (const r of release) {
    if (r.quantity <= 0 || !r.batchId) continue;
    const line = order.items[r.itemIndex];
    if (!line) continue;
    const pid = line.productId?.toString?.() || line.productId;
    const vid = line.variantId?.toString?.() || line.variantId;
    const k = `${pid}:${vid}`;
    const pcs = piecesForOrderLineQty(line, r.quantity);
    const cur = map.get(k) || { productId: line.productId, variantId: line.variantId, allocations: [] };
    const ix = cur.allocations.findIndex((a) => String(a.batchId) === String(r.batchId));
    if (ix >= 0) cur.allocations[ix].quantity += pcs;
    else cur.allocations.push({ batchId: r.batchId, quantity: pcs });
    map.set(k, cur);
  }
  return Array.from(map.values());
}

/** Operational copy for invoiced → delivered; stock and receivables stay on the parent sales order. */
async function createFulfillmentSubOrderDocument(
  parent: any,
  pricedReleaseItems: any[],
  orderPricing: any,
  batchSelections: any[] | undefined,
  session: mongoose.ClientSession,
  userId: string
) {
  const parentId = parent._id;
  const last = await Order.findOne({ sourceOrderId: parentId, isDeleted: false })
    .sort({ subOrderSequence: -1 })
    .select('subOrderSequence')
    .session(session)
    .lean();
  const seq = ((last as { subOrderSequence?: number } | null)?.subOrderSequence ?? 0) + 1;
  const orderNumber = `${parent.orderNumber}-${seq}`;

  const stripItem = (it: any) => {
    const o = it.toObject ? it.toObject() : { ...it };
    delete o._id;
    delete o.inventoryTransactionId;
    o.inventoryDeducted = true;
    const q = Number(o.quantity) || 0;
    // Entire line on a fulfillment doc is this release; avoid "Released 0 / Remaining N" on detail UI.
    o.releasedQuantity = q;
    return o;
  };

  const pricingClone = orderPricing ? clonePlain(orderPricing) : clonePlain(parent.pricing);
  const subGrandTotal = Number(pricingClone?.grandTotal) || 0;
  const bill = parent.billingAddress?.toObject?.() ?? parent.billingAddress;
  const ship = parent.shippingAddress?.toObject?.() ?? parent.shippingAddress;
  const parentCredit = parent.creditInfo?.toObject?.() ?? parent.creditInfo;
  const parentPm = String(parent.paymentMethod || '').toLowerCase();
  const childCreditInfo =
    parentPm === 'credit'
      ? {
          isCreditSale: true,
          creditDays: parentCredit?.creditDays || 30,
        }
      : undefined;

  const child = new Order({
    orderNumber,
    customerId: parent.customerId,
    customerCode: parent.customerCode,
    customerName: parent.customerName,
    customerEmail: parent.customerEmail,
    customerPhone: parent.customerPhone,
    orderType: parent.orderType || 'sales',
    orderSource: parent.orderSource || 'web',
    billingAddress: bill,
    shippingAddress: ship,
    items: pricedReleaseItems.map(stripItem),
    pricing: pricingClone,
    paymentStatus: 'pending',
    paymentMethod: parent.paymentMethod,
    paidAmount: 0,
    balanceDue: subGrandTotal,
    returnCreditAmount: 0,
    payments: [],
    creditInfo: childCreditInfo,
    status: 'confirmed',
    statusHistory: [
      {
        status: 'confirmed',
        timestamp: new Date(),
        updatedBy: userId as any,
        notes: `Fulfillment sub-order of ${parent.orderNumber}`,
      },
    ],
    approval: { required: false, status: 'not_required', approverRoles: [], decisions: [] },
    fulfillment: {},
    tags: Array.isArray(parent.tags) ? [...parent.tags] : [],
    linkedOrders: [],
    batchSelections: batchSelections?.length ? clonePlain(batchSelections) : [],
    sourceOrderId: parentId,
    sourceOrderNumber: parent.orderNumber,
    subOrderSequence: seq,
    isFulfillmentSubOrder: true,
    assignedTo: parent.assignedTo,
    notes: `Sub-order of ${parent.orderNumber}. Use Update status for invoicing through delivery (stock on parent).`,
    createdBy: userId as any,
    updatedBy: userId as any,
  });
  await child.save({ session });

  // Book customer receivable when the fulfillment sub-order is created (any payment method with balance due).
  // Credit lines need this for limit checks at release; COD etc. need it so customer outstanding is not stuck
  // at zero if the sub-order never goes through invoiced/delivered separately. invoiced/delivered later no-ops
  // when a ledger row for this order already exists.
  const posted = await ensureOrderInvoiceReceivableRecorded(child, session, userId);
  if (posted > 0) {
    reduceParentBalanceDueInMemory(parent, posted);
    await child.save({ session });
  }

  return child;
}

export class OrderController {
  static async getAll(req: IAuthRequest, res: Response, next: NextFunction) {
    try {
      const { page, limit, skip } = parsePagination(req.query);
      const filter: any = { isDeleted: false };

      if (req.query.includeSubOrders !== 'true') {
        filter.isFulfillmentSubOrder = { $ne: true };
      }

      if (req.query.status) {
        filter.status = req.query.status;
      }

      if (req.query.customerId) {
        filter.customerId = req.query.customerId;
      }

      const [orders, total] = await Promise.all([
        Order.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit)
          .populate('customerId', 'name customerCode')
          .populate('createdBy', 'fullName role'),
        Order.countDocuments(filter),
      ]);

      const result = buildPaginatedResponse(orders, total, page, limit);

      res.json({ success: true, ...result });
    } catch (error) {
      next(error);
    }
  }

  static async getById(req: IAuthRequest, res: Response, next: NextFunction) {
    try {
      const order = await Order.findById(req.params.id)
        .populate('customerId')
        .populate('statusHistory.updatedBy', 'fullName');

      if (!order) {
        throw errors.notFound('Order');
      }

      const orderObj = order.toObject ? order.toObject() : order;
      if (orderObj.items?.length) {
        const productIds = [...new Set(orderObj.items.map((i: any) => i.productId?.toString()).filter(Boolean))];
        const products = await Product.find({ _id: { $in: productIds } }).select('sku variants');
        const productMap = new Map(products.map((p: any) => [p._id.toString(), p]));

        orderObj.items = orderObj.items.map((item: any) => {
          const prod = productMap.get(item.productId?.toString?.() || item.productId);
          const vid = item.variantId?.toString?.() || item.variantId;
          const variant = prod?.variants?.find((v: any) => (v._id?.toString?.() || v._id) === vid);
          return {
            ...item,
            barcode: item.barcode ?? variant?.barcode ?? null,
            productCode: item.productCode ?? variant?.itemCode ?? prod?.sku ?? null,
          };
        });
      }

      res.json({ success: true, data: orderObj });
    } catch (error) {
      next(error);
    }
  }

  static async getTimeline(req: IAuthRequest, res: Response, next: NextFunction) {
    try {
      const order = await Order.findById(req.params.id)
        .select('statusHistory fulfillment')
        .populate('statusHistory.updatedBy', 'fullName')
        .lean();

      if (!order) {
        throw errors.notFound('Order');
      }

      const timeline: Array<{
        type: string;
        status?: string;
        timestamp: string;
        updatedBy?: string;
        notes?: string;
      }> = [];

      (order.statusHistory || []).forEach((entry: any) => {
        timeline.push({
          type: 'status',
          status: entry.status,
          timestamp: entry.timestamp ? new Date(entry.timestamp).toISOString() : new Date().toISOString(),
          updatedBy: entry.updatedBy?.fullName || entry.updatedBy?.toString?.(),
          notes: entry.notes,
        });
      });

      const fulfillment = order.fulfillment || {};
      const events = [
        { key: 'pickedAt', type: 'picked', label: 'Picked' },
        { key: 'packedAt', type: 'packed', label: 'Packed' },
        { key: 'shippedAt', type: 'shipped', label: 'Shipped' },
        { key: 'deliveredAt', type: 'delivered', label: 'Delivered' },
      ];
      events.forEach(({ key, type, label }) => {
        const date = (fulfillment as any)[key];
        if (date) {
          timeline.push({
            type: 'fulfillment',
            status: type,
            timestamp: new Date(date).toISOString(),
            notes: label,
          });
        }
      });

      timeline.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

      res.json({ success: true, data: timeline });
    } catch (error) {
      next(error);
    }
  }

  static async getCreditNotes(req: IAuthRequest, res: Response, next: NextFunction) {
    try {
      const order = await Order.findById(req.params.id);
      if (!order) {
        throw errors.notFound('Order');
      }
      const creditNotes = await CustomerLedger.find({
        referenceType: 'order',
        referenceId: order._id,
        transactionType: 'credit_note',
      })
        .sort({ transactionDate: -1 })
        .lean();
      res.json({ success: true, data: { creditNotes } });
    } catch (error) {
      next(error);
    }
  }

  static async create(req: IAuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user?._id.toString() || '';
      const userRole = req.user?.role as UserRole | undefined;

      // Get customer
      const customer = await Customer.findById(req.body.customerId);
      if (!customer) {
        throw errors.notFound('Customer');
      }

      // Generate order number from numbering config
      const orderNumber = await NumberingService.getNextCode('order');

      const odIn =
        req.body.pricing?.orderDiscount?.type &&
        req.body.pricing.orderDiscount?.value !== undefined &&
        req.body.pricing.orderDiscount?.value !== null
          ? {
              type: req.body.pricing.orderDiscount.type as 'percent' | 'fixed',
              value: Number(req.body.pricing.orderDiscount.value),
            }
          : null;

      const { items, pricing } = buildPricedOrderItems(req.body.items, {
        orderDiscount: odIn,
        shippingCharge: req.body.pricing?.shippingCharge,
        shippingDiscount: req.body.pricing?.shippingDiscount,
        customerDiscountPercent: Number(customer.discountPercent) || 0,
        taxRateDefault: ORDER_VAT_PERCENT,
      });

      // Approval: config drives who needs sign-off; field sales roles always submit as draft first so
      // zero-stock / no-batch lines never block order capture (stock is reserved at approval).
      const approvalConfig = await getOrderApprovalConfig();
      const applicableRolesRaw = (approvalConfig?.applicableFor as any)?.roles;
      const applicableRoles: string[] = Array.isArray(applicableRolesRaw) ? applicableRolesRaw : [];

      const FIELD_ORDER_CAPTURE_ROLES: UserRole[] = ['sales_team', 'supervisor', 'delivery_team'];
      const alwaysDraftForFieldRole = !!(userRole && FIELD_ORDER_CAPTURE_ROLES.includes(userRole));

      const approvalRequiredByConfig = approvalConfig?.isActive
        ? !applicableRoles.length || !!(userRole && applicableRoles.includes(userRole))
        : false;

      const approvalRequired = alwaysDraftForFieldRole || approvalRequiredByConfig;

      const approverRoles = resolveApproverRoles(
        approvalConfig?.levels
          ?.map((level) => level.approverRole)
          .filter((role): role is string => Boolean(role))
      );

      const orderData: any = {
        orderNumber,
        customerId: customer._id,
        customerCode: customer.customerCode,
        customerName: customer.name,
        customerEmail: customer.email,
        customerPhone: customer.phone,
        items,
        pricing,
        paymentMethod: req.body.paymentMethod,
        balanceDue: pricing.grandTotal,
        billingAddress: req.body.billingAddress,
        shippingAddress: req.body.shippingAddress,
        status: approvalRequired ? 'draft' : 'confirmed',
        statusHistory: [
          {
            status: approvalRequired ? 'draft' : 'confirmed',
            timestamp: new Date(),
            updatedBy: userId,
            notes: approvalRequired ? 'Order submitted for approval' : undefined,
          },
        ],
        approval: approvalRequired
          ? {
              required: true,
              status: 'pending',
              approverRoles,
              submittedAt: new Date(),
              decisions: [],
            }
          : {
              required: false,
              status: 'not_required',
              approverRoles: [],
              decisions: [],
            },
        createdBy: userId,
        updatedBy: userId,
        ...(req.body.batchSelections?.length && { batchSelections: req.body.batchSelections }),
        ...(req.body.notes !== undefined && req.body.notes !== null && { notes: String(req.body.notes) }),
        ...(req.body.internalNotes !== undefined &&
          req.body.internalNotes !== null && { internalNotes: String(req.body.internalNotes) }),
      };

      // Handle credit sale
      if (req.body.paymentMethod === 'credit') {
        const creditDays = customer.creditInfo.creditTermDays || 30;
        orderData.creditInfo = {
          isCreditSale: true,
          creditDays,
          dueDate: addDays(new Date(), creditDays),
        };
      }

      const order = new Order(orderData);

      if (!approvalRequired) {
        const session = await mongoose.startSession();
        session.startTransaction();
        try {
          await order.save({ session });
          const batchSelections = (req.body.batchSelections || order.batchSelections) as any[] | undefined;
          await InventoryService.deductInventoryForOrder(order, session, userId, batchSelections);
          await order.save({ session });
          await session.commitTransaction();
        } catch (err) {
          await session.abortTransaction();
          throw err;
        } finally {
          session.endSession();
        }
      } else {
        await order.save();
      }

      res.status(201).json({
        success: true,
        data: order,
        message: approvalRequired
          ? 'Order submitted for approval successfully'
          : 'Order created successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  /** Update order lines and header while still draft + pending approval (no inventory touch). */
  static async update(req: IAuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user?._id?.toString() || '';
      const order = await Order.findById(req.params.id);
      if (!order || order.isDeleted) {
        throw errors.notFound('Order');
      }
      if (order.status !== 'draft' || !order.approval?.required || order.approval.status !== 'pending') {
        throw errors.validation('Only draft orders pending approval can be edited');
      }

      const customer = await Customer.findById(req.body.customerId);
      if (!customer) {
        throw errors.notFound('Customer');
      }

      const odIn =
        req.body.pricing?.orderDiscount?.type &&
        req.body.pricing?.orderDiscount?.value !== undefined &&
        req.body.pricing?.orderDiscount?.value !== null
          ? {
              type: req.body.pricing.orderDiscount.type as 'percent' | 'fixed',
              value: Number(req.body.pricing.orderDiscount.value),
            }
          : null;

      const { items, pricing } = buildPricedOrderItems(req.body.items, {
        orderDiscount: odIn,
        shippingCharge: req.body.pricing?.shippingCharge,
        shippingDiscount: req.body.pricing?.shippingDiscount,
        customerDiscountPercent: Number(customer.discountPercent) || 0,
        taxRateDefault: ORDER_VAT_PERCENT,
      });

      order.customerId = customer._id as any;
      order.customerCode = customer.customerCode;
      order.customerName = customer.name;
      order.customerEmail = customer.email;
      order.customerPhone = customer.phone;
      order.items = items as any;
      order.pricing = pricing as any;
      order.balanceDue = pricing.grandTotal;
      if (req.body.billingAddress && typeof req.body.billingAddress === 'object') {
        order.billingAddress = { ...(order.billingAddress as any)?.toObject?.(), ...req.body.billingAddress } as any;
      }
      if (req.body.shippingAddress && typeof req.body.shippingAddress === 'object') {
        order.shippingAddress = { ...(order.shippingAddress as any)?.toObject?.(), ...req.body.shippingAddress } as any;
      }
      if (req.body.paymentMethod) {
        order.paymentMethod = req.body.paymentMethod;
      }
      if (req.body.notes !== undefined) {
        order.notes = req.body.notes;
      }
      if (req.body.internalNotes !== undefined) {
        order.internalNotes = req.body.internalNotes;
      }
      if (req.body.batchSelections !== undefined) {
        order.batchSelections = Array.isArray(req.body.batchSelections) ? req.body.batchSelections : [];
      }

      if (req.body.paymentMethod === 'credit') {
        const creditDays = customer.creditInfo.creditTermDays || 30;
        order.creditInfo = {
          isCreditSale: true,
          creditDays,
          dueDate: addDays(new Date(), creditDays),
        } as any;
      } else {
        order.creditInfo = undefined;
      }

      order.updatedBy = userId as any;
      await order.save();

      res.json({
        success: true,
        data: order,
        message: 'Order updated successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  static async getPendingApprovals(req: IAuthRequest, res: Response, next: NextFunction) {
    try {
      const userRole = req.user?.role as UserRole | undefined;

      if (!userRole || !DEFAULT_ORDER_APPROVER_ROLES.includes(userRole)) {
        throw errors.forbidden('view order approvals');
      }

      const { page, limit, skip } = parsePagination(req.query);
      const filter: Record<string, unknown> = {
        isDeleted: false,
        'approval.required': true,
        $or: [
          { status: 'draft', 'approval.status': 'pending' },
          { 'approval.status': 'partial' },
        ],
      };

      const [orders, total] = await Promise.all([
        Order.find(filter)
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .populate('customerId', 'name customerCode')
          .populate('createdBy', 'fullName role'),
        Order.countDocuments(filter),
      ]);

      const result = buildPaginatedResponse(orders, total, page, limit);

      res.json({ success: true, ...result });
    } catch (error) {
      next(error);
    }
  }

  static async approveCreate(req: IAuthRequest, res: Response, next: NextFunction) {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const userId = req.user?._id?.toString() || '';
      const userRole = req.user?.role as UserRole | undefined;

      if (!userId || !userRole || !DEFAULT_ORDER_APPROVER_ROLES.includes(userRole)) {
        throw errors.forbidden('approve order creation');
      }

      const order = await Order.findById(req.params.id).session(session);
      if (!order) {
        throw errors.notFound('Order');
      }

      if (
        !order.approval?.required ||
        !['pending', 'partial'].includes(String(order.approval.status))
      ) {
        throw errors.validation('Order does not have an open approval release (pending or partial)');
      }

      const approverRoles = resolveApproverRoles(order.approval.approverRoles as any);
      if (!approverRoles.includes(userRole)) {
        throw errors.forbidden('approve this order');
      }

      if (order.approval.status === 'pending') {
        const alreadyDecided = order.approval.decisions?.some(
          (decision: any) => decision.approverId?.toString() === userId
        );
        if (alreadyDecided) {
          throw errors.validation('You have already submitted a decision for this order');
        }
      }

      const rawRelease = Array.isArray(req.body.release) ? req.body.release : [];
      const normalizedRelease: Array<{ itemIndex: number; quantity: number; batchId?: string }> = [];
      const seenIdx = new Set<number>();
      for (const row of rawRelease) {
        const itemIndex = Number(row.itemIndex);
        const quantity = Number(row.quantity) || 0;
        if (!Number.isInteger(itemIndex) || itemIndex < 0) {
          throw errors.validation('Each release row must have a valid itemIndex');
        }
        if (quantity <= 0) continue;
        if (seenIdx.has(itemIndex)) {
          throw errors.validation(`Duplicate itemIndex ${itemIndex} in release — merge quantities in one row`);
        }
        seenIdx.add(itemIndex);
        normalizedRelease.push({
          itemIndex,
          quantity,
          batchId: row.batchId ? String(row.batchId) : undefined,
        });
      }

      if (normalizedRelease.length === 0) {
        throw errors.validation(
          'Provide release: [{ itemIndex, quantity, batchId? }] with at least one line to reserve. Batch is required when the variant is batch-tracked.'
        );
      }

      for (const r of normalizedRelease) {
        const line = order.items[r.itemIndex];
        if (!line) {
          throw errors.validation(`Invalid itemIndex ${r.itemIndex}`);
        }
        const demand = Number(line.quantity) || 0;
        const already = Number((line as any).releasedQuantity) || 0;
        if (r.quantity > demand - already) {
          throw errors.validation(
            `Release quantity for line ${r.itemIndex + 1} (${line.name}) exceeds remaining demand (${demand - already})`
          );
        }
        const pid = line.productId?.toString?.() || line.productId;
        const vid = line.variantId?.toString?.() || line.variantId;
        const batches = await StockBatchService.getBatchesByVariant(String(pid), String(vid), false);
        if (batches.length > 0 && !r.batchId) {
          throw errors.validation(
            `Select a batch for line ${r.itemIndex + 1}: ${line.name} — batch-tracked variants require a batch`
          );
        }
      }

      const deductItems = normalizedRelease.map((r) => {
        const src = order.items[r.itemIndex] as any;
        const o = src?.toObject ? src.toObject() : { ...src };
        o.quantity = r.quantity;
        delete o._id;
        return o;
      });

      const deductOrder: any = {
        _id: order._id,
        orderNumber: order.orderNumber,
        customerId: order.customerId,
        items: deductItems,
      };

      const batchSelections = buildBatchSelectionsFromRelease(order, normalizedRelease);
      await InventoryService.deductInventoryForOrder(
        deductOrder,
        session,
        userId,
        batchSelections.length ? batchSelections : undefined
      );

      for (let i = 0; i < normalizedRelease.length; i++) {
        const r = normalizedRelease[i];
        const srcLine = order.items[r.itemIndex] as any;
        const dLine = deductOrder.items[i];
        const prevRel = Number(srcLine.releasedQuantity) || 0;
        srcLine.releasedQuantity = prevRel + r.quantity;
        if (dLine.batchId) {
          srcLine.batchId = dLine.batchId;
          srcLine.batchNumber = dLine.batchNumber;
          srcLine.expiryDate = dLine.expiryDate;
        }
        if (srcLine.releasedQuantity >= (Number(srcLine.quantity) || 0)) {
          srcLine.inventoryDeducted = true;
        }
      }
      order.markModified('items');

      const existingSubs = await Order.countDocuments({ sourceOrderId: order._id, isDeleted: false }).session(session);
      const includeShipping = existingSubs === 0;

      const odIn =
        req.body.pricing?.orderDiscount?.type &&
        req.body.pricing.orderDiscount?.value !== undefined &&
        req.body.pricing.orderDiscount?.value !== null
          ? {
              type: req.body.pricing.orderDiscount.type as 'percent' | 'fixed',
              value: Number(req.body.pricing.orderDiscount.value),
            }
          : order.pricing?.orderDiscount?.type && order.pricing?.orderDiscount?.value != null
            ? {
                type: order.pricing.orderDiscount.type as 'percent' | 'fixed',
                value: Number(order.pricing.orderDiscount.value),
              }
            : null;

      const releaseProductIds = [
        ...new Set(
          normalizedRelease
            .map((r) => {
              const src = order.items[r.itemIndex] as any;
              if (!src) return undefined;
              const pid = src.productId?.toString?.() ?? src.productId;
              return pid ? String(pid) : undefined;
            })
            .filter(Boolean)
        ),
      ] as string[];

      const releaseProducts =
        releaseProductIds.length > 0
          ? await Product.find({ _id: { $in: releaseProductIds } })
              .session(session)
              .lean()
          : [];
      const productById = new Map(releaseProducts.map((p: any) => [String(p._id), p]));

      const shipCh = includeShipping
        ? Number(req.body.pricing?.shippingCharge ?? order.pricing?.shippingCharge) || 0
        : 0;
      const shipDisc = includeShipping
        ? Number(req.body.pricing?.shippingDiscount ?? order.pricing?.shippingDiscount) || 0
        : 0;

      const approvalCustomer = await Customer.findById(order.customerId)
        .select('discountPercent')
        .session(session)
        .lean();
      const approvalCustDisc = Number((approvalCustomer as any)?.discountPercent ?? 0);

      const parentLinesHaveCustomerDisc = (order.items as any[]).some(
        (it: any) => Number(it.customerDiscountAmount) > 0
      );

      /** Repricing only release lines reallocates order discount across those lines → wrong tax vs parent. */
      const partialLineRelease = normalizedRelease.some((r) => {
        const pl = order.items[r.itemIndex] as any;
        return Number(r.quantity) < (Number(pl?.quantity) || 0);
      });

      let pricedRelease: any[];
      let subPricing: any;

      if (approvalCustDisc > 0 && !parentLinesHaveCustomerDisc && !partialLineRelease) {
        const rawFullOrder = (order.items as any[]).map((src: any, itemIndex: number) => {
          const p = src?.toObject ? src.toObject() : { ...src };
          const rel = normalizedRelease.find((nr) => nr.itemIndex === itemIndex);
          const qty = rel ? rel.quantity : Number(p.quantity) || 0;
          const base = { ...p, quantity: qty };
          const pid = base.productId?.toString?.() ?? String(base.productId);
          const prod = productById.get(pid);
          return prod ? enrichMissingUomFromProduct(base, prod) : base;
        });
        const recomputed = buildPricedOrderItems(rawFullOrder, {
          orderDiscount: odIn,
          shippingCharge: shipCh,
          shippingDiscount: shipDisc,
          customerDiscountPercent: approvalCustDisc,
          taxRateDefault: ORDER_VAT_PERCENT,
        });
        pricedRelease = normalizedRelease.map((r) => recomputed.items[r.itemIndex]);
        subPricing = rollupSubOrderPricingFromPricedSubset(recomputed, pricedRelease, shipCh, shipDisc);
      } else {
        const parentPricingPlain =
          (order.pricing as any)?.toObject?.() ?? (order.pricing ? { ...(order.pricing as any) } : undefined);
        const scaled = buildFulfillmentReleaseFromParentScaled(order.items as any[], normalizedRelease, {
          includeShipping,
          shippingCharge: shipCh,
          shippingDiscount: shipDisc,
          productById,
          parentHeaderPricing: includeShipping ? parentPricingPlain : undefined,
        });
        pricedRelease = scaled.items;
        subPricing = scaled.pricing;
      }

      if (req.body.shippingAddress && typeof req.body.shippingAddress === 'object') {
        order.shippingAddress = {
          ...(order.shippingAddress as any)?.toObject?.(),
          ...req.body.shippingAddress,
        } as any;
      }
      if (req.body.billingAddress && typeof req.body.billingAddress === 'object') {
        order.billingAddress = {
          ...(order.billingAddress as any)?.toObject?.(),
          ...req.body.billingAddress,
        } as any;
      }
      if (req.body.paymentMethod) {
        order.paymentMethod = req.body.paymentMethod;
      }
      // Do not overwrite salesman order.notes / internalNotes with approver payload — those go to approval.decisions only.

      order.approval.decisions.push({
        approverId: userId as any,
        approverRole: userRole,
        decision: 'approved',
        notes: req.body.notes,
        decidedAt: new Date(),
      } as any);
      order.approval.decisionNotes = req.body.notes;

      const allLinesReleased = (order.items as any[]).every((it: any) => {
        const q = Number(it.quantity) || 0;
        const rel = Number(it.releasedQuantity) || 0;
        return rel >= q;
      });
      order.approval.status = allLinesReleased ? 'approved' : 'partial';
      if (allLinesReleased) {
        order.approval.approvedAt = new Date();
        order.approval.approvedBy = userId as any;
      }

      const prevStatus = order.status;
      if (prevStatus === 'draft') {
        order.status = 'confirmed';
        order.statusHistory.push({
          status: 'confirmed',
          timestamp: new Date(),
          updatedBy: userId as any,
          notes: req.body.notes || 'Stock released from approval (sales order confirmed)',
        });
      } else {
        order.statusHistory.push({
          status: order.status,
          timestamp: new Date(),
          updatedBy: userId as any,
          notes:
            req.body.notes ||
            `Additional stock release (${normalizedRelease.length} line(s)) → fulfillment sub-order`,
        });
      }
      order.updatedBy = userId as any;

      (order as any).batchSelections = batchSelections.length ? batchSelections : [];

      const child = await createFulfillmentSubOrderDocument(
        order,
        pricedRelease,
        subPricing,
        batchSelections.length ? batchSelections : undefined,
        session,
        userId
      );
      if (!Array.isArray(order.linkedOrders)) {
        order.linkedOrders = [] as any;
      }
      (order.linkedOrders as any).push({
        orderId: child._id,
        orderNumber: child.orderNumber,
        type: 'fulfillment_sub',
      });

      await order.save({ session });
      await session.commitTransaction();

      res.json({
        success: true,
        data: order,
        message: 'Order approved and created successfully',
      });
    } catch (error) {
      await session.abortTransaction();
      next(error);
    } finally {
      session.endSession();
    }
  }

  static async rejectCreate(req: IAuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user?._id;
      const userRole = req.user?.role as UserRole | undefined;

      if (!userId || !userRole || !DEFAULT_ORDER_APPROVER_ROLES.includes(userRole)) {
        throw errors.forbidden('reject order creation');
      }

      const order = await Order.findById(req.params.id);
      if (!order) {
        throw errors.notFound('Order');
      }

      if (!order.approval?.required || order.approval.status !== 'pending') {
        throw errors.validation(
          'Only orders still pending approval (no stock released yet) can be rejected'
        );
      }

      const approverRoles = resolveApproverRoles(order.approval.approverRoles as any);
      if (!approverRoles.includes(userRole)) {
        throw errors.forbidden('reject this order');
      }

      const notes = req.body.notes;
      if (!notes || !notes.trim()) {
        throw errors.validation('Rejection notes are required');
      }

      const alreadyDecided = order.approval.decisions?.some(
        (decision: any) => decision.approverId?.toString() === userId.toString()
      );

      if (alreadyDecided) {
        throw errors.validation('You have already submitted a decision for this order');
      }

      order.approval.decisions.push({
        approverId: userId as any,
        approverRole: userRole,
        decision: 'rejected',
        notes,
        decidedAt: new Date(),
      } as any);
      order.approval.status = 'rejected';
      order.approval.rejectedAt = new Date();
      order.approval.rejectedBy = userId as any;
      order.approval.decisionNotes = notes;

      order.status = 'cancelled';
      order.statusHistory.push({
        status: 'cancelled',
        timestamp: new Date(),
        updatedBy: userId as any,
        notes: `Order creation rejected: ${notes}`,
      });
      order.updatedBy = userId as any;

      await order.save();

      res.json({
        success: true,
        data: order,
        message: 'Order creation request rejected',
      });
    } catch (error) {
      next(error);
    }
  }

  static async updateStatus(req: IAuthRequest, res: Response, next: NextFunction) {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const { status } = req.body;
      const userId = req.user?._id.toString() || '';

      const order = await Order.findById(req.params.id).session(session);
      if (!order) {
        throw errors.notFound('Order');
      }

      const previousStatus = order.status;

      // Delivered and partially_returned orders are locked except for returns
      if (['delivered', 'partially_returned'].includes(previousStatus) && !['returned', 'partially_returned'].includes(status)) {
        throw errors.validation('Delivered/partially returned orders can only be updated for returns');
      }

      const isFulfillmentSubOrder = order.isFulfillmentSubOrder === true;

      // Receivable + customer AR: sales orders and fulfillment sub-orders (partial releases)
      if (status === 'invoiced' && previousStatus !== 'invoiced') {
        const posted = await ensureOrderInvoiceReceivableRecorded(order, session, userId);
        if (posted > 0 && isFulfillmentSubOrder && order.sourceOrderId) {
          const parent = await Order.findById(order.sourceOrderId).session(session);
          if (parent) {
            reduceParentBalanceDueInMemory(parent, posted);
            await parent.save({ session });
          }
        }
      }
      if (status === 'delivered' && previousStatus !== 'delivered') {
        const posted = await ensureOrderInvoiceReceivableRecorded(order, session, userId);
        if (posted > 0 && isFulfillmentSubOrder && order.sourceOrderId) {
          const parent = await Order.findById(order.sourceOrderId).session(session);
          if (parent) {
            reduceParentBalanceDueInMemory(parent, posted);
            await parent.save({ session });
          }
        }
      }

      // Handle inventory restoration on cancellation (inventory was deducted at approval)
      if (
        !isFulfillmentSubOrder &&
        status === 'cancelled' &&
        previousStatus !== 'draft' &&
        order.items?.some((i: any) => i.inventoryDeducted)
      ) {
        await InventoryService.restoreInventoryForOrder(order, session, userId, 'Order cancelled');
      }

      // Handle return / partial return: restore inventory + credit note (deduct receivable or create refund)
      if (
        !isFulfillmentSubOrder &&
        ['returned', 'partially_returned'].includes(status) &&
        ['delivered', 'partially_returned'].includes(previousStatus)
      ) {
        const returnItems = req.body.returnItems as Array<{
          itemIndex: number;
          returnedQuantity: number;
          returnUom?: 'unit' | 'pcs';
        }> | undefined;

        if (status === 'partially_returned') {
          if (!returnItems?.length || !returnItems.some((r) => (r.returnedQuantity || 0) > 0)) {
            throw errors.validation('Select at least one item and quantity to return for partial return');
          }
          await InventoryService.restoreInventoryForPartialReturn(order, returnItems, session, userId, 'Partial return');

          // Credit = prorated by pieces returned: (returnedPieces / totalPiecesInLine) * lineTotal
          let creditAmount = 0;
          for (const { itemIndex, returnedQuantity, returnUom } of returnItems) {
            const item = order.items[itemIndex];
            if (!item || returnedQuantity <= 0) continue;
            const pcsPerUnit = Math.max(1, item.pcsPerUnit || 1);
            const totalPiecesInLine = item.sellBy === 'unit'
              ? (item.quantity || 0) * pcsPerUnit
              : (item.quantity || 0);
            if (totalPiecesInLine <= 0) continue;
            const uom = returnUom || item.sellBy || 'unit';
            const returnedPieces = uom === 'unit'
              ? Math.round(returnedQuantity * pcsPerUnit)
              : Math.round(returnedQuantity);
            creditAmount += (Math.min(returnedPieces, totalPiecesInLine) / totalPiecesInLine) * (item.lineTotal || 0);
          }
          creditAmount = Math.round(creditAmount * 100) / 100;

          const customer = await Customer.findById(order.customerId).session(session);
          if (customer && creditAmount > 0) {
            const currentOutstanding = customer.creditInfo.currentOutstanding || 0;
            const balanceAfter = Math.round((currentOutstanding - creditAmount) * 100) / 100;

            await CustomerLedger.create([{
              customerId: customer._id,
              customerCode: customer.customerCode,
              transactionType: 'credit_note',
              transactionDate: new Date(),
              referenceType: 'order',
              referenceId: order._id,
              referenceNumber: `CN-${order.orderNumber}`,
              debitAmount: 0,
              creditAmount,
              balanceAfter,
              description: `Credit note for partial return - order ${order.orderNumber}`,
              notes: req.body.notes,
              createdBy: userId as any,
              updatedBy: userId as any,
            }], { session });

            customer.creditInfo.currentOutstanding = Math.max(0, balanceAfter);
            customer.creditInfo.availableCredit = (customer.creditInfo.creditLimit || 0) - customer.creditInfo.currentOutstanding;
            customer.financialSummary.totalOutstanding = Math.max(0, (customer.financialSummary.totalOutstanding || 0) - creditAmount);
            await customer.save({ session });
          }

          // Recalculate order balance: reduce by credit, update payment status
          const newBalanceDue = Math.round(((order.balanceDue || 0) - creditAmount) * 100) / 100;
          order.balanceDue = Math.max(0, newBalanceDue);
          order.returnCreditAmount = (order.returnCreditAmount || 0) + creditAmount;
          if (order.balanceDue <= 0) {
            order.paymentStatus = order.paidAmount > 0 ? 'refunded' : 'paid';
          }
        } else {
          // Full return (from delivered or partially_returned)
          if (previousStatus === 'partially_returned') {
            // Restore only remaining inventory
            const remainingReturnItems: Array<{ itemIndex: number; returnedQuantity: number; returnUom?: 'unit' | 'pcs' }> = [];
            for (let i = 0; i < order.items.length; i++) {
              const item = order.items[i];
              const ppu = Math.max(1, item.pcsPerUnit || 1);
              const totalPieces = item.sellBy === 'unit' ? (item.quantity || 0) * ppu : (item.quantity || 0);
              const alreadyReturned = item.returnedQuantityPieces || 0;
              const remainingPieces = Math.max(0, totalPieces - alreadyReturned);
              if (remainingPieces > 0) {
                const returnQty = item.sellBy === 'unit' ? remainingPieces / ppu : remainingPieces;
                remainingReturnItems.push({ itemIndex: i, returnedQuantity: Math.round(returnQty * 1000) / 1000, returnUom: (item.sellBy as 'unit' | 'pcs') || 'unit' });
              }
            }
            if (remainingReturnItems.length > 0) {
              await InventoryService.restoreInventoryForPartialReturn(order, remainingReturnItems, session, userId, 'Full return (remaining)');
            }
          } else {
            await InventoryService.restoreInventoryForOrder(order, session, userId, 'Order returned');
          }
          for (const item of order.items) {
            const ppu = Math.max(1, item.pcsPerUnit || 1);
            const totalPieces = item.sellBy === 'unit' ? (item.quantity || 0) * ppu : (item.quantity || 0);
            item.returnedQuantity = item.quantity;
            item.returnedQuantityPieces = totalPieces;
          }

          const creditAmount = previousStatus === 'partially_returned'
            ? Math.max(0, (order.pricing?.grandTotal || 0) - (order.returnCreditAmount || 0))
            : (order.pricing?.grandTotal || 0);
          const customer = await Customer.findById(order.customerId).session(session);
          if (customer && creditAmount > 0) {
            const currentOutstanding = customer.creditInfo.currentOutstanding || 0;
            const balanceAfter = currentOutstanding - creditAmount;

            await CustomerLedger.create([{
              customerId: customer._id,
              customerCode: customer.customerCode,
              transactionType: 'credit_note',
              transactionDate: new Date(),
              referenceType: 'order',
              referenceId: order._id,
              referenceNumber: `CN-${order.orderNumber}`,
              debitAmount: 0,
              creditAmount,
              balanceAfter,
              description: `Credit note for returned order ${order.orderNumber}`,
              notes: req.body.notes,
              createdBy: userId as any,
              updatedBy: userId as any,
            }], { session });

            customer.creditInfo.currentOutstanding = balanceAfter;
            customer.creditInfo.availableCredit = (customer.creditInfo.creditLimit || 0) - balanceAfter;
            customer.financialSummary.totalOutstanding = Math.max(0, (customer.financialSummary.totalOutstanding || 0) - creditAmount);
            await customer.save({ session });
          }
          order.returnCreditAmount = (order.returnCreditAmount || 0) + creditAmount;
          if (order.paymentStatus === 'paid') {
            order.paymentStatus = 'refunded';
          } else if (order.paymentStatus === 'partial') {
            order.balanceDue = 0;
            order.paymentStatus = 'refunded';
          }
        }
      }

      // Update status
      order.status = status;
      order.statusHistory.push({
        status,
        timestamp: new Date(),
        updatedBy: userId as any,
        notes: req.body.notes,
      });

      await order.save({ session });
      await session.commitTransaction();

      res.json({
        success: true,
        data: order,
        message: 'Order status updated successfully',
      });
    } catch (error) {
      await session.abortTransaction();
      next(error);
    } finally {
      session.endSession();
    }
  }

  /**
   * Generate and download order invoice PDF
   */
  static async downloadPDF(req: IAuthRequest, res: Response, next: NextFunction) {
    try {
      const order = await Order.findById(req.params.id);

      if (!order) {
        throw errors.notFound('Order');
      }

      const plainOrder = order.toObject({ flattenMaps: true });
      const pdfBuffer = await PDFService.generateOrderPDF(plainOrder);

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="invoice-${order.orderNumber}.pdf"`
      );
      res.setHeader('Content-Length', pdfBuffer.length);
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
      res.setHeader('Pragma', 'no-cache');

      res.send(pdfBuffer);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Generate and download delivery note PDF
   */
  static async downloadDeliveryNote(req: IAuthRequest, res: Response, next: NextFunction) {
    try {
      const order = await Order.findById(req.params.id);

      if (!order) {
        throw errors.notFound('Order');
      }

      const plainOrder = order.toObject({ flattenMaps: true });
      const pdfBuffer = await PDFService.generateDeliveryNotePDF(plainOrder);

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="delivery-note-${order.orderNumber}.pdf"`
      );
      res.setHeader('Content-Length', pdfBuffer.length);

      res.send(pdfBuffer);
    } catch (error) {
      next(error);
    }
  }
}
