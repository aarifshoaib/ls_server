/**
 * Corrects fulfillment sub-orders for a **full shipment** (same product:variant qtys as parent):
 * - **Pricing**: child `grandTotal` differs from parent → copy parent `pricing` + `balanceDue`.
 * - **Ledger**: invoice `debitAmount` ≠ parent `grandTotal − paid` → adjust + replay `balanceAfter`.
 *
 * For each matching sub-order this script:
 * 1. Copies parent `pricing` onto the child and recomputes `balanceDue`.
 * 2. Updates the `CustomerLedger` invoice row (`referenceId` = sub-order) `debitAmount` to the new amount due.
 * 3. Replays `balanceAfter` for all ledger rows of affected customers (chronological).
 * 4. Syncs `Customer.creditInfo.currentOutstanding`, `availableCredit`, and `financialSummary.totalOutstanding`.
 *
 * Usage (dry-run by default):
 *   npm run migrate:correct-fulfillment-ar
 *   npm run migrate:correct-fulfillment-ar -- --apply
 *
 * Optional filter:
 *   npm run migrate:correct-fulfillment-ar -- --apply --customer-code=LST-SUV-00003
 *
 * --verbose  Log why each sub-order was skipped (use when candidates=0).
 */
import mongoose, { Types } from 'mongoose';
import { config } from '../config';
import Order from '../models/Order';
import Customer from '../models/Customer';
import CustomerLedger from '../models/CustomerLedger';
import { orderLineKey } from '../utils/orderPricing';
import { roundToTwo } from '../utils/helpers';

function clonePlain<T>(v: T): T {
  return v == null ? v : (JSON.parse(JSON.stringify(v)) as T);
}

function customerCodeArg(): string | undefined {
  const raw = process.argv.find((a) => a.startsWith('--customer-code='));
  if (!raw) return undefined;
  const v = raw.split('=')[1]?.trim();
  return v || undefined;
}

/** Total released qty per product:variant — matches a full shipment of the whole parent order. */
function variantQtyMap(items: any[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const it of items || []) {
    const plain = it?.toObject ? it.toObject() : { ...it };
    const k = orderLineKey(plain.productId, plain.variantId);
    const q = Number(plain.quantity) || 0;
    m.set(k, (m.get(k) || 0) + q);
  }
  return m;
}

function mapsEqualQty(a: Map<string, number>, b: Map<string, number>): boolean {
  if (a.size !== b.size) return false;
  for (const [k, v] of a) {
    if (Math.abs((b.get(k) || 0) - v) > 1e-6) return false;
  }
  return true;
}

async function replayCustomerLedger(customerId: Types.ObjectId): Promise<void> {
  const entries = await CustomerLedger.find({ customerId }).sort({ transactionDate: 1, createdAt: 1 });
  if (!entries.length) return;

  let running = roundToTwo(
    Number(entries[0].balanceAfter) -
      (Number(entries[0].debitAmount) || 0) +
      (Number(entries[0].creditAmount) || 0)
  );

  const bulk: mongoose.mongo.AnyBulkWriteOperation<any>[] = [];
  for (const e of entries) {
    running = roundToTwo(running + (Number(e.debitAmount) || 0) - (Number(e.creditAmount) || 0));
    bulk.push({
      updateOne: {
        filter: { _id: e._id },
        update: { $set: { balanceAfter: running } },
      },
    });
  }
  await CustomerLedger.bulkWrite(bulk);
}

async function syncCustomerOutstandingFromLedger(customerId: Types.ObjectId): Promise<void> {
  const cnt = await CustomerLedger.countDocuments({ customerId });
  if (!cnt) {
    console.warn(`  [warn] customerId=${customerId} has no ledger rows — skip embedded outstanding sync`);
    return;
  }

  const last = await CustomerLedger.findOne({ customerId })
    .sort({ transactionDate: -1, createdAt: -1 })
    .select('balanceAfter')
    .lean();

  const out = last ? roundToTwo(Number((last as any).balanceAfter) || 0) : 0;
  const cust = await Customer.findById(customerId);
  if (!cust) return;

  const limit = Number((cust as any).creditInfo?.creditLimit) || 0;
  (cust as any).creditInfo = {
    ...(cust as any).creditInfo?.toObject?.() ?? { ...(cust as any).creditInfo },
    currentOutstanding: out,
    availableCredit: roundToTwo(Math.max(0, limit - out)),
  };
  const fs = ((cust as any).financialSummary?.toObject?.() ?? (cust as any).financialSummary) || {};
  (cust as any).financialSummary = { ...fs, totalOutstanding: out };
  await cust.save();
}

