import { Response, NextFunction } from 'express';
import { IAuthRequest } from '../types';
import Order from '../models/Order';
import Customer from '../models/Customer';
import Product from '../models/Product';

export class DashboardController {
  static async getStats(_req: IAuthRequest, res: Response, next: NextFunction) {
    try {
      const today = new Date();
      const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

      const [
        totalOrders,
        totalCustomers,
        totalProducts,
        monthlyOrders,
        pendingOrders,
        lowStockCount,
      ] = await Promise.all([
        Order.countDocuments({ isDeleted: false }),
        Customer.countDocuments({ status: 'active' }),
        Product.countDocuments({ status: 'active' }),
        Order.countDocuments({
          createdAt: { $gte: startOfMonth },
          isDeleted: false
        }),
        Order.countDocuments({
          status: { $in: ['pending', 'confirmed'] },
          isDeleted: false
        }),
        Product.countDocuments({
          status: 'active',
          variants: {
            $elemMatch: {
              status: 'active',
              $expr: { $lte: ['$stock.quantity', '$stock.reorderLevel'] },
            },
          },
        }),
      ]);

      // Get monthly sales
      const salesData = await Order.aggregate([
        {
          $match: {
            createdAt: { $gte: startOfMonth },
            status: 'delivered',
            isDeleted: false,
          },
        },
        {
          $group: {
            _id: null,
            totalSales: { $sum: '$pricing.grandTotal' },
            orderCount: { $sum: 1 },
          },
        },
      ]);

      const stats = {
        totalOrders,
        totalCustomers,
        totalProducts,
        monthlyOrders,
        pendingOrders,
        lowStockCount,
        monthlySales: salesData[0]?.totalSales || 0,
        monthlySalesCount: salesData[0]?.orderCount || 0,
      };

      res.json({
        success: true,
        data: stats,
      });
    } catch (error) {
      next(error);
    }
  }
}
