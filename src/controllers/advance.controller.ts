import { Response, NextFunction } from 'express';
import { IAuthRequest } from '../types';
import { AdvanceService } from '../services/advance.service';
import { errors } from '../utils/errors';

export class AdvanceController {
  static async getAll(req: IAuthRequest, res: Response, next: NextFunction) {
    try {
      const result = await AdvanceService.getAdvances(req.query, req.query);

      res.json({
        success: true,
        ...result,
      });
    } catch (error) {
      next(error);
    }
  }

  static async getById(req: IAuthRequest, res: Response, next: NextFunction) {
    try {
      const advance = await AdvanceService.getAdvanceById(req.params.id);

      res.json({
        success: true,
        data: advance,
      });
    } catch (error) {
      next(error);
    }
  }

  static async getByEmployee(req: IAuthRequest, res: Response, next: NextFunction) {
    try {
      const includeCompleted = req.query.includeCompleted === 'true';
      const advances = await AdvanceService.getByEmployee(req.params.employeeId, includeCompleted);

      res.json({
        success: true,
        data: advances,
      });
    } catch (error) {
      next(error);
    }
  }

  static async create(req: IAuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user?._id.toString() || '';
      const advance = await AdvanceService.createAdvance(req.body, userId);

      res.status(201).json({
        success: true,
        data: advance,
        message: 'Advance request created successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  static async update(req: IAuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?._id.toString() || '';
      const advance = await AdvanceService.getAdvanceById(req.params.id);

      if (advance.status !== 'pending') {
        res.status(400).json({
          success: false,
          message: 'Only pending advances can be updated',
        });
        return;
      }

      Object.assign(advance, req.body);
      advance.updatedBy = userId as any;
      await advance.save();

      res.json({
        success: true,
        data: advance,
        message: 'Advance updated successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  static async approve(req: IAuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user?._id.toString() || '';
      const advance = await AdvanceService.approveAdvance(req.params.id, req.body, userId);

      res.json({
        success: true,
        data: advance,
        message: 'Advance approved successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  static async reject(req: IAuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user?._id.toString() || '';
      const advance = await AdvanceService.rejectAdvance(req.params.id, req.body, userId);

      res.json({
        success: true,
        data: advance,
        message: 'Advance rejected successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  static async disburse(req: IAuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user?._id.toString() || '';
      const advance = await AdvanceService.disburseAdvance(req.params.id, req.body, userId);

      res.json({
        success: true,
        data: advance,
        message: 'Advance disbursed successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  static async recordRepayment(req: IAuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user?._id.toString() || '';
      const { amount, payrollRunId } = req.body;
      const advance = await AdvanceService.recordRepayment(req.params.id, amount, payrollRunId, userId);

      res.json({
        success: true,
        data: advance,
        message: 'Repayment recorded successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  static async getPendingRepayments(req: IAuthRequest, res: Response, next: NextFunction) {
    try {
      const periodEndParam = req.query.periodEnd ? String(req.query.periodEnd) : undefined;
      const periodEnd = periodEndParam ? new Date(periodEndParam) : undefined;
      if (periodEndParam && Number.isNaN(periodEnd?.getTime())) {
        throw errors.validation('Invalid periodEnd date');
      }

      const repayments = await AdvanceService.getPendingRepayments(req.params.employeeId, periodEnd);

      res.json({
        success: true,
        data: repayments,
      });
    } catch (error) {
      next(error);
    }
  }

  static async cancel(req: IAuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user?._id.toString() || '';
      const advance = await AdvanceService.cancelAdvance(req.params.id, req.body.reason, userId);

      res.json({
        success: true,
        data: advance,
        message: 'Advance cancelled successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  static async getStatistics(_req: IAuthRequest, res: Response, next: NextFunction) {
    try {
      const statistics = await AdvanceService.getStatistics();

      res.json({
        success: true,
        data: statistics,
      });
    } catch (error) {
      next(error);
    }
  }
}