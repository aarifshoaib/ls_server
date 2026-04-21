import mongoose from 'mongoose';
import Order from '../models/Order';
import CustomerLedger from '../models/CustomerLedger';

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Sum of positive `balanceDue` for open orders, **without double-counting** parent vs fulfillment:
 * - All fulfillment sub-orders' `balanceDue` are included.
 * - A **parent** sales order's `balanceDue` is included **only if** none of its fulfillment
 *   subs still show positive `balanceDue` (otherwise AR lives on the subs; parent is often stale
 *   or a duplicate of the same invoice total).
 */
export async function sumUnpaidOrderBalanceDue(customerId: string): Promise<number> {
  const cid = new mongoose.Types.ObjectId(customerId);
  const orders = await Order.find({
    customerId: cid,
    isDeleted: { $ne: true },
    status: { $nin: ['cancelled', 'draft'] },
  })
    .select('_id isFulfillmentSubOrder sourceOrderId balanceDue')
    .lean();

  const parentsWithOpenSubAr = new Set<string>();
  for (const o of orders) {
    if (o.isFulfillmentSubOrder === true && o.sourceOrderId) {
      const d = Math.max(0, Number((o as any).balanceDue) || 0);
      if (d > 1e-6) {
        parentsWithOpenSubAr.add(String((o as any).sourceOrderId));
      }
    }
  }

  let total = 0;
  for (const o of orders) {
    const d = Math.max(0, Number((o as any).balanceDue) || 0);
    if (d < 1e-6) continue;

    if (o.isFulfillmentSubOrder === true) {
      total += d;
      continue;
    }

    const pid = String((o as any)._id);
    if (parentsWithOpenSubAr.has(pid)) {
      continue;
    }
    total += d;
  }

  return round2(total);
}

/**
 * Latest running balance per customer from CustomerLedger (authoritative when entries exist).
 * Embedded customer.creditInfo.currentOutstanding can drift if ledger and document updates diverge.
 */
export async function getLatestOutstandingByCustomerIds(
  customerIds: mongoose.Types.ObjectId[]
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (!customerIds.length) return map;

  const rows = await CustomerLedger.aggregate<{ _id: mongoose.Types.ObjectId; balanceAfter: number }>([
    { $match: { customerId: { $in: customerIds } } },
    { $sort: { transactionDate: -1, createdAt: -1 } },
    { $group: { _id: '$customerId', balanceAfter: { $first: '$balanceAfter' } } },
  ]);

  for (const r of rows) {
    if (r?._id) {
      map.set(String(r._id), round2(Number(r.balanceAfter) || 0));
    }
  }
  return map;
}

/**
 * Live order aggregates for a customer (parent sales orders only, not cancelled).
 * Embedded customer.financialSummary is only updated on delivery; this matches what
 * users see in the order list and keeps detail totals accurate before delivery.
 */
export async function getCustomerOrderFinancialSnapshot(customerId: string): Promise<{
  totalOrders: number;
  totalOrderValue: number;
  lastOrderDate?: Date;
  averageOrderValue: number;
}> {
  const cid = new mongoose.Types.ObjectId(customerId);
  const [agg] = await Order.aggregate<{
    totalOrders: number;
    totalOrderValue: number;
    lastOrderDate?: Date;
  }>([
    {
      $match: {
        customerId: cid,
        isFulfillmentSubOrder: { $ne: true },
        status: { $nin: ['cancelled'] },
      },
    },
    {
      $group: {
        _id: null,
        totalOrders: { $sum: 1 },
        totalOrderValue: { $sum: { $ifNull: ['$pricing.grandTotal', 0] } },
        lastOrderDate: { $max: '$createdAt' },
      },
    },
  ]);

  if (!agg?.totalOrders) {
    return { totalOrders: 0, totalOrderValue: 0, averageOrderValue: 0 };
  }

  const totalOrderValue = agg.totalOrderValue || 0;
  return {
    totalOrders: agg.totalOrders,
    totalOrderValue: round2(totalOrderValue),
    lastOrderDate: agg.lastOrderDate,
    averageOrderValue: round2(totalOrderValue / agg.totalOrders),
  };
}
