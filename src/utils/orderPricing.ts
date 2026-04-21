import { roundToTwo } from './helpers';
import { ORDER_VAT_PERCENT } from './constants';

export interface OrderDiscountInput {
  type: 'percent' | 'fixed';
  value: number;
}

export interface BuildPricedOrderOptions {
  /** VAT % on merchandise after customer + order discount (default 5). Lines stay ex‑tax (`taxAmount` 0). */
  taxRateDefault?: number;
  shippingCharge?: number;
  shippingDiscount?: number;
  orderDiscount?: OrderDiscountInput | null;
  /** Customer master discount (%), applied on line merchandise before order-level discount */
  customerDiscountPercent?: number;
}

export function orderLineKey(productId: unknown, variantId: unknown) {
  const p = productId?.toString?.() ?? String(productId);
  const v = variantId?.toString?.() ?? String(variantId);
  return `${p}:${v}`;
}

/** Infer piece price when not explicitly supplied (backward compatible with stored orders). */
export function derivePricePerPiece(item: any): number {
  const explicit =
    item.pricePerPiece != null && Number(item.pricePerPiece) > 0 ? Number(item.pricePerPiece) : undefined;
  if (explicit !== undefined) return roundToTwo(explicit);

  const ppu = Math.max(1, Number(item.pcsPerUnit) || 1);
  const unitPrice = Number(item.unitPrice) || 0;
  const sellBy = item.sellBy || 'unit';

  if (sellBy === 'unit') {
    if (unitPrice > 0 && ppu > 0) {
      return unitPrice / ppu;
    }
    return 0;
  }
  return unitPrice;
}

/**
 * Line merchandise total (one round at the end only):
 * - sellBy `pcs`: price per piece × quantity (pieces)
 * - sellBy `unit`: explicit piece × pcs_per_unit × units, else unit price × units (price per selling unit)
 */
export function lineMerchandiseGross(item: any, pricePerPiece: number): number {
  const qty = Number(item.quantity) || 0;
  const ppu = Math.max(1, Number(item.pcsPerUnit) || 1);
  const sellBy = item.sellBy || 'unit';
  const explicitPiece =
    item.pricePerPiece != null && Number(item.pricePerPiece) > 0 ? Number(item.pricePerPiece) : undefined;
  const unitPrice = Number(item.unitPrice) || 0;

  if (sellBy === 'unit') {
    if (explicitPiece !== undefined) {
      return roundToTwo(explicitPiece * ppu * qty);
    }
    if (unitPrice > 0) {
      return roundToTwo(unitPrice * qty);
    }
    return roundToTwo(pricePerPiece * ppu * qty);
  }
  const piece = explicitPiece !== undefined ? explicitPiece : unitPrice > 0 ? unitPrice : pricePerPiece;
  return roundToTwo(piece * qty);
}

/** Display unit price: per selling unit when sellBy is unit, else per piece */
export function displayUnitPrice(item: any, pricePerPiece: number): number {
  const ppu = Math.max(1, Number(item.pcsPerUnit) || 1);
  const sellBy = item.sellBy || 'unit';
  const explicitPiece =
    item.pricePerPiece != null && Number(item.pricePerPiece) > 0 ? Number(item.pricePerPiece) : undefined;
  const unitPrice = Number(item.unitPrice) || 0;

  if (sellBy === 'unit') {
    if (explicitPiece !== undefined) {
      return roundToTwo(explicitPiece * ppu);
    }
    if (unitPrice > 0) {
      return roundToTwo(unitPrice);
    }
    return roundToTwo(pricePerPiece * ppu);
  }
  const piece = explicitPiece !== undefined ? explicitPiece : unitPrice > 0 ? unitPrice : pricePerPiece;
  return roundToTwo(piece);
}

/**
 * Builds order line items: merchandise (price × qty by UOM), customer %, proportional order discount,
 * then VAT once on the net merchandise total. Each line has `taxAmount: 0` and `lineTotal` = net ex VAT.
 */
