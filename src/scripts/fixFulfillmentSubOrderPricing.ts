/**
 * Backfill fulfillment sub-order lines from the parent sales order.
 *
 * 1) releasedQuantity := quantity (fixes "Released 0 / Remaining N" on old rows).
 * 2) Optional repricing: each sub line is matched to a parent line (same product+variant),
 *    greedy on remaining parent quantity; amounts come from scaleParentOrderLineForRelease.
 *    Then pricing is rolled up from lines + existing shipping on the sub-order.
 *
 * Repricing is skipped when a customer-ledger invoice already exists for the sub-order
 * (amounts were posted) unless you pass --force-reprice.
 *
 * Usage:
 *   npx ts-node src/scripts/fixFulfillmentSubOrderPricing.ts
 *   npx ts-node src/scripts/fixFulfillmentSubOrderPricing.ts --apply
 *   npx ts-node src/scripts/fixFulfillmentSubOrderPricing.ts --apply --released-only
 *   npx ts-node src/scripts/fixFulfillmentSubOrderPricing.ts --apply --reprice
 *   npx ts-node src/scripts/fixFulfillmentSubOrderPricing.ts --apply --reprice --force-reprice
 *   npx ts-node src/scripts/fixFulfillmentSubOrderPricing.ts --apply --order-number=SO-3-1
 */
import mongoose from 'mongoose';
import { config } from '../config';
import Order from '../models/Order';
import CustomerLedger from '../models/CustomerLedger';
import {
  orderLineKey,
  scaleParentOrderLineForRelease,
  rollupOrderLineItemsToPricing,
} from '../utils/orderPricing';
import { roundToTwo } from '../utils/helpers';

type PoolEntry = { idx: number; pl: any; rem: number; key: string };

function createPool(parentItems: any[]): PoolEntry[] {
  return (parentItems || []).map((pl, idx) => {
    const plain = pl?.toObject ? pl.toObject() : { ...pl };
    return {
      idx,
      pl: plain,
      rem: Number(plain.quantity) || 0,
      key: orderLineKey(plain.productId, plain.variantId),
    };
  });
}

/**
 * Allocate child qty across one or more parent lines with the same variant (split demand).
 * Returns scaled rows to merge, or null if not enough remaining qty on parent.
 */
function consumeParentForSubAggregated(pool: PoolEntry[], childItem: any): any[] | null {
  const key = orderLineKey(childItem.productId, childItem.variantId);
  let need = Number(childItem.quantity) || 0;
  if (need <= 0) return null;

  const candidates = pool.filter((e) => e.key === key && e.rem > 0);
  const sumRem = candidates.reduce((s, e) => s + e.rem, 0);
  if (sumRem < need) return null;

  const parts: any[] = [];
  for (const e of candidates) {
    if (need <= 0) break;
    const take = Math.min(e.rem, need);
    if (take <= 0) continue;
    parts.push(scaleParentOrderLineForRelease(e.pl, take));
    e.rem -= take;
    need -= take;
  }
  return need <= 0 ? parts : null;
}

function mergeScaledParts(parts: any[], childPlain: any): any {
  if (parts.length === 0) return childPlain;
  const first = parts[0];
  if (parts.length === 1) {
    return {
      ...first,
      _id: childPlain._id,
      releasedQuantity: Number(childPlain.quantity) || 0,
      batchId: childPlain.batchId,
      batchNumber: childPlain.batchNumber,
      expiryDate: childPlain.expiryDate,
      inventoryDeducted: childPlain.inventoryDeducted ?? true,
      returnedQuantity: childPlain.returnedQuantity,
      returnedQuantityPieces: childPlain.returnedQuantityPieces,
    };
  }
  const qty = parts.reduce((s, p) => s + (Number(p.quantity) || 0), 0);
  return {
    ...first,
    quantity: qty,
    discountAmount: roundToTwo(parts.reduce((s, p) => s + (Number(p.discountAmount) || 0), 0)),
    customerDiscountAmount: roundToTwo(parts.reduce((s, p) => s + (Number(p.customerDiscountAmount) || 0), 0)),
    taxAmount: roundToTwo(parts.reduce((s, p) => s + (Number(p.taxAmount) || 0), 0)),
    lineTotal: roundToTwo(parts.reduce((s, p) => s + (Number(p.lineTotal) || 0), 0)),
    _id: childPlain._id,
    releasedQuantity: Number(childPlain.quantity) || 0,
    batchId: childPlain.batchId,
    batchNumber: childPlain.batchNumber,
    expiryDate: childPlain.expiryDate,
    inventoryDeducted: childPlain.inventoryDeducted ?? true,
    returnedQuantity: childPlain.returnedQuantity,
    returnedQuantityPieces: childPlain.returnedQuantityPieces,
  };
}

function orderNumberArg(): string | undefined {
  const raw = process.argv.find((a) => a.startsWith('--order-number='));
  if (!raw) return undefined;
  const v = raw.split('=')[1]?.trim();
  return v || undefined;
}

