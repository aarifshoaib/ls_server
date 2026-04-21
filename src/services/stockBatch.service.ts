import mongoose, { Types } from 'mongoose';
import Product from '../models/Product';
import StockBatch from '../models/StockBatch';
import InventoryTransaction from '../models/InventoryTransaction';
import { errors } from '../utils/errors';
import { INVENTORY_TRANSACTION_TYPES } from '../utils/constants';

export class StockBatchService {
  /**
   * Add stock from Purchase Invoice - creates batch(es) and updates variant stock.
   * quantity + receiveUom: 'unit' => convert to pieces via pcsPerUnit; 'pcs' => use quantity as pieces.
   */
  static async addStockFromPurchase(
    productId: Types.ObjectId,
    variantId: Types.ObjectId,
    variantSku: string,
    batchNumber: string,
    expiryDate: Date,
    quantity: number,
    sourceReferenceId: Types.ObjectId,
    sourceReferenceNumber: string,
    userId: string,
    session: mongoose.ClientSession,
    receiveUom: 'unit' | 'pcs' = 'unit'
  ) {
    const now = new Date();
    const isExpired = expiryDate <= now;

    const product = await Product.findOne({ _id: productId }).session(session);
    if (!product) throw errors.notFound('Product');
    const variant = (product.variants as any).id(variantId);
    if (!variant) throw errors.notFound('Variant');
    const pcsPerUnit = Math.max(1, (variant as any).salesUom?.pcsPerUnit || 1);
    const quantityInPieces = receiveUom === 'pcs'
      ? Math.round(quantity)
      : Math.round(quantity * pcsPerUnit);

    let batch = await StockBatch.findOne({
      productId,
      variantId,
      batchNumber,
    }).session(session);

    if (batch) {
      const existingExpiry = new Date(batch.expiryDate).toISOString().split('T')[0];
      const newExpiry = new Date(expiryDate).toISOString().split('T')[0];
      if (existingExpiry !== newExpiry) {
        throw errors.validation(
          `Batch ${batchNumber} already exists for this product/variant with expiry ${existingExpiry}. Use the same expiry date or a different batch number.`
        );
      }
      batch.quantity += quantityInPieces;
      batch.availableQuantity += quantityInPieces;
      await batch.save({ session });
    } else {
      batch = new StockBatch({
        productId,
        variantId,
        variantSku,
        batchNumber,
        expiryDate,
        quantity: quantityInPieces,
        reservedQuantity: 0,
        availableQuantity: quantityInPieces,
        sourceReferenceType: 'PurchaseInvoice',
        sourceReferenceId,
        sourceReferenceNumber,
        receivedAt: now,
        isExpired,
        createdBy: userId,
      });
      await batch.save({ session });
    }

    // Update variant-level stock on Product (in pieces)
    const previousQuantity = variant.stock.quantity;
    variant.stock.quantity += quantityInPieces;
    variant.stock.availableQuantity = variant.stock.quantity - (variant.stock.reservedQuantity || 0);
    await product.save({ session });

    // Create inventory transaction
    const transaction = new InventoryTransaction({
      productId,
      variantId,
      batchId: batch._id,
      variantSku,
      transactionType: INVENTORY_TRANSACTION_TYPES.PURCHASE,
      quantity: quantityInPieces,
      previousQuantity,
      newQuantity: variant.stock.quantity,
      referenceType: 'PurchaseInvoice',
      referenceId: sourceReferenceId,
      referenceNumber: sourceReferenceNumber,
      performedBy: userId,
      performedAt: now,
      metadata: { batchId: batch._id, batchNumber, expiryDate },
    });
    await transaction.save({ session });

    return { batch, product, transaction };
  }

  /**
   * Get available batches for a variant (for manual selection during sales)
   * Returns batches sorted by expiry (FEFO) - earliest expiry first
   */
  static async getBatchesByVariant(
    productId: string,
    variantId: string,
    includeExpired = false
  ) {
    const filter: Record<string, unknown> = {
      productId: new Types.ObjectId(productId),
      variantId: new Types.ObjectId(variantId),
      availableQuantity: { $gt: 0 },
    };
    if (!includeExpired) {
      filter.isExpired = false;
      filter.expiryDate = { $gt: new Date() };
    }

    const batches = await StockBatch.find(filter)
      .sort({ expiryDate: 1 }) // FEFO
      .lean();

    return batches;
  }