export function buildPricedOrderItems(
  rawItems: any[],
  options: BuildPricedOrderOptions = {}
): {
  items: any[];
  pricing: {
    subtotal: number;
    itemDiscountTotal: number;
    customerDiscountTotal: number;
    orderDiscount?: { type: 'percent' | 'fixed'; value: number; amount: number };
    taxTotal: number;
    shippingCharge: number;
    shippingDiscount: number;
    grandTotal: number;
    roundingAdjustment: number;
  };
} {
  const taxRateDefault = Math.max(0, Number(options.taxRateDefault ?? ORDER_VAT_PERCENT));
  const shippingCharge = roundToTwo(Number(options.shippingCharge) || 0);
  const shippingDiscount = roundToTwo(Number(options.shippingDiscount) || 0);
  const customerPct = Math.min(100, Math.max(0, Number(options.customerDiscountPercent) || 0));

  const rows = rawItems.map((item: any) => {
    const pricePerPiece = derivePricePerPiece(item);
    const lineGross = lineMerchandiseGross(item, pricePerPiece);
    const lineDiscPct = 0;
    const discountAmount = 0;
    const lineAfterLineDisc = Math.max(0, roundToTwo(lineGross - discountAmount));
    const customerDiscountAmount = roundToTwo((lineAfterLineDisc * customerPct) / 100);
    const lineMerchNet = Math.max(0, roundToTwo(lineAfterLineDisc - customerDiscountAmount));

    return {
      raw: item,
      pricePerPiece,
      lineGross,
      discountPercent: lineDiscPct,
      discountAmount,
      customerDiscountAmount,
      lineMerchNet,
    };
  });

  const subtotal = roundToTwo(rows.reduce((s, r) => s + r.lineGross, 0));
  const itemDiscountTotal = roundToTwo(rows.reduce((s, r) => s + r.discountAmount, 0));
  const customerDiscountTotal = roundToTwo(rows.reduce((s, r) => s + r.customerDiscountAmount, 0));
  const totalMerchNet = roundToTwo(rows.reduce((s, r) => s + r.lineMerchNet, 0));

  let orderDiscountAmount = 0;
  let orderDiscountMeta: { type: 'percent' | 'fixed'; value: number; amount: number } | undefined;
  const od = options.orderDiscount;
  if (od && totalMerchNet > 0 && Number(od.value) > 0) {
    if (od.type === 'percent') {
      orderDiscountAmount = roundToTwo(
        Math.min(totalMerchNet, (totalMerchNet * Number(od.value)) / 100)
      );
      orderDiscountMeta = { type: 'percent', value: Number(od.value), amount: orderDiscountAmount };
    } else if (od.type === 'fixed') {
      orderDiscountAmount = roundToTwo(Math.min(totalMerchNet, Number(od.value)));
      orderDiscountMeta = { type: 'fixed', value: Number(od.value), amount: orderDiscountAmount };
    }
  }

  const taxRows = rows.map((r) => {
    const alloc =
      totalMerchNet > 0 && orderDiscountAmount > 0
        ? roundToTwo((orderDiscountAmount * r.lineMerchNet) / totalMerchNet)
        : 0;
    const taxable = Math.max(0, roundToTwo(r.lineMerchNet - alloc));
    return { r, alloc, taxable };
  });

  const totalTaxable = roundToTwo(taxRows.reduce((s, t) => s + t.taxable, 0));
  const vatRate = taxRateDefault;
  const taxTotal = roundToTwo((totalTaxable * vatRate) / 100);

  const pricedItems = taxRows.map((t) => {
    const { r } = t;
    const lineTotal = roundToTwo(t.taxable);
    const item = r.raw;
    const unitPriceOut = displayUnitPrice(item, r.pricePerPiece);
    const persistedPiece =
      item.pricePerPiece != null && Number(item.pricePerPiece) > 0
        ? roundToTwo(Number(item.pricePerPiece))
        : r.pricePerPiece;

    return {
      ...(item._id ? { _id: item._id } : {}),
      productId: item.productId,
      variantId: item.variantId,
      sku: item.sku,
      variantSku: item.variantSku,
      barcode: item.barcode,
      productCode: item.productCode,
      name: item.name,
      variantName: item.variantName,
      displaySize: item.displaySize,
      quantity: Number(item.quantity) || 0,
      sellBy: item.sellBy,
      pcsPerUnit: item.pcsPerUnit,
      pricePerPiece: persistedPiece,
      unitPrice: unitPriceOut,
      discountPercent: r.discountPercent,
      discountAmount: r.discountAmount,
      customerDiscountAmount: r.customerDiscountAmount,
      taxRate: vatRate,
      taxAmount: 0,
      lineTotal,
      batchId: item.batchId,
      batchNumber: item.batchNumber,
      expiryDate: item.expiryDate,
      inventoryDeducted: item.inventoryDeducted ?? false,
      releasedQuantity: item.releasedQuantity,
      returnedQuantity: item.returnedQuantity,
      returnedQuantityPieces: item.returnedQuantityPieces,
    };
  });

  const sumLineTotals = roundToTwo(pricedItems.reduce((s, i) => s + (Number(i.lineTotal) || 0), 0));
  const grandTotalRaw = roundToTwo(sumLineTotals + taxTotal + shippingCharge - shippingDiscount);
  const grandTotal = roundToTwo(grandTotalRaw);
  const roundingAdjustment = roundToTwo(grandTotal - grandTotalRaw);

  return {
    items: pricedItems,
    pricing: {
      subtotal,
      itemDiscountTotal,
      customerDiscountTotal,
      ...(orderDiscountMeta ? { orderDiscount: orderDiscountMeta } : {}),
      taxTotal,
      shippingCharge,
      shippingDiscount,
      grandTotal,
      roundingAdjustment,
    },
  };
}

