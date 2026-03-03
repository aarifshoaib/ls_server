import { Response, NextFunction } from 'express';
import { IAuthRequest } from '../types';
import ApprovalConfig from '../models/ApprovalConfig';
import { errors } from '../utils/errors';

const PROCUREMENT_MODULES = ['requisitions', 'purchase_orders', 'purchase_invoices'];

export class ApprovalConfigController {
  static async getProcurementConfigs(_req: IAuthRequest, res: Response, next: NextFunction) {
    try {
      const configs = await ApprovalConfig.find({
        type: 'custom',
        $or: [
          { name: 'requisition_approval' },
          { name: 'purchase_order_approval' },
          { name: 'purchase_invoice_approval' },
          { 'metadata.module': { $in: PROCUREMENT_MODULES } },
        ],
      }).lean();

      const byModule = {
        requisitions: configs.find((c: any) => c.name === 'requisition_approval' || c.metadata?.module === 'requisitions'),
        purchase_orders: configs.find((c: any) => c.name === 'purchase_order_approval' || c.metadata?.module === 'purchase_orders'),
        purchase_invoices: configs.find((c: any) => c.name === 'purchase_invoice_approval' || c.metadata?.module === 'purchase_invoices'),
      };

      res.json({ success: true, data: byModule });
    } catch (error) {
      next(error);
    }
  }

  static async updateIsActive(req: IAuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { isActive } = req.body;

      const config = await ApprovalConfig.findByIdAndUpdate(
        id,
        { isActive: !!isActive, updatedBy: req.user?._id },
        { new: true }
      );

      if (!config) throw errors.notFound('Approval config');

      res.json({ success: true, data: config, message: 'Approval config updated' });
    } catch (error) {
      next(error);
    }
  }
}
