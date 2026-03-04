import mongoose, { Schema } from 'mongoose';
import { IOrder, IOrderAddress, IOrderItem, IOrderPricing, IPayment, IOrderCreditInfo, IStatusHistory, IFulfillment, IShipping, ILinkedOrder } from '../types';

const orderAddressSchema = new Schema<IOrderAddress>(
  {
    addressLine1: { type: String, required: true },
    addressLine2: String,
    city: { type: String, required: true },
    state: String,
    country: { type: String, required: true },
    postalCode: String,
    contactPerson: String,
    contactPhone: String,
    deliveryInstructions: String,
  },
  { _id: false }
);

const orderItemSchema = new Schema<IOrderItem>({
  productId: {
    type: Schema.Types.ObjectId,
    ref: 'Product',
    required: true,
  },
  variantId: {
    type: Schema.Types.ObjectId,
    required: true,
  },
  sku: {
    type: String,
    required: true,
  },
  variantSku: {
    type: String,
    required: true,
  },
  barcode: String,
  productCode: String,
  name: {
    type: String,
    required: true,
  },
  variantName: {
    type: String,
    required: true,
  },
  displaySize: {
    type: String,
    required: true,
  },
  quantity: {
    type: Number,
    required: true,
  },
  sellBy: {
    type: String,
    enum: ['unit', 'pcs'],
  },
  pcsPerUnit: {
    type: Number,
    min: 1,
  },
  unitPrice: {
    type: Number,
    required: true,
  },
  discountPercent: {
    type: Number,
    default: 0,
  },
  discountAmount: {
    type: Number,
    default: 0,
  },
  taxRate: {
    type: Number,
    default: 5,
  },
  taxAmount: {
    type: Number,
    default: 0,
  },
  lineTotal: {
    type: Number,
    required: true,
  },
  inventoryDeducted: {
    type: Boolean,
    default: false,
  },
  batchId: {
    type: Schema.Types.ObjectId,
    ref: 'StockBatch',
  },
  batchNumber: String,
  expiryDate: Date,
  inventoryTransactionId: {
    type: Schema.Types.ObjectId,
    ref: 'InventoryTransaction',
  },
  returnedQuantity: {
    type: Number,
    default: 0,
  },
  returnedQuantityPieces: {
    type: Number,
    default: 0,
  },
});

const orderPricingSchema = new Schema<IOrderPricing>(
  {
    subtotal: { type: Number, required: true },
    itemDiscountTotal: { type: Number, default: 0 },
    orderDiscount: {
      type: {
        type: String,
        enum: ['percent', 'fixed'],
      },
      value: Number,
      amount: Number,
      code: String,
      reason: String,
    },
    taxTotal: { type: Number, default: 0 },
    shippingCharge: { type: Number, default: 0 },
    shippingDiscount: { type: Number, default: 0 },
    grandTotal: { type: Number, required: true },
    roundingAdjustment: { type: Number, default: 0 },
  },
  { _id: false }
);

const paymentSchema = new Schema<IPayment>({
  amount: { type: Number, required: true },
  method: {
    type: String,
    enum: ['cod', 'credit', 'prepaid', 'cash', 'bank_transfer', 'cheque', 'card'],
    required: true,
  },
  reference: String,
  paidAt: { type: Date, default: Date.now },
  receivedBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
  },
});

const orderCreditInfoSchema = new Schema<IOrderCreditInfo>(
  {
    isCreditSale: { type: Boolean, default: false },
    creditDays: { type: Number, default: 0 },
    dueDate: Date,
    invoiceNumber: String,
    ledgerEntryId: {
      type: Schema.Types.ObjectId,
      ref: 'CustomerLedger',
    },
  },
  { _id: false }
);

const statusHistorySchema = new Schema<IStatusHistory>(
  {
    status: {
      type: String,
      required: true,
    },
    timestamp: {
      type: Date,
      default: Date.now,
    },
    updatedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    notes: String,
  },
  { _id: false }
);

const orderApprovalDecisionSchema = new Schema(
  {
    approverId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    approverRole: {
      type: String,
      required: true,
    },
    decision: {
      type: String,
      enum: ['approved', 'rejected'],
      required: true,
    },
    notes: String,
    decidedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false }
);

const orderApprovalSchema = new Schema(
  {
    required: {
      type: Boolean,
      default: false,
    },
    status: {
      type: String,
      enum: ['not_required', 'pending', 'approved', 'rejected'],
      default: 'not_required',
      index: true,
    },
    approverRoles: [String],
    submittedAt: Date,
    approvedAt: Date,
    approvedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    rejectedAt: Date,
    rejectedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    decisionNotes: String,
    decisions: {
      type: [orderApprovalDecisionSchema],
      default: [],
    },
  },
  { _id: false }
);