async function main() {
  const apply = process.argv.includes('--apply');
  const releasedOnly = process.argv.includes('--released-only');
  const reprice = process.argv.includes('--reprice');
  const forceReprice = process.argv.includes('--force-reprice');
  const orderNumber = orderNumberArg();

  // Same scope for dry-run preview and --apply; only --apply persists.
  const fixReleased = releasedOnly || reprice || (!releasedOnly && !reprice);
  const fixReprice = reprice || (!releasedOnly && !reprice);

  await mongoose.connect(config.mongoUri);
  console.log(
    `Connected. Fulfillment sub-order fix ${apply ? '(APPLY)' : '(dry-run)'}` +
      ` released=${fixReleased} reprice=${fixReprice}` +
      (orderNumber ? ` orderNumber=${orderNumber}` : '')
  );

  const children = await Order.find({
    isFulfillmentSubOrder: true,
    isDeleted: false,
    ...(orderNumber ? { orderNumber } : {}),
  });
  console.log(`Found ${children.length} fulfillment sub-order document(s).`);
  let touched = 0;
  let skippedRepriceLedger = 0;
  let skippedLines = 0;

  for (const child of children) {
    const parent = await Order.findById(child.sourceOrderId);
    if (!parent) {
      console.warn(`[skip] ${child.orderNumber}: parent ${child.sourceOrderId} not found`);
      continue;
    }

    const hasLedger = await CustomerLedger.exists({
      referenceType: 'order',
      referenceId: child._id,
      transactionType: 'invoice',
    });

    const canReprice = fixReprice && (!hasLedger || forceReprice);
    if (fixReprice && hasLedger && !forceReprice) {
      skippedRepriceLedger++;
      console.warn(
        `[reprice-skipped: invoice ledger] ${child.orderNumber} — line/tax totals unchanged. ` +
          `Run with --force-reprice after adjusting ledger, or fix AR manually.`
      );
    }

    const pool = createPool(parent.items as any[]);

    const nextItems: any[] = [];
    let lineProblems = 0;

    for (let i = 0; i < (child.items as any[]).length; i++) {
      const it = (child.items as any[])[i];
      const plain = it?.toObject ? it.toObject() : { ...it };
      const qty = Number(plain.quantity) || 0;

      if (fixReleased) {
        plain.releasedQuantity = qty;
      }

      if (canReprice) {
        const parts = consumeParentForSubAggregated(pool, plain);
        if (!parts) {
          lineProblems++;
          skippedLines++;
          console.warn(
            `  [line] ${child.orderNumber} row ${i + 1} (${plain.name}): parent has insufficient remaining qty for this variant (split across lines?)`
          );
          nextItems.push(plain);
          continue;
        }
        nextItems.push(mergeScaledParts(parts, plain));
      } else {
        nextItems.push(plain);
      }
    }

    if (lineProblems > 0) {
      console.warn(
        `  ${child.orderNumber}: ${lineProblems} line(s) could not be repriced (duplicate SKU split across parent lines?)`
      );
    }

    const sc = Number(child.pricing?.shippingCharge) || 0;
    const sd = Number(child.pricing?.shippingDiscount) || 0;
    let newPricing: ReturnType<typeof rollupOrderLineItemsToPricing> | null = null;
    if (canReprice && nextItems.length > 0) {
      newPricing = rollupOrderLineItemsToPricing(nextItems, {
        includeShipping: true,
        shippingCharge: sc,
        shippingDiscount: sd,
      });
    }

    const paid = Number(child.paidAmount) || 0;
    const newBalance =
      newPricing != null ? Math.max(0, Math.round((newPricing.grandTotal - paid) * 100) / 100) : null;

    const releasedChanged =
      fixReleased &&
      (child.items as any[]).some((it) => {
        const q = Number(it.quantity) || 0;
        const cur = Number((it as any).releasedQuantity) || 0;
        return cur !== q;
      });

    const pricingChanged =
      canReprice &&
      newPricing != null &&
      ((child.items as any[]).some((it, i) => {
        const a = it?.toObject ? it.toObject() : { ...it };
        const b = nextItems[i];
        return (
          Math.abs(Number(a.lineTotal || 0) - Number(b?.lineTotal || 0)) > 0.005 ||
          Math.abs(Number(a.taxAmount || 0) - Number(b?.taxAmount || 0)) > 0.005
        );
      }) ||
        Math.abs(Number(child.pricing?.grandTotal ?? 0) - newPricing.grandTotal) > 0.005);

    const changed = releasedChanged || pricingChanged;
    if (!changed) continue;

    if (!apply) {
      console.log(
        `[dry-run] ${child.orderNumber} parent=${parent.orderNumber}` +
          (releasedChanged ? ' releasedQuantity' : '') +
          (pricingChanged && newPricing
            ? ` grandTotal ${child.pricing?.grandTotal} -> ${newPricing.grandTotal}`
            : '')
      );
      touched++;
      continue;
    }

    child.items = nextItems as any;
    child.markModified('items');

    if (canReprice && newPricing) {
      const prevPricing = (child.pricing as any)?.toObject?.() ?? { ...child.pricing };
      child.pricing = {
        ...prevPricing,
        ...newPricing,
      } as any;
      child.markModified('pricing');
      if (newBalance != null) {
        child.balanceDue = newBalance;
      }
    }

    await child.save();
    console.log(`[saved] ${child.orderNumber}`);
    touched++;
  }

  console.log(
    `Done. ${touched} sub-order(s) ${apply ? 'updated' : 'would be reported'}.` +
      ` Skipped repricing (ledger): ${skippedRepriceLedger}. Ambiguous/missing parent lines: ${skippedLines}.`
  );
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
