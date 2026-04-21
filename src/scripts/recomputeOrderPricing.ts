/**
 * Recompute order line totals and pricing using current orderPricing rules:
 * - Merchandise (price × qty by UOM), customer %, order discount, then VAT on net merchandise (default 5%)
 *
 * Optionally refreshes pricePerPiece from the product catalog when a variant exists.
 *
 * Usage:
 *   npx ts-node src/scripts/recomputeOrderPricing.ts
 *   npx ts-node src/scripts/recomputeOrderPricing.ts --dry-run
 *   npx ts-node src/scripts/recomputeOrderPricing.ts --from-product
 *   npx ts-node src/scripts/recomputeOrderPricing.ts --order-number=SO-3
 *   npx ts-node src/scripts/recomputeOrderPricing.ts --force   # save every order even if totals match (normalize DB)
 */
import mongoose from 'mongoose';
import { config } from '../config';
import Order from '../models/Order';
import Customer from '../models/Customer';
import Product from '../models/Product';
import { buildPricedOrderItems } from '../utils/orderPricing';
import { roundToTwo } from '../utils/helpers';
import { ORDER_VAT_PERCENT } from '../utils/constants';

async function refreshPricePerPieceFromProduct(item: any): Promise<any> {
  if (!item?.productId || !item?.variantId) return item;
  const product = await Product.findById(item.productId).lean();
  if (!product?.variants) return item;
  const vid = item.variantId?.toString?.() ?? item.variantId;
  const variant = (product.variants as any[]).find(
    (v: any) => String(v._id) === String(vid)
  );
  if (!variant?.price?.sellingPrice) return item;
  return {
    ...item,
    pricePerPiece: Number(variant.price.sellingPrice),
    pcsPerUnit: variant.salesUom?.pcsPerUnit ?? item.pcsPerUnit,
  };
}

function orderNumberArg(): string | undefined {
  const raw = process.argv.find((a) => a.startsWith('--order-number='));
  if (!raw) return undefined;
  const v = raw.split('=')[1]?.trim();
  return v || undefined;
}

