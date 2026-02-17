import { Response, NextFunction } from 'express';
import { IAuthRequest } from '../types';
import { HolidayService } from '../services/holiday.service';

export class HolidayController {
  static async getAll(req: IAuthRequest, res: Response, next: NextFunction) {
    try {
      const result = await HolidayService.getHolidays(req.query, req.query);

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
      const holiday = await HolidayService.getHolidayById(req.params.id);

      res.json({
        success: true,
        data: holiday,
      });
    } catch (error) {
      next(error);
    }
  }

  static async create(req: IAuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user?._id.toString() || '';
      const holiday = await HolidayService.createHoliday(req.body, userId);

      res.status(201).json({
        success: true,
        data: holiday,
        message: 'Holiday created successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  static async update(req: IAuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user?._id.toString() || '';
      const holiday = await HolidayService.updateHoliday(req.params.id, req.body, userId);

      res.json({
        success: true,
        data: holiday,
        message: 'Holiday updated successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  static async delete(req: IAuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user?._id.toString() || '';
      const holiday = await HolidayService.deleteHoliday(req.params.id, userId);

      res.json({
        success: true,
        data: holiday,
        message: 'Holiday deleted successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  static async getForPeriod(req: IAuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { startDate, endDate, department, location, activeOnly } = req.query;

      if (!startDate || !endDate) {
        res.status(400).json({
          success: false,
          message: 'startDate and endDate are required',
        });
        return;
      }

      const holidays = await HolidayService.getHolidaysForPeriod(
        new Date(startDate as string),
        new Date(endDate as string),
        {
          department: department as string,
          location: location as string,
          activeOnly: activeOnly !== 'false',
        }
      );

      res.json({
        success: true,
        data: holidays,
      });
    } catch (error) {
      next(error);
    }
  }

  static async getByYear(req: IAuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const year = parseInt(req.params.year);
      const activeOnly = req.query.activeOnly !== 'false';

      if (!year || isNaN(year)) {
        res.status(400).json({
          success: false,
          message: 'Valid year is required',
        });
        return;
      }

      const holidays = await HolidayService.getHolidaysByYear(year, activeOnly);

      res.json({
        success: true,
        data: holidays,
      });
    } catch (error) {
      next(error);
    }
  }

  static async getStatistics(req: IAuthRequest, res: Response, next: NextFunction) {
    try {
      const year = req.query.year ? parseInt(req.query.year as string) : undefined;
      const statistics = await HolidayService.getStatistics(year);

      res.json({
        success: true,
        data: statistics,
      });
    } catch (error) {
      next(error);
    }
  }

  static async bulkCreate(req: IAuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?._id.toString() || '';
      const { holidays } = req.body;

      if (!holidays || !Array.isArray(holidays)) {
        res.status(400).json({
          success: false,
          message: 'holidays array is required',
        });
        return;
      }

      const result = await HolidayService.bulkCreateHolidays(holidays, userId);

      res.status(201).json({
        success: true,
        data: result,
        message: `${result.success.length} holidays created successfully, ${result.errors.length} failed`,
      });
    } catch (error) {
      next(error);
    }
  }

  static async checkIsHoliday(req: IAuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { date, department, location } = req.query;

      if (!date) {
        res.status(400).json({
          success: false,
          message: 'date is required',
        });
        return;
      }

      const result = await HolidayService.isHoliday(
        new Date(date as string),
        {
          department: department as string,
          location: location as string,
        }
      );

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
}