/** Only fill missing pcsPerUnit / sellBy from catalog — never override prices (must match parent order). */
export function enrichMissingUomFromProduct(line: any, product: any): any {
  if (!product?.variants?.length) return line;
  const vid = line.variantId?.toString?.() ?? String(line.variantId);
  const variant = (product.variants as any[]).find((v: any) => String(v._id) === vid);
  if (!variant) return line;
  const catalogPpu = Number(variant.salesUom?.pcsPerUnit);
  const ppu =
    Number(line.pcsPerUnit) > 0 ? Number(line.pcsPerUnit) : Math.max(1, catalogPpu || 1);
  return {
    ...line,
    pcsPerUnit: ppu,
    sellBy: line.sellBy || 'unit',
  };
}

/**
 * Scale saved parent line money fields by released quantity / demand quantity (same UOM).
 * Keeps unitPrice / pricePerPiece — sub-order totals stay consistent with the sales order.
 */
export function scaleParentOrderLineForRelease(parentLine: any, releaseQty: number): any {
  const pl = parentLine?.toObject ? parentLine.toObject() : { ...parentLine };
  const demand = Number(pl.quantity) || 0;
  const rq = Math.max(0, Number(releaseQty) || 0);
  const fullLine = demand > 0 && Math.abs(rq - demand) < 1e-6;
  const frac = demand > 0 ? Math.min(1, rq / demand) : 1;

  if (fullLine) {
    return {
      ...pl,
      quantity: rq,
      discountAmount: roundToTwo(Number(pl.discountAmount) || 0),
      customerDiscountAmount: roundToTwo(Number(pl.customerDiscountAmount) || 0),
      taxAmount: roundToTwo(Number(pl.taxAmount) || 0),
      lineTotal: roundToTwo(Number(pl.lineTotal) || 0),
    };
  }

  return {
    ...pl,
    quantity: rq,
    discountAmount: roundToTwo((Number(pl.discountAmount) || 0) * frac),
    customerDiscountAmount: roundToTwo((Number(pl.customerDiscountAmount) || 0) * frac),
    taxAmount: roundToTwo((Number(pl.taxAmount) || 0) * frac),
    lineTotal: roundToTwo((Number(pl.lineTotal) || 0) * frac),
  };
}

/** Merchandise net after line + customer discount, before order-level discount & VAT (matches buildPricedOrderItems rows). */
export function lineMerchNetBeforeOrderDiscount(item: any): number {
  const ppp = derivePricePerPiece(item);
  const g = lineMerchandiseGross(item, ppp);
  return Math.max(
    0,
    roundToTwo(
      g - (Number(item.discountAmount) || 0) - (Number(item.customerDiscountAmount) || 0)
    )
  );
}

/**
 * Roll up sub-order pricing from a subset of lines priced with the full sales order,
 * so order-discount allocation matches the parent (and VAT applies when line `taxAmount` is all zero).
 */