const fulfillmentSchema = new Schema<IFulfillment>(
  {
    warehouseId: {
      type: Schema.Types.ObjectId,
      ref: 'Warehouse',
    },
    pickedAt: Date,
    pickedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    packedAt: Date,
    packedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    shippedAt: Date,
    shippedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    deliveredAt: Date,
    deliveredBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    deliveryProof: {
      signature: String,
      photo: String,
      receiverName: String,
    },
  },
  { _id: false }
);

const shippingSchema = new Schema<IShipping>(
  {
    method: String,
    carrier: String,
    trackingNumber: String,
    estimatedDelivery: Date,
    actualDelivery: Date,
    weight: Number,
    packages: Number,
  },
  { _id: false }
);

const linkedOrderSchema = new Schema<ILinkedOrder>(
  {
    orderId: {
      type: Schema.Types.ObjectId,
      ref: 'Order',
      required: true,
    },
    orderNumber: {
      type: String,
      required: true,
    },
    type: {
      type: String,
      required: true,
    },
  },
  { _id: false }
);

const orderSchema = new Schema<IOrder>(
  {
    orderNumber: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
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
    customerName: {
      type: String,
      required: true,
    },
    customerEmail: String,
    customerPhone: {
      type: String,
      required: true,
    },
    orderType: {
      type: String,
      enum: ['sales', 'return', 'exchange'],
      default: 'sales',
    },
    orderSource: {
      type: String,
      enum: ['web', 'mobile', 'pos', 'phone', 'whatsapp'],
      default: 'web',
    },
    billingAddress: {
      type: orderAddressSchema,
      required: true,
    },
    shippingAddress: {
      type: orderAddressSchema,
      required: true,
    },
    items: [orderItemSchema],
    pricing: {
      type: orderPricingSchema,
      required: true,
    },
    paymentStatus: {
      type: String,
      enum: ['pending', 'partial', 'paid', 'refunded'],
      default: 'pending',
      index: true,
    },
    paymentMethod: {
      type: String,
      enum: ['cod', 'credit', 'prepaid', 'cash', 'bank_transfer', 'cheque', 'card'],
      required: true,
    },
    paidAmount: {
      type: Number,
      default: 0,
    },
    balanceDue: {
      type: Number,
      default: 0,
    },
    returnCreditAmount: {
      type: Number,
      default: 0,
    },
    payments: [paymentSchema],
    creditInfo: orderCreditInfoSchema,
    status: {
      type: String,
      enum: [
        'draft',
        'pending',
        'confirmed',
        'invoiced',
        'processing',
        'packed',
        'picked',
        'ready_to_deliver',
        'ready_to_ship',
        'out_for_delivery',
        'shipped',
        'delivered',
        'cancelled',
        'returned',
        'partially_returned',
      ],
      default: 'pending',
      index: true,
    },
    statusHistory: [statusHistorySchema],
    approval: {
      type: orderApprovalSchema,
      default: {
        required: false,
        status: 'not_required',
        approverRoles: [],
        decisions: [],
      },
    },
    fulfillment: {
      type: fulfillmentSchema,
      default: {},
    },
    shipping: shippingSchema,
    notes: String,
    internalNotes: String,
    tags: [String],
    linkedOrders: [linkedOrderSchema],
    batchSelections: [{
      productId: { type: Schema.Types.ObjectId, ref: 'Product' },
      variantId: Schema.Types.ObjectId,
      allocations: [{
        batchId: { type: Schema.Types.ObjectId, ref: 'StockBatch' },
        quantity: { type: Number, required: true, min: 1 },
      }],
    }],
    assignedTo: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      index: true,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    updatedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
    deletedAt: Date,
    deletedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
orderSchema.index({ orderNumber: 1 });
orderSchema.index({ customerId: 1, createdAt: -1 });
orderSchema.index({ status: 1 });
orderSchema.index({ paymentStatus: 1 });
orderSchema.index({ createdAt: -1 });
orderSchema.index({ 'creditInfo.dueDate': 1 });
orderSchema.index({ assignedTo: 1 });
orderSchema.index({ 'items.productId': 1 });
orderSchema.index({ 'items.variantId': 1 });

const Order = mongoose.model<IOrder>('Order', orderSchema);

export default Order;
