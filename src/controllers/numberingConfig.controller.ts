import { Response, NextFunction } from 'express';
import { IAuthRequest } from '../types';
import { NumberingService } from '../services/numbering.service';

const VALID_ENTITIES = [
  'order',
  'invoice',
  'employee',
  'customer',
  'vendor',
  'requisition',
  'purchase_order',
  'purchase_invoice',
  'purchase_return',
  'advance',
] as const;

export class NumberingConfigController {
  static async getAll(_req: IAuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const configs = await NumberingService.getAll();
      res.json({ success: true, data: configs });
    } catch (error) {
      next(error);
    }
  }

  static async update(req: IAuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { entity } = req.params;
      const { prefix, digitCount, useSeparator } = req.body;
      if (!entity || !VALID_ENTITIES.includes(entity as any)) {
        res.status(400).json({ success: false, error: 'Invalid entity' });
        return;
      }
      await NumberingService.update(entity as any, {
        ...(prefix != null && { prefix: String(prefix).trim() }),
        ...(digitCount != null && { digitCount: Number(digitCount) }),
        ...(useSeparator != null && { useSeparator: Boolean(useSeparator) }),
      });
      const configs = await NumberingService.getAll();
      const updated = configs.find((c) => c.entity === entity);
      res.json({ success: true, data: updated });
    } catch (error) {
      next(error);
    }
  }

  static async updateBulk(req: IAuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const items = Array.isArray(req.body) ? req.body : req.body?.configs;
      if (!Array.isArray(items)) {
        res.status(400).json({ success: false, error: 'Expected array of configs' });
        return;
      }
      for (const item of items) {
        if (item?.entity && VALID_ENTITIES.includes(item.entity)) {
          await NumberingService.update(item.entity, {
            ...(item.prefix != null && { prefix: String(item.prefix).trim() }),
            ...(item.digitCount != null && { digitCount: Number(item.digitCount) }),
            ...(item.useSeparator != null && { useSeparator: Boolean(item.useSeparator) }),
          });
        }
      }
      const configs = await NumberingService.getAll();
      res.json({ success: true, data: configs });
    } catch (error) {
      next(error);
    }
  }
}
