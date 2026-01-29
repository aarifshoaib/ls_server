import mongoose, { Types } from 'mongoose';
import Product from '../models/Product';
import InventoryTransaction from '../models/InventoryTransaction';
import { errors } from '../utils/errors';
import { INVENTORY_TRANSACTION_TYPES } from '../utils/constants';

export class InventoryService {
  // Deduct inventory for order (called when order is delivered)
  static async deductInventoryForOrder(order: any, session: any, userId: string) {
    for (const item of order.items) {
      // Get current stock
      const product = await Product.findOne({
        _id: item.productId,
        'variants._id': item.variantId,
      }).session(session);

      if (!product) {
        throw errors.notFound(`Product with ID ${item.productId}`);
      }

      const variant = (product.variants as any).id(item.variantId);

      if (!variant) {
        throw errors.notFound(`Variant with ID ${item.variantId}`);
      }

      // Check if sufficient stock
      if (variant.stock.quantity < item.quantity) {
        throw errors.insufficientStock(
          `${item.name} ${item.variantName}`,
          variant.stock.quantity,
          item.quantity
        );
      }

      // Deduct stock
      const previousQuantity = variant.stock.quantity;
      variant.stock.quantity -= item.quantity;
      variant.stock.availableQuantity =
        variant.stock.quantity - variant.stock.reservedQuantity;

      await product.save({ session });

      // Create inventory transaction record
      const inventoryTransaction = new InventoryTransaction({
        productId: item.productId,
        variantId: item.variantId,
        variantSku: item.variantSku,
        transactionType: INVENTORY_TRANSACTION_TYPES.SALE,
        quantity: -item.quantity,
        previousQuantity: previousQuantity,
        newQuantity: variant.stock.quantity,
        referenceType: 'Order',
        referenceId: order._id,
        referenceNumber: order.orderNumber,
        performedBy: userId,
        performedAt: new Date(),
        metadata: {
          orderId: order._id,
          orderStatus: 'delivered',
          customerId: order.customerId,
        },
      });

      await inventoryTransaction.save({ session });

      // Update order item with transaction reference
      item.inventoryDeducted = true;
      item.inventoryTransactionId = inventoryTransaction._id;
    }
  }

  // Restore inventory for order (called when order is cancelled after delivery)
  static async restoreInventoryForOrder(order: any, session: any, userId: string) {
    for (const item of order.items) {
      if (!item.inventoryDeducted) {
        continue;
      }

      const product = await Product.findOne({
        _id: item.productId,
        'variants._id': item.variantId,
      }).session(session);

      if (!product) {
        continue;
      }

      const variant = (product.variants as any).id(item.variantId);

      if (!variant) {
        continue;
      }

      // Restore stock
      const previousQuantity = variant.stock.quantity;
      variant.stock.quantity += item.quantity;
      variant.stock.availableQuantity =
        variant.stock.quantity - variant.stock.reservedQuantity;

      await product.save({ session });

      // Create inventory transaction record
      const inventoryTransaction = new InventoryTransaction({
        productId: item.productId,
        variantId: item.variantId,
        variantSku: item.variantSku,
        transactionType: INVENTORY_TRANSACTION_TYPES.RETURN,
        quantity: item.quantity,
        previousQuantity: previousQuantity,
        newQuantity: variant.stock.quantity,
        referenceType: 'Order',
        referenceId: order._id,
        referenceNumber: order.orderNumber,
        performedBy: userId,
        performedAt: new Date(),
        metadata: {
          orderId: order._id,
          orderStatus: 'cancelled',
          customerId: order.customerId,
          reason: 'Order cancelled after delivery',
        },
      });

      await inventoryTransaction.save({ session });

      // Update order item
      item.inventoryDeducted = false;
    }
  }

  // Manual inventory adjustment
  static async adjustInventory(
    productId: string,
    variantId: string,
    quantity: number,
    reason: string,
    userId: string
  ) {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const product = await Product.findOne({
        _id: productId,
        'variants._id': variantId,
      }).session(session);

      if (!product) {
        throw errors.notFound('Product or variant');
      }

      const variant = (product.variants as any).id(variantId);

      if (!variant) {
        throw errors.notFound('Variant');
      }

      const previousQuantity = variant.stock.quantity;
      const newQuantity = previousQuantity + quantity;

      if (newQuantity < 0) {
        throw errors.validation('New quantity cannot be negative');
      }

      variant.stock.quantity = newQuantity;
      variant.stock.availableQuantity = newQuantity - variant.stock.reservedQuantity;

      await product.save({ session });

      // Create inventory transaction
      const transaction = new InventoryTransaction({
        productId,
        variantId,
        variantSku: variant.variantSku,
        transactionType: INVENTORY_TRANSACTION_TYPES.ADJUSTMENT,
        quantity,
        previousQuantity,
        newQuantity,
        referenceType: 'Manual',
        notes: reason,
        performedBy: userId,
        performedAt: new Date(),
      });

      await transaction.save({ session });

      await session.commitTransaction();

      return {
        product,
        transaction,
        message: 'Inventory adjusted successfully',
      };
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  // Get inventory transactions
  static async getInventoryTransactions(
    productId?: string,
    variantId?: string,
    limit: number = 50
  ) {
    const filter: any = {};

    if (productId) {
      filter.productId = new Types.ObjectId(productId);
    }

    if (variantId) {
      filter.variantId = new Types.ObjectId(variantId);
    }

    const transactions = await InventoryTransaction.find(filter)
      .sort({ performedAt: -1 })
      .limit(limit)
      .populate('performedBy', 'firstName lastName email');

    return transactions;
  }

  // Get inventory summary
  static async getInventorySummary() {
    const summary = await Product.aggregate([
      {
        $match: { status: 'active' },
      },
      {
        $unwind: '$variants',
      },
      {
        $match: { 'variants.status': 'active' },
      },
      {
        $group: {
          _id: null,
          totalProducts: { $sum: 1 },
          totalQuantity: { $sum: '$variants.stock.quantity' },
          totalValue: {
            $sum: {
              $multiply: ['$variants.stock.quantity', '$variants.price.basePrice'],
            },
          },
          lowStockCount: {
            $sum: {
              $cond: [
                { $lte: ['$variants.stock.quantity', '$variants.stock.reorderLevel'] },
                1,
                0,
              ],
            },
          },
          outOfStockCount: {
            $sum: {
              $cond: [{ $eq: ['$variants.stock.quantity', 0] }, 1, 0],
            },
          },
        },
      },
    ]);

    return summary[0] || {
      totalProducts: 0,
      totalQuantity: 0,
      totalValue: 0,
      lowStockCount: 0,
      outOfStockCount: 0,
    };
  }
}
