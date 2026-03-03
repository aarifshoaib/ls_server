import mongoose, { Schema } from 'mongoose';
import { IRequisition, IRequisitionItem, IRequisitionApproval } from '../types';

const requisitionItemSchema = new Schema<IRequisitionItem>(
  {
    productId: {
      type: Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
    },
    variantId: {
      type: Schema.Types.ObjectId,
      required: true,
    },
    sku: { type: String, required: true },
    variantSku: { type: String, required: true },
    productName: { type: String, required: true },
    variantName: { type: String, required: true },
    displaySize: { type: String, required: true },
    quantity: { type: Number, required: true, min: 1 },
    reason: String,
  },
  { _id: false }
);

const requisitionApprovalDecisionSchema = new Schema(
  {
    approverId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    approverRole: { type: String, required: true },
    decision: { type: String, enum: ['approved', 'rejected'], required: true },
    notes: String,
    decidedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const requisitionApprovalSchema = new Schema<IRequisitionApproval>(
  {
    required: { type: Boolean, default: false },
    status: {
      type: String,
      enum: ['not_required', 'pending', 'approved', 'rejected'],
      default: 'not_required',
    },
    approverRoles: [String],
    submittedAt: Date,
    approvedAt: Date,
    approvedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    rejectedAt: Date,
    rejectedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    decisionNotes: String,
    decisions: [requisitionApprovalDecisionSchema],
  },
  { _id: false }
);

const requisitionSchema = new Schema<IRequisition>(
  {
    requisitionNumber: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    status: {
      type: String,
      enum: ['draft', 'pending_approval', 'approved', 'rejected'],
      default: 'draft',
      index: true,
    },
    items: {
      type: [requisitionItemSchema],
      required: true,
      validate: {
        validator: (items: IRequisitionItem[]) => items.length > 0,
        message: 'At least one item is required',
      },
    },
    approval: requisitionApprovalSchema,
    requestedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    submittedAt: Date,
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

requisitionSchema.index({ requisitionNumber: 1 });
requisitionSchema.index({ status: 1 });
requisitionSchema.index({ requestedBy: 1, createdAt: -1 });

const Requisition = mongoose.model<IRequisition>('Requisition', requisitionSchema);

export default Requisition;
