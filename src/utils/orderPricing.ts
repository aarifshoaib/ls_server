import { roundToNearestQuarter } from './helpers';

export interface OrderDiscountInput {
  type: 'percent' | 'fixed';
  value: number;
}

export interface BuildPricedOrderOptions {
  taxRateDefault?: number;
  orderDiscount?: OrderDiscountInput | null;
  shippingCharge?: number;
  shippingDiscount?: number;
}

function lineKey(productId: unknown, variantId: unknown) {
  const p = productId?.toString?.() ?? String(productId);
  const v = variantId?.toString?.() ?? String(variantId);
  return `${p}:${v}`;
}

/**
 * Builds order line items with line discounts, proportional order-level discount on merchandise,
 * VAT per line (same rate), shipping, and rounded grand total.
 */
export function buildPricedOrderItems(
  rawItems: any[],
  options: BuildPricedOrderOptions = {}
): {
  items: any[];
  pricing: {
    subtotal: number;
    itemDiscountTotal: number;
    orderDiscount?: { type: 'percent' | 'fixed'; value: number; amount: number };
    taxTotal: number;
    shippingCharge: number;
    shippingDiscount: number;
    grandTotal: number;
    roundingAdjustment: number;
  };
} {
  const taxRateDefault = options.taxRateDefault ?? 5;
  const shippingCharge = Number(options.shippingCharge) || 0;
  const shippingDiscount = Number(options.shippingDiscount) || 0;

  const rows = rawItems.map((item: any) => {
    const qty = Number(item.quantity) || 0;
    const unitPrice = Number(item.unitPrice) || 0;
    const lineGross = qty * unitPrice;
    const discountPercent = Number(item.discountPercent) || 0;
    const discountAmount = (lineGross * discountPercent) / 100;
    const lineMerchNet = Math.max(0, lineGross - discountAmount);
    const taxRate = Number(item.taxRate) || taxRateDefault;
    return {
      raw: item,
      qty,
      unitPrice,
      lineGross,
      discountPercent,
      discountAmount,
      lineMerchNet,
      taxRate,
    };
  });

  const subtotal = rows.reduce((s, r) => s + r.lineGross, 0);
  const itemDiscountTotal = rows.reduce((s, r) => s + r.discountAmount, 0);
  const totalMerchNet = rows.reduce((s, r) => s + r.lineMerchNet, 0);

  let orderDiscountAmount = 0;
  let orderDiscountMeta: { type: 'percent' | 'fixed'; value: number; amount: number } | undefined;
  const od = options.orderDiscount;
  if (od && totalMerchNet > 0 && Number(od.value) > 0) {
    if (od.type === 'percent') {
      orderDiscountAmount = Math.min(totalMerchNet, (totalMerchNet * Number(od.value)) / 100);
      orderDiscountMeta = { type: 'percent', value: Number(od.value), amount: orderDiscountAmount };
    } else if (od.type === 'fixed') {
      orderDiscountAmount = Math.min(totalMerchNet, Number(od.value));
      orderDiscountMeta = { type: 'fixed', value: Number(od.value), amount: orderDiscountAmount };
    }
  }

  const pricedItems = rows.map((r) => {
    const alloc =
      totalMerchNet > 0 && orderDiscountAmount > 0
        ? (orderDiscountAmount * r.lineMerchNet) / totalMerchNet
        : 0;
    const taxable = Math.max(0, r.lineMerchNet - alloc);
    const taxAmount = (taxable * r.taxRate) / 100;
    const lineTotal = taxable + taxAmount;
    const item = r.raw;
    return {
      productId: item.productId,
      variantId: item.variantId,
      sku: item.sku,
      variantSku: item.variantSku,
      barcode: item.barcode,
      productCode: item.productCode,
      name: item.name,
      variantName: item.variantName,
      displaySize: item.displaySize,
      quantity: r.qty,
      sellBy: item.sellBy,
      pcsPerUnit: item.pcsPerUnit,
      unitPrice: r.unitPrice,
      discountPercent: r.discountPercent,
      discountAmount: r.discountAmount,
      taxRate: r.taxRate,
      taxAmount,
      lineTotal,
      // Line-level batch: from client when sent; else InventoryService.deductInventoryForOrder stamps after deduct (approve / confirm).
      batchId: item.batchId,
      batchNumber: item.batchNumber,
      expiryDate: item.expiryDate,
      inventoryDeducted: item.inventoryDeducted ?? false,
    };
  });

  const taxTotal = pricedItems.reduce((s, i) => s + (Number(i.taxAmount) || 0), 0);
  const sumLineTotals = pricedItems.reduce((s, i) => s + (Number(i.lineTotal) || 0), 0);
  const grandTotalRaw = sumLineTotals + shippingCharge - shippingDiscount;
  const grandTotal = roundToNearestQuarter(grandTotalRaw);
  const roundingAdjustment = grandTotal - grandTotalRaw;

  return {
    items: pricedItems,
    pricing: {
      subtotal,
      itemDiscountTotal,
      ...(orderDiscountMeta ? { orderDiscount: orderDiscountMeta } : {}),
      taxTotal,
      shippingCharge,
      shippingDiscount,
      grandTotal,
      roundingAdjustment,
    },
  };
}

/** Lines fully removed or quantity reduced vs previous snapshot (for follow-up orders / audit). */
export function buildApprovalRemovedSnapshot(previousItems: any[], nextItems: any[]) {
  const nextByKey = new Map<string, any>();
  for (const n of nextItems) {
    nextByKey.set(lineKey(n.productId, n.variantId), n);
  }

  const snapshot: any[] = [];
  for (const p of previousItems) {
    const k = lineKey(p.productId, p.variantId);
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
