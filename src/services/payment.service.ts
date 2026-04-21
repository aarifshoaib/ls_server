import mongoose, { Types } from 'mongoose';
import Customer from '../models/Customer';
import Order from '../models/Order';
import CustomerLedger from '../models/CustomerLedger';
import PaymentRequest from '../models/PaymentRequest';
import { errors } from '../utils/errors';
import { roundToTwo } from '../utils/helpers';
import { UserRole } from '../types';

const PAYMENT_APPROVER_ROLES: UserRole[] = ['accountant', 'admin', 'super_admin'];
const ROLES_REQUIRING_APPROVAL: UserRole[] = ['sales_team', 'delivery_team'];

export class PaymentService {
  static requiresApproval(role: UserRole): boolean {
    return ROLES_REQUIRING_APPROVAL.includes(role);
  }

  static canApprove(role: UserRole): boolean {
    return PAYMENT_APPROVER_ROLES.includes(role);
  }

  static async submitPaymentRequest(data: any, userId: string) {
    const { customerId, amount, method, reference, orderId, bankName, cardLast4 } = data;

    if (!customerId) {
      throw errors.validation('Customer is required');
    }
    const paymentAmount = Number(amount);
    if (!paymentAmount || paymentAmount <= 0) {
      throw errors.validation('Amount must be greater than zero');
    }
    if (!method) {
      throw errors.validation('Payment method is required');
    }

    const customer = await Customer.findById(customerId);
    if (!customer) {
      throw errors.notFound('Customer');
    }

    if (orderId) {
      const order = await Order.findById(orderId);
      if (!order) {
        throw errors.notFound('Order');
      }
      const grandTotal = order.pricing?.grandTotal || 0;
      const returnCredit = order.returnCreditAmount || 0;
      const netTotal = Math.max(0, grandTotal - returnCredit);
      const currentPaid = order.paidAmount || 0;
      const currentBalance = Math.max(0, netTotal - currentPaid);
      const balanceCents = Math.round(currentBalance * 100);
      const paymentCents = Math.round(paymentAmount * 100);
      if (paymentCents > balanceCents) {
        throw errors.validation('Payment amount exceeds order balance');
      }
    } else {
      const currentOutstanding = customer.creditInfo.currentOutstanding || 0;
      const outstandingCents = Math.round(currentOutstanding * 100);
      const paymentCents = Math.round(paymentAmount * 100);
      if (paymentCents > outstandingCents) {
        throw errors.validation('Payment amount exceeds outstanding balance');
      }
    }

    const request = await PaymentRequest.create({
      customerId,
      orderId: orderId || undefined,
      amount: paymentAmount,
      method,
      reference: reference || undefined,
      bankName: bankName || undefined,
      cardLast4: cardLast4 || undefined,
      status: 'pending_approval',
      requestedBy: userId,
    });

    return request.populate([
      { path: 'customerId', select: 'name customerCode' },
      { path: 'orderId', select: 'orderNumber' },
      { path: 'requestedBy', select: 'fullName email' },
    ]);
  }

  static async getPendingApprovals() {
    return PaymentRequest.find({ status: 'pending_approval' })
      .sort({ requestedAt: -1 })
      .populate('customerId', 'name customerCode')
      .populate('orderId', 'orderNumber')
      .populate('requestedBy', 'fullName email');
  }

  static async approvePaymentRequest(requestId: string, userId: string, notes?: string) {
    const request = await PaymentRequest.findById(requestId);
    if (!request) {
      throw errors.notFound('Payment request');
    }
    if (request.status !== 'pending_approval') {
      throw errors.validation(`Payment request is already ${request.status}`);
    }

    const payment = await this.recordPayment(
      {
        customerId: request.customerId.toString(),
        orderId: request.orderId?.toString(),
        amount: request.amount,
        method: request.method,
        reference: request.reference,
        bankName: request.bankName,
        cardLast4: request.cardLast4,
      },
      userId
    );

    request.status = 'approved';
    request.approvedBy = new Types.ObjectId(userId);
    request.approvedAt = new Date();
    request.notes = notes;
    await request.save();

    return payment;
  }