async function main() {
  const apply = process.argv.includes('--apply');
  const verbose = process.argv.includes('--verbose');
  const codeFilter = customerCodeArg();

  await mongoose.connect(config.mongoUri);
  console.log(
    `[correct-fulfillment-ar] ${apply ? 'APPLY' : 'dry-run'}${codeFilter ? ` customerCode=${codeFilter}` : ''}`
  );

  const match: Record<string, unknown> = { isFulfillmentSubOrder: true, isDeleted: false };
  if (codeFilter) {
    const cust = await Customer.findOne({ customerCode: codeFilter }).select('_id').lean();
    if (!cust) {
      console.error(`Customer code not found: ${codeFilter}`);
      await mongoose.disconnect();
      process.exit(1);
    }
    match.customerId = (cust as any)._id;
  }

  const children = await Order.find(match).sort({ sourceOrderId: 1, subOrderSequence: 1 });
  console.log(`Scanning ${children.length} fulfillment sub-order(s).`);

  const affectedCustomerIds = new Set<string>();
  let examined = 0;
  let wouldFix = 0;

  for (const child of children) {
    examined++;
    const parent = await Order.findById(child.sourceOrderId);
    if (!parent || parent.isDeleted) {
      if (verbose) console.log(`[skip] ${(child as any).orderNumber}: no parent`);
      continue;
    }

    const subCount = await Order.countDocuments({
      sourceOrderId: parent._id,
      isFulfillmentSubOrder: true,
      isDeleted: false,
    });
    const seq = (child as any).subOrderSequence ?? 1;
    if (subCount > 1 && seq !== 1) {
      if (verbose) console.log(`[skip] ${(child as any).orderNumber}: subCount=${subCount} seq=${seq} (only first sub eligible)`);
      continue;
    }

    const parentItems = parent.items as any[];
    const childItems = child.items as any[];
    const pq = variantQtyMap(parentItems);
    const cq = variantQtyMap(childItems);
    if (!mapsEqualQty(pq, cq)) {
      if (verbose) {
        console.log(
          `[skip] ${(child as any).orderNumber}: qty map differs parent keys=${pq.size} child keys=${cq.size}`
        );
      }
      continue;
    }

    const parentGt = roundToTwo(Number((parent.pricing as any)?.grandTotal) || 0);
    const childGt = roundToTwo(Number((child.pricing as any)?.grandTotal) || 0);
    if (parentGt <= 0) {
      if (verbose) console.log(`[skip] ${(child as any).orderNumber}: parent grandTotal 0`);
      continue;
    }
    const paid = roundToTwo(Number((child as any).paidAmount) || 0);
    const newBalanceDue = roundToTwo(Math.max(0, parentGt - paid));

    const ledger = await CustomerLedger.findOne({
      referenceType: 'order',
      referenceId: child._id,
      transactionType: 'invoice',
    });
    const oldDebit = ledger ? roundToTwo(Number((ledger as any).debitAmount) || 0) : null;
    const newDebit = newBalanceDue;

    const pricingMismatch = Math.abs(parentGt - childGt) >= 0.02;
    const ledgerMismatch = ledger != null && oldDebit != null && Math.abs(oldDebit - newDebit) >= 0.02;

    if (!pricingMismatch && !ledgerMismatch) {
      if (verbose) {
        console.log(
          `[skip] ${(child as any).orderNumber}: pricing+ledger OK (GT=${childGt} debit=${oldDebit ?? 'n/a'})`
        );
      }
      continue;
    }

    wouldFix++;
    console.log(
      `[candidate] ${child.orderNumber} parent=${parent.orderNumber} customer=${(child as any).customerCode}` +
        (pricingMismatch ? ` childGT=${childGt} parentGT=${parentGt}` : ` childGT=${childGt} (=parent)`) +
        ` -> balanceDue ${roundToTwo(Number((child as any).balanceDue) || 0)} -> ${newBalanceDue}` +
        (ledger ? ` ledgerDebit ${oldDebit} -> ${newDebit}` : ' (no invoice ledger row)') +
        (!pricingMismatch && ledgerMismatch ? ' [ledger-only]' : '')
    );

    if (!apply) continue;

    if (pricingMismatch) {
      const parentPricing = clonePlain((parent.pricing as any)?.toObject?.() ?? parent.pricing);
      (child as any).pricing = parentPricing;
      (child as any).markModified?.('pricing');
    }
    (child as any).balanceDue = newBalanceDue;
    await child.save();

    if (ledger && oldDebit != null && Math.abs(oldDebit - newDebit) >= 0.02) {
      (ledger as any).debitAmount = newDebit;
      await ledger.save();
    }

    affectedCustomerIds.add(String((child as any).customerId));
  }

  if (apply && affectedCustomerIds.size) {
    console.log(`Replaying ledger + syncing ${affectedCustomerIds.size} customer(s).`);
    for (const cid of affectedCustomerIds) {
      const oid = new Types.ObjectId(cid);
      await replayCustomerLedger(oid);
      await syncCustomerOutstandingFromLedger(oid);
      console.log(`  [synced] customerId=${cid}`);
    }
  }

  console.log(
    `Done. Examined=${examined}, candidates=${wouldFix}. ${apply ? 'Changes applied.' : 'Re-run with --apply to persist.'}`
  );
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
