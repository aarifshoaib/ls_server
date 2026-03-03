import { Response, NextFunction } from 'express';
import { IAuthRequest } from '../types';
import { PurchaseOrderService } from '../services/purchaseOrder.service';
import { parsePagination } from '../utils/helpers';

export class PurchaseOrderController {
  static async getAll(req: IAuthRequest, res: Response, next: NextFunction) {
    try {
      const { page, limit, skip } = parsePagination(req.query);
      const result = await PurchaseOrderService.getAll(req.query as Record<string, unknown>, { page, limit, skip });
      res.json({ success: true, ...result });
    } catch (error) {
      next(error);
    }
  }

  static async getById(req: IAuthRequest, res: Response, next: NextFunction) {
    try {
      const po = await PurchaseOrderService.getById(req.params.id);
      res.json({ success: true, data: po });
    } catch (error) {
      next(error);
    }
  }

  static async create(req: IAuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user?._id?.toString() || '';
      const po = await PurchaseOrderService.create(req.body, userId);
      res.status(201).json({
        success: true,
        data: po,
        message: 'Purchase Order created successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  static async update(req: IAuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user?._id?.toString() || '';
      const po = await PurchaseOrderService.update(req.params.id, req.body, userId);
      res.json({
        success: true,
        data: po,
        message: 'Purchase Order updated successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  static async submit(req: IAuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user?._id?.toString() || '';
      const po = await PurchaseOrderService.submit(req.params.id, userId);
      res.json({
        success: true,
        data: po,
        message: po.status === 'approved'
          ? 'Purchase Order submitted and approved'
          : 'Purchase Order submitted for approval',
      });
    } catch (error) {
      next(error);
    }
  }

  static async approve(req: IAuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user?._id?.toString() || '';
      const userRole = req.user?.role as string;
      const po = await PurchaseOrderService.approve(req.params.id, userId, userRole, req.body.notes);
      res.json({
        success: true,
        data: po,
        message: 'Purchase Order approved successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  static async reject(req: IAuthRequest, res: Response, next: NextFunction) {
    try {
      const notes = req.body.notes;
      if (!notes?.trim()) {
        res.status(400).json({ success: false, error: 'Rejection reason is required' });
        return;
      }
      const userId = req.user?._id?.toString() || '';
      const userRole = req.user?.role as string;
      const po = await PurchaseOrderService.reject(req.params.id, userId, userRole, notes);
      res.json({
        success: true,
        data: po,
        message: 'Purchase Order rejected',
      });
    } catch (error) {
      next(error);
    }
  }

  static async getPendingApprovals(req: IAuthRequest, res: Response, next: NextFunction) {
    try {
      const { page, limit, skip } = parsePagination(req.query);
      const result = await PurchaseOrderService.getPendingApprovals({ page, limit, skip });
      res.json({ success: true, ...result });
    } catch (error) {
      next(error);
    }
  }
}
