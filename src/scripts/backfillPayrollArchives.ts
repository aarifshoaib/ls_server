/**
 * Migration Script: Backfill Payroll Archives
 *
 * This script creates PayrollArchive records for all finalized payroll runs
 * that don't already have an archive.
 *
 * Usage:
 *   npm run ts-node src/scripts/backfillPayrollArchives.ts
 * or
 *   npx ts-node src/scripts/backfillPayrollArchives.ts
 */

import mongoose from 'mongoose';
import PayrollRun from '../models/PayrollRun';
import PayrollArchive from '../models/PayrollArchive';
import { PayrollArchiveService } from '../services/payrollArchive.service';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../../.env') });

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/oms';

async function connectDB() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  }
}

async function backfillArchives() {
  console.log('🔍 Searching for finalized payroll runs without archives...\n');

  // Find all finalized payroll runs
  const finalizedPayrolls = await PayrollRun.find({
    status: 'finalized',
  }).populate('payCycleId');

  console.log(`Found ${finalizedPayrolls.length} finalized payroll runs\n`);

  if (finalizedPayrolls.length === 0) {
    console.log('✅ No finalized payroll runs found. Nothing to backfill.');
    return;
  }

  let createdCount = 0;
  let skippedCount = 0;
  let errorCount = 0;

  for (const payrollRun of finalizedPayrolls) {
    try {
      // Check if archive already exists
      const existingArchive = await PayrollArchive.findOne({
        payrollRunId: payrollRun._id,
      });

      if (existingArchive) {
        console.log(`⏭️  Skipped: ${payrollRun.runNumber} - Archive already exists (${existingArchive.archiveNumber})`);
        skippedCount++;
        continue;
      }

      // Get the user who finalized it, or use a system user
      const userId = payrollRun.finalization?.finalizedBy?.toString() || 'system';

      // Create archive
      const archive = await PayrollArchiveService.createFromPayrollRun(
        payrollRun._id.toString(),
        userId
      );

      console.log(`✅ Created: ${payrollRun.runNumber} → Archive ${archive.archiveNumber}`);
      createdCount++;
    } catch (error: any) {
      console.error(`❌ Error processing ${payrollRun.runNumber}:`, error.message);
      errorCount++;
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('📊 Summary:');
  console.log(`   Total finalized payrolls: ${finalizedPayrolls.length}`);
  console.log(`   ✅ Archives created: ${createdCount}`);
  console.log(`   ⏭️  Skipped (already exists): ${skippedCount}`);
  console.log(`   ❌ Errors: ${errorCount}`);
  console.log('='.repeat(60) + '\n');
}

async function main() {
  try {
    console.log('🚀 Starting Payroll Archive Backfill Script\n');

    await connectDB();
    await backfillArchives();

    console.log('✅ Script completed successfully\n');
  } catch (error) {
    console.error('❌ Script failed:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('👋 Disconnected from MongoDB');
  }
}

// Run the script
main();
