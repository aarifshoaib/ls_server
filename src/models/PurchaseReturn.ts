import mongoose, { Schema } from 'mongoose';
import { IPurchaseReturn, IPurchaseReturnItem, IRequisitionApproval } from '../types';

const purchaseReturnItemSchema = new Schema<IPurchaseReturnItem>(
  {
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    variantId: { type: Schema.Types.ObjectId, required: true },
    sku: { type: String, required: true },
    variantSku: { type: String, required: true },
    productName: { type: String, required: true },
    variantName: { type: String, required: true },
    displaySize: { type: String, required: true },
    quantity: { type: Number, required: true, min: 1 },
    returnUom: { type: String, enum: ['unit', 'pcs'], default: 'unit' },
    batchId: { type: Schema.Types.ObjectId, ref: 'StockBatch', required: true },
    batchNumber: { type: String, required: true },
    expiryDate: { type: Date, required: true },
    reason: String,
  },
  { _id: false }
);

const prApprovalDecisionSchema = new Schema(
  {
    approverId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    approverRole: { type: String, required: true },
    decision: { type: String, enum: ['approved', 'rejected'], required: true },
    notes: String,
    decidedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const prApprovalSchema = new Schema<IRequisitionApproval>(
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
    decisions: [prApprovalDecisionSchema],
  },
  { _id: false }
);

const purchaseReturnSchema = new Schema<IPurchaseReturn>(
  {
    returnNumber: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    vendorId: {
      type: Schema.Types.ObjectId,
      ref: 'Vendor',
      required: true,
      index: true,
    },
    vendorName: { type: String, required: true },
    vendorCode: { type: String, required: true },
    status: {
      type: String,
      enum: ['draft', 'pending_approval', 'approved', 'rejected', 'completed', 'cancelled'],
      default: 'draft',
      index: true,
    },
    items: {
      type: [purchaseReturnItemSchema],
      required: true,
      validate: {
        validator: (items: IPurchaseReturnItem[]) => items.length > 0,
        message: 'At least one item is required',
      },
    },
    approval: prApprovalSchema,
    submittedAt: Date,
    notes: String,
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

purchaseReturnSchema.index({ returnNumber: 1 });
purchaseReturnSchema.index({ vendorId: 1 });
purchaseReturnSchema.index({ status: 1 });

const PurchaseReturn = mongoose.model<IPurchaseReturn>('PurchaseReturn', purchaseReturnSchema);

export default PurchaseReturn;
