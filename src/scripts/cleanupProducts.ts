/**
 * Product cleanup script - keeps only 5-10 products for testing.
 * Usage: KEEP_COUNT=8 npm run cleanup:products
 * Or: npx ts-node src/scripts/cleanupProducts.ts 8
 * Options: --dry-run to preview without deleting
 */
import mongoose from 'mongoose';
import { config } from '../config';
import Product from '../models/Product';
import StockBatch from '../models/StockBatch';
import InventoryTransaction from '../models/InventoryTransaction';

const KEEP_COUNT = parseInt(process.env.KEEP_COUNT || process.argv.find(a => /^\d+$/.test(a)) || '8', 10);

async function cleanupProducts() {
  const dryRun = process.argv.includes('--dry-run');

  try {
    await mongoose.connect(config.mongoUri);
    console.log(`Connected. Will keep ${KEEP_COUNT} products${dryRun ? ' (DRY RUN)' : ''}.`);

    const products = await Product.find({}).sort({ createdAt: 1 }).lean();
    const total = products.length;

    if (total <= KEEP_COUNT) {
      console.log(`Only ${total} products exist. No cleanup needed.`);
      process.exit(0);
      return;
    }

    const toKeep = products.slice(0, KEEP_COUNT).map((p: any) => p._id);
    const toDelete = products.slice(KEEP_COUNT).map((p: any) => p._id);

    console.log(`Keeping ${toKeep.length} products:`, toKeep);
    console.log(`Will delete ${toDelete.length} products:`, toDelete.map((id: any) => id.toString()));

    if (dryRun) {
      const batchCount = await StockBatch.countDocuments({ productId: { $in: toDelete } });
      const txCount = await InventoryTransaction.countDocuments({ productId: { $in: toDelete } });
      console.log(`Would also delete: ${batchCount} stock batches, ${txCount} inventory transactions`);
      process.exit(0);
      return;
    }

    const batchResult = await StockBatch.deleteMany({ productId: { $in: toDelete } });
    console.log(`Deleted ${batchResult.deletedCount} stock batches`);

    const txResult = await InventoryTransaction.deleteMany({ productId: { $in: toDelete } });
    console.log(`Deleted ${txResult.deletedCount} inventory transactions`);

    const prodResult = await Product.deleteMany({ _id: { $in: toDelete } });
    console.log(`Deleted ${prodResult.deletedCount} products`);

    console.log(`Done. ${KEEP_COUNT} products remaining.`);
    process.exit(0);
  } catch (error) {
    console.error('Cleanup error:', error);
    process.exit(1);
  }
}

cleanupProducts();
