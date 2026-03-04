import mongoose, { Types } from 'mongoose';
import Product from '../models/Product';
import StockBatch from '../models/StockBatch';
import InventoryTransaction from '../models/InventoryTransaction';
import { StockBatchService } from './stockBatch.service';
import { errors } from '../utils/errors';
import { INVENTORY_TRANSACTION_TYPES } from '../utils/constants';

export interface BatchAllocation {
  batchId: string;
  quantity: number;
}

export interface ItemBatchSelection {
  productId: string;
  variantId: string;
  allocations: BatchAllocation[];
}

/** Order quantity in pieces for batch/variant deduction (batch stores in pieces) */
function getQuantityInPieces(item: any): number {
  const qty = Number(item.quantity) || 0;
  const sellBy = item.sellBy;
  const pcsPerUnit = Math.max(1, Number(item.pcsPerUnit) || 1);
  if (sellBy === 'unit') return Math.round(qty * pcsPerUnit);
  return qty;
}

/**
 * Deduct inventory for order (called when order is delivered).
 * Uses batch-level deduction when batches exist; supports manual batch selection or FEFO.
 * Batch stores in PIECES; order quantity (unit or pcs) is converted to pieces for deduction.
 */
export class InventoryService {
  static async deductInventoryForOrder(
    order: any,
    session: any,
    userId: string,
    batchSelections?: ItemBatchSelection[]
  ) {
    const processedManual = new Set<string>();
    const processedFefoOrVariant = new Set<string>();

    for (const item of order.items) {
      const pid = item.productId?.toString?.() || item.productId;
      const vid = item.variantId?.toString?.() || item.variantId;
      const key = `${pid}:${vid}`;
      const manualAllocations = batchSelections?.find(
        (s) => (s.productId?.toString?.() || s.productId) === pid && (s.variantId?.toString?.() || s.variantId) === vid
      )?.allocations;

      if (manualAllocations?.length) {
        if (processedManual.has(key)) continue;
        processedManual.add(key);

        const allocTotalPieces = manualAllocations.reduce((s, a) => s + (Number(a.quantity) || 0), 0);
        const matchingItems = order.items.filter(
          (i: any) => (i.productId?.toString?.() || i.productId) === pid && (i.variantId?.toString?.() || i.variantId) === vid
        );
        const orderQtyPieces = matchingItems.reduce((s: number, i: any) => s + getQuantityInPieces(i), 0);

        if (allocTotalPieces !== orderQtyPieces) {
          throw errors.validation(
            `Batch allocation total (${allocTotalPieces} pcs) must equal order quantity (${orderQtyPieces} pcs) for ${item.name}`
          );
        }
        for (const a of manualAllocations) {
          const qtyPieces = Number(a.quantity) || 0;
          if (qtyPieces <= 0) continue;
          await StockBatchService.deductFromBatch(
            a.batchId,
            qtyPieces,
            order._id,
            order.orderNumber,
            userId,
            session
          );
        }
        for (const i of matchingItems) i.inventoryDeducted = true;
        continue;
      }

      if (processedFefoOrVariant.has(key)) continue;

      const batches = await StockBatchService.getBatchesByVariant(pid, vid, false);
      if (batches.length > 0) {
        processedFefoOrVariant.add(key);
        const needPieces = order.items
          .filter((i: any) => (i.productId?.toString?.() || i.productId) === pid && (i.variantId?.toString?.() || i.variantId) === vid)
          .reduce((s: number, i: any) => s + getQuantityInPieces(i), 0);
        let remaining = needPieces;
        for (const batch of batches) {
          if (remaining <= 0) break;
          const deduct = Math.min(remaining, batch.availableQuantity);
          if (deduct <= 0) continue;
          await StockBatchService.deductFromBatch(
            (batch as any)._id.toString(),
            deduct,
            order._id,
            order.orderNumber,
            userId,
            session
          );
          remaining -= deduct;
        }
        if (remaining > 0) {
          throw errors.insufficientStock(
            `${item.name} ${item.variantName}`,
            needPieces - remaining,
            needPieces
          );
        }
        for (const i of order.items) {
          if ((i.productId?.toString?.() || i.productId) === pid && (i.variantId?.toString?.() || i.variantId) === vid) {
            i.inventoryDeducted = true;
          }
        }
        continue;
      }

      // Fallback: variant-level deduction (no batches)
      processedFefoOrVariant.add(key);
      const product = await Product.findOne({
        _id: item.productId,
        'variants._id': item.variantId,
      }).session(session);

      if (!product) throw errors.notFound(`Product with ID ${item.productId}`);
      const variant = (product.variants as any).id(item.variantId);
      if (!variant) throw errors.notFound(`Variant with ID ${item.variantId}`);
      const needPieces = order.items
        .filter((i: any) => (i.productId?.toString?.() || i.productId) === item.productId?.toString?.() && (i.variantId?.toString?.() || i.variantId) === item.variantId?.toString?.())
        .reduce((s: number, i: any) => s + getQuantityInPieces(i), 0);
      if (variant.stock.quantity < needPieces) {
        throw errors.insufficientStock(
          `${item.name} ${item.variantName}`,
          variant.stock.quantity,
          needPieces
        );
      }

      const previousQuantity = variant.stock.quantity;
      variant.stock.quantity -= needPieces;
      variant.stock.availableQuantity =
        variant.stock.quantity - (variant.stock.reservedQuantity || 0);
      await product.save({ session });

      const inventoryTransaction = new InventoryTransaction({
        productId: item.productId,
        variantId: item.variantId,
        variantSku: item.variantSku,
        transactionType: INVENTORY_TRANSACTION_TYPES.SALE,
        quantity: -needPieces,
        previousQuantity,
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
      for (const i of order.items) {
        if ((i.productId?.toString?.() || i.productId) === pid && (i.variantId?.toString?.() || i.variantId) === vid) {
          i.inventoryDeducted = true;
          i.inventoryTransactionId = inventoryTransaction._id;
        }
      }
    }
  }

  /**
   * Restore inventory for partial return - only specified items/quantities.
   * returnItems: [{ itemIndex, returnedQuantity, returnUom?: 'unit'|'pcs' }]
   * Restores to same batch from order (item.batchId) when available, else sale transactions FIFO.
   */
  static async restoreInventoryForPartialReturn(
    order: any,
    returnItems: Array<{ itemIndex: number; returnedQuantity: number; returnUom?: 'unit' | 'pcs' }>,
    session: any,
    userId: string,
    reason = 'Partial return'
  ) {
    const saleTransactions = await InventoryTransaction.find({
      referenceType: 'Order',
      referenceId: order._id,
      transactionType: 'sale',
    })
      .sort({ performedAt: 1 })
      .session(session);

    const batchTxByVariant = new Map<string, Array<{ batchId: string; quantity: number }>>();
    for (const tx of saleTransactions) {
      const bid = (tx as any).batchId?.toString?.();
      if (bid) {
        const key = `${tx.productId}:${tx.variantId}`;
        if (!batchTxByVariant.has(key)) batchTxByVariant.set(key, []);
        batchTxByVariant.get(key)!.push({ batchId: bid, quantity: Math.abs((tx as any).quantity) || 0 });
      }
    }

    for (const { itemIndex, returnedQuantity, returnUom } of returnItems) {
      if (returnedQuantity <= 0) continue;
      const item = order.items[itemIndex];
      if (!item) continue;

      const pcsPerUnit = Math.max(1, item.pcsPerUnit || 1);
      const totalPiecesInLine = item.sellBy === 'unit'
        ? (item.quantity || 0) * pcsPerUnit
        : (item.quantity || 0);
      const alreadyReturnedPieces = item.returnedQuantityPieces || 0;
      const maxReturnPieces = totalPiecesInLine - alreadyReturnedPieces;
      if (maxReturnPieces <= 0) continue;

      const uom = returnUom || item.sellBy || 'unit';
      const restorePieces = uom === 'unit'
        ? Math.min(Math.round(returnedQuantity * pcsPerUnit), maxReturnPieces)
        : Math.min(Math.round(returnedQuantity), maxReturnPieces);
      if (restorePieces <= 0) continue;

      const pid = item.productId?.toString?.() || item.productId;
      const vid = item.variantId?.toString?.() || item.variantId;
      const key = `${pid}:${vid}`;
      let remaining = restorePieces;

      const itemBatchId = item.batchId?.toString?.();
      if (itemBatchId && remaining > 0) {
        const batch = await StockBatch.findById(itemBatchId).session(session);
        if (batch && String(batch.productId) === pid && String(batch.variantId) === vid) {
          await StockBatchService.addBackToBatch(
            itemBatchId,
            remaining,
            order._id,
            order.orderNumber,
            userId,
            session
          );
          remaining = 0;
        }
      }

      if (remaining > 0) {
        const batchTxs = batchTxByVariant.get(key) || [];
        for (const { batchId, quantity } of batchTxs) {
          if (remaining <= 0) break;
          const toRestore = Math.min(remaining, quantity);
          if (toRestore <= 0) continue;
          await StockBatchService.addBackToBatch(batchId, toRestore, order._id, order.orderNumber, userId, session);
          remaining -= toRestore;
        }
      }

      if (remaining > 0) {
        const product = await Product.findOne({ _id: pid, 'variants._id': vid }).session(session);
        if (product) {
          const variant = (product.variants as any).id(vid);
          if (variant) {
            const prev = variant.stock.quantity;
            variant.stock.quantity += remaining;
            variant.stock.availableQuantity = variant.stock.quantity - (variant.stock.reservedQuantity || 0);
            await product.save({ session });
            await InventoryTransaction.create([{
              productId: pid,
              variantId: vid,
              variantSku: item.variantSku,
              transactionType: INVENTORY_TRANSACTION_TYPES.RETURN,
              quantity: remaining,
              previousQuantity: prev,
              newQuantity: variant.stock.quantity,
              referenceType: 'Order',
              referenceId: order._id,
              referenceNumber: order.orderNumber,
              performedBy: userId,
              performedAt: new Date(),
              metadata: { orderId: order._id, reason },
            }], { session });
          }
        }
      }

      item.returnedQuantityPieces = (item.returnedQuantityPieces || 0) + restorePieces;
      item.returnedQuantity = item.sellBy === 'unit'
        ? Math.floor((item.returnedQuantityPieces || 0) / pcsPerUnit)
        : (item.returnedQuantityPieces || 0);
      if ((item.returnedQuantityPieces || 0) >= totalPiecesInLine) {
        item.inventoryDeducted = false;
      }
    }
  }

  // Restore inventory for order (called when order is cancelled or returned after delivery)
  static async restoreInventoryForOrder(order: any, session: any, userId: string, reason = 'Order cancelled after delivery') {
    const saleTransactions = await InventoryTransaction.find({
      referenceType: 'Order',
      referenceId: order._id,
      transactionType: 'sale',
      batchId: { $exists: true, $ne: null },
    }).session(session);

    const batchRestores = new Map<string, number>();
    for (const tx of saleTransactions) {
      const bid = (tx as any).batchId?.toString?.();
      if (bid) {
        const qty = Math.abs((tx as any).quantity) || 0;
        batchRestores.set(bid, (batchRestores.get(bid) || 0) + qty);
      }
    }

    for (const [batchId, quantity] of batchRestores) {
      await StockBatchService.addBackToBatch(
        batchId,
        quantity,
        order._id,
        order.orderNumber,
        userId,
        session
      );
    }

    for (const item of order.items) {
      if (!item.inventoryDeducted) continue;

      const hadBatchDeduction = saleTransactions.some(
        (tx: any) =>
          tx.productId?.toString?.() === item.productId?.toString?.() &&
          tx.variantId?.toString?.() === item.variantId?.toString?.() &&
          tx.batchId
      );
      if (hadBatchDeduction) {
        item.inventoryDeducted = false;
        continue;
      }

      const product = await Product.findOne({
        _id: item.productId,
        'variants._id': item.variantId,
      }).session(session);

      if (!product) continue;

      const variant = (product.variants as any).id(item.variantId);
      if (!variant) continue;

      const restorePieces = getQuantityInPieces(item);
      const previousQuantity = variant.stock.quantity;
      variant.stock.quantity += restorePieces;
      variant.stock.availableQuantity =
        variant.stock.quantity - variant.stock.reservedQuantity;

      await product.save({ session });

      await InventoryTransaction.create([{
        productId: item.productId,
        variantId: item.variantId,
        variantSku: item.variantSku,
        transactionType: INVENTORY_TRANSACTION_TYPES.RETURN,
        quantity: restorePieces,
        previousQuantity,
        newQuantity: variant.stock.quantity,
        referenceType: 'Order',
        referenceId: order._id,
        referenceNumber: order.orderNumber,
        performedBy: userId,
        performedAt: new Date(),
        metadata: {
          orderId: order._id,
          orderStatus: order.status,
          customerId: order.customerId,
          reason,
        },
      }], { session });

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
