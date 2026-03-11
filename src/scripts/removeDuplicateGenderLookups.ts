/**
 * Remove duplicate gender lookup values. Keeps MALE, FEMALE, OTHER (canonical codes).
 * Deletes any other gender entries (e.g. M, F, etc.).
 * Run: npx ts-node src/scripts/removeDuplicateGenderLookups.ts
 */
import mongoose from 'mongoose';
import { config } from '../config';
import LookupValue from '../models/LookupValue';

const KEEP_CODES = new Set(['MALE', 'FEMALE', 'OTHER']);

async function run() {
  try {
    await mongoose.connect(config.mongoUri);
    console.log('Connected to database');

    const all = await LookupValue.find({ category: 'gender' }).lean();
    console.log(`Found ${all.length} gender lookup values`);

    const toDelete = all.filter((v: any) => !KEEP_CODES.has(String(v.code || '').toUpperCase()));
    if (toDelete.length === 0) {
      console.log('No duplicates to remove.');
      process.exit(0);
      return;
    }

    const ids = toDelete.map((v: any) => v._id);
    const result = await LookupValue.deleteMany({ _id: { $in: ids } });
    console.log(`Removed ${result.deletedCount} duplicate gender entries:`, toDelete.map((v: any) => v.code).join(', '));

    const remaining = await LookupValue.find({ category: 'gender' }).lean();
    console.log(`Remaining: ${remaining.map((v: any) => `${v.code} (${v.name})`).join(', ')}`);

    console.log('Done.');
  } catch (err) {
    console.error(err);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    process.exit(0);
  }
}

run();
