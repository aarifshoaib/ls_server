import { Types } from 'mongoose';
import PayCycle from '../models/PayCycle';
import Employee from '../models/Employee';
import { errors } from '../utils/errors';
import { parsePagination, buildPaginatedResponse } from '../utils/helpers';
import { IPaginationQuery } from '../types';

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

// Helper function to create a UTC midnight date from year, month, day
// This ensures dates are stored consistently at UTC midnight regardless of server timezone
function createUTCDate(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month, day, 0, 0, 0, 0));
}

// Helper function to get the last day of a month in UTC
function getLastDayOfMonthUTC(year: number, month: number): Date {
  // Setting day to 0 gives us the last day of the previous month
  // So we use month + 1 to get the last day of the target month
  return new Date(Date.UTC(year, month + 1, 0, 0, 0, 0, 0));
}

// Helper function to parse a date string (YYYY-MM-DD) or Date and return a UTC midnight Date
// This ensures dates are stored consistently at UTC midnight regardless of server timezone
// Exported for use in other services that need consistent UTC date handling
export function parseUTCDate(date: Date | string): Date {
  const dateStr = toDateString(date);
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

export class PayCycleService {
  // Get all pay cycles with pagination and filters
  static async getPayCycles(query: any, pagination: IPaginationQuery) {
    const { page, limit, skip } = parsePagination(pagination);

    const filter: any = {};

    // Cycle type filter
    if (query.cycleType) {
      filter.cycleType = query.cycleType;
    }

    // Active filter
    if (query.isActive !== undefined) {
      filter.isActive = query.isActive === 'true' || query.isActive === true;
    }

    // Default filter
    if (query.isDefault === 'true') {
      filter.isDefault = true;
    }

    // Search filter
    if (query.search) {
      filter.$or = [
        { name: { $regex: query.search, $options: 'i' } },
        { code: { $regex: query.search, $options: 'i' } },
      ];
    }

    const [payCycles, total] = await Promise.all([
      PayCycle.find(filter)
        .sort({ isDefault: -1, name: 1 })
        .skip(skip)
        .limit(limit),
      PayCycle.countDocuments(filter),
    ]);

    return buildPaginatedResponse(payCycles, total, page, limit);
  }

  // Get all active pay cycles (no pagination, for dropdowns)
  static async getActivePayCycles() {
    const payCycles = await PayCycle.find({ isActive: true })
      .sort({ isDefault: -1, name: 1 });

    return payCycles;
  }

  // Get pay cycle by ID
  static async getPayCycleById(id: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw errors.validation('Invalid pay cycle ID');
    }

    const payCycle = await PayCycle.findById(id);

    if (!payCycle) {
      throw errors.notFound('PayCycle');
    }

    return payCycle;
  }

  // Get pay cycle by code
  static async getByCode(code: string) {
    const payCycle = await PayCycle.findOne({
      code: code.toUpperCase(),
    });

    if (!payCycle) {
      throw errors.notFound('PayCycle');
    }

    return payCycle;
  }

  // Get default pay cycle
  static async getDefaultPayCycle() {
    const payCycle = await PayCycle.findOne({ isDefault: true, isActive: true });

    if (!payCycle) {
      // Return first active pay cycle if no default
      const firstActive = await PayCycle.findOne({ isActive: true });
      return firstActive;
    }

    return payCycle;
  }

  // Create pay cycle
  static async createPayCycle(data: any, userId: string) {
    data.code = data.code.toUpperCase();

    // Check if code already exists
    const existing = await PayCycle.findOne({ code: data.code });
    if (existing) {
      throw errors.duplicateEntry('Code', data.code);
    }

    // If this is set as default, unset other defaults
    if (data.isDefault) {
      await PayCycle.updateMany({}, { isDefault: false });
    }

    // Validate configuration based on cycle type
    this.validatePayCycleConfig(data);

    data.createdBy = userId;
    data.updatedBy = userId;

    const payCycle = new PayCycle(data);
    await payCycle.save();

    return payCycle;
  }

  // Update pay cycle
  static async updatePayCycle(id: string, data: any, userId: string) {
    const payCycle = await this.getPayCycleById(id);

    // Check for duplicate code if code is being changed
    if (data.code && data.code.toUpperCase() !== payCycle.code) {
      const existing = await PayCycle.findOne({
        code: data.code.toUpperCase(),
        _id: { $ne: payCycle._id },
      });

      if (existing) {
        throw errors.duplicateEntry('Code', data.code);
      }

      data.code = data.code.toUpperCase();
    }

    // If this is set as default, unset other defaults
    if (data.isDefault && !payCycle.isDefault) {
      await PayCycle.updateMany(
        { _id: { $ne: payCycle._id } },
        { isDefault: false }
      );
    }

    // Validate configuration if provided
    if (data.cycleType || data.monthlyConfig) {
      this.validatePayCycleConfig({ ...payCycle.toObject(), ...data });
    }

    data.updatedBy = userId;

    Object.assign(payCycle, data);
    await payCycle.save();

    return payCycle;
  }

  // Delete pay cycle
  static async deletePayCycle(id: string) {
    const payCycle = await this.getPayCycleById(id);

    // Cannot delete default pay cycle
    if (payCycle.isDefault) {
      throw errors.validation('Cannot delete default pay cycle. Set another as default first.');
    }

    // Check if pay cycle is in use by employees
    // This would need Employee model to be imported
    // For now, just soft delete
    payCycle.isActive = false;
    await payCycle.save();

    return { message: 'Pay cycle deactivated successfully' };
  }

  // Set as default pay cycle
  static async setDefault(id: string, userId: string) {
    const payCycle = await this.getPayCycleById(id);

    if (!payCycle.isActive) {
      throw errors.validation('Cannot set inactive pay cycle as default');
    }

    // Unset all other defaults
    await PayCycle.updateMany({}, { isDefault: false });

    payCycle.isDefault = true;
    payCycle.updatedBy = new Types.ObjectId(userId);
    await payCycle.save();

    return payCycle;
  }

  // Validate pay cycle configuration
  private static validatePayCycleConfig(data: any) {
    const { cycleType, monthlyConfig, biWeeklyConfig, weeklyConfig } = data;

    switch (cycleType) {
      case 'monthly':
        if (!monthlyConfig) {
          throw errors.validation('Monthly configuration is required for monthly pay cycle');
        }
        if (monthlyConfig.payDay < 1 || monthlyConfig.payDay > 31) {
          throw errors.validation('Pay day must be between 1 and 31');
        }
        if (monthlyConfig.cutoffDay < 1 || monthlyConfig.cutoffDay > 31) {
          throw errors.validation('Cutoff day must be between 1 and 31');
        }
        break;

      case 'bi_weekly':
        if (!biWeeklyConfig) {
          throw errors.validation('Bi-weekly configuration is required for bi-weekly pay cycle');
        }
        break;

      case 'weekly':
        if (!weeklyConfig) {
          throw errors.validation('Weekly configuration is required for weekly pay cycle');
        }
        break;
    }
  }

  // Calculate period dates for a given date (using UTC for consistency)
  static calculatePeriodDates(payCycle: any, referenceDate: Date = new Date()) {
    const { cycleType, monthlyConfig } = payCycle;

    if (cycleType === 'monthly') {
      const year = referenceDate.getUTCFullYear();
      const month = referenceDate.getUTCMonth();

      const periodStartDay = monthlyConfig.periodStartDay || 1;
      let periodStart = createUTCDate(year, month, periodStartDay);
      let periodEnd = createUTCDate(year, month + 1, periodStartDay - 1);

      // Adjust for cutoff
      if (referenceDate.getUTCDate() < periodStartDay) {
        // Previous period
        periodStart = createUTCDate(year, month - 1, periodStartDay);
        periodEnd = createUTCDate(year, month, periodStartDay - 1);
      }

      // Payment date
      const payDay = monthlyConfig.payDay || 28;
      const paymentDate = createUTCDate(year, month + 1, payDay);

      return {
        periodStart,
        periodEnd,
        paymentDate,
        totalDays: Math.ceil((periodEnd.getTime() - periodStart.getTime()) / (1000 * 60 * 60 * 24)) + 1,
      };
    }

    // Default to current month (using UTC)
    const year = referenceDate.getUTCFullYear();
    const month = referenceDate.getUTCMonth();
    return {
      periodStart: createUTCDate(year, month, 1),
      periodEnd: getLastDayOfMonthUTC(year, month),
      paymentDate: createUTCDate(year, month + 1, 1),
      totalDays: getLastDayOfMonthUTC(year, month).getUTCDate(),
    };
  }

  // Calculate proration factor
  static calculateProrationFactor(
    payCycle: any,
    startDate: Date,
    endDate: Date,
    periodStart: Date,
    periodEnd: Date
  ): number {
    if (!payCycle.prorationRules?.enabled) {
      return 1;
    }

    const method = payCycle.prorationRules.method || 'calendar_days';

    // Effective dates within period
    const effectiveStart = startDate > periodStart ? startDate : periodStart;
    const effectiveEnd = endDate < periodEnd ? endDate : periodEnd;

    const effectiveDays = Math.ceil(
      (effectiveEnd.getTime() - effectiveStart.getTime()) / (1000 * 60 * 60 * 24)
    ) + 1;

    switch (method) {
      case 'calendar_days':
        const totalCalendarDays = Math.ceil(
          (periodEnd.getTime() - periodStart.getTime()) / (1000 * 60 * 60 * 24)
        ) + 1;
        return effectiveDays / totalCalendarDays;

      case 'fixed_days':
        const fixedDays = payCycle.prorationRules.fixedDaysPerMonth || 30;
        return effectiveDays / fixedDays;

      case 'working_days':
        // Would need to count actual working days
        // For now, assume 5/7 are working days
        const totalWorkingDays = Math.ceil(
          (periodEnd.getTime() - periodStart.getTime()) / (1000 * 60 * 60 * 24) * 5 / 7
        );
        const effectiveWorkingDays = Math.ceil(effectiveDays * 5 / 7);
        return effectiveWorkingDays / totalWorkingDays;

      default:
        return 1;
    }
  }

  // Reset PayCycle to next month after payroll approval
  static async resetToNextMonth(payCycleId: string, userId: string) {
    const payCycle = await this.getPayCycleById(payCycleId);

    if (!payCycle.payMonth) {
      throw errors.validation('PayCycle does not have a payMonth configured');
    }

    // Parse current payMonth (MMYYYY format)
    const currentMonth = parseInt(payCycle.payMonth.substring(0, 2));
    const currentYear = parseInt(payCycle.payMonth.substring(2));

    // Calculate next month
    const nextMonth = currentMonth === 12 ? 1 : currentMonth + 1;
    const nextYear = currentMonth === 12 ? currentYear + 1 : currentYear;
    const newPayMonth = String(nextMonth).padStart(2, '0') + nextYear;

    // Calculate new period dates based on config (using UTC to avoid timezone issues)
    const periodStartDay = payCycle.monthlyConfig?.periodStartDay || 1;

    // Start date is the periodStartDay of the next month (in UTC)
    const newStartDate = createUTCDate(nextYear, nextMonth - 1, periodStartDay);

    // End date calculation (in UTC)
    let newEndDate: Date;
    if (periodStartDay === 1) {
      // Last day of the period month
      newEndDate = getLastDayOfMonthUTC(nextYear, nextMonth - 1);
    } else {
      // One day before the periodStartDay of the month after
      const endMonth = nextMonth === 12 ? 0 : nextMonth; // 0 = January of next year
      const endYear = nextMonth === 12 ? nextYear + 1 : nextYear;
      newEndDate = createUTCDate(endYear, endMonth, periodStartDay - 1);
    }

    // Update the PayCycle
    const updatedPayCycle = await PayCycle.findByIdAndUpdate(
      payCycleId,
      {
        payMonth: newPayMonth,
        periodStartDate: newStartDate,
        periodEndDate: newEndDate,
        periodStatus: 'open',
        updatedBy: new Types.ObjectId(userId),
      },
      { new: true }
    );

    return updatedPayCycle;
  }

  // Set period status (open, processing, closed)
  static async setPeriodStatus(
    payCycleId: string,
    status: 'open' | 'processing' | 'closed',
    userId: string
  ) {
    const payCycle = await this.getPayCycleById(payCycleId);

    payCycle.periodStatus = status;
    payCycle.updatedBy = new Types.ObjectId(userId);
    await payCycle.save();

    return payCycle;
  }

  // Validate if a date is within the PayCycle period
  static async validateAttendanceDate(
    payCycleId: string,
    date: Date
  ): Promise<{ valid: boolean; message?: string }> {
    const payCycle = await this.getPayCycleById(payCycleId);

    if (!payCycle.periodStartDate || !payCycle.periodEndDate) {
      return { valid: false, message: 'PayCycle period dates are not configured' };
    }

    if (payCycle.periodStatus === 'closed') {
      return {
        valid: false,
        message: `PayCycle period is ${payCycle.periodStatus}. Attendance entry is not allowed when period is closed.`
      };
    }

    // Use string-based date comparison to avoid timezone issues
    const startDateStr = toDateString(payCycle.periodStartDate);
    const endDateStr = toDateString(payCycle.periodEndDate);

    if (!isDateWithinPeriod(date, payCycle.periodStartDate, payCycle.periodEndDate)) {
      return {
        valid: false,
        message: `Date must be within the PayCycle period: ${startDateStr} to ${endDateStr}`,
      };
    }

    return { valid: true };
  }

  // Validate attendance date for a specific employee
  static async validateEmployeeAttendanceDate(
    employeeId: string,
    date: Date
  ): Promise<{ valid: boolean; message?: string; payCycleId?: string }> {
    // Get employee's PayCycle
    const employee = await Employee.findById(employeeId);

    if (!employee) {
      return { valid: false, message: 'Employee not found' };
    }

    if (!employee.salaryInfo?.payCycleId) {
      return { valid: false, message: 'Employee has no assigned PayCycle' };
    }

    const payCycleId = employee.salaryInfo.payCycleId.toString();
    const validation = await this.validateAttendanceDate(payCycleId, date);

    return {
      ...validation,
      payCycleId: validation.valid ? payCycleId : undefined,
    };
  }

  // Get employees assigned to a PayCycle
  static async getEmployeesForPayCycle(payCycleId: string) {
    const employees = await Employee.find({
      'salaryInfo.payCycleId': new Types.ObjectId(payCycleId),
      status: 'active',
    }).select('_id employeeCode fullName firstName lastName employment');

    return employees;
  }

  // Get PayCycle period info
  static async getPeriodInfo(payCycleId: string) {
    const payCycle = await this.getPayCycleById(payCycleId);

    return {
      payCycleId: payCycle._id,
      name: payCycle.name,
      code: payCycle.code,
      payMonth: payCycle.payMonth,
      periodStartDate: payCycle.periodStartDate,
      periodEndDate: payCycle.periodEndDate,
      periodStatus: payCycle.periodStatus,
      weekendDays: payCycle.weekendDays || [5, 6],
      calculationMethod: payCycle.calculationMethod || 'daily_rate',
      standardHoursPerDay: payCycle.standardHoursPerDay || 8,
      overtimeRates: payCycle.overtimeRates,
    };
  }

  // Initialize PayCycle period (for new PayCycles or manual initialization)
  static async initializePeriod(
    payCycleId: string,
    payMonth: string, // MMYYYY format
    userId: string
  ) {
    const payCycle = await this.getPayCycleById(payCycleId);

    // Validate payMonth format
    if (!/^\d{6}$/.test(payMonth)) {
      throw errors.validation('payMonth must be in MMYYYY format (e.g., 012026)');
    }

    const month = parseInt(payMonth.substring(0, 2));
    const year = parseInt(payMonth.substring(2));

    if (month < 1 || month > 12) {
      throw errors.validation('Invalid month in payMonth');
    }

    // Calculate period dates (using UTC to avoid timezone issues)
    const periodStartDay = payCycle.monthlyConfig?.periodStartDay || 1;
    const startDate = createUTCDate(year, month - 1, periodStartDay);

    // End date calculation (using UTC to avoid timezone issues)
    let endDate: Date;
    if (periodStartDay === 1) {
      // Last day of the month (in UTC)
      endDate = getLastDayOfMonthUTC(year, month - 1);
    } else {
      // One day before the periodStartDay of next month (in UTC)
      const nextMonth = month === 12 ? 1 : month + 1;
      const nextYear = month === 12 ? year + 1 : year;
      endDate = createUTCDate(nextYear, nextMonth - 1, periodStartDay - 1);
    }

    // Update PayCycle
    const updatedPayCycle = await PayCycle.findByIdAndUpdate(
      payCycleId,
      {
        payMonth,
        periodStartDate: startDate,
        periodEndDate: endDate,
        periodStatus: 'open',
        updatedBy: new Types.ObjectId(userId),
      },
      { new: true }
    );

    return updatedPayCycle;
  }
}
