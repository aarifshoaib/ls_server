import { Response, NextFunction } from 'express';
import { IAuthRequest } from '../types';
import { PurchaseInvoiceService } from '../services/purchaseInvoice.service';
import { parsePagination } from '../utils/helpers';

export class PurchaseInvoiceController {
  static async getAll(req: IAuthRequest, res: Response, next: NextFunction) {
    try {
      const { page, limit, skip } = parsePagination(req.query);
      const result = await PurchaseInvoiceService.getAll(req.query as Record<string, unknown>, { page, limit, skip });
      res.json({ success: true, ...result });
    } catch (error) {
      next(error);
    }
  }

  static async getById(req: IAuthRequest, res: Response, next: NextFunction) {
    try {
      const pi = await PurchaseInvoiceService.getById(req.params.id);
      res.json({ success: true, data: pi });
    } catch (error) {
      next(error);
    }
  }

  static async create(req: IAuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user?._id?.toString() || '';
      const pi = await PurchaseInvoiceService.create(req.body, userId);
      res.status(201).json({
        success: true,
        data: pi,
        message: 'Purchase Invoice created successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  static async update(req: IAuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user?._id?.toString() || '';
      const pi = await PurchaseInvoiceService.update(req.params.id, req.body, userId);
      res.json({
        success: true,
        data: pi,
        message: 'Purchase Invoice updated successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  static async submit(req: IAuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user?._id?.toString() || '';
      const pi = await PurchaseInvoiceService.submit(req.params.id, userId);
      res.json({
        success: true,
        data: pi,
        message: pi.status === 'approved'
          ? 'Purchase Invoice submitted and approved'
          : 'Purchase Invoice submitted for approval',
      });
    } catch (error) {
      next(error);
    }
  }

  static async approve(req: IAuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user?._id?.toString() || '';
      const userRole = req.user?.role as string;
      const pi = await PurchaseInvoiceService.approve(req.params.id, userId, userRole, req.body.notes);
      res.json({
        success: true,
        data: pi,
        message: 'Purchase Invoice approved successfully',
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
      const pi = await PurchaseInvoiceService.reject(req.params.id, userId, userRole, notes);
      res.json({
        success: true,
        data: pi,
        message: 'Purchase Invoice rejected',
      });
    } catch (error) {
      next(error);
    }
  }

  static async delete(req: IAuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user?._id?.toString() || '';
      await PurchaseInvoiceService.delete(req.params.id, userId);
      res.json({
        success: true,
        message: 'Purchase Invoice deleted',
      });
    } catch (error) {
      next(error);
    }
  }

  static async receive(req: IAuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user?._id?.toString() || '';
      const pi = await PurchaseInvoiceService.receive(req.params.id, userId);
      res.json({
        success: true,
        data: pi,
        message: 'Purchase Invoice received - stock updated',
      });
    } catch (error) {
      next(error);
    }
  }

  static async getPendingApprovals(req: IAuthRequest, res: Response, next: NextFunction) {
    try {
      const { page, limit, skip } = parsePagination(req.query);
      const result = await PurchaseInvoiceService.getPendingApprovals({ page, limit, skip });
      res.json({ success: true, ...result });
    } catch (error) {
      next(error);
    }
  }
}
