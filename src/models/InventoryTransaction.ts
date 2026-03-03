import mongoose, { Schema } from 'mongoose';
import { IInventoryTransaction } from '../types';

const inventoryTransactionSchema = new Schema<IInventoryTransaction>(
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
    batchId: {
      type: Schema.Types.ObjectId,
      ref: 'StockBatch',
      index: true,
    },
    variantSku: {
      type: String,
      required: true,
    },
    transactionType: {
      type: String,
      enum: ['purchase', 'sale', 'adjustment', 'return', 'purchase_return', 'transfer', 'damage'],
      required: true,
      index: true,
    },
    quantity: {
      type: Number,
      required: true,
    },
    previousQuantity: {
      type: Number,
      required: true,
    },
    newQuantity: {
      type: Number,
      required: true,
    },
    referenceType: String,
    referenceId: {
      type: Schema.Types.ObjectId,
      refPath: 'referenceType',
    },
    referenceNumber: String,
    warehouseId: {
      type: Schema.Types.ObjectId,
      ref: 'Warehouse',
    },
    notes: String,
    performedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    performedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
inventoryTransactionSchema.index({ productId: 1, variantId: 1 });
inventoryTransactionSchema.index({ transactionType: 1 });
inventoryTransactionSchema.index({ referenceType: 1, referenceId: 1 });
inventoryTransactionSchema.index({ performedAt: -1 });
inventoryTransactionSchema.index({ warehouseId: 1 });

const InventoryTransaction = mongoose.model<IInventoryTransaction>(
  'InventoryTransaction',
  inventoryTransactionSchema
);

export default InventoryTransaction;
