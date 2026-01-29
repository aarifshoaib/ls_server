import { Response, NextFunction } from 'express';
import { IAuthRequest } from '../types';
import { PayCycleService } from '../services/payCycle.service';

export class PayCycleController {
  static async getAll(req: IAuthRequest, res: Response, next: NextFunction) {
    try {
      const result = await PayCycleService.getPayCycles(req.query, req.query);

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
      const payCycle = await PayCycleService.getPayCycleById(req.params.id);

      res.json({
        success: true,
        data: payCycle,
      });
    } catch (error) {
      next(error);
    }
  }

  static async getByCode(req: IAuthRequest, res: Response, next: NextFunction) {
    try {
      const payCycle = await PayCycleService.getByCode(req.params.code);

      res.json({
        success: true,
        data: payCycle,
      });
    } catch (error) {
      next(error);
    }
  }

  static async getActive(_req: IAuthRequest, res: Response, next: NextFunction) {
    try {
      const payCycles = await PayCycleService.getActivePayCycles();

      res.json({
        success: true,
        data: payCycles,
      });
    } catch (error) {
      next(error);
    }
  }

  static async getDefault(_req: IAuthRequest, res: Response, next: NextFunction) {
    try {
      const payCycle = await PayCycleService.getDefaultPayCycle();

      res.json({
        success: true,
        data: payCycle,
      });
    } catch (error) {
      next(error);
    }
  }

  static async create(req: IAuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user?._id.toString() || '';
      const payCycle = await PayCycleService.createPayCycle(req.body, userId);

      res.status(201).json({
        success: true,
        data: payCycle,
        message: 'Pay cycle created successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  static async update(req: IAuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user?._id.toString() || '';
      const payCycle = await PayCycleService.updatePayCycle(req.params.id, req.body, userId);

      res.json({
        success: true,
        data: payCycle,
        message: 'Pay cycle updated successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  static async delete(req: IAuthRequest, res: Response, next: NextFunction) {
    try {
      const result = await PayCycleService.deletePayCycle(req.params.id);

      res.json({
        success: true,
        ...result,
      });
    } catch (error) {
      next(error);
    }
  }

  static async setDefault(req: IAuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user?._id.toString() || '';
      const payCycle = await PayCycleService.setDefault(req.params.id, userId);

      res.json({
        success: true,
        data: payCycle,
        message: 'Default pay cycle updated successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  static async calculatePeriodDates(req: IAuthRequest, res: Response, next: NextFunction) {
    try {
      const payCycle = await PayCycleService.getPayCycleById(req.params.id);
      const referenceDate = req.query.date ? new Date(req.query.date as string) : new Date();
      const periodDates = PayCycleService.calculatePeriodDates(payCycle, referenceDate);

      res.json({
        success: true,
        data: periodDates,
      });
    } catch (error) {
      next(error);
    }
  }

  // Get period info for a pay cycle
  static async getPeriodInfo(req: IAuthRequest, res: Response, next: NextFunction) {
    try {
      const periodInfo = await PayCycleService.getPeriodInfo(req.params.id);

      res.json({
        success: true,
        data: periodInfo,
      });
    } catch (error) {
      next(error);
    }
  }

  // Initialize period for a pay cycle
  static async initializePeriod(req: IAuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?._id.toString() || '';
      const { payMonth } = req.body;

      if (!payMonth) {
        res.status(400).json({
          success: false,
          message: 'payMonth is required (format: MMYYYY)',
        });
        return;
      }

      const payCycle = await PayCycleService.initializePeriod(
        req.params.id,
        payMonth,
        userId
      );

      res.json({
        success: true,
        data: payCycle,
        message: 'Pay cycle period initialized successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  // Set period status (open, processing, closed)
  static async setPeriodStatus(req: IAuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?._id.toString() || '';
      const { status } = req.body;

      if (!status || !['open', 'processing', 'closed'].includes(status)) {
        res.status(400).json({
          success: false,
          message: 'Valid status is required (open, processing, closed)',
        });
        return;
      }

      const payCycle = await PayCycleService.setPeriodStatus(
        req.params.id,
        status,
        userId
      );

      res.json({
        success: true,
        data: payCycle,
        message: `Pay cycle period status set to ${status}`,
      });
    } catch (error) {
      next(error);
    }
  }

  // Get employees for a pay cycle
  static async getEmployees(req: IAuthRequest, res: Response, next: NextFunction) {
    try {
      const employees = await PayCycleService.getEmployeesForPayCycle(req.params.id);

      res.json({
        success: true,
        data: employees,
        total: employees.length,
      });
    } catch (error) {
      next(error);
    }
  }
}
