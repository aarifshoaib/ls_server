import mongoose, { Schema } from 'mongoose';

export interface IPaymentRequest {
  _id: mongoose.Types.ObjectId;
  customerId: mongoose.Types.ObjectId;
  orderId?: mongoose.Types.ObjectId;
  amount: number;
  method: string;
  reference?: string;
  bankName?: string;
  cardLast4?: string;
  status: 'pending_approval' | 'approved' | 'rejected';
  requestedBy: mongoose.Types.ObjectId;
  requestedAt: Date;
  approvedBy?: mongoose.Types.ObjectId;
  approvedAt?: Date;
  rejectionReason?: string;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const paymentRequestSchema = new Schema<IPaymentRequest>(
  {
    customerId: {
      type: Schema.Types.ObjectId,
      ref: 'Customer',
      required: true,
      index: true,
    },
    orderId: {
      type: Schema.Types.ObjectId,
      ref: 'Order',
      index: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    method: {
      type: String,
      required: true,
    },
    reference: String,
    bankName: String,
    cardLast4: String,
    status: {
      type: String,
      enum: ['pending_approval', 'approved', 'rejected'],
      default: 'pending_approval',
      index: true,
    },
    requestedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    requestedAt: {
      type: Date,
      default: Date.now,
    },
    approvedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    approvedAt: Date,
    rejectionReason: String,
    notes: String,
  },
  { timestamps: true }
);

paymentRequestSchema.index({ status: 1, requestedAt: -1 });

const PaymentRequest = mongoose.model<IPaymentRequest>('PaymentRequest', paymentRequestSchema);

export default PaymentRequest;
