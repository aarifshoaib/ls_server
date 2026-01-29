import { Response, NextFunction } from 'express';
import { IAuthRequest } from '../types';
import { AttendanceService } from '../services/attendance.service';

export class AttendanceController {
  // Clock in
  static async clockIn(req: IAuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user?._id.toString() || '';
      const { location, notes } = req.body;
      const deviceInfo = req.headers['user-agent'];

      const attendance = await AttendanceService.clockIn(
        userId,
        { location, notes },
        deviceInfo
      );

      res.status(201).json({
        success: true,
        data: attendance,
        message: 'Clocked in successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  // Clock out
  static async clockOut(req: IAuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user?._id.toString() || '';
      const { location, notes } = req.body;
      const deviceInfo = req.headers['user-agent'];

      const attendance = await AttendanceService.clockOut(
        userId,
        { location, notes },
        deviceInfo
      );

      res.json({
        success: true,
        data: attendance,
        message: 'Clocked out successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  // Get all attendance records
  static async getAll(req: IAuthRequest, res: Response, next: NextFunction) {
    try {
      const result = await AttendanceService.getAttendance(req.query, req.query);

      res.json({
        success: true,
        ...result,
      });
    } catch (error) {
      next(error);
    }
  }

  // Get attendance by ID
  static async getById(req: IAuthRequest, res: Response, next: NextFunction) {
    try {
      const attendance = await AttendanceService.getAttendanceById(req.params.id);

      res.json({
        success: true,
        data: attendance,
      });
    } catch (error) {
      next(error);
    }
  }

  // Update attendance (admin)
  static async update(req: IAuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user?._id.toString() || '';
      const attendance = await AttendanceService.updateAttendance(
        req.params.id,
        req.body,
        userId
      );

      res.json({
        success: true,
        data: attendance,
        message: 'Attendance updated successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  // Delete attendance (admin)
  static async delete(req: IAuthRequest, res: Response, next: NextFunction) {
    try {
      const result = await AttendanceService.deleteAttendance(req.params.id);

      res.json({
        success: true,
        ...result,
      });
    } catch (error) {
      next(error);
    }
  }

  // Get attendance summary
  static async getSummary(req: IAuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.params.userId || req.user?._id.toString() || '';
      const month = parseInt(req.query.month as string) || new Date().getMonth() + 1;
      const year = parseInt(req.query.year as string) || new Date().getFullYear();

      const result = await AttendanceService.getAttendanceSummary(userId, month, year);

      res.json({
        success: true,
        ...result,
      });
    } catch (error) {
      next(error);
    }
  }

  // Get today's attendance
  static async getTodayStatus(req: IAuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user?._id.toString() || '';
      const attendance = await AttendanceService.getTodayAttendance(userId);

      res.json({
        success: true,
        data: attendance,
      });
    } catch (error) {
      next(error);
    }
  }

  // Get my attendance
  static async getMyAttendance(req: IAuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user?._id.toString() || '';
      const result = await AttendanceService.getAttendance(
        { ...req.query, userId },
        req.query
      );

      res.json({
        success: true,
        ...result,
      });
    } catch (error) {
      next(error);
    }
  }

  // Get attendance stats (dashboard)
  static async getStats(req: IAuthRequest, res: Response, next: NextFunction) {
    try {
      const { endDate } = req.query;

      // Parse dates
      const end = endDate ? new Date(endDate as string) : new Date();

      // Get current month summary
      const month = end.getMonth() + 1;
      const year = end.getFullYear();

      // For admin, get overall stats
      const result = await AttendanceService.getAttendanceSummary(
        req.user?._id.toString() || '',
        month,
        year
      );

      const totalDays = result.summary?.totalDays || 0;
      const totalWorkHours = result.summary?.totalWorkHours || 0;
      const presentCount = result.summary?.present || 0;

      res.json({
        success: true,
        data: {
          totalWorkingDays: totalDays,
          presentDays: presentCount,
          absentDays: result.summary?.absent || 0,
          lateDays: result.summary?.lateArrivals || 0,
          earlyLeaveDays: result.summary?.earlyLeaves || 0,
          totalWorkHours: totalWorkHours,
          averageWorkHours: presentCount > 0 ? Math.round((totalWorkHours / presentCount) * 100) / 100 : 0,
          overtimeHours: result.summary?.totalOvertimeHours || 0,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  // Get attendance summary for payroll
  static async getPayrollSummary(req: IAuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { employeeId } = req.params;
      const { startDate, endDate } = req.query;

      if (!startDate || !endDate) {
        res.status(400).json({
          success: false,
          message: 'Start date and end date are required',
        });
        return;
      }

      const result = await AttendanceService.getAttendanceSummaryForPayroll(
        employeeId,
        new Date(startDate as string),
        new Date(endDate as string)
      );

      res.json({
        success: true,
        ...result,
      });
    } catch (error) {
      next(error);
    }
  }

  // Bulk create attendance
  static async bulkCreate(req: IAuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { records } = req.body;

      if (!records || !Array.isArray(records) || records.length === 0) {
        res.status(400).json({
          success: false,
          message: 'Records array is required',
        });
        return;
      }

      const result = await AttendanceService.bulkCreateAttendance(records);

      res.status(201).json({
        success: true,
        data: result,
        message: `Successfully created ${result.success} attendance records`,
      });
    } catch (error) {
      next(error);
    }
  }

  // Lock attendance for payroll
  static async lockForPayroll(req: IAuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { payrollRunId, employeeIds, startDate, endDate } = req.body;

      if (!payrollRunId || !employeeIds || !startDate || !endDate) {
        res.status(400).json({
          success: false,
          message: 'Missing required fields',
        });
        return;
      }

      const result = await AttendanceService.lockAttendanceForPayroll(
        payrollRunId,
        employeeIds,
        new Date(startDate),
        new Date(endDate)
      );

      res.json({
        success: true,
        ...result,
      });
    } catch (error) {
      next(error);
    }
  }

  // Unlock attendance
  static async unlock(req: IAuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { attendanceIds } = req.body;

      if (!attendanceIds || !Array.isArray(attendanceIds)) {
        res.status(400).json({
          success: false,
          message: 'Attendance IDs array is required',
        });
        return;
      }

      const result = await AttendanceService.unlockAttendance(attendanceIds);

      res.json({
        success: true,
        ...result,
      });
    } catch (error) {
      next(error);
    }
  }

  // Update payroll overtime
  static async updatePayrollOvertime(req: IAuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const overtimeData = req.body;

      const attendance = await AttendanceService.updatePayrollOvertime(id, overtimeData);

      res.json({
        success: true,
        data: attendance,
        message: 'Payroll overtime updated successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  // ==================== PayCycle Period Methods ====================

  // Get attendance for PayCycle period
  static async getForPayCyclePeriod(req: IAuthRequest, res: Response, next: NextFunction) {
    try {
      const { payCycleId } = req.params;

      const result = await AttendanceService.getAttendanceForPayCyclePeriod(payCycleId);

      res.json({
        success: true,
        ...result,
      });
    } catch (error) {
      next(error);
    }
  }

  // Get attendance grid for PayCycle period (for UI)
  static async getAttendanceGrid(req: IAuthRequest, res: Response, next: NextFunction) {
    try {
      const { payCycleId } = req.params;

      const result = await AttendanceService.getAttendanceGrid(payCycleId);

      res.json({
        success: true,
        ...result,
      });
    } catch (error) {
      next(error);
    }
  }

  // Create attendance with period validation
  static async createWithPeriodValidation(req: IAuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user?._id.toString() || '';
      const data = req.body;

      const attendance = await AttendanceService.createAttendanceWithPeriodValidation(data, userId);

      res.status(201).json({
        success: true,
        data: attendance,
        message: 'Attendance created successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  // Bulk create attendance with period validation
  static async bulkCreateWithPeriodValidation(req: IAuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { payCycleId, records } = req.body;
      const userId = req.user?._id.toString() || '';

      if (!payCycleId) {
        res.status(400).json({
          success: false,
          message: 'PayCycle ID is required',
        });
        return;
      }

      if (!records || !Array.isArray(records) || records.length === 0) {
        res.status(400).json({
          success: false,
          message: 'Records array is required',
        });
        return;
      }

      const result = await AttendanceService.bulkCreateWithPeriodValidation(
        payCycleId,
        records,
        userId
      );

      res.status(201).json({
        success: true,
        data: result,
        message: `Successfully created ${result.success} attendance records`,
      });
    } catch (error) {
      next(error);
    }
  }

  // Bulk update attendance with period validation
  static async bulkUpdateWithPeriodValidation(req: IAuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { records } = req.body;
      const userId = req.user?._id.toString() || '';

      if (!records || !Array.isArray(records) || records.length === 0) {
        res.status(400).json({
          success: false,
          message: 'Records array is required',
        });
        return;
      }

      const result = await AttendanceService.bulkUpdateWithPeriodValidation(records, userId);

      res.json({
        success: true,
        data: result,
        message: `Successfully updated ${result.success} attendance records`,
      });
    } catch (error) {
      next(error);
    }
  }

  // Bulk delete attendance with period validation
  static async bulkDeleteWithPeriodValidation(req: IAuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { ids } = req.body;
      const userId = req.user?._id.toString() || '';

      if (!ids || !Array.isArray(ids) || ids.length === 0) {
        res.status(400).json({
          success: false,
          message: 'IDs array is required',
        });
        return;
      }

      const result = await AttendanceService.bulkDeleteWithPeriodValidation(ids, userId);

      res.json({
        success: true,
        data: result,
        message: `Successfully deleted ${result.success} attendance records`,
      });
    } catch (error) {
      next(error);
    }
  }

  // Mark all employees as present for a date
  static async markAllPresent(req: IAuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { payCycleId, date } = req.body;
      const userId = req.user?._id.toString() || '';

      if (!payCycleId || !date) {
        res.status(400).json({
          success: false,
          message: 'PayCycle ID and date are required',
        });
        return;
      }

      const result = await AttendanceService.markAllPresent(payCycleId, date, userId);

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
}
