import mongoose, { Schema } from 'mongoose';
import { IPurchaseInvoice, IPurchaseInvoiceItem, IPurchaseInvoicePricing, IRequisitionApproval } from '../types';

const purchaseInvoiceItemSchema = new Schema<IPurchaseInvoiceItem>(
  {
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    variantId: { type: Schema.Types.ObjectId, required: true },
    sku: { type: String, required: true },
    variantSku: { type: String, required: true },
    productName: { type: String, required: true },
    variantName: { type: String, required: true },
    displaySize: { type: String, required: true },
    quantity: { type: Number, required: true, min: 1 },
    batchNumber: { type: String, required: true },
    expiryDate: { type: Date, required: true },
    isMatched: { type: Boolean, required: true },
    purchaseOrderId: { type: Schema.Types.ObjectId, ref: 'PurchaseOrder' },
    purchaseOrderLineRef: String,
    unitPrice: { type: Number, required: true },
    taxRate: { type: Number, default: 0 },
    taxAmount: { type: Number, default: 0 },
    lineTotal: { type: Number, required: true },
    matchReason: String,
  },
  { _id: false }
);

const purchaseInvoicePricingSchema = new Schema<IPurchaseInvoicePricing>(
  {
    subtotal: { type: Number, required: true },
    taxTotal: { type: Number, default: 0 },
    grandTotal: { type: Number, required: true },
  },
  { _id: false }
);

const piApprovalDecisionSchema = new Schema(
  {
    approverId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    approverRole: { type: String, required: true },
    decision: { type: String, enum: ['approved', 'rejected'], required: true },
    notes: String,
    decidedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const piApprovalSchema = new Schema<IRequisitionApproval>(
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
    decisions: [piApprovalDecisionSchema],
  },
  { _id: false }
);

const purchaseInvoiceSchema = new Schema<IPurchaseInvoice>(
  {
    invoiceNumber: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    purchaseOrderIds: [{
      type: Schema.Types.ObjectId,
      ref: 'PurchaseOrder',
      index: true,
    }],
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
      enum: ['draft', 'pending_approval', 'approved', 'rejected', 'received', 'cancelled'],
      default: 'draft',
      index: true,
    },
    items: {
      type: [purchaseInvoiceItemSchema],
      required: true,
      validate: {
        validator: (items: IPurchaseInvoiceItem[]) => items.length > 0,
        message: 'At least one item is required',
      },
    },
    pricing: {
      type: purchaseInvoicePricingSchema,
      required: true,
    },
    approval: piApprovalSchema,
    receivedAt: { type: Date, default: Date.now },
    notes: String,
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

purchaseInvoiceSchema.index({ invoiceNumber: 1 });
purchaseInvoiceSchema.index({ vendorId: 1 });
purchaseInvoiceSchema.index({ status: 1 });
purchaseInvoiceSchema.index({ purchaseOrderIds: 1 });

const PurchaseInvoice = mongoose.model<IPurchaseInvoice>('PurchaseInvoice', purchaseInvoiceSchema);

export default PurchaseInvoice;
