import mongoose, { Schema } from 'mongoose';
import { IPurchaseOrder, IPurchaseOrderItem, IPurchaseOrderPricing, IRequisitionApproval } from '../types';

const purchaseOrderItemSchema = new Schema<IPurchaseOrderItem>(
  {
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    variantId: { type: Schema.Types.ObjectId, required: true },
    sku: { type: String, required: true },
    variantSku: { type: String, required: true },
    productName: { type: String, required: true },
    variantName: { type: String, required: true },
    displaySize: { type: String, required: true },
    quantity: { type: Number, required: true, min: 1 },
    receivedQuantity: { type: Number, default: 0 },
    unitPrice: { type: Number, required: true, default: 0 },
    taxRate: { type: Number, default: 0 },
    taxAmount: { type: Number, default: 0 },
    lineTotal: { type: Number, required: true },
  },
  { _id: false }
);

const purchaseOrderPricingSchema = new Schema<IPurchaseOrderPricing>(
  {
    subtotal: { type: Number, required: true },
    taxTotal: { type: Number, default: 0 },
    grandTotal: { type: Number, required: true },
  },
  { _id: false }
);

const poApprovalDecisionSchema = new Schema(
  {
    approverId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    approverRole: { type: String, required: true },
    decision: { type: String, enum: ['approved', 'rejected'], required: true },
    notes: String,
    decidedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const poApprovalSchema = new Schema<IRequisitionApproval>(
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
    decisions: [poApprovalDecisionSchema],
  },
  { _id: false }
);

const purchaseOrderSchema = new Schema<IPurchaseOrder>(
  {
    purchaseOrderNumber: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    requisitionId: {
      type: Schema.Types.ObjectId,
      ref: 'Requisition',
      required: true,
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
      enum: ['draft', 'pending_approval', 'approved', 'rejected', 'sent', 'partially_received', 'received', 'cancelled'],
      default: 'draft',
      index: true,
    },
    items: {
      type: [purchaseOrderItemSchema],
      required: true,
      validate: {
        validator: (items: IPurchaseOrderItem[]) => items.length > 0,
        message: 'At least one item is required',
      },
    },
    pricing: {
      type: purchaseOrderPricingSchema,
      required: true,
    },
    approval: poApprovalSchema,
    notes: String,
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

purchaseOrderSchema.index({ purchaseOrderNumber: 1 });
purchaseOrderSchema.index({ requisitionId: 1 });
purchaseOrderSchema.index({ vendorId: 1 });
purchaseOrderSchema.index({ status: 1 });

const PurchaseOrder = mongoose.model<IPurchaseOrder>('PurchaseOrder', purchaseOrderSchema);

export default PurchaseOrder;