export function rollupSubOrderPricingFromPricedSubset(
  recomputed: ReturnType<typeof buildPricedOrderItems>,
  releasedItems: any[],
  shippingCharge: number,
  shippingDiscount: number
): ReturnType<typeof buildPricedOrderItems>['pricing'] {
  const fullItems = recomputed.items;
  const totalLN = roundToTwo(fullItems.reduce((s, i) => s + lineMerchNetBeforeOrderDiscount(i), 0));
  const releasedLN = roundToTwo(releasedItems.reduce((s, i) => s + lineMerchNetBeforeOrderDiscount(i), 0));

  // Full merchandise release: header must match full repricing (rollup from lines can drift vs VAT base).
  if (totalLN > 0 && Math.abs(releasedLN - totalLN) < 0.02) {
    return clonePricing(recomputed.pricing);
  }

  const subtotal = roundToTwo(
    releasedItems.reduce((s, i) => s + lineMerchandiseGross(i, derivePricePerPiece(i)), 0)
  );
  const itemDiscountTotal = roundToTwo(
    releasedItems.reduce((s, i) => s + (Number(i.discountAmount) || 0), 0)
  );
  const customerDiscountTotal = roundToTwo(
    releasedItems.reduce((s, i) => s + (Number(i.customerDiscountAmount) || 0), 0)
  );
  const lineTaxSum = roundToTwo(releasedItems.reduce((s, i) => s + (Number(i.taxAmount) || 0), 0));
  const sumLineTotals = roundToTwo(releasedItems.reduce((s, i) => s + (Number(i.lineTotal) || 0), 0));
  const rate = Number(releasedItems[0]?.taxRate) || 5;
  const taxTotal =
    lineTaxSum > 0.001 ? lineTaxSum : roundToTwo((sumLineTotals * rate) / 100);

  const sc = roundToTwo(Number(shippingCharge) || 0);
  const sd = roundToTwo(Number(shippingDiscount) || 0);
  const grandTotal = roundToTwo(sumLineTotals + taxTotal + sc - sd);

  const od = recomputed.pricing.orderDiscount;
  let orderDiscountMeta: typeof od;
  if (od && totalLN > 0) {
    orderDiscountMeta = {
      ...od,
      amount: roundToTwo((od.amount * releasedLN) / totalLN),
    };
  }

  return {
    subtotal,
    itemDiscountTotal,
    customerDiscountTotal,
    ...(orderDiscountMeta ? { orderDiscount: orderDiscountMeta } : {}),
    taxTotal,
    shippingCharge: sc,
    shippingDiscount: sd,
    grandTotal,
    roundingAdjustment: 0,
  };
}

export interface FulfillmentReleaseOptions {
  includeShipping: boolean;
  shippingCharge: number;
  shippingDiscount: number;
  /** Map productId string → Product lean doc (variants for UOM gaps only) */
  productById?: Map<string, any>;
  /**
   * Parent sales order `pricing` when this release ships 100% of every line in one sub-order.
   * Ensures AR / sub-order grand total matches the parent (avoids VAT on pre–customer-discount base
   * when persisted line `lineTotal` semantics drift from `rollupOrderLineItemsToPricing`).
   */
  parentHeaderPricing?: ReturnType<typeof buildPricedOrderItems>['pricing'];
}

function clonePricing<T>(p: T): T {
  return p == null ? p : (JSON.parse(JSON.stringify(p)) as T);
}

/** Every parent line is released in full quantity (typical first fulfillment of whole order). */
export function isCompleteFulfillmentRelease(
  parentItems: any[],
  releaseRows: Array<{ itemIndex: number; quantity: number }>
): boolean {
  if (!parentItems?.length || !releaseRows?.length) return false;
  if (releaseRows.length !== parentItems.length) return false;
  const seen = new Set<number>();
  for (const r of releaseRows) {
    if (seen.has(r.itemIndex)) return false;
    seen.add(r.itemIndex);
    const pl = parentItems[r.itemIndex];
    if (!pl) return false;
    const pq = Number(pl.quantity) || 0;
    const rq = Number(r.quantity) || 0;
    if (Math.abs(pq - rq) > 1e-6) return false;
  }
  for (let i = 0; i < parentItems.length; i++) {
    if (!seen.has(i)) return false;
  }
  return true;
}

/**
 * Build fulfillment sub-order lines + pricing from parent order lines using proportional scaling.
 * Optional product map fills missing pcsPerUnit only.
 */
export function buildFulfillmentReleaseFromParentScaled(
  parentItems: any[],
  releaseRows: Array<{ itemIndex: number; quantity: number }>,
  opts: FulfillmentReleaseOptions
): { items: any[]; pricing: ReturnType<typeof buildPricedOrderItems>['pricing'] } {
  const items = releaseRows.map((r) => {
    const parentLine = parentItems[r.itemIndex];
    let scaled = scaleParentOrderLineForRelease(parentLine, r.quantity);
    const pid = scaled.productId?.toString?.() ?? String(scaled.productId);
    const prod = opts.productById?.get(pid);
    if (prod) scaled = enrichMissingUomFromProduct(scaled, prod);
    return scaled;
  });

  if (
    opts.parentHeaderPricing &&
    opts.includeShipping &&
    isCompleteFulfillmentRelease(parentItems, releaseRows)
  ) {
    return {
      items,
      pricing: clonePricing(opts.parentHeaderPricing),
    };
  }

  const subtotal = roundToTwo(
    releaseRows.reduce((sum, r) => {
      const parentLine = parentItems[r.itemIndex];
      const pl = parentLine?.toObject ? parentLine.toObject() : { ...parentLine };
      let raw = { ...pl, quantity: r.quantity };
      const pid = raw.productId?.toString?.() ?? String(raw.productId);
      const prod = opts.productById?.get(pid);
      if (prod) raw = enrichMissingUomFromProduct(raw, prod);
      const ppp = derivePricePerPiece(raw);
      return sum + lineMerchandiseGross(raw, ppp);
    }, 0)
  );

  return {
    items,
    pricing: rollupOrderLineItemsToPricing(items, {
      includeShipping: opts.includeShipping,
      shippingCharge: opts.shippingCharge,
      shippingDiscount: opts.shippingDiscount,
      subtotalOverride: subtotal,
    }),
  };
}

