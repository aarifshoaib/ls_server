import { Response, NextFunction } from 'express';
import { IAuthRequest } from '../types';
import { InventoryService } from '../services/inventory.service';

export class InventoryController {
  static async getSummary(_req: IAuthRequest, res: Response, next: NextFunction) {
    try {
      const summary = await InventoryService.getInventorySummary();

      res.json({
        success: true,
        data: summary,
      });
    } catch (error) {
      next(error);
    }
  }

  static async getTransactions(req: IAuthRequest, res: Response, next: NextFunction) {
    try {
      const { productId, variantId, limit } = req.query;

      const transactions = await InventoryService.getInventoryTransactions(
        productId as string,
        variantId as string,
        limit ? parseInt(limit as string) : 50
      );

      res.json({
        success: true,
        data: transactions,
      });
    } catch (error) {
      next(error);
    }
  }

  static async adjust(req: IAuthRequest, res: Response, next: NextFunction) {
    try {
      const { productId, variantId, quantity, reason } = req.body;
      const userId = req.user?._id.toString() || '';

      const result = await InventoryService.adjustInventory(
        productId,
        variantId,
        quantity,
        reason,
        userId
      );

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
}
