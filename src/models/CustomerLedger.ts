import mongoose, { Schema } from 'mongoose';
import { ICustomerLedger, IInvoiceDetails, IPaymentDetails } from '../types';

const invoiceDetailsSchema = new Schema<IInvoiceDetails>(
  {
    dueDate: Date,
    paymentTerms: String,
    isPaid: {
      type: Boolean,
      default: false,
    },
    paidAmount: {
      type: Number,
      default: 0,
    },
    paidDate: Date,
    isOverdue: {
      type: Boolean,
      default: false,
    },
    daysOverdue: {
      type: Number,
      default: 0,
    },
  },
  { _id: false }
);

const paymentDetailsSchema = new Schema<IPaymentDetails>(
  {
    paymentMethod: String,
    paymentReference: String,
    bankName: String,
    appliedToInvoices: [
      {
        invoiceId: {
          type: Schema.Types.ObjectId,
          ref: 'CustomerLedger',
        },
        invoiceNumber: String,
        amount: Number,
      },
    ],
  },
  { _id: false }
);

const customerLedgerSchema = new Schema<ICustomerLedger>(
  {
    customerId: {
      type: Schema.Types.ObjectId,
      ref: 'Customer',
      required: true,
      index: true,
    },
    customerCode: {
      type: String,
      required: true,
    },
    transactionType: {
      type: String,
      enum: ['invoice', 'payment', 'credit_note', 'debit_note', 'adjustment'],
      required: true,
      index: true,
    },
    transactionDate: {
      type: Date,
      required: true,
      default: Date.now,
    },
    referenceType: String,
    referenceId: {
      type: Schema.Types.ObjectId,
      refPath: 'referenceType',
    },
    referenceNumber: String,
    debitAmount: {
      type: Number,
      default: 0,
    },
    creditAmount: {
      type: Number,
      default: 0,
    },
    balanceAfter: {
      type: Number,
      required: true,
    },
    invoiceDetails: invoiceDetailsSchema,
    paymentDetails: paymentDetailsSchema,
    description: String,
    notes: String,
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    updatedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
customerLedgerSchema.index({ customerId: 1, transactionDate: -1 });
customerLedgerSchema.index({ transactionType: 1 });
customerLedgerSchema.index({ referenceType: 1, referenceId: 1 });
customerLedgerSchema.index({ 'invoiceDetails.dueDate': 1 });
customerLedgerSchema.index({ 'invoiceDetails.isOverdue': 1 });

const CustomerLedger = mongoose.model<ICustomerLedger>('CustomerLedger', customerLedgerSchema);

export default CustomerLedger;