  /**
   * Deduct from a specific batch (for sales order with manual batch selection)
   */
  static async deductFromBatch(
    batchId: string,
    quantity: number,
    orderId: Types.ObjectId,
    orderNumber: string,
    userId: string,
    session: mongoose.ClientSession,
    extraMetadata?: Record<string, unknown>
  ) {
    const batch = await StockBatch.findById(batchId).session(session);
    if (!batch) throw errors.notFound('Stock batch');

    if (batch.availableQuantity < quantity) {
      throw errors.insufficientStock(
        `Batch ${batch.batchNumber}`,
        batch.availableQuantity,
        quantity
      );
    }

    if (batch.isExpired || batch.expiryDate <= new Date()) {
      throw errors.validation('Cannot sell from expired batch');
    }

    // Update batch
    batch.quantity -= quantity;
    batch.availableQuantity -= quantity;
    await batch.save({ session });

    // Update variant-level stock
    const product = await Product.findOne({ _id: batch.productId }).session(session);
    if (!product) throw errors.notFound('Product');

    const variant = (product.variants as any).id(batch.variantId);
    if (!variant) throw errors.notFound('Variant');

    const previousQuantity = variant.stock.quantity;
    variant.stock.quantity -= quantity;
    variant.stock.availableQuantity = variant.stock.quantity - (variant.stock.reservedQuantity || 0);
    await product.save({ session });

    // Create inventory transaction
    const transaction = new InventoryTransaction({
      productId: batch.productId,
      variantId: batch.variantId,
      batchId: batch._id,
      variantSku: batch.variantSku,
      transactionType: INVENTORY_TRANSACTION_TYPES.SALE,
      quantity: -quantity,
      previousQuantity,
      newQuantity: variant.stock.quantity,
      referenceType: 'Order',
      referenceId: orderId,
      referenceNumber: orderNumber,
      performedBy: userId,
      performedAt: new Date(),
      metadata: {
        batchId: batch._id,
        batchNumber: batch.batchNumber,
        ...(extraMetadata && typeof extraMetadata === 'object' ? extraMetadata : {}),
      },
    });
    await transaction.save({ session });

    return { batch, transaction };
  }

  /**
   * Deduct from batch for purchase return (returning goods to vendor)
   */
  static async deductFromBatchForPurchaseReturn(
    batchId: string,
    quantity: number,
    purchaseReturnId: Types.ObjectId,
    returnNumber: string,
    userId: string,
    session: mongoose.ClientSession
  ) {
    const batch = await StockBatch.findById(batchId).session(session);
    if (!batch) throw errors.notFound('Stock batch');

    if (batch.availableQuantity < quantity) {
      throw errors.insufficientStock(
        `Batch ${batch.batchNumber}`,
        batch.availableQuantity,
        quantity
      );
    }

    batch.quantity -= quantity;
    batch.availableQuantity -= quantity;
    await batch.save({ session });

    const product = await Product.findOne({ _id: batch.productId }).session(session);
    if (!product) throw errors.notFound('Product');

    const variant = (product.variants as any).id(batch.variantId);
    if (!variant) throw errors.notFound('Variant');

    const previousQuantity = variant.stock.quantity;
    variant.stock.quantity -= quantity;
    variant.stock.availableQuantity = variant.stock.quantity - (variant.stock.reservedQuantity || 0);
    await product.save({ session });

    const transaction = new InventoryTransaction({
      productId: batch.productId,
      variantId: batch.variantId,
      batchId: batch._id,
      variantSku: batch.variantSku,
      transactionType: INVENTORY_TRANSACTION_TYPES.PURCHASE_RETURN,
      quantity: -quantity,
      previousQuantity,
      newQuantity: variant.stock.quantity,
      referenceType: 'PurchaseReturn',
      referenceId: purchaseReturnId,
      referenceNumber: returnNumber,
      performedBy: userId,
      performedAt: new Date(),
      metadata: { batchId: batch._id, batchNumber: batch.batchNumber },
    });
    await transaction.save({ session });

    return { batch, transaction };
  }

  /**
   * Add back to batch (for order cancellation after delivery)
   */
  static async addBackToBatch(
    batchId: string,
    quantity: number,
    orderId: Types.ObjectId,
    orderNumber: string,
    userId: string,
    session: mongoose.ClientSession
  ) {
    const batch = await StockBatch.findById(batchId).session(session);
    if (!batch) throw errors.notFound('Stock batch');

    batch.quantity += quantity;
    batch.availableQuantity += quantity;
    await batch.save({ session });

    const product = await Product.findOne({ _id: batch.productId }).session(session);
    if (!product) throw errors.notFound('Product');

    const variant = (product.variants as any).id(batch.variantId);
    if (!variant) throw errors.notFound('Variant');

    const previousQuantity = variant.stock.quantity;
    variant.stock.quantity += quantity;
    variant.stock.availableQuantity = variant.stock.quantity - (variant.stock.reservedQuantity || 0);
    await product.save({ session });

    const transaction = new InventoryTransaction({
      productId: batch.productId,
      variantId: batch.variantId,
      batchId: batch._id,
      variantSku: batch.variantSku,
      transactionType: INVENTORY_TRANSACTION_TYPES.RETURN,
      quantity,
      previousQuantity,
      newQuantity: variant.stock.quantity,
      referenceType: 'Order',
      referenceId: orderId,
      referenceNumber: orderNumber,
      performedBy: userId,
      performedAt: new Date(),
      metadata: { batchId: batch._id, batchNumber: batch.batchNumber, reason: 'Order cancelled' },
    });
    await transaction.save({ session });

    return { batch, transaction };
  }

  /**
   * Mark expired batches (scheduled job or on-demand)
   */
  static async markExpiredBatches() {
    const result = await StockBatch.updateMany(
      { expiryDate: { $lte: new Date() }, isExpired: false },
      { $set: { isExpired: true } }
    );
    return result.modifiedCount;
  }
}
