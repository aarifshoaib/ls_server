/**
 * Recalculate each customer's outstanding from **open orders** (sum of positive `balanceDue`),
 * update embedded `creditInfo` / `financialSummary`, and align **CustomerLedger** with a single
 * `adjustment` row so list/detail APIs (which prefer the latest ledger balance) show the same figure.
 *
 * Approach:
 * 1. **targetOutstanding** = Σ open `balanceDue` without double-counting parent + fulfillment
 *    (subs always count; parent counts only when no sub for that parent still has AR).
 * 2. **ledgerOutstanding** = latest CustomerLedger `balanceAfter` (0 if none).
 * 3. If |target − ledger| > tolerance, insert **adjustment**: debit or credit for the delta, then
 *    replay `balanceAfter` on all rows in chronological order.
 * 4. Set **Customer** `currentOutstanding`, `availableCredit`, `totalOutstanding` = target.
 *
 * Usage:
 *   npm run migrate:recalc-outstanding-from-orders
 *   npm run migrate:recalc-outstanding-from-orders -- --apply
 *   npm run migrate:recalc-outstanding-from-orders -- --apply --customer-code=LST-SUV-00003
 *   npm run migrate:recalc-outstanding-from-orders -- --apply --verbose
 */
import mongoose, { Types } from 'mongoose';
import { config } from '../config';
import Customer from '../models/Customer';
import CustomerLedger from '../models/CustomerLedger';
import { sumUnpaidOrderBalanceDue, getLatestOutstandingByCustomerIds } from '../services/customerOrderStats.service';
import { roundToTwo } from '../utils/helpers';

const TOL = 0.02;

function customerCodeArg(): string | undefined {
  const raw = process.argv.find((a) => a.startsWith('--customer-code='));
  return raw?.split('=')[1]?.trim() || undefined;
}

function customerIdArg(): string | undefined {
  const raw = process.argv.find((a) => a.startsWith('--customer-id='));
  return raw?.split('=')[1]?.trim() || undefined;
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

async function main() {
  const apply = process.argv.includes('--apply');
  const verbose = process.argv.includes('--verbose');
  const code = customerCodeArg();
  const idArg = customerIdArg();

  await mongoose.connect(config.mongoUri);
  console.log(
    `[recalc-outstanding-from-orders] ${apply ? 'APPLY' : 'dry-run'}${code ? ` code=${code}` : ''}${idArg ? ` id=${idArg}` : ''}`
  );

  let filter: Record<string, unknown> = {};
  if (code) {
    const c = await Customer.findOne({ customerCode: code }).select('_id').lean();
    if (!c) {
      console.error(`Customer code not found: ${code}`);
      await mongoose.disconnect();
      process.exit(1);
    }
    filter = { _id: (c as any)._id };
  } else if (idArg) {
    if (!mongoose.Types.ObjectId.isValid(idArg)) {
      console.error(`Invalid customer id: ${idArg}`);
      await mongoose.disconnect();
      process.exit(1);
    }
    filter = { _id: new Types.ObjectId(idArg) };
  }

  const customers = await Customer.find(filter).select('_id customerCode creditInfo financialSummary').lean();
  console.log(`Processing ${customers.length} customer(s).`);

  let n = 0;
  for (const c of customers) {
    const cid = String((c as any)._id);
    const target = await sumUnpaidOrderBalanceDue(cid);
    const ledgerMap = await getLatestOutstandingByCustomerIds([new Types.ObjectId(cid)]);
    const ledgerOut = ledgerMap.has(cid) ? ledgerMap.get(cid)! : 0;
    const embedded = roundToTwo(Number((c as any).creditInfo?.currentOutstanding) || 0);

    const needLedgerAdj = Math.abs(target - ledgerOut) > TOL;
    const needEmbedded = Math.abs(target - embedded) > TOL;

    if (!needLedgerAdj && !needEmbedded) {
      if (verbose) console.log(`[ok] ${(c as any).customerCode} target=${target}`);
      continue;
    }

    n++;
    console.log(
      `[update] ${(c as any).customerCode} ordersΣ=${target} ledger=${ledgerOut} embedded=${embedded}` +
        (needLedgerAdj ? ` -> ledger adj ${roundToTwo(target - ledgerOut)}` : '') +
        (needEmbedded ? ` -> sync embedded` : '')
    );

    if (!apply) continue;

    const cust = await Customer.findById(cid);
    if (!cust) continue;

    if (needLedgerAdj) {
      const diff = roundToTwo(target - ledgerOut);
      const debit = diff > 0 ? diff : 0;
      const credit = diff < 0 ? -diff : 0;
      const nextBal = roundToTwo(ledgerOut + debit - credit);

      await CustomerLedger.create({
        customerId: cust._id,
        customerCode: (cust as any).customerCode,
        transactionType: 'adjustment',
        transactionDate: new Date(),
        referenceType: 'system',
        referenceNumber: `OUTSTANDING-RECALC-${Date.now()}`,
        debitAmount: debit,
        creditAmount: credit,
        balanceAfter: nextBal,
        description: 'Outstanding aligned to sum of open order balance due (migration)',
        notes: `Before ledger=${ledgerOut}, target=${target}`,
      } as any);

      await replayCustomerLedger(cust._id as Types.ObjectId);
    }

    const limit = Number((cust as any).creditInfo?.creditLimit) || 0;
    const last = await CustomerLedger.findOne({ customerId: cust._id })
      .sort({ transactionDate: -1, createdAt: -1 })
      .select('balanceAfter')
      .lean();
    const outFromLedger = last
      ? roundToTwo(Number((last as any).balanceAfter) || 0)
      : roundToTwo(await sumUnpaidOrderBalanceDue(cid));

    (cust as any).creditInfo = {
      ...(cust as any).creditInfo?.toObject?.() ?? { ...(cust as any).creditInfo },
      currentOutstanding: outFromLedger,
      availableCredit: roundToTwo(Math.max(0, limit - outFromLedger)),
    };
    const fs = ((cust as any).financialSummary?.toObject?.() ?? (cust as any).financialSummary) || {};
    (cust as any).financialSummary = { ...fs, totalOutstanding: outFromLedger };
    await cust.save();
  }

  console.log(`Done. ${n} customer(s) needed changes. ${apply ? 'Applied.' : 'Re-run with --apply.'}`);
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