async function migrate() {
  const dryRun = process.argv.includes('--dry-run');
  const fromProduct = process.argv.includes('--from-product');
  const forceSave = process.argv.includes('--force');
  const orderNumber = orderNumberArg();

  await mongoose.connect(config.mongoUri);
  console.log(
    `Connected. Recomputing order pricing${dryRun ? ' (DRY RUN)' : ''}` +
      (orderNumber ? ` (orderNumber=${orderNumber})` : '') +
      (forceSave && !dryRun ? ' (--force: save all)' : '') +
      '.'
  );

  const orders = await Order.find({
    isDeleted: false,
    ...(orderNumber ? { orderNumber } : {}),
  });
  if (orders.length === 0 && orderNumber) {
    console.warn(`No orders found with orderNumber="${orderNumber}". Use the exact orderNumber field from the DB.`);
  }
  let scanned = 0;
  let saved = 0;

  for (const order of orders) {
    scanned++;
    const prevGrand = Number(order.pricing?.grandTotal) || 0;
    const prevTaxTotal = Number(order.pricing?.taxTotal) || 0;

    const customer = await Customer.findById(order.customerId).lean();
    const custPct = Number((customer as any)?.discountPercent) || 0;

    const rawItems: any[] = [];
    for (const it of order.items as any[]) {
      const plain = typeof it.toObject === 'function' ? it.toObject() : { ...it };
      let row = plain;
      if (fromProduct) {
        row = await refreshPricePerPieceFromProduct(plain);
      }
      rawItems.push(row);
    }

    const odMeta = order.pricing?.orderDiscount;
    const od =
      odMeta?.type && odMeta.value != null && Number(odMeta.value) > 0
        ? {
            type: odMeta.type as 'percent' | 'fixed',
            value: Number(odMeta.value),
          }
        : null;

    const { items, pricing } = buildPricedOrderItems(rawItems, {
      orderDiscount: od,
      shippingCharge: Number(order.pricing?.shippingCharge) || 0,
      shippingDiscount: Number(order.pricing?.shippingDiscount) || 0,
      customerDiscountPercent: custPct,
      taxRateDefault: ORDER_VAT_PERCENT,
    });

    const paid = Number(order.paidAmount) || 0;
    const newBalanceDue = roundToTwo(Math.max(0, pricing.grandTotal - paid));

    const prevGt = Number(order.pricing?.grandTotal) || 0;
    const grandTotalChanged = Math.abs(prevGt - pricing.grandTotal) > 0.005;

    const prevItems = order.items as any[];
    const itemsChanged =
      prevItems.length !== items.length ||
      items.some((newIt: any, i: number) => {
        const oldIt = prevItems[i];
        if (!oldIt) return true;
        const o = typeof oldIt.toObject === 'function' ? oldIt.toObject() : { ...oldIt };
        return (
          Math.abs(Number(o.lineTotal || 0) - Number(newIt.lineTotal || 0)) > 0.005 ||
          Math.abs(Number(o.taxAmount || 0) - Number(newIt.taxAmount || 0)) > 0.005 ||
          Math.abs(Number(o.discountAmount || 0) - Number(newIt.discountAmount || 0)) > 0.005 ||
          Math.abs(Number(o.customerDiscountAmount || 0) - Number(newIt.customerDiscountAmount || 0)) > 0.005
        );
      });

    const pricingRollupChanged =
      Math.abs(Number(order.pricing?.subtotal ?? 0) - Number(pricing.subtotal)) > 0.005 ||
      Math.abs(Number(order.pricing?.taxTotal ?? 0) - Number(pricing.taxTotal)) > 0.005 ||
      Math.abs(Number(order.pricing?.itemDiscountTotal ?? 0) - Number(pricing.itemDiscountTotal)) > 0.005 ||
      Math.abs(Number(order.pricing?.customerDiscountTotal ?? 0) - Number(pricing.customerDiscountTotal || 0)) >
        0.005;

    const changed = grandTotalChanged || itemsChanged || pricingRollupChanged;
    const shouldWrite = !dryRun && (changed || forceSave);

    if (shouldWrite) {
      order.items = items as any;
      order.pricing = pricing as any;
      order.balanceDue = newBalanceDue;
      if (paid >= pricing.grandTotal - 0.005) {
        order.paymentStatus = 'paid';
      } else if (paid > 0) {
        order.paymentStatus = 'partial';
      }
      await order.save();
      saved++;
    }

    if (changed || dryRun || forceSave) {
      const gtNote =
        Math.abs(prevGrand - pricing.grandTotal) > 0.005
          ? `grandTotal ${prevGrand} → ${pricing.grandTotal}`
          : `grandTotal ${pricing.grandTotal} (unchanged)`;
      const taxNote =
        Math.abs(prevTaxTotal - pricing.taxTotal) > 0.005
          ? `taxTotal ${prevTaxTotal} → ${pricing.taxTotal}`
          : itemsChanged || pricingRollupChanged
            ? `taxTotal ${pricing.taxTotal} (line allocation updated)`
            : `taxTotal ${pricing.taxTotal}`;
      const writeTag = dryRun
        ? ' (dry-run, no write)'
        : shouldWrite
          ? changed
            ? ' (saved)'
            : ' (saved, --force)'
          : '';
      console.log(`${order.orderNumber}: ${gtNote}; ${taxNote}${writeTag}`);
    }
  }

  const explainZero =
    !dryRun && saved === 0 && scanned > 0 && !forceSave
      ? ' No rows differed from DB by more than 0.01 AED (with one flat VAT %, totals often match the old per-line sum). Use --force to rewrite all orders anyway.'
      : '';
  console.log(
    `Done. Scanned: ${scanned}. ${dryRun ? 'No writes (dry-run).' : `Saved: ${saved}.`}${explainZero}` +
      (dryRun || forceSave ? '' : ' Use --dry-run to preview; add --force to save even when unchanged.')
  );
  await mongoose.disconnect();
}

migrate().catch((e) => {
  console.error(e);
  process.exit(1);
});
