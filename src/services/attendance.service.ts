import { Types } from 'mongoose';
import Attendance from '../models/Attendance';
import AttendanceSettings from '../models/AttendanceSettings';
import User from '../models/User';
import Employee from '../models/Employee';
import PayCycle from '../models/PayCycle';
import Holiday from '../models/Holiday';
import { errors } from '../utils/errors';
import { parsePagination, buildPaginatedResponse } from '../utils/helpers';
import { IPaginationQuery, IClockRecord } from '../types';
import { PayCycleService } from './payCycle.service';

// Helper function to normalize a date to YYYY-MM-DD string for comparison
// This avoids timezone issues when comparing dates
function toDateString(date: Date | string): string {
  const d = new Date(date);
  // Use UTC methods to get consistent date parts regardless of timezone
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Helper function to parse a date string (YYYY-MM-DD) or Date and return a UTC midnight Date
// This ensures dates are stored consistently at UTC midnight regardless of server timezone
function parseUTCDate(date: Date | string): Date {
  const dateStr = toDateString(date);
  // Parse YYYY-MM-DD as UTC midnight
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
}

// Helper function to check if a date is within a period (inclusive)
function isDateWithinPeriod(
  date: Date | string,
  periodStart: Date | string,
  periodEnd: Date | string
): boolean {
  const dateStr = toDateString(date);
  const startStr = toDateString(periodStart);
  const endStr = toDateString(periodEnd);
  return dateStr >= startStr && dateStr <= endStr;
}

export class AttendanceService {
  // Clock in
  static async clockIn(
    userId: string,
    clockInData: Partial<IClockRecord>,
    deviceInfo?: string
  ) {
    const user = await User.findById(userId);
    if (!user) {
      throw errors.notFound('User');
    }

    // Check if already clocked in today
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const existingAttendance = await Attendance.findOne({
      userId: new Types.ObjectId(userId),
      date: today,
    });

    if (existingAttendance) {
      throw errors.conflict('Already clocked in today');
    }

    // Get attendance settings
    const settings = await AttendanceSettings.findOne({});
    const dayOfWeek = today.getDay();
    const workingHours = settings?.workingHours.find((wh) => wh.dayOfWeek === dayOfWeek);

    // Check if it's a working day
    if (!workingHours?.isWorkingDay) {
      throw errors.validation('Today is not a working day');
    }

    // Calculate if late
    const clockInTime = new Date();
    const [startHour, startMinute] = workingHours.startTime.split(':').map(Number);
    const expectedStartTime = new Date(today);
    expectedStartTime.setHours(startHour, startMinute, 0, 0);

    const lateMinutes = Math.floor(
      (clockInTime.getTime() - expectedStartTime.getTime()) / 60000
    );
    const isLate = lateMinutes > (settings?.lateArrivalThresholdMinutes || 15);

    // Create attendance record
    const attendance = new Attendance({
      userId: new Types.ObjectId(userId),
      employeeId: user.employeeId,
      date: today,
      clockIn: {
        time: clockInTime,
        location: clockInData.location,
        deviceInfo,
        notes: clockInData.notes,
      },
      status: 'present',
      isLate,
      lateMinutes: Math.max(0, lateMinutes),
    });

    await attendance.save();

    return attendance;
  }

  // Clock out
  static async clockOut(
    userId: string,
    clockOutData: Partial<IClockRecord>,
    deviceInfo?: string
  ) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const attendance = await Attendance.findOne({
      userId: new Types.ObjectId(userId),
      date: today,
    });

    if (!attendance) {
      throw errors.notFound('Clock-in record for today');
    }

    if (attendance.clockOut) {
      throw errors.conflict('Already clocked out today');
    }

    // Get attendance settings
    const settings = await AttendanceSettings.findOne({});
    const dayOfWeek = today.getDay();
    const workingHours = settings?.workingHours.find((wh) => wh.dayOfWeek === dayOfWeek);

    const clockOutTime = new Date();
    attendance.clockOut = {
      time: clockOutTime,
      location: clockOutData.location,
      deviceInfo,
      notes: clockOutData.notes,
    };

    // Calculate work hours
    const totalMinutes = Math.floor(
      (clockOutTime.getTime() - attendance.clockIn.time.getTime()) / 60000
    );

    // Calculate break duration (default from settings or 60 minutes)
    const breakMinutes = attendance.breakDuration || workingHours?.breakDuration || 60;
    const netMinutes = totalMinutes - breakMinutes;
    const netHours = netMinutes / 60;

    // Calculate overtime
    const overtimeThreshold = settings?.overtimeThresholdHours || 8;
    const regularHours = Math.min(netHours, overtimeThreshold);
    const overtimeHours = Math.max(0, netHours - overtimeThreshold);

    attendance.workHours = {
      regular: Number(regularHours.toFixed(2)),
      overtime: Number(overtimeHours.toFixed(2)),
      total: Number(netHours.toFixed(2)),
    };

    // Check for early leave
    if (workingHours) {
      const [endHour, endMinute] = workingHours.endTime.split(':').map(Number);
      const expectedEndTime = new Date(today);
      expectedEndTime.setHours(endHour, endMinute, 0, 0);

      const earlyMinutes = Math.floor(
        (expectedEndTime.getTime() - clockOutTime.getTime()) / 60000
      );
      attendance.isEarlyLeave = earlyMinutes > (settings?.earlyLeaveThresholdMinutes || 30);
      attendance.earlyLeaveMinutes = Math.max(0, earlyMinutes);
    }

    // Determine status based on hours worked
    const halfDayThreshold = settings?.halfDayThresholdHours || 4;
    if (netHours < halfDayThreshold) {
      attendance.status = 'half_day';
    }

    await attendance.save();

    return attendance;
  }

  // Get attendance records with pagination
  static async getAttendance(query: any, pagination: IPaginationQuery) {
    const { page, limit, skip } = parsePagination(pagination);

    const filter: any = {};

    if (query.userId) {
      filter.userId = new Types.ObjectId(query.userId);
    }

    if (query.employeeId) {
      filter.employeeId = query.employeeId;
    }

    if (query.status) {
      filter.status = query.status;
    }

    if (query.dateFrom || query.dateTo) {
      filter.date = {};
      if (query.dateFrom) {
        filter.date.$gte = new Date(query.dateFrom);
      }
      if (query.dateTo) {
        filter.date.$lte = new Date(query.dateTo);
      }
    }

    if (query.isLate === 'true') {
      filter.isLate = true;
    }

    const [records, total] = await Promise.all([
      Attendance.find(filter)
        .populate('userId', 'employeeId firstName lastName fullName')
        .populate('approvedBy', 'firstName lastName fullName')
        .sort({ date: -1 })
        .skip(skip)
        .limit(limit),
      Attendance.countDocuments(filter),
    ]);

    return buildPaginatedResponse(records, total, page, limit);
  }

  // Get attendance by ID
  static async getAttendanceById(id: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw errors.validation('Invalid attendance ID');
    }

    const attendance = await Attendance.findById(id)
      .populate('userId', 'employeeId firstName lastName fullName')
      .populate('approvedBy', 'firstName lastName fullName');

    if (!attendance) {
      throw errors.notFound('Attendance record');
    }

    return attendance;
  }

  // Update attendance record (admin)
  static async updateAttendance(id: string, data: any, userId: string) {
    const attendance = await this.getAttendanceById(id);

    // Update allowed fields
    if (data.status) attendance.status = data.status;
    if (data.notes) attendance.notes = data.notes;
    if (data.breakDuration !== undefined) attendance.breakDuration = data.breakDuration;

    // Recalculate work hours if break duration changed
    if (data.breakDuration !== undefined && attendance.clockOut) {
      const totalMinutes = Math.floor(
        (attendance.clockOut.time.getTime() - attendance.clockIn.time.getTime()) / 60000
      );
      const netMinutes = totalMinutes - data.breakDuration;
      const netHours = netMinutes / 60;

      const settings = await AttendanceSettings.findOne({});
      const overtimeThreshold = settings?.overtimeThresholdHours || 8;
      const regularHours = Math.min(netHours, overtimeThreshold);
      const overtimeHours = Math.max(0, netHours - overtimeThreshold);

      attendance.workHours = {
        regular: Number(regularHours.toFixed(2)),
        overtime: Number(overtimeHours.toFixed(2)),
        total: Number(netHours.toFixed(2)),
      };
    }

    attendance.approvedBy = new Types.ObjectId(userId);
    attendance.approvedAt = new Date();

    await attendance.save();

    return attendance;
  }

  // Delete attendance record (admin)
  static async deleteAttendance(id: string) {
    const attendance = await this.getAttendanceById(id);
    await attendance.deleteOne();

    return { message: 'Attendance record deleted successfully' };
  }

  // Get attendance summary for a user
  static async getAttendanceSummary(userId: string, month: number, year: number) {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0);

    const records = await Attendance.find({
      userId: new Types.ObjectId(userId),
      date: { $gte: startDate, $lte: endDate },
    });

    const summary = {
      totalDays: records.length,
      present: records.filter((r) => r.status === 'present').length,
      halfDay: records.filter((r) => r.status === 'half_day').length,
      absent: records.filter((r) => r.status === 'absent').length,
      leave: records.filter((r) => r.status === 'leave').length,
      lateArrivals: records.filter((r) => r.isLate).length,
      earlyLeaves: records.filter((r) => r.isEarlyLeave).length,
      totalWorkHours: records.reduce((sum, r) => sum + (r.workHours?.total || 0), 0),
      totalOvertimeHours: records.reduce((sum, r) => sum + (r.workHours?.overtime || 0), 0),
    };

    return { summary, records };
  }

  // Get today's attendance status
  static async getTodayAttendance(userId: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const attendance = await Attendance.findOne({
      userId: new Types.ObjectId(userId),
      date: today,
    });

    return attendance;
  }

  // Get attendance for payroll calculation
  static async getAttendanceForPayroll(
    employeeId: string,
    startDate: Date,
    endDate: Date
  ) {
    const records = await Attendance.find({
      employeeId,
      date: { $gte: startDate, $lte: endDate },
      payrollStatus: { $in: ['pending', 'processed'] },
    }).sort({ date: 1 });

    return records;
  }

  // Get attendance summary for payroll
  static async getAttendanceSummaryForPayroll(
    employeeId: string,
    startDate: Date,
    endDate: Date
  ) {
    const records = await Attendance.find({
      employeeId,
      date: { $gte: startDate, $lte: endDate },
    }).sort({ date: 1 });

    // Calculate working days between dates
    const totalDays = Math.floor(
      (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)
    ) + 1;

    const presentDays = records.filter((r) => r.status === 'present').length;
    const absentDays = records.filter((r) => r.status === 'absent').length;
    const halfDays = records.filter((r) => r.status === 'half_day').length;
    const leaveDays = records.filter((r) => r.status === 'leave').length;
    const holidayDays = records.filter((r) => r.status === 'holiday').length;

    const totalRegularHours = records.reduce(
      (sum, r) => sum + (r.workHours?.regular || 0),
      0
    );
    const totalOvertimeHours = records.reduce(
      (sum, r) => sum + (r.workHours?.overtime || 0),
      0
    );

    // Get OT breakdown from payrollOvertime
    const ot1Hours = records.reduce(
      (sum, r) => sum + (r.payrollOvertime?.ot1Hours || 0),
      0
    );
    const ot2Hours = records.reduce(
      (sum, r) => sum + (r.payrollOvertime?.ot2Hours || 0),
      0
    );

    const totalOvertimeAmount = records.reduce(
      (sum, r) => sum + (r.payrollOvertime?.totalOvertimeAmount || 0),
      0
    );

    return {
      summary: {
        totalDays,
        presentDays,
        absentDays,
        halfDays,
        leaveDays,
        holidayDays,
        totalRegularHours: Number(totalRegularHours.toFixed(2)),
        totalOvertimeHours: Number(totalOvertimeHours.toFixed(2)),
        ot1Hours: Number(ot1Hours.toFixed(2)),
        ot2Hours: Number(ot2Hours.toFixed(2)),
        totalOvertimeAmount: Number(totalOvertimeAmount.toFixed(2)),
      },
      records,
    };
  }

  // Bulk create attendance records
  static async bulkCreateAttendance(records: any[]) {
    const attendanceRecords = [];
    const errors = [];

    for (const record of records) {
      try {
        // Validate required fields
        if (!record.employeeId || !record.date) {
          errors.push({
            employeeId: record.employeeId,
            error: 'Missing required fields',
          });
          continue;
        }

        // Get user by employeeId
        const user = await User.findOne({ employeeId: record.employeeId });
        if (!user) {
          errors.push({
            employeeId: record.employeeId,
            error: 'Employee not found',
          });
          continue;
        }

        // Check if attendance already exists
        // Use parseUTCDate to ensure consistent UTC midnight storage
        const recordDate = parseUTCDate(record.date);

        const existingAttendance = await Attendance.findOne({
          userId: user._id,
          date: recordDate,
        });

        if (existingAttendance) {
          errors.push({
            employeeId: record.employeeId,
            date: record.date,
            error: 'Attendance already exists',
          });
          continue;
        }

        // Create clock in time
        const clockInTime = record.clockInTime
          ? new Date(record.clockInTime)
          : new Date(recordDate);

        // Create attendance
        const attendance = new Attendance({
          userId: user._id,
          employeeId: record.employeeId,
          date: recordDate,
          clockIn: {
            time: clockInTime,
            notes: record.notes,
          },
          status: record.status || 'present',
          isLate: record.isLate || false,
          lateMinutes: record.lateMinutes || 0,
          breakDuration: record.breakDuration || 0,
          notes: record.notes,
        });

        // If clock out time provided, add it and calculate hours
        if (record.clockOutTime) {
          const clockOutTime = new Date(record.clockOutTime);
          attendance.clockOut = {
            time: clockOutTime,
          };

          // Calculate work hours
          const totalMinutes = Math.floor(
            (clockOutTime.getTime() - clockInTime.getTime()) / 60000
          );
          const breakMinutes = record.breakDuration || 60;
          const netMinutes = totalMinutes - breakMinutes;
          const netHours = netMinutes / 60;

          const settings = await AttendanceSettings.findOne({});
          const overtimeThreshold = settings?.overtimeThresholdHours || 8;
          const regularHours = Math.min(netHours, overtimeThreshold);
          const overtimeHours = Math.max(0, netHours - overtimeThreshold);

          attendance.workHours = {
            regular: Number(regularHours.toFixed(2)),
            overtime: Number(overtimeHours.toFixed(2)),
            total: Number(netHours.toFixed(2)),
          };
        }

        // Add payroll overtime if provided
        if (record.payrollOvertime) {
          attendance.payrollOvertime = {
            ot1Hours: record.payrollOvertime.ot1Hours || 0,
            ot1Rate: record.payrollOvertime.ot1Rate || 0,
            ot2Hours: record.payrollOvertime.ot2Hours || 0,
            ot2Rate: record.payrollOvertime.ot2Rate || 0,
            totalOvertimeAmount: record.payrollOvertime.totalOvertimeAmount || 0,
          };
        }

        await attendance.save();
        attendanceRecords.push(attendance);
      } catch (error: any) {
        errors.push({
          employeeId: record.employeeId,
          date: record.date,
          error: error.message,
        });
      }
    }

    return {
      success: attendanceRecords.length,
      failed: errors.length,
      records: attendanceRecords,
      errors,
    };
  }

  // Lock attendance for payroll
  static async lockAttendanceForPayroll(
    payrollRunId: string,
    employeeIds: string[],
    startDate: Date,
    endDate: Date
  ) {
    const result = await Attendance.updateMany(
      {
        employeeId: { $in: employeeIds },
        date: { $gte: startDate, $lte: endDate },
        payrollStatus: { $ne: 'locked' },
      },
      {
        $set: {
          payrollStatus: 'locked',
          payrollRunId: new Types.ObjectId(payrollRunId),
          payrollProcessedAt: new Date(),
        },
      }
    );

    return {
      message: 'Attendance locked for payroll',
      modifiedCount: result.modifiedCount,
    };
  }

  // Unlock attendance (for corrections)
  static async unlockAttendance(attendanceIds: string[]) {
    const result = await Attendance.updateMany(
      {
        _id: { $in: attendanceIds.map((id) => new Types.ObjectId(id)) },
        payrollStatus: 'locked',
      },
      {
        $set: {
          payrollStatus: 'pending',
          payrollRunId: undefined,
          payrollProcessedAt: undefined,
        },
      }
    );

    return {
      message: 'Attendance unlocked',
      modifiedCount: result.modifiedCount,
    };
  }

  // Update payroll overtime for attendance
  static async updatePayrollOvertime(
    attendanceId: string,
    overtimeData: {
      ot1Hours?: number;
      ot1Rate?: number;
      ot2Hours?: number;
      ot2Rate?: number;
    }
  ) {
    const attendance = await this.getAttendanceById(attendanceId);

    if (attendance.payrollStatus === 'locked') {
      throw errors.validation('Cannot update locked attendance');
    }

    const ot1Hours = overtimeData.ot1Hours || 0;
    const ot1Rate = overtimeData.ot1Rate || 0;
    const ot2Hours = overtimeData.ot2Hours || 0;
    const ot2Rate = overtimeData.ot2Rate || 0;

    const totalOvertimeAmount = ot1Hours * ot1Rate + ot2Hours * ot2Rate;

    attendance.payrollOvertime = {
      ot1Hours,
      ot1Rate,
      ot2Hours,
      ot2Rate,
      totalOvertimeAmount: Number(totalOvertimeAmount.toFixed(2)),
    };

    await attendance.save();

    return attendance;
  }

  // ==================== PayCycle Period Methods ====================

  // Get attendance for a PayCycle period
  static async getAttendanceForPayCyclePeriod(payCycleId: string) {
    const payCycle = await PayCycle.findById(payCycleId);

    if (!payCycle) {
      throw errors.notFound('PayCycle');
    }

    if (!payCycle.periodStartDate || !payCycle.periodEndDate) {
      throw errors.validation('PayCycle period dates are not configured');
    }

    // Get all employees assigned to this PayCycle
    const employees = await Employee.find({
      'salaryInfo.payCycleId': new Types.ObjectId(payCycleId),
      status: 'active',
    }).select('_id employeeCode fullName firstName lastName');

    const employeeIds = employees.map((e) => e.employeeCode);

    // Get attendance records within period
    const records = await Attendance.find({
      employeeId: { $in: employeeIds },
      date: {
        $gte: payCycle.periodStartDate,
        $lte: payCycle.periodEndDate,
      },
    })
      .populate('userId', 'employeeId firstName lastName fullName')
      .sort({ employeeId: 1, date: 1 });

    // Calculate period info
    const periodDays =
      Math.ceil(
        (payCycle.periodEndDate.getTime() - payCycle.periodStartDate.getTime()) /
          (1000 * 60 * 60 * 24)
      ) + 1;

    return {
      payCycle: {
        id: payCycle._id,
        name: payCycle.name,
        code: payCycle.code,
        payMonth: payCycle.payMonth,
        periodStartDate: payCycle.periodStartDate,
        periodEndDate: payCycle.periodEndDate,
        periodStatus: payCycle.periodStatus,
        weekendDays: payCycle.weekendDays || [5, 6],
      },
      periodDays,
      employees: employees.map((e) => ({
        id: e._id,
        employeeCode: e.employeeCode,
        fullName: e.fullName || `${e.firstName} ${e.lastName}`,
      })),
      records,
      summary: {
        totalEmployees: employees.length,
        totalRecords: records.length,
      },
    };
  }

  // Create attendance with PayCycle period validation
  static async createAttendanceWithPeriodValidation(
    data: any,
    userId: string
  ) {
    // Validate the date against employee's PayCycle
    const validation = await PayCycleService.validateEmployeeAttendanceDate(
      data.employeeId,
      new Date(data.date)
    );

    if (!validation.valid) {
      throw errors.validation(validation.message || 'Date validation failed');
    }

    // Get user/employee details
    const employee = await Employee.findById(data.employeeId);
    if (!employee) {
      throw errors.notFound('Employee');
    }

    // Check if attendance already exists for this date
    // Use parseUTCDate to ensure consistent UTC midnight storage
    const recordDate = parseUTCDate(data.date);

    const existingAttendance = await Attendance.findOne({
      employeeId: employee.employeeCode,
      date: recordDate,
    });

    if (existingAttendance) {
      throw errors.conflict('Attendance already exists for this date');
    }

    // Create attendance record
    const attendance = new Attendance({
      userId: employee.userId || employee._id,
      employeeId: employee.employeeCode,
      date: recordDate,
      status: data.status || 'present',
      clockIn: data.clockIn
        ? {
            time: new Date(data.clockIn.time),
            location: data.clockIn.location,
            notes: data.clockIn.notes,
          }
        : undefined,
      clockOut: data.clockOut
        ? {
            time: new Date(data.clockOut.time),
            location: data.clockOut.location,
            notes: data.clockOut.notes,
          }
        : undefined,
      workHours: data.workHours,
      isLate: data.isLate || false,
      lateMinutes: data.lateMinutes || 0,
      isEarlyLeave: data.isEarlyLeave || false,
      earlyLeaveMinutes: data.earlyLeaveMinutes || 0,
      breakDuration: data.breakDuration || 0,
      notes: data.notes,
      payrollOvertime: data.payrollOvertime,
      approvedBy: new Types.ObjectId(userId),
      approvedAt: new Date(),
    });

    await attendance.save();

    return attendance;
  }

  // Bulk create attendance with PayCycle period validation
  static async bulkCreateWithPeriodValidation(
    payCycleId: string,
    records: any[],
    userId: string
  ) {
    const payCycle = await PayCycle.findById(payCycleId);

    if (!payCycle) {
      throw errors.notFound('PayCycle');
    }

    if (payCycle.periodStatus === 'closed') {
      throw errors.validation(
        `PayCycle period is ${payCycle.periodStatus}. Attendance entry is not allowed when period is closed.`
      );
    }

    if (!payCycle.periodStartDate || !payCycle.periodEndDate) {
      throw errors.validation('PayCycle period dates are not configured');
    }

    const results = {
      success: 0,
      failed: 0,
      created: [] as any[],
      errors: [] as any[],
    };

    for (const record of records) {
      try {
        // Validate date within period using string comparison (avoids timezone issues)
        const startDateStr = toDateString(payCycle.periodStartDate);
        const endDateStr = toDateString(payCycle.periodEndDate);

        if (!isDateWithinPeriod(record.date, payCycle.periodStartDate, payCycle.periodEndDate)) {
          results.failed++;
          results.errors.push({
            employeeId: record.employeeId,
            date: record.date,
            error: `Date must be within PayCycle period: ${startDateStr} to ${endDateStr}`,
          });
          continue;
        }

        // Create recordDate for DB storage (normalized to midnight UTC)
        const recordDate = parseUTCDate(record.date);

        // Get employee
        const employee = await Employee.findOne({
          $or: [
            { _id: Types.ObjectId.isValid(record.employeeId) ? record.employeeId : null },
            { employeeCode: record.employeeId },
          ],
          'salaryInfo.payCycleId': new Types.ObjectId(payCycleId),
        });

        if (!employee) {
          results.failed++;
          results.errors.push({
            employeeId: record.employeeId,
            date: record.date,
            error: 'Employee not found or not assigned to this PayCycle',
          });
          continue;
        }

        // Check for existing attendance
        const existingAttendance = await Attendance.findOne({
          employeeId: employee.employeeCode,
          date: recordDate,
        });

        if (existingAttendance) {
          results.failed++;
          results.errors.push({
            employeeId: record.employeeId,
            date: record.date,
            error: 'Attendance already exists for this date',
          });
          continue;
        }

        // Create attendance
        const attendance = new Attendance({
          userId: employee.userId || employee._id,
          employeeId: employee.employeeCode,
          date: recordDate,
          status: record.status || 'present',
          clockIn: record.clockIn
            ? {
                time: new Date(record.clockIn.time),
                location: record.clockIn.location,
                notes: record.clockIn.notes,
              }
            : undefined,
          clockOut: record.clockOut
            ? {
                time: new Date(record.clockOut.time),
                location: record.clockOut.location,
                notes: record.clockOut.notes,
              }
            : undefined,
          workHours: record.workHours,
          isLate: record.isLate || false,
          lateMinutes: record.lateMinutes || 0,
          isEarlyLeave: record.isEarlyLeave || false,
          earlyLeaveMinutes: record.earlyLeaveMinutes || 0,
          breakDuration: record.breakDuration || 0,
          notes: record.notes,
          payrollOvertime: record.payrollOvertime,
          approvedBy: new Types.ObjectId(userId),
          approvedAt: new Date(),
        });

        await attendance.save();
        results.success++;
        results.created.push(attendance);
      } catch (error: any) {
        results.failed++;
        results.errors.push({
          employeeId: record.employeeId,
          date: record.date,
          error: error.message,
        });
      }
    }

    return results;
  }

  // Bulk update attendance with period validation
  static async bulkUpdateWithPeriodValidation(
    records: Array<{ id: string; data: any }>,
    userId: string
  ) {
    const results = {
      success: 0,
      failed: 0,
      updated: [] as any[],
      errors: [] as any[],
    };

    for (const record of records) {
      try {
        const attendance = await Attendance.findById(record.id);

        if (!attendance) {
          results.failed++;
          results.errors.push({
            id: record.id,
            error: 'Attendance record not found',
          });
          continue;
        }

        if (attendance.payrollStatus === 'locked') {
          results.failed++;
          results.errors.push({
            id: record.id,
            error: 'Cannot update locked attendance',
          });
          continue;
        }

        // Get employee to validate PayCycle period
        const employee = await Employee.findOne({
          employeeCode: attendance.employeeId,
        });

        if (employee?.salaryInfo?.payCycleId) {
          const payCycle = await PayCycle.findById(employee.salaryInfo.payCycleId);

          if (payCycle && payCycle.periodStatus === 'closed') {
            results.failed++;
            results.errors.push({
              id: record.id,
              error: `PayCycle period is ${payCycle.periodStatus}. Updates are not allowed when period is closed.`,
            });
            continue;
          }
        }

        // Update allowed fields
        if (record.data.status !== undefined) attendance.status = record.data.status;
        if (record.data.notes !== undefined) attendance.notes = record.data.notes;
        if (record.data.breakDuration !== undefined) attendance.breakDuration = record.data.breakDuration;
        if (record.data.isLate !== undefined) attendance.isLate = record.data.isLate;
        if (record.data.lateMinutes !== undefined) attendance.lateMinutes = record.data.lateMinutes;
        if (record.data.isEarlyLeave !== undefined) attendance.isEarlyLeave = record.data.isEarlyLeave;
        if (record.data.earlyLeaveMinutes !== undefined) attendance.earlyLeaveMinutes = record.data.earlyLeaveMinutes;
        if (record.data.workHours !== undefined) attendance.workHours = record.data.workHours;
        if (record.data.payrollOvertime !== undefined) attendance.payrollOvertime = record.data.payrollOvertime;

        attendance.approvedBy = new Types.ObjectId(userId);
        attendance.approvedAt = new Date();

        await attendance.save();
        results.success++;
        results.updated.push(attendance);
      } catch (error: any) {
        results.failed++;
        results.errors.push({
          id: record.id,
          error: error.message,
        });
      }
    }

    return results;
  }

  // Bulk delete attendance with period validation
  static async bulkDeleteWithPeriodValidation(ids: string[], _userId: string) {
    const results = {
      success: 0,
      failed: 0,
      deleted: [] as string[],
      errors: [] as any[],
    };

    for (const id of ids) {
      try {
        if (!Types.ObjectId.isValid(id)) {
          results.failed++;
          results.errors.push({
            id,
            error: 'Invalid attendance ID',
          });
          continue;
        }

        const attendance = await Attendance.findById(id);

        if (!attendance) {
          results.failed++;
          results.errors.push({
            id,
            error: 'Attendance record not found',
          });
          continue;
        }

        if (attendance.payrollStatus === 'locked') {
          results.failed++;
          results.errors.push({
            id,
            error: 'Cannot delete locked attendance',
          });
          continue;
        }

        // Get employee to validate PayCycle period
        const employee = await Employee.findOne({
          employeeCode: attendance.employeeId,
        });

        if (employee?.salaryInfo?.payCycleId) {
          const payCycle = await PayCycle.findById(employee.salaryInfo.payCycleId);

          if (payCycle && payCycle.periodStatus === 'closed') {
            results.failed++;
            results.errors.push({
              id,
              error: `PayCycle period is ${payCycle.periodStatus}. Deletion is not allowed when period is closed.`,
            });
            continue;
          }
        }

        await attendance.deleteOne();
        results.success++;
        results.deleted.push(id);
      } catch (error: any) {
        results.failed++;
        results.errors.push({
          id,
          error: error.message,
        });
      }
    }

    return results;
  }

  // Get attendance grid for PayCycle period (for UI)
  static async getAttendanceGrid(payCycleId: string) {
    const payCycle = await PayCycle.findById(payCycleId);

    if (!payCycle) {
      throw errors.notFound('PayCycle');
    }

    if (!payCycle.periodStartDate || !payCycle.periodEndDate) {
      throw errors.validation('PayCycle period dates are not configured');
    }

    // Get all employees assigned to this PayCycle
    const employees = await Employee.find({
      'salaryInfo.payCycleId': new Types.ObjectId(payCycleId),
      status: 'active',
    })
      .select('_id employeeCode fullName firstName lastName employment')
      .sort({ employeeCode: 1 });

    // Generate all dates in period using UTC to avoid timezone issues
    const dates: Date[] = [];
    const currentDate = new Date(payCycle.periodStartDate);
    const endDate = new Date(payCycle.periodEndDate);

    while (currentDate <= endDate) {
      dates.push(new Date(currentDate));
      currentDate.setUTCDate(currentDate.getUTCDate() + 1);
    }

    // Fetch holidays for the period
    const holidays = await Holiday.find({
      date: {
        $gte: payCycle.periodStartDate,
        $lte: payCycle.periodEndDate,
      },
      isActive: true,
    }).select('date name type');

    // Create a map of date strings to holiday info
    const holidayMap = new Map<string, { name: string; type: string }>();
    for (const holiday of holidays) {
      const dateKey = holiday.date.toISOString().split('T')[0];
      holidayMap.set(dateKey, { name: holiday.name, type: holiday.type });
    }

    // Get all attendance records for the period
    const employeeCodes = employees.map((e) => e.employeeCode);
    const attendanceRecords = await Attendance.find({
      employeeId: { $in: employeeCodes },
      date: {
        $gte: payCycle.periodStartDate,
        $lte: payCycle.periodEndDate,
      },
    });

    // Create a map for quick lookup
    const attendanceMap = new Map<string, any>();
    for (const record of attendanceRecords) {
      const key = `${record.employeeId}_${record.date.toISOString().split('T')[0]}`;
      attendanceMap.set(key, record);
    }

    // Build grid data
    const grid = employees.map((employee) => {
      const employeeCode = employee.employeeCode;
      const attendanceByDate: Record<string, any> = {};
      let totalPresent = 0;
      let totalAbsent = 0;
      let totalHalfDay = 0;
      let totalLeave = 0;
      let totalOt1Hours = 0;
      let totalOt2Hours = 0;

      for (const date of dates) {
        const dateKey = date.toISOString().split('T')[0];
        const key = `${employeeCode}_${dateKey}`;
        const record = attendanceMap.get(key);

        if (record) {
          attendanceByDate[dateKey] = {
            id: record._id,
            status: record.status,
            workHours: record.workHours,
            ot1Hours: record.payrollOvertime?.ot1Hours || 0,
            ot2Hours: record.payrollOvertime?.ot2Hours || 0,
            isLate: record.isLate,
            notes: record.notes,
          };

          // Tally up
          switch (record.status) {
            case 'present':
              totalPresent++;
              break;
            case 'absent':
              totalAbsent++;
              break;
            case 'half_day':
              totalHalfDay++;
              break;
            case 'leave':
              totalLeave++;
              break;
          }

          totalOt1Hours += record.payrollOvertime?.ot1Hours || 0;
          totalOt2Hours += record.payrollOvertime?.ot2Hours || 0;
        } else {
          attendanceByDate[dateKey] = null;
        }
      }

      return {
        employee: {
          id: employee._id,
          employeeCode: employee.employeeCode,
          fullName: employee.fullName || `${employee.firstName} ${employee.lastName}`,
          department: employee.employment?.department,
          designation: employee.employment?.designation,
        },
        attendance: attendanceByDate,
        summary: {
          totalPresent,
          totalAbsent,
          totalHalfDay,
          totalLeave,
          totalOt1Hours: Number(totalOt1Hours.toFixed(2)),
          totalOt2Hours: Number(totalOt2Hours.toFixed(2)),
        },
      };
    });

    return {
      payCycle: {
        id: payCycle._id,
        name: payCycle.name,
        code: payCycle.code,
        payMonth: payCycle.payMonth,
        periodStartDate: payCycle.periodStartDate,
        periodEndDate: payCycle.periodEndDate,
        periodStatus: payCycle.periodStatus,
        weekendDays: payCycle.weekendDays || [5, 6],
        // OT enabled settings for frontend to show/hide OT columns
        ot1Enabled: payCycle.overtimeRates?.ot1?.enabled ?? true,
        ot2Enabled: payCycle.overtimeRates?.ot2?.enabled ?? true,
      },
      dates: dates.map((d) => {
        const dateString = d.toISOString().split('T')[0];
        const holiday = holidayMap.get(dateString);
        // Use getUTCDay() to avoid timezone issues - dates are stored in UTC
        const dayOfWeek = d.getUTCDay();
        return {
          date: d,
          dateString,
          dayOfWeek,
          isWeekend: (payCycle.weekendDays || [5, 6]).includes(dayOfWeek),
          isHoliday: !!holiday,
          holidayName: holiday?.name,
        };
      }),
      grid,
    };
  }

  // Mark all employees as present for a date (bulk entry helper)
  static async markAllPresent(
    payCycleId: string,
    date: string,
    userId: string
  ) {
    const payCycle = await PayCycle.findById(payCycleId);

    if (!payCycle) {
      throw errors.notFound('PayCycle');
    }

    if (payCycle.periodStatus === 'closed') {
      throw errors.validation(
        `PayCycle period is ${payCycle.periodStatus}. Attendance entry is not allowed when period is closed.`
      );
    }

    // Validate date within period using string comparison (avoids timezone issues)
    const startDateStr = toDateString(payCycle.periodStartDate!);
    const endDateStr = toDateString(payCycle.periodEndDate!);

    if (!isDateWithinPeriod(date, payCycle.periodStartDate!, payCycle.periodEndDate!)) {
      throw errors.validation(
        `Date must be within PayCycle period: ${startDateStr} to ${endDateStr}`
      );
    }

    // Create recordDate for DB storage (normalized to midnight UTC)
    // Use parseUTCDate to ensure consistent UTC midnight storage
    const recordDate = parseUTCDate(date);

    // Get all employees for this PayCycle
    const employees = await Employee.find({
      'salaryInfo.payCycleId': new Types.ObjectId(payCycleId),
      status: 'active',
    });

    const results = {
      success: 0,
      skipped: 0,
      errors: [] as any[],
    };

    for (const employee of employees) {
      try {
        // Check if attendance already exists
        const existingAttendance = await Attendance.findOne({
          employeeId: employee.employeeCode,
          date: recordDate,
        });

        if (existingAttendance) {
          results.skipped++;
          continue;
        }

        // Create attendance
        const attendance = new Attendance({
          userId: employee.userId || employee._id,
          employeeId: employee.employeeCode,
          date: recordDate,
          status: 'present',
          approvedBy: new Types.ObjectId(userId),
          approvedAt: new Date(),
        });

        await attendance.save();
        results.success++;
      } catch (error: any) {
        results.errors.push({
          employeeId: employee.employeeCode,
          error: error.message,
        });
      }
    }

    return {
      message: `Marked ${results.success} employees as present`,
      ...results,
    };
  }
}
