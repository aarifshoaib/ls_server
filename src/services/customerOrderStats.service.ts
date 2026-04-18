import mongoose from 'mongoose';
import Order from '../models/Order';

const round2 = (n: number) => Math.round(n * 100) / 100;

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
