import { Response, NextFunction } from 'express';
import { IAuthRequest } from '../types';
import { PayrollService } from '../services/payroll.service';

export class PayrollRunController {
  static async getAll(req: IAuthRequest, res: Response, next: NextFunction) {
    try {
      const result = await PayrollService.getPayrollRuns(req.query, req.query);

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
      const payrollRun = await PayrollService.getPayrollRunById(req.params.id);

      res.json({
        success: true,
        data: payrollRun,
      });
    } catch (error) {
      next(error);
    }
  }

  static async create(req: IAuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user?._id.toString() || '';
      const payrollRun = await PayrollService.createPayrollRun(req.body, userId);

      res.status(201).json({
        success: true,
        data: payrollRun,
        message: 'Payroll run created successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  static async calculate(req: IAuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user?._id.toString() || '';
      const payrollRun = await PayrollService.calculatePayroll(req.params.id, userId);

      res.json({
        success: true,
        data: payrollRun,
        message: 'Payroll calculated successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  static async approve(req: IAuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user?._id.toString() || '';
      const payrollRun = await PayrollService.approvePayrollRun(req.params.id, req.body, userId);

      res.json({
        success: true,
        data: payrollRun,
        message: 'Payroll approved successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  static async finalize(req: IAuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user?._id.toString() || '';
      const payrollRun = await PayrollService.finalizePayrollRun(req.params.id, userId);

      res.json({
        success: true,
        data: payrollRun,
        message: 'Payroll finalized successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  static async cancel(req: IAuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user?._id.toString() || '';
      const payrollRun = await PayrollService.cancelPayrollRun(req.params.id, req.body.reason, userId);

      res.json({
        success: true,
        data: payrollRun,
        message: 'Payroll cancelled successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  static async getStatistics(_req: IAuthRequest, res: Response, next: NextFunction) {
    try {
      const statistics = await PayrollService.getStatistics();

      res.json({
        success: true,
        data: statistics,
      });
    } catch (error) {
      next(error);
    }
  }

  static async rerun(req: IAuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user?._id.toString() || '';
      const result = await PayrollService.rerunPayroll(req.params.id, userId);

      res.json({
        success: true,
        data: result.payrollRun,
        changes: result.changes,
        message: 'Payroll recalculated successfully',
      });
    } catch (error) {
      next(error);
    }
  }
}
