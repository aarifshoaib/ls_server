import { Response, NextFunction } from 'express';
import { IAuthRequest } from '../types';
import { PurchaseReturnService } from '../services/purchaseReturn.service';
import { parsePagination } from '../utils/helpers';

export class PurchaseReturnController {
  static async getAll(req: IAuthRequest, res: Response, next: NextFunction) {
    try {
      const { page, limit, skip } = parsePagination(req.query);
      const result = await PurchaseReturnService.getAll(req.query as Record<string, unknown>, { page, limit, skip });
      res.json({ success: true, ...result });
    } catch (error) {
      next(error);
    }
  }

  static async getById(req: IAuthRequest, res: Response, next: NextFunction) {
    try {
      const pr = await PurchaseReturnService.getById(req.params.id);
      res.json({ success: true, data: pr });
    } catch (error) {
      next(error);
    }
  }

  static async create(req: IAuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user?._id?.toString() || '';
      const pr = await PurchaseReturnService.create(req.body, userId);
      res.status(201).json({
        success: true,
        data: pr,
        message: 'Purchase Return created successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  static async update(req: IAuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user?._id?.toString() || '';
      const pr = await PurchaseReturnService.update(req.params.id, req.body, userId);
      res.json({
        success: true,
        data: pr,
        message: 'Purchase Return updated successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  static async delete(req: IAuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user?._id?.toString() || '';
      await PurchaseReturnService.delete(req.params.id, userId);
      res.json({
        success: true,
        message: 'Purchase Return deleted',
      });
    } catch (error) {
      next(error);
    }
  }

  static async submit(req: IAuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user?._id?.toString() || '';
      const pr = await PurchaseReturnService.submit(req.params.id, userId);
      res.json({
        success: true,
        data: pr,
        message: pr.status === 'approved'
          ? 'Purchase Return submitted - inventory deducted'
          : 'Purchase Return submitted for approval',
      });
    } catch (error) {
      next(error);
    }
  }

  static async approve(req: IAuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user?._id?.toString() || '';
      const userRole = req.user?.role as string;
      const pr = await PurchaseReturnService.approve(req.params.id, userId, userRole, req.body.notes);
      res.json({
        success: true,
        data: pr,
        message: 'Purchase Return approved - inventory deducted',
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
      const pr = await PurchaseReturnService.reject(req.params.id, userId, userRole, notes);
      res.json({
        success: true,
        data: pr,
        message: 'Purchase Return rejected',
      });
    } catch (error) {
      next(error);
    }
  }

  static async getPendingApprovals(req: IAuthRequest, res: Response, next: NextFunction) {
    try {
      const { page, limit, skip } = parsePagination(req.query);
      const result = await PurchaseReturnService.getPendingApprovals({ page, limit, skip });
      res.json({ success: true, ...result });
    } catch (error) {
      next(error);
    }
  }
}
