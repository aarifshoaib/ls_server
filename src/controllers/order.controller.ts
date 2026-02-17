import { Response, NextFunction } from 'express';
import { IAuthRequest } from '../types';
import Order from '../models/Order';
import Customer from '../models/Customer';
import CustomerLedger from '../models/CustomerLedger';
import { errors } from '../utils/errors';
import { parsePagination, buildPaginatedResponse, generateCode, addDays } from '../utils/helpers';
import { InventoryService } from '../services/inventory.service';
import { PDFService } from '../services/pdf.service';
import mongoose from 'mongoose';

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
        Order.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).populate('customerId', 'name customerCode'),
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
      const order = await Order.findById(req.params.id).populate('customerId');

      if (!order) {
        throw errors.notFound('Order');
      }

      res.json({ success: true, data: order });
    } catch (error) {
      next(error);
    }
  }

  static async create(req: IAuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user?._id.toString() || '';

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
        status: 'pending',
        statusHistory: [
          {
            status: 'pending',
            timestamp: new Date(),
            updatedBy: userId,
          },
        ],
        createdBy: userId,
        updatedBy: userId,
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
        message: 'Order created successfully',
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

      // Delivered orders are locked except for returns
      if (previousStatus === 'delivered' && !['returned', 'partially_returned'].includes(status)) {
        throw errors.validation('Delivered orders cannot be updated');
      }

      // Handle inventory deduction on delivery
      if (status === 'delivered' && previousStatus !== 'delivered') {
        await InventoryService.deductInventoryForOrder(order, session, userId);

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

      // Handle inventory restoration on cancellation
      if (status === 'cancelled' && previousStatus === 'delivered') {
        await InventoryService.restoreInventoryForOrder(order, session, userId);
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
