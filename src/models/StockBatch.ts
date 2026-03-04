import mongoose, { Schema } from 'mongoose';
import { IStockBatch } from '../types';

const stockBatchSchema = new Schema<IStockBatch>(
  {
    productId: {
      type: Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
      index: true,
    },
    variantId: {
      type: Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    variantSku: {
      type: String,
      required: true,
      index: true,
    },
    batchNumber: {
      type: String,
      required: true,
      index: true,
    },
    expiryDate: {
      type: Date,
      required: true,
      index: true,
    },
    quantity: {
      type: Number,
      required: true,
      default: 0,
    },
    reservedQuantity: {
      type: Number,
      default: 0,
    },
    availableQuantity: {
      type: Number,
      required: true,
      default: 0,
    },
    sourceReferenceType: {
      type: String,
      enum: ['PurchaseInvoice'],
      required: true,
    },
    sourceReferenceId: {
      type: Schema.Types.ObjectId,
      refPath: 'sourceReferenceType',
      required: true,
      index: true,
    },
    sourceReferenceNumber: String,
    receivedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    isExpired: {
      type: Boolean,
      default: false,
      index: true,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  { timestamps: true }
);

stockBatchSchema.index({ productId: 1, variantId: 1 });
stockBatchSchema.index({ productId: 1, variantId: 1, expiryDate: 1 });
stockBatchSchema.index({ batchNumber: 1, productId: 1, variantId: 1 }, { unique: true });

const StockBatch = mongoose.model<IStockBatch>('StockBatch', stockBatchSchema);

export default StockBatch;