  static async rejectPaymentRequest(requestId: string, userId: string, rejectionReason?: string) {
    const request = await PaymentRequest.findById(requestId);
    if (!request) {
      throw errors.notFound('Payment request');
    }
    if (request.status !== 'pending_approval') {
      throw errors.validation(`Payment request is already ${request.status}`);
    }

    request.status = 'rejected';
    request.approvedBy = new Types.ObjectId(userId);
    request.approvedAt = new Date();
    request.rejectionReason = rejectionReason;
    await request.save();

    return request;
  }
  static async recordPayment(data: any, userId: string) {
    const { customerId, amount, method, reference, orderId, bankName, cardLast4 } = data;

    if (!customerId) {
      throw errors.validation('Customer is required');
    }
    const paymentAmount = Number(amount);
    if (!paymentAmount || paymentAmount <= 0) {
      throw errors.validation('Amount must be greater than zero');
    }
    if (!method) {
      throw errors.validation('Payment method is required');
    }

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const customer = await Customer.findById(customerId).session(session);
      if (!customer) {
        throw errors.notFound('Customer');
      }

      const currentOutstanding = customer.creditInfo.currentOutstanding || 0;

      let order: any = null;
      let remainingAmount = paymentAmount;
      const appliedToInvoices: { invoiceId: any; invoiceNumber: string; amount: number }[] = [];

      if (orderId) {
        order = await Order.findById(orderId).session(session);
        if (!order) {
          throw errors.notFound('Order');
        }
        const grandTotal = order.pricing?.grandTotal || 0;
        const returnCredit = order.returnCreditAmount || 0;
        const netTotal = Math.max(0, grandTotal - returnCredit);
        const currentPaid = order.paidAmount || 0;
        const currentBalance = Math.max(0, netTotal - currentPaid);

        // Use cents comparison to avoid floating-point precision errors (e.g. 123.45 vs 123.4499999)
        const balanceCents = Math.round(currentBalance * 100);
        const paymentCents = Math.round(paymentAmount * 100);
        if (paymentCents > balanceCents) {
          throw errors.validation('Payment amount exceeds order balance');
        }

        const appliedAmount = Math.min(currentBalance, remainingAmount);

        if (appliedAmount > 0) {
          const newPaidAmount = roundToTwo(currentPaid + appliedAmount);
          const newBalance = roundToTwo(Math.max(0, netTotal - newPaidAmount));

          order.paidAmount = newPaidAmount;
          order.balanceDue = newBalance;
          order.paymentStatus = newBalance === 0 ? 'paid' : 'partial';
          order.payments.push({
            amount: appliedAmount,
            method,
            reference,
            paidAt: new Date(),
            receivedBy: new Types.ObjectId(userId),
          });
          await order.save({ session });

          appliedToInvoices.push({
            invoiceId: order._id,
            invoiceNumber: `INV-${order.orderNumber}`,
            amount: appliedAmount,
          });
          remainingAmount -= appliedAmount;
        }
      } else {
        const outstandingCents = Math.round(currentOutstanding * 100);
        const paymentCentsOut = Math.round(paymentAmount * 100);
        if (paymentCentsOut > outstandingCents) {
          throw errors.validation('Payment amount exceeds outstanding balance');
        }
        const openOrders = await Order.find({
          customerId: customer._id,
          isDeleted: false,
          paymentStatus: { $in: ['pending', 'partial'] },
          balanceDue: { $gt: 0 },
        }).sort({ 'creditInfo.dueDate': 1, createdAt: 1 }).session(session);

        for (const openOrder of openOrders) {
          if (remainingAmount <= 0) break;
          const grandTotal = openOrder.pricing?.grandTotal || 0;
          const returnCredit = openOrder.returnCreditAmount || 0;
          const netTotal = Math.max(0, grandTotal - returnCredit);
          const currentPaid = openOrder.paidAmount || 0;
          const currentBalance = Math.max(0, netTotal - currentPaid);
          const appliedAmount = Math.min(currentBalance, remainingAmount);

          if (appliedAmount > 0) {
            const newPaidAmount = roundToTwo(currentPaid + appliedAmount);
            const newBalance = roundToTwo(Math.max(0, netTotal - newPaidAmount));

            openOrder.paidAmount = newPaidAmount;
            openOrder.balanceDue = newBalance;
            openOrder.paymentStatus = newBalance === 0 ? 'paid' : 'partial';
            openOrder.payments.push({
              amount: appliedAmount,
              method,
              reference,
              paidAt: new Date(),
              receivedBy: new Types.ObjectId(userId),
            });
            await openOrder.save({ session });

            appliedToInvoices.push({
              invoiceId: openOrder._id,
              invoiceNumber: `INV-${openOrder.orderNumber}`,
              amount: appliedAmount,
            });
            remainingAmount -= appliedAmount;
          }
        }
      }

      const newOutstanding = Math.max(0, currentOutstanding - paymentAmount);

      const ledgerEntry = await CustomerLedger.create([{
        customerId: customer._id,
        customerCode: customer.customerCode,
        transactionType: 'payment',
        transactionDate: new Date(),
        referenceType: order ? 'order' : 'payment',
        referenceId: order ? order._id : undefined,
        referenceNumber: order ? `PAY-${order.orderNumber}` : undefined,
        debitAmount: 0,
        creditAmount: paymentAmount,
        balanceAfter: newOutstanding,
        paymentDetails: {
          paymentMethod: method,
          paymentReference: reference,
          bankName,
          appliedToInvoices,
          ...(cardLast4 ? { paymentReference: `****${cardLast4}` } : {}),
        },
        description: order
          ? `Payment received for order ${order.orderNumber}`
          : 'Payment received',
        createdBy: userId as any,
        updatedBy: userId as any,
      }], { session });

      customer.creditInfo.currentOutstanding = newOutstanding;
      customer.creditInfo.availableCredit = (customer.creditInfo.creditLimit || 0) - newOutstanding;
      customer.financialSummary.totalPaidAmount =
        (customer.financialSummary.totalPaidAmount || 0) + paymentAmount;
      customer.financialSummary.totalOutstanding =
        Math.max(0, (customer.financialSummary.totalOutstanding || 0) - paymentAmount);
      customer.financialSummary.lastPaymentDate = new Date();
      customer.financialSummary.lastPaymentAmount = paymentAmount;

      await customer.save({ session });
      await session.commitTransaction();

      return ledgerEntry[0];
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }
}
