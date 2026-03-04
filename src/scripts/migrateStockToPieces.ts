/**
 * Migration: Convert batch and variant stock from UNITS to PIECES.
 * Run this once if you have existing stock that was stored in units.
 * New PI receipts will store in pieces automatically.
 *
 * Usage: npx ts-node src/scripts/migrateStockToPieces.ts
 * Options: --dry-run to preview without updating
 */
import mongoose from 'mongoose';
import { config } from '../config';
import Product from '../models/Product';
import StockBatch from '../models/StockBatch';

async function migrate() {
  const dryRun = process.argv.includes('--dry-run');

  try {
    await mongoose.connect(config.mongoUri);
    console.log(`Connected. Converting stock from units to pieces${dryRun ? ' (DRY RUN)' : ''}.`);

    const batches = await StockBatch.find({}).lean();
    let batchCount = 0;

    for (const batch of batches) {
      const product = await Product.findById(batch.productId);
      if (!product) continue;
      const variant = (product.variants as any).id(batch.variantId);
      if (!variant) continue;
      const pcsPerUnit = Math.max(1, (variant as any).salesUom?.pcsPerUnit || 1);
      const newQty = Math.round((batch.quantity as number) * pcsPerUnit);
      const newReserved = Math.round((batch.reservedQuantity || 0) * pcsPerUnit);
      const newAvail = Math.round((batch.availableQuantity as number) * pcsPerUnit);

      if (!dryRun) {
        await StockBatch.updateOne(
          { _id: batch._id },
          { $set: { quantity: newQty, reservedQuantity: newReserved, availableQuantity: newAvail } }
        );
      }
      batchCount++;
      console.log(`Batch ${batch.batchNumber}: ${batch.quantity} -> ${newQty} pieces`);
    }

    // Update Product variant stock
    const products = await Product.find({ 'variants.stock.quantity': { $gt: 0 } });
    for (const product of products) {
      let modified = false;
      for (const v of product.variants as any[]) {
        if (!v.stock?.quantity || v.stock.quantity <= 0) continue;
        const pcsPerUnit = Math.max(1, v.salesUom?.pcsPerUnit || 1);
        const newQty = Math.round(v.stock.quantity * pcsPerUnit);
        const newAvail = Math.round((v.stock.availableQuantity ?? v.stock.quantity) * pcsPerUnit);
        v.stock.quantity = newQty;
        v.stock.availableQuantity = newAvail;
        modified = true;
      }
      if (modified && !dryRun) await product.save();
    }

    console.log(`Done. Migrated ${batchCount} batches.`);
  } catch (err) {
    console.error(err);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

migrate();