/** Roll up `pricing` from already-priced line items (sums money fields + shipping). */
export function rollupOrderLineItemsToPricing(
  items: any[],
  opts: {
    includeShipping: boolean;
    shippingCharge: number;
    shippingDiscount: number;
    /** When set, use this as subtotal instead of recomputing from piece price × qty. */
    subtotalOverride?: number;
    /** When sum of line `taxAmount` is ~0, VAT = this rate × sum of line totals (ex VAT). */
    vatRateWhenNoLineTax?: number;
  }
): ReturnType<typeof buildPricedOrderItems>['pricing'] {
  const subtotal =
    opts.subtotalOverride != null
      ? roundToTwo(opts.subtotalOverride)
      : roundToTwo(
          items.reduce((sum, raw) => {
            const ppp = derivePricePerPiece(raw);
            return sum + lineMerchandiseGross(raw, ppp);
          }, 0)
        );
  const lineTaxSum = roundToTwo(items.reduce((s, i) => s + (Number(i.taxAmount) || 0), 0));
  const itemDiscountTotal = roundToTwo(items.reduce((s, i) => s + (Number(i.discountAmount) || 0), 0));
  const customerDiscountTotal = roundToTwo(
    items.reduce((s, i) => s + (Number(i.customerDiscountAmount) || 0), 0)
  );
  const sumLineTotals = roundToTwo(items.reduce((s, i) => s + (Number(i.lineTotal) || 0), 0));
  const rate = Number(opts.vatRateWhenNoLineTax ?? items[0]?.taxRate ?? 5);
  const taxTotal =
    lineTaxSum > 0.001 ? lineTaxSum : roundToTwo((sumLineTotals * rate) / 100);
  const sc = opts.includeShipping ? roundToTwo(Number(opts.shippingCharge) || 0) : 0;
  const sd = opts.includeShipping ? roundToTwo(Number(opts.shippingDiscount) || 0) : 0;
  const grandTotal = roundToTwo(sumLineTotals + taxTotal + sc - sd);

  return {
    subtotal,
    itemDiscountTotal,
    customerDiscountTotal,
    taxTotal,
    shippingCharge: sc,
    shippingDiscount: sd,
    grandTotal,
    roundingAdjustment: 0,
  };
}

/** Lines fully removed or quantity reduced vs previous snapshot (for follow-up orders / audit). */
export function buildApprovalRemovedSnapshot(previousItems: any[], nextItems: any[]) {
  const nextByKey = new Map<string, any>();
  for (const n of nextItems) {
    nextByKey.set(orderLineKey(n.productId, n.variantId), n);
  }

  const snapshot: any[] = [];
  for (const p of previousItems) {
    const k = orderLineKey(p.productId, p.variantId);
    const n = nextByKey.get(k);
    const prevQty = Number(p.quantity) || 0;
    const sellBy = p.sellBy || 'unit';
    const pcsPerUnit = Math.max(1, Number(p.pcsPerUnit) || 1);

    if (!n) {
      snapshot.push({
        productId: p.productId,
        variantId: p.variantId,
        sku: p.sku,
        variantSku: p.variantSku,
        name: p.name,
        variantName: p.variantName,
        displaySize: p.displaySize,
        quantity: prevQty,
        sellBy,
        pcsPerUnit,
        unitPrice: p.unitPrice,
        removalType: 'line_removed',
      });
      continue;
    }
    const newQty = Number(n.quantity) || 0;
    if (newQty < prevQty) {
      snapshot.push({
        productId: p.productId,
        variantId: p.variantId,
        sku: p.sku,
        variantSku: p.variantSku,
        name: p.name,
        variantName: p.variantName,
        displaySize: p.displaySize,
        quantity: prevQty - newQty,
        sellBy,
        pcsPerUnit,
        unitPrice: p.unitPrice,
        removalType: 'qty_reduced',
        originalQuantity: prevQty,
        approvedQuantity: newQty,
      });
    }
  }
  return snapshot;
}
