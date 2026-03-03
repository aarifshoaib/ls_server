import { Response, NextFunction } from 'express';
import { IAuthRequest } from '../types';
import Order from '../models/Order';
import Product from '../models/Product';
import Customer from '../models/Customer';
import CustomerLedger from '../models/CustomerLedger';
import ApprovalConfig from '../models/ApprovalConfig';
import { errors } from '../utils/errors';
import { parsePagination, buildPaginatedResponse, generateCode, addDays } from '../utils/helpers';
import { InventoryService } from '../services/inventory.service';
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

export class OrderController {
  static async getAll(req: IAuthRequest, res: Response, next: NextFunction) {
    try {
      const { page, limit, skip } = parsePagination(req.query);
      const filter: any = { isDeleted: false };

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

      // Generate order number
      const count = await Order.countDocuments();
      const orderNumber = generateCode('ORD', count + 1, 6);

      // Calculate pricing
      let subtotal = 0;
      let taxTotal = 0;
      const items = req.body.items.map((item: any) => {
        const lineTotal = item.quantity * item.unitPrice;
        const discountAmount = (lineTotal * (item.discountPercent || 0)) / 100;
        const taxableAmount = lineTotal - discountAmount;
        const taxAmount = (taxableAmount * (item.taxRate || 5)) / 100;
        const finalTotal = taxableAmount + taxAmount;

        subtotal += lineTotal;
        taxTotal += taxAmount;

        return {
          ...item,
          discountAmount,
          taxAmount,
          lineTotal: finalTotal,
          inventoryDeducted: false,
        };
      });

      const grandTotal = subtotal - (req.body.itemDiscountTotal || 0) + taxTotal;

      // Use approval config: when isActive, require approval (for applicable roles or all if empty)
      const approvalConfig = await getOrderApprovalConfig();
      const applicableRoles = (approvalConfig?.applicableFor as any)?.roles || [];
      const approvalRequired = approvalConfig?.isActive
        ? (!applicableRoles.length || (userRole && applicableRoles.includes(userRole)))
        : userRole === 'sales_team'; // fallback when no config

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
        pricing: {
          subtotal,
          itemDiscountTotal: req.body.itemDiscountTotal || 0,
          taxTotal,
          shippingCharge: req.body.shippingCharge || 0,
          shippingDiscount: req.body.shippingDiscount || 0,
          grandTotal,
          roundingAdjustment: 0,
        },
        paymentMethod: req.body.paymentMethod,
        balanceDue: grandTotal,
        billingAddress: req.body.billingAddress,
        shippingAddress: req.body.shippingAddress,
        status: approvalRequired ? 'draft' : 'pending',
        statusHistory: [
          {
            status: approvalRequired ? 'draft' : 'pending',
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
      await order.save();

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

  static async getPendingApprovals(req: IAuthRequest, res: Response, next: NextFunction) {
    try {
      const userRole = req.user?.role as UserRole | undefined;

      if (!userRole || !DEFAULT_ORDER_APPROVER_ROLES.includes(userRole)) {
        throw errors.forbidden('view order approvals');
      }

      const { page, limit, skip } = parsePagination(req.query);
      const filter = {
        isDeleted: false,
        status: 'draft',
        'approval.required': true,
        'approval.status': 'pending',
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

      if (!order.approval?.required || order.approval.status !== 'pending') {
        throw errors.validation('Order does not have a pending approval request');
      }

      const approverRoles = resolveApproverRoles(order.approval.approverRoles as any);
      if (!approverRoles.includes(userRole)) {
        throw errors.forbidden('approve this order');
      }

      const alreadyDecided = order.approval.decisions?.some(
        (decision: any) => decision.approverId?.toString() === userId
      );

      if (alreadyDecided) {
        throw errors.validation('You have already submitted a decision for this order');
      }

      order.approval.decisions.push({
        approverId: userId as any,
        approverRole: userRole,
        decision: 'approved',
        notes: req.body.notes,
        decidedAt: new Date(),
      } as any);
      order.approval.status = 'approved';
      order.approval.approvedAt = new Date();
      order.approval.approvedBy = userId as any;
      order.approval.decisionNotes = req.body.notes;

      order.status = 'pending';
      order.statusHistory.push({
        status: 'pending',
        timestamp: new Date(),
        updatedBy: userId as any,
        notes: req.body.notes || 'Order approved for creation',
      });
      order.updatedBy = userId as any;

      // Deduct inventory on approval so stock is allocated for other customers
      const batchSelections = (order.batchSelections?.length ? order.batchSelections : req.body.batchSelections) as any[] | undefined;
      await InventoryService.deductInventoryForOrder(order, session, userId, batchSelections);

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
        throw errors.validation('Order does not have a pending approval request');
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

      // Inventory is deducted at approval, not at delivery
      if (status === 'delivered' && previousStatus !== 'delivered') {
        // Record receivable for unpaid orders
        const outstanding = order.balanceDue || order.pricing?.grandTotal || 0;
        if (outstanding > 0 && order.paymentStatus !== 'paid') {
          const existingLedger = await CustomerLedger.findOne({
            referenceType: 'order',
            referenceId: order._id,
            transactionType: 'invoice',
          }).session(session);

          if (!existingLedger) {
            const customer = await Customer.findById(order.customerId).session(session);
            if (customer) {
              const creditDays = order.creditInfo?.creditDays || customer.creditInfo?.creditTermDays || 30;
              const invoiceNumber = order.creditInfo?.invoiceNumber || `INV-${order.orderNumber}`;
              const balanceAfter = (customer.creditInfo?.currentOutstanding || 0) + outstanding;

              const ledgerEntry = await CustomerLedger.create([{
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
                description: `Invoice for order ${order.orderNumber}`,
                createdBy: userId as any,
                updatedBy: userId as any,
              }], { session });

              customer.creditInfo.currentOutstanding = balanceAfter;
              customer.creditInfo.availableCredit = (customer.creditInfo.creditLimit || 0) - balanceAfter;
              customer.financialSummary.totalOutstanding =
                (customer.financialSummary.totalOutstanding || 0) + outstanding;
              customer.financialSummary.totalOrderValue =
                (customer.financialSummary.totalOrderValue || 0) + (order.pricing?.grandTotal || 0);
              customer.financialSummary.totalOrders =
                (customer.financialSummary.totalOrders || 0) + 1;
              customer.financialSummary.lastOrderDate = new Date();

              order.creditInfo = {
                ...(order.creditInfo || { isCreditSale: false, creditDays }),
                dueDate: addDays(new Date(), creditDays),
                invoiceNumber,
                ledgerEntryId: ledgerEntry[0]._id,
              } as any;

              await customer.save({ session });
            }
          }
        }
      }

      // Handle inventory restoration on cancellation (inventory was deducted at approval)
      if (status === 'cancelled' && previousStatus !== 'draft' && order.items?.some((i: any) => i.inventoryDeducted)) {
        await InventoryService.restoreInventoryForOrder(order, session, userId, 'Order cancelled');
      }

      // Handle return / partial return: restore inventory + credit note (deduct receivable or create refund)
      if (['returned', 'partially_returned'].includes(status) && ['delivered', 'partially_returned'].includes(previousStatus)) {
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

      const pdfBuffer = await PDFService.generateOrderPDF(order);

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="invoice-${order.orderNumber}.pdf"`
      );
      res.setHeader('Content-Length', pdfBuffer.length);

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

      const pdfBuffer = await PDFService.generateDeliveryNotePDF(order);

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
