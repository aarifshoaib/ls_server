import { Response, NextFunction } from 'express';
import { IAuthRequest } from '../types';
import { EarningDeductionService } from '../services/earningDeduction.service';

export class EarningDeductionController {
  static async getAll(req: IAuthRequest, res: Response, next: NextFunction) {
    try {
      const result = await EarningDeductionService.getEarningDeductions(req.query, req.query);

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
      const earningDeduction = await EarningDeductionService.getEarningDeductionById(req.params.id);

      res.json({
        success: true,
        data: earningDeduction,
      });
    } catch (error) {
      next(error);
    }
  }

  static async getByCode(req: IAuthRequest, res: Response, next: NextFunction) {
    try {
      const earningDeduction = await EarningDeductionService.getByCode(req.params.code);

      res.json({
        success: true,
        data: earningDeduction,
      });
    } catch (error) {
      next(error);
    }
  }

  static async getActiveComponents(req: IAuthRequest, res: Response, next: NextFunction) {
    try {
      const type = req.query.type as 'earning' | 'deduction' | undefined;
      const components = await EarningDeductionService.getActiveComponents(type);

      res.json({
        success: true,
        data: components,
      });
    } catch (error) {
      next(error);
    }
  }

  static async create(req: IAuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user?._id.toString() || '';
      const earningDeduction = await EarningDeductionService.createEarningDeduction(req.body, userId);

      res.status(201).json({
        success: true,
        data: earningDeduction,
        message: 'Earning/Deduction component created successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  static async update(req: IAuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user?._id.toString() || '';
      const earningDeduction = await EarningDeductionService.updateEarningDeduction(req.params.id, req.body, userId);

      res.json({
        success: true,
        data: earningDeduction,
        message: 'Earning/Deduction component updated successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  static async delete(req: IAuthRequest, res: Response, next: NextFunction) {
    try {
      const result = await EarningDeductionService.deleteEarningDeduction(req.params.id);

      res.json({
        success: true,
        ...result,
      });
    } catch (error) {
      next(error);
    }
  }
}
