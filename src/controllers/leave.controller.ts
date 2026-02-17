import { Response, NextFunction } from 'express';
import { IAuthRequest } from '../types';
import { LeaveService } from '../services/leave.service';

export class LeaveController {
  // Create leave request
  static async create(req: IAuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user?._id.toString() || '';
      const leave = await LeaveService.createLeave(req.body, userId);

      res.status(201).json({
        success: true,
        data: leave,
        message: 'Leave request created successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  // Get all leaves
  static async getAll(req: IAuthRequest, res: Response, next: NextFunction) {
    try {
      const result = await LeaveService.getLeaves(req.query, req.query);

      res.json({
        success: true,
        ...result,
      });
    } catch (error) {
      next(error);
    }
  }

  // Get leave by ID
  static async getById(req: IAuthRequest, res: Response, next: NextFunction) {
    try {
      const leave = await LeaveService.getLeaveById(req.params.id);

      res.json({
        success: true,
        data: leave,
      });
    } catch (error) {
      next(error);
    }
  }

  // Approve leave
  static async approve(req: IAuthRequest, res: Response, next: NextFunction) {
    try {
      const approverId = req.user?._id.toString() || '';
      const { comments } = req.body;

      const leave = await LeaveService.processLeaveApproval(
        req.params.id,
        approverId,
        'approve',
        comments
      );

      res.json({
        success: true,
        data: leave,
        message: 'Leave approved successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  // Reject leave
  static async reject(req: IAuthRequest, res: Response, next: NextFunction) {
    try {
      const approverId = req.user?._id.toString() || '';
      const { comments } = req.body;

      const leave = await LeaveService.processLeaveApproval(
        req.params.id,
        approverId,
        'reject',
        comments
      );

      res.json({
        success: true,
        data: leave,
        message: 'Leave rejected',
      });
    } catch (error) {
      next(error);
    }
  }

  // Cancel leave
  static async cancel(req: IAuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user?._id.toString() || '';
      const { reason } = req.body;

      const leave = await LeaveService.cancelLeave(req.params.id, userId, reason);

      res.json({
        success: true,
        data: leave,
        message: 'Leave cancelled successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  // Get my leaves
  static async getMyLeaves(req: IAuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user?._id.toString() || '';
      const result = await LeaveService.getLeaves({ ...req.query, userId }, req.query);

      res.json({
        success: true,
        ...result,
      });
    } catch (error) {
      next(error);
    }
  }

  // Get pending approvals for current user
  static async getPendingApprovals(req: IAuthRequest, res: Response, next: NextFunction) {
    try {
      const approverId = req.user?._id.toString() || '';
      const result = await LeaveService.getLeaves({ ...req.query, approverId }, req.query);

      res.json({
        success: true,
        ...result,
      });
    } catch (error) {
      next(error);
    }
  }

  // Get leave balance
  static async getBalance(req: IAuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.params.userId || req.user?._id.toString() || '';
      const year = req.query.year ? parseInt(req.query.year as string) : undefined;

      const balance = await LeaveService.getLeaveBalance(userId, year);

      res.json({
        success: true,
        data: balance,
      });
    } catch (error) {
      next(error);
    }
  }

  // Get my leave balance
  static async getMyBalance(req: IAuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user?._id.toString() || '';
      const year = req.query.year ? parseInt(req.query.year as string) : undefined;

      const balance = await LeaveService.getLeaveBalance(userId, year);

      res.json({
        success: true,
        data: balance,
      });
    } catch (error) {
      next(error);
    }
  }

  // Update leave balance (admin)
  static async updateBalance(req: IAuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user?._id.toString() || '';
      const balance = await LeaveService.updateLeaveBalanceAdmin(
        req.params.id,
        req.body,
        userId
      );

      res.json({
        success: true,
        data: balance,
        message: 'Leave balance updated successfully',
      });
    } catch (error) {
      next(error);
    }
  }
}
