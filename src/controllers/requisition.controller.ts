import { Response, NextFunction } from 'express';
import { IAuthRequest } from '../types';
import { RequisitionService } from '../services/requisition.service';
import { parsePagination } from '../utils/helpers';

export class RequisitionController {
  static async getAll(req: IAuthRequest, res: Response, next: NextFunction) {
    try {
      const { page, limit, skip } = parsePagination(req.query);
      const result = await RequisitionService.getAll(req.query as Record<string, unknown>, { page, limit, skip });
      res.json({ success: true, ...result });
    } catch (error) {
      next(error);
    }
  }

  static async getById(req: IAuthRequest, res: Response, next: NextFunction) {
    try {
      const requisition = await RequisitionService.getById(req.params.id);
      res.json({ success: true, data: requisition });
    } catch (error) {
      next(error);
    }
  }

  static async create(req: IAuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user?._id?.toString() || '';
      const requisition = await RequisitionService.create(req.body, userId);
      res.status(201).json({
        success: true,
        data: requisition,
        message: 'Requisition created successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  static async update(req: IAuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user?._id?.toString() || '';
      const requisition = await RequisitionService.update(req.params.id, req.body, userId);
      res.json({
        success: true,
        data: requisition,
        message: 'Requisition updated successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  static async submit(req: IAuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user?._id?.toString() || '';
      const requisition = await RequisitionService.submit(req.params.id, userId);
      res.json({
        success: true,
        data: requisition,
        message: requisition.status === 'approved'
          ? 'Requisition submitted and approved (no approval required)'
          : 'Requisition submitted for approval',
      });
    } catch (error) {
      next(error);
    }
  }

  static async approve(req: IAuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user?._id?.toString() || '';
      const userRole = req.user?.role as string;
      const requisition = await RequisitionService.approve(
        req.params.id,
        userId,
        userRole,
        req.body.notes
      );
      res.json({
        success: true,
        data: requisition,
        message: 'Requisition approved successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  static async reject(req: IAuthRequest, res: Response, next: NextFunction) {
    try {
      const notes = req.body.notes;
      if (!notes?.trim()) {
        res.status(400).json({
          success: false,
          error: 'Rejection reason is required',
        });
        return;
      }
      const userId = req.user?._id?.toString() || '';
      const userRole = req.user?.role as string;
      const requisition = await RequisitionService.reject(
        req.params.id,
        userId,
        userRole,
        notes
      );
      res.json({
        success: true,
        data: requisition,
        message: 'Requisition rejected',
      });
    } catch (error) {
      next(error);
    }
  }

  static async getPendingApprovals(req: IAuthRequest, res: Response, next: NextFunction) {
    try {
      const { page, limit, skip } = parsePagination(req.query);
      const result = await RequisitionService.getPendingApprovals({ page, limit, skip });
      res.json({ success: true, ...result });
    } catch (error) {
      next(error);
    }
  }
}
