import mongoose, { Types } from 'mongoose';
import Customer from '../models/Customer';
import Order from '../models/Order';
import CustomerLedger from '../models/CustomerLedger';
import { errors } from '../utils/errors';

export class PaymentService {
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
        const currentPaid = order.paidAmount || 0;
        const currentBalance = Math.max(0, grandTotal - currentPaid);

        if (paymentAmount > currentBalance) {
          throw errors.validation('Payment amount exceeds order balance');
        }

        const appliedAmount = Math.min(currentBalance, remainingAmount);

        if (appliedAmount > 0) {
          const newPaidAmount = currentPaid + appliedAmount;
          const newBalance = Math.max(0, grandTotal - newPaidAmount);

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
        if (paymentAmount > currentOutstanding) {
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
          const currentPaid = openOrder.paidAmount || 0;
          const currentBalance = Math.max(0, grandTotal - currentPaid);
          const appliedAmount = Math.min(currentBalance, remainingAmount);

          if (appliedAmount > 0) {
            const newPaidAmount = currentPaid + appliedAmount;
            const newBalance = Math.max(0, grandTotal - newPaidAmount);

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
