import { Types } from 'mongoose';
import PayrollRun from '../models/PayrollRun';
import PayCycle from '../models/PayCycle';
import Employee from '../models/Employee';
import Attendance from '../models/Attendance';
import Leave from '../models/Leave';
import AdhocEarningDeduction from '../models/AdhocEarningDeduction';
import { errors } from '../utils/errors';
import { parsePagination, buildPaginatedResponse, roundToTwo } from '../utils/helpers';
import { IPaginationQuery } from '../types';
import { PayCycleService } from './payCycle.service';
import { AdvanceService } from './advance.service';
import { PayrollArchiveService } from './payrollArchive.service';
import { HolidayService } from './holiday.service';

export class PayrollService {
  // Get all payroll runs with pagination and filters
  static async getPayrollRuns(query: any, pagination: IPaginationQuery) {
    const { page, limit, skip } = parsePagination(pagination);

    const filter: any = {};

    // Pay cycle filter
    if (query.payCycleId) {
      filter.payCycleId = new Types.ObjectId(query.payCycleId);
    }

    // Status filter
    if (query.status) {
      filter.status = query.status;
    }

    // Date range filter
    if (query.year && query.month) {
      const startOfMonth = new Date(query.year, query.month - 1, 1);
      const endOfMonth = new Date(query.year, query.month, 0);
      filter.periodStartDate = { $gte: startOfMonth };
      filter.periodEndDate = { $lte: endOfMonth };
    }

    // Search filter
    if (query.search) {
      filter.$or = [
        { runNumber: { $regex: query.search, $options: 'i' } },
      ];
    }

    const [payrollRuns, total] = await Promise.all([
      PayrollRun.find(filter)
        .populate('payCycleId', 'name code')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      PayrollRun.countDocuments(filter),
    ]);

    return buildPaginatedResponse(payrollRuns, total, page, limit);
  }

  // Get payroll run by ID
  static async getPayrollRunById(id: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw errors.validation('Invalid payroll run ID');
    }

    const payrollRun = await PayrollRun.findById(id)
      .populate('payCycleId')
      .populate('approvalWorkflow.approverId', 'fullName email');

    if (!payrollRun) {
      throw errors.notFound('PayrollRun');
    }

    return payrollRun;
  }

  // Generate next run number
  static async generateRunNumber(_payCycleCode?: string): Promise<string> {
    const year = new Date().getFullYear();
    const month = String(new Date().getMonth() + 1).padStart(2, '0');
    const prefix = `PAY-${year}-${month}`;

    const lastRun = await PayrollRun.findOne({
      runNumber: { $regex: `^${prefix}` },
    })
      .sort({ runNumber: -1 })
      .select('runNumber');

    if (!lastRun) {
      return `${prefix}-001`;
    }

    const lastNumber = parseInt(lastRun.runNumber.split('-').pop() || '0');
    return `${prefix}-${String(lastNumber + 1).padStart(3, '0')}`;
  }

  // Create payroll run
  static async createPayrollRun(data: any, userId: string) {
    // Validate pay cycle
    const payCycle = await PayCycle.findById(data.payCycleId);
    if (!payCycle) {
      throw errors.notFound('PayCycle');
    }

    if (!payCycle.isActive) {
      throw errors.validation('Pay cycle is not active');
    }

    // Validate that PayCycle has period configured
    if (!payCycle.payMonth || !payCycle.periodStartDate || !payCycle.periodEndDate) {
      throw errors.validation('PayCycle period is not initialized. Please initialize the period first.');
    }

    // Use period dates from PayCycle master
    const periodStartDate = payCycle.periodStartDate;
    const periodEndDate = payCycle.periodEndDate;

    // Check for duplicate period - must match SAME payCycleId AND same dates
    console.log('[Payroll] Checking for duplicate run with payCycleId:', data.payCycleId);
    const existingRun = await PayrollRun.findOne({
      payCycleId: new Types.ObjectId(data.payCycleId),
      periodStartDate,
      periodEndDate,
      status: { $nin: ['cancelled'] },
    });
    console.log('[Payroll] Existing run found:', existingRun ? existingRun._id : 'NONE');

    if (existingRun) {
      throw errors.validation(`Payroll run already exists for period ${payCycle.payMonth} (${periodStartDate.toISOString().split('T')[0]} to ${periodEndDate.toISOString().split('T')[0]})`);
    }

    // Check if period is open for processing
    if (payCycle.periodStatus === 'closed') {
      throw errors.validation('PayCycle period is closed. Cannot create payroll run.');
    }

    // Generate run number
    data.runNumber = await this.generateRunNumber(payCycle.code);
    data.payCycleName = payCycle.name;
    data.payMonth = payCycle.payMonth;

    // Use dates from PayCycle master
    data.periodStartDate = periodStartDate;
    data.periodEndDate = periodEndDate;

    // Calculate number of days in period
    const diffTime = Math.abs(periodEndDate.getTime() - periodStartDate.getTime());
    data.periodDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;

    // Set payment date if not provided (use PayCycle's payDay config)
    if (!data.paymentDate && payCycle.monthlyConfig?.payDay) {
      const month = parseInt(payCycle.payMonth.substring(0, 2));
      const year = parseInt(payCycle.payMonth.substring(2));
      data.paymentDate = new Date(year, month - 1, payCycle.monthlyConfig.payDay);
    }

    // Update PayCycle status to processing
    await PayCycle.findByIdAndUpdate(data.payCycleId, {
      periodStatus: 'processing',
      updatedBy: userId,
    });

    // Initialize
    data.status = 'draft';
    data.summary = {
      totalEmployees: 0,
      totalGrossEarnings: 0,
      totalDeductions: 0,
      totalAdvanceDeductions: 0,
      totalNetPay: 0,
      totalOvertimePay: 0,
    };
    data.employeePayrolls = [];
    data.createdBy = userId;
    data.updatedBy = userId;

    const payrollRun = new PayrollRun(data);
    await payrollRun.save();

    return payrollRun;
  }

  // Calculate payroll for all employees
  static async calculatePayroll(id: string, userId: string) {
    const payrollRun = await this.getPayrollRunById(id);

    if (!['draft', 'calculated'].includes(payrollRun.status)) {
      throw errors.validation('Cannot calculate payroll in current status');
    }

    payrollRun.status = 'processing';
    await payrollRun.save();

    try {
      const payCycle = await PayCycle.findById(payrollRun.payCycleId);
      if (!payCycle) {
        throw errors.notFound('PayCycle');
      }

      // Get all active employees in this pay cycle
      // Component definitions are fetched from LookupValue (categories: EARNING_COMPONENT, DEDUCTION_COMPONENT)
      const employees = await Employee.find({
        'salaryInfo.payCycleId': payrollRun.payCycleId,
        status: 'active',
      })
        .populate('assignedComponents.earnings.componentId')
        .populate('assignedComponents.deductions.componentId');

      const activeEmployees = employees.filter((employee: any) => employee.status === 'active');

      const employeePayrolls = [];
      let totalGrossEarnings = 0;
      let totalDeductions = 0;
      let totalAdvanceDeductions = 0;
      let totalNetPay = 0;
      let totalOvertimePay = 0;
      let totalAdhocEarnings = 0;
      let totalAdhocDeductions = 0;

      for (const employee of activeEmployees) {
        const employeePayroll = await this.calculateEmployeePayroll(
          employee,
          payCycle,
          payrollRun.periodStartDate,
          payrollRun.periodEndDate,
          payrollRun._id.toString()
        );

        employeePayrolls.push(employeePayroll);
        totalGrossEarnings += employeePayroll.grossSalary;
        totalDeductions += employeePayroll.totalDeductions;
        totalAdvanceDeductions += employeePayroll.totalAdvanceDeductions;
        totalNetPay += employeePayroll.netSalary;
        totalOvertimePay += employeePayroll.attendance.totalOvertimeAmount;
        totalAdhocEarnings += employeePayroll.adhocItems?.totalEarnings || 0;
        totalAdhocDeductions += employeePayroll.adhocItems?.totalDeductions || 0;
      }

      // Update payroll run
      payrollRun.employeePayrolls = employeePayrolls as any;
      payrollRun.summary = {
        totalEmployees: employeePayrolls.length,
        processedEmployees: employeePayrolls.length,
        errorEmployees: 0,
        totalGrossEarnings: roundToTwo(totalGrossEarnings),
        totalDeductions: roundToTwo(totalDeductions),
        totalNetPay: roundToTwo(totalNetPay),
        totalTax: 0, // Tax calculation not implemented yet
        totalOvertimePay: roundToTwo(totalOvertimePay),
        totalAdvanceDeductions: roundToTwo(totalAdvanceDeductions),
        totalAdhocEarnings: roundToTwo(totalAdhocEarnings),
        totalAdhocDeductions: roundToTwo(totalAdhocDeductions),
        currency: 'AED',
      };
      payrollRun.status = 'calculated';
      payrollRun.calculatedAt = new Date();
      payrollRun.calculatedBy = new Types.ObjectId(userId);
      payrollRun.updatedBy = new Types.ObjectId(userId);

      await payrollRun.save();

      return payrollRun;
    } catch (error) {
      payrollRun.status = 'draft';
      await payrollRun.save();
      throw error;
    }
  }

  // Calculate payroll for single employee
  // NOTE: Payroll calculation ONLY uses employee.assignedComponents - no global component definitions
  private static async calculateEmployeePayroll(
    employee: any,
    payCycle: any,
    periodStart: Date,
    periodEnd: Date,
    _payrollRunId?: string
  ) {
    // Note: basicSalary from employee.salaryInfo is used as reference for percentage calculations
    // but NOT automatically added as an earning. All earnings must come from assignedComponents.
    const basicSalary = employee.salaryInfo.basicSalary || 0;

    // Get attendance for period (with holiday integration and PayCycle weekend config)
    const attendance = await this.getAttendanceForPeriod(
      employee._id,
      periodStart,
      periodEnd,
      employee,  // Pass employee for department/location-based holiday filtering
      payCycle   // Pass payCycle for weekend days and OT configuration
    );

    // Get adhoc items for this employee and period
    const payrollMonth = periodStart.getMonth() + 1;
    const payrollYear = periodStart.getFullYear();
    const adhocItems = await AdhocEarningDeduction.find({
      employeeId: employee._id,
      'payrollPeriod.month': payrollMonth,
      'payrollPeriod.year': payrollYear,
      status: 'approved',
    });

    // Calculate proration if needed (for new joinees)
    let prorationFactor = 1;
    let isProrated = false;
    let prorationReason = '';

    const joiningDate = new Date(employee.employment.joiningDate);
    if (joiningDate > periodStart) {
      prorationFactor = PayCycleService.calculateProrationFactor(
        payCycle,
        joiningDate,
        periodEnd,
        periodStart,
        periodEnd
      );
      isProrated = true;
      prorationReason = 'new_joinee';
    }

    // Calculate attendance-based proration factor
    // This is used when isAttendanceBased (pro-rated) flag is enabled on a component
    const expectedWorkingDays = attendance.expectedWorkingDays || (payCycle.monthlyConfig?.workingDaysPerMonth || 22);
    const daysWorked = attendance.daysWorked + attendance.paidLeaveDays + attendance.paidHolidays;
    const attendanceProrationFactor = expectedWorkingDays > 0 ? daysWorked / expectedWorkingDays : 1;

    // Calculate earnings - ONLY from assigned components (no default BASIC/ALLOWANCE)
    const earnings = [];
    const earningsMap = new Map<string, number>();

    // Process assigned earnings
    for (const assignedEarning of employee.assignedComponents?.earnings || []) {
      if (!assignedEarning.isActive) continue;

      // Get component code - either from componentCode field or from populated componentId
      const componentCode = assignedEarning.componentCode || assignedEarning.componentId?.code;
      if (!componentCode) continue;

      // Check if component is effective within the payroll period
      if (!this.isComponentEffective(assignedEarning, periodStart, periodEnd)) continue;

      // Check if this component is attendance-based (pro-rated based on days worked)
      const isAttendanceBased = assignedEarning.isAttendanceBased ?? false;

      let amount = 0;
      if (assignedEarning.overrideValue !== undefined) {
        amount = assignedEarning.overrideValue;
      } else {
        // For BASIC component, use employee's basicSalary
        if (componentCode === 'BASIC') {
          amount = basicSalary;
        }
      }

      // Apply attendance-based proration if enabled
      if (isAttendanceBased) {
        amount = roundToTwo(amount * attendanceProrationFactor);
      }
      // Apply new joinee proration if applicable
      else if (isProrated) {
        amount = roundToTwo(amount * prorationFactor);
      }

      earnings.push({
        componentCode,
        componentName: assignedEarning.componentName || componentCode,
        amount: roundToTwo(amount),
        isProrated,
        prorationFactor: isProrated ? prorationFactor : 1,
        isAttendanceBased,
        attendanceProrationFactor: isAttendanceBased ? attendanceProrationFactor : undefined,
      });
      earningsMap.set(componentCode, amount);
    }

    // Include basic salary and allowance from salaryInfo when not assigned as components
    if (!earningsMap.has('BASIC') && basicSalary > 0) {
      let amount = basicSalary;
      amount = roundToTwo(amount * attendanceProrationFactor);
      if (isProrated) {
        amount = roundToTwo(amount * prorationFactor);
      }
      earnings.push({
        componentCode: 'BASIC',
        componentName: 'Basic Salary',
        amount: roundToTwo(amount),
        isProrated,
        prorationFactor: isProrated ? prorationFactor : 1,
        isAttendanceBased: true,
        attendanceProrationFactor,
      });
      earningsMap.set('BASIC', amount);
    }

    const allowanceFromSalary = employee.salaryInfo?.allowance || 0;
    if (!earningsMap.has('ALLOWANCE') && allowanceFromSalary > 0) {
      let amount = allowanceFromSalary;
      amount = roundToTwo(amount * attendanceProrationFactor);
      if (isProrated) {
        amount = roundToTwo(amount * prorationFactor);
      }
      earnings.push({
        componentCode: 'ALLOWANCE',
        componentName: 'Allowance',
        amount: roundToTwo(amount),
        isProrated,
        prorationFactor: isProrated ? prorationFactor : 1,
        isAttendanceBased: true,
        attendanceProrationFactor,
      });
      earningsMap.set('ALLOWANCE', amount);
    }

    // Calculate gross salary (before overtime)
    const grossBeforeOT = earnings.reduce((sum, e) => sum + e.amount, 0);

    // Calculate overtime
    const ot1Hours = attendance.ot1Hours;
    const ot2Hours = attendance.ot2Hours;
    const workingDaysPerMonth = payCycle.monthlyConfig?.workingDaysPerMonth || 22;
    const standardHoursPerDay = payCycle.standardHoursPerDay || 8;
    const hourlyRate = basicSalary / workingDaysPerMonth / standardHoursPerDay;
    const ot1Multiplier = payCycle.overtimeRates?.ot1?.multiplier || 1.25;
    const ot2Multiplier = payCycle.overtimeRates?.ot2?.multiplier || 1.5;
    const ot1Amount = roundToTwo(ot1Hours * hourlyRate * ot1Multiplier);
    const ot2Amount = roundToTwo(ot2Hours * hourlyRate * ot2Multiplier);
    const totalOvertimeAmount = ot1Amount + ot2Amount;

    // Add overtime to earnings if applicable
    if (totalOvertimeAmount > 0) {
      earnings.push({
        componentCode: 'OT',
        componentName: 'Overtime Pay',
        amount: totalOvertimeAmount,
        isProrated: false,
        prorationFactor: 1,
      });
    }

    // Add adhoc earnings
    const adhocEarnings: any[] = [];
    for (const adhoc of adhocItems.filter(a => a.type === 'earning')) {
      earnings.push({
        componentCode: `ADHOC-${adhoc.category.toUpperCase()}`,
        componentName: adhoc.name,
        amount: roundToTwo(adhoc.amount),
        isProrated: false,
        prorationFactor: 1,
        isAdhoc: true,
        adhocId: adhoc._id,
      });
      adhocEarnings.push({
        adhocId: adhoc._id,
        referenceNumber: adhoc.referenceNumber,
        category: adhoc.category,
        name: adhoc.name,
        amount: adhoc.amount,
      });
    }

    const totalAdhocEarnings = adhocEarnings.reduce((sum, a) => sum + a.amount, 0);
    const grossSalary = roundToTwo(grossBeforeOT + totalOvertimeAmount + totalAdhocEarnings);

    // Calculate deductions
    const deductions = [];

    // Process assigned deductions
    for (const assignedDeduction of employee.assignedComponents?.deductions || []) {
      if (!assignedDeduction.isActive) continue;

      // Get component code - either from componentCode field or from populated componentId
      const componentCode = assignedDeduction.componentCode || assignedDeduction.componentId?.code;
      if (!componentCode) continue;

      // Check if component is effective within the payroll period
      if (!this.isComponentEffective(assignedDeduction, periodStart, periodEnd)) continue;

      // Check if this deduction is attendance-based (pro-rated based on days worked)
      const isAttendanceBased = assignedDeduction.isAttendanceBased ?? false;

      let amount = 0;
      if (assignedDeduction.overrideValue !== undefined) {
        amount = assignedDeduction.overrideValue;
      } else {
        amount = 0;
      }

      // Apply attendance-based proration if enabled
      if (isAttendanceBased) {
        amount = roundToTwo(amount * attendanceProrationFactor);
      }
      // Apply new joinee proration if applicable
      else if (isProrated) {
        amount = roundToTwo(amount * prorationFactor);
      }

      deductions.push({
        componentCode,
        componentName: assignedDeduction.componentName || componentCode,
        amount: roundToTwo(amount),
        isProrated,
        prorationFactor: isProrated ? prorationFactor : 1,
        isAttendanceBased,
        attendanceProrationFactor: isAttendanceBased ? attendanceProrationFactor : undefined,
      });
    }

    const assignedDeductionCodes = new Set(
      (employee.assignedComponents?.deductions || [])
        .map((d: any) => d.componentCode || d.componentId?.code)
        .filter(Boolean)
    );
    const hasAssignedDeduction = (codes: string[]) => codes.some((code) => assignedDeductionCodes.has(code));

    // Calculate leave deductions (unpaid leave) only if assigned
    const leaveDeduction = await this.calculateLeaveDeductions(
      employee._id,
      periodStart,
      periodEnd,
      basicSalary,
      payCycle
    );

    if (leaveDeduction > 0 && hasAssignedDeduction(['UNPAID_LEAVE', 'UNPAID_LEAVE_DEDUCTION'])) {
      deductions.push({
        componentCode: 'UNPAID_LEAVE',
        componentName: 'Unpaid Leave Deduction',
        amount: roundToTwo(leaveDeduction),
      });
    }

    // Calculate unpaid holiday deductions (if any unpaid holidays) only if assigned
    if (attendance.unpaidHolidays > 0 && hasAssignedDeduction(['UNPAID_HOLIDAY'])) {
      const dailyRate = basicSalary / (payCycle.monthlyConfig?.workingDaysPerMonth || 22);
      const unpaidHolidayDeduction = roundToTwo(attendance.unpaidHolidays * dailyRate);
      deductions.push({
        componentCode: 'UNPAID_HOLIDAY',
        componentName: 'Unpaid Holiday Deduction',
        amount: unpaidHolidayDeduction,
      });
    }

    // Calculate absence deductions (days absent without leave approval) only if assigned
    if (attendance.daysAbsent > 0 && hasAssignedDeduction(['ABSENCE', 'ABSENT', 'ABSENT_DEDUCTION'])) {
      const dailyRate = basicSalary / (payCycle.monthlyConfig?.workingDaysPerMonth || 22);
      const absenceDeduction = roundToTwo(attendance.daysAbsent * dailyRate);
      deductions.push({
        componentCode: 'ABSENCE',
        componentName: 'Absence Deduction',
        amount: absenceDeduction,
      });
    }

    // Add adhoc deductions
    const adhocDeductions: any[] = [];
    for (const adhoc of adhocItems.filter(a => a.type === 'deduction')) {
      deductions.push({
        componentCode: `ADHOC-${adhoc.category.toUpperCase()}`,
        componentName: adhoc.name,
        amount: roundToTwo(adhoc.amount),
        isAdhoc: true,
        adhocId: adhoc._id,
      });
      adhocDeductions.push({
        adhocId: adhoc._id,
        referenceNumber: adhoc.referenceNumber,
        category: adhoc.category,
        name: adhoc.name,
        amount: adhoc.amount,
      });
    }

    const totalAdhocDeductions = adhocDeductions.reduce((sum, a) => sum + a.amount, 0);
    const totalDeductions = deductions.reduce((sum, d) => sum + d.amount, 0);

    // Get advance deductions
    const advanceDeductions = [];
    const pendingAdvances = await AdvanceService.getPendingRepayments(
      employee._id.toString(),
      periodEnd
    );

    let totalAdvanceDeductions = 0;
    for (const pending of pendingAdvances) {
      advanceDeductions.push({
        advanceId: pending.advanceId,
        advanceNumber: pending.advanceNumber,
        amount: pending.amount,
        installmentNumber: pending.installmentNumber,
      });
      totalAdvanceDeductions += pending.amount;
    }

    // Calculate net salary
    const netSalary = Math.max(0, roundToTwo(grossSalary - totalDeductions - totalAdvanceDeductions));

    // Calculate total earnings (sum of all earnings)
    const totalEarnings = earnings.reduce((sum, e) => sum + e.amount, 0);

    return {
      employeeId: employee._id,
      employeeCode: employee.employeeCode,
      employeeName: employee.fullName,
      department: employee.employment?.department,
      designation: employee.employment?.designation,
      attendance: {
        totalWorkingDays: attendance.expectedWorkingDays || 22,
        daysWorked: attendance.daysWorked,
        daysAbsent: attendance.daysAbsent,
        leaveDays: attendance.leaveDays,
        paidLeaveDays: attendance.paidLeaveDays,
        unpaidLeaveDays: attendance.unpaidLeaveDays,
        holidays: attendance.holidays,
        paidHolidays: attendance.paidHolidays,
        unpaidHolidays: attendance.unpaidHolidays,
        weekends: attendance.totalWeekends || 0,
        weekendWorked: attendance.weekendWorked || 0,
        holidayWorkHours: attendance.holidayWorkHours || 0, // Hours worked on holidays/weekends (all at OT2)
        expectedWorkingDays: attendance.expectedWorkingDays,
        ot1Hours,
        ot1Rate: ot1Multiplier,
        ot1Amount,
        ot2Hours,
        ot2Rate: ot2Multiplier,
        ot2Amount,
        totalOvertimeAmount,
        lateArrivals: attendance.lateCount || 0,
        earlyDepartures: attendance.earlyLeaveCount || 0,
        lateDeductionAmount: 0, // TODO: implement late deduction
        holidayDetails: attendance.holidayDetails,
      },
      earnings,
      totalEarnings: roundToTwo(totalEarnings),
      deductions,
      totalDeductions: roundToTwo(totalDeductions),
      advanceDeductions,
      totalAdvanceDeductions: roundToTwo(totalAdvanceDeductions),
      adhocItems: {
        earnings: adhocEarnings,
        deductions: adhocDeductions,
        totalEarnings: roundToTwo(totalAdhocEarnings),
        totalDeductions: roundToTwo(totalAdhocDeductions),
      },
      basicSalary,
      grossSalary,
      netSalary,
      currency: employee.salaryInfo?.currency || 'AED',
      proration: {
        isProrated,
        ...(isProrated && prorationReason ? { reason: prorationReason as 'new_joinee' | 'termination' | 'mid_month_change' } : {}),
        prorationFactor,
      },
      status: 'calculated' as const,
    };
  }

  // Calculate component amount from LookupValue metadata
  // This method works with the LookupValue.metadata.additionalData structure
  // and also supports backward compatibility with EarningDeduction.calculation structure
  // Check if an assigned component is effective within the payroll period
  // A component is effective if its effectiveFrom is before or equal to periodEnd
  // AND its effectiveTo is undefined/null OR after or equal to periodStart
  private static isComponentEffective(
    assignedComponent: { effectiveFrom?: Date; effectiveTo?: Date },
    periodStart: Date,
    periodEnd: Date
  ): boolean {
    const { effectiveFrom, effectiveTo } = assignedComponent;

    // If no dates are specified, the component is always effective
    if (!effectiveFrom && !effectiveTo) {
      return true;
    }

    // If effectiveFrom is specified and is after periodEnd, component is not yet effective
    if (effectiveFrom && new Date(effectiveFrom) > periodEnd) {
      return false;
    }

    // If effectiveTo is specified and is before periodStart, component has expired
    if (effectiveTo && new Date(effectiveTo) < periodStart) {
      return false;
    }

    return true;
  }

  // Get attendance summary for period (integrated with Holiday Master)
  private static async getAttendanceForPeriod(
    employeeId: Types.ObjectId,
    periodStart: Date,
    periodEnd: Date,
    employee?: any,
    payCycle?: any
  ) {
    // Get attendance records
    const attendanceFilters: any[] = [];
    if (employee?.userId) {
      attendanceFilters.push({ userId: employee.userId });
    }
    attendanceFilters.push({ userId: employeeId });
    if (employee?.employeeCode) {
      attendanceFilters.push({ employeeId: employee.employeeCode });
    }

    const attendanceRecords = await Attendance.find({
      $or: attendanceFilters,
      date: { $gte: periodStart, $lte: periodEnd },
    });
    const hasAttendanceRecords = attendanceRecords.length > 0;

    // Get holidays from Holiday Master for this period
    // Filter by employee's department/location if available
    const holidayOptions: { department?: string; location?: string } = {};
    if (employee?.employment?.department) {
      holidayOptions.department = employee.employment.department;
    }
    if (employee?.employment?.workLocation) {
      holidayOptions.location = employee.employment.workLocation;
    }

    const holidaysFromMaster = await HolidayService.getHolidaysForPeriod(
      periodStart,
      periodEnd,
      { ...holidayOptions, activeOnly: true }
    );

    // Create a set of holiday dates for quick lookup
    const holidayDateSet = new Set<string>();
    let paidHolidaysCount = 0;
    let unpaidHolidaysCount = 0;
    let halfDayHolidaysCount = 0;

    for (const holiday of holidaysFromMaster) {
      const dateKey = new Date(holiday.date).toISOString().split('T')[0];
      holidayDateSet.add(dateKey);

      if (holiday.isPaid) {
        if (holiday.isHalfDay) {
          halfDayHolidaysCount += 0.5;
          paidHolidaysCount += 0.5;
        } else {
          paidHolidaysCount += 1;
        }
      } else {
        unpaidHolidaysCount += holiday.isHalfDay ? 0.5 : 1;
      }
    }

    // Get weekend days from PayCycle (default: Friday=5, Saturday=6 for UAE)
    const weekendDays = payCycle?.weekendDays || [5, 6];

    // Calculate working days in the period
    let totalCalendarDays = 0;
    let totalWeekends = 0;
    const currentDate = new Date(periodStart);
    while (currentDate <= periodEnd) {
      totalCalendarDays++;
      const dayOfWeek = currentDate.getDay();
      // Use configurable weekend days
      if (weekendDays.includes(dayOfWeek)) {
        totalWeekends++;
      }
      currentDate.setDate(currentDate.getDate() + 1);
    }

    // Calculate expected working days (excluding weekends and holidays)
    const totalHolidays = paidHolidaysCount + unpaidHolidaysCount;
    let expectedWorkingDays = totalCalendarDays - totalWeekends - totalHolidays;
    if (expectedWorkingDays <= 0 && payCycle?.monthlyConfig?.workingDaysPerMonth) {
      expectedWorkingDays = payCycle.monthlyConfig.workingDaysPerMonth;
    }

    let daysWorked = 0;
    let daysAbsent = 0;
    let holidaysFromAttendance = 0;
    let ot1Hours = 0;
    let ot2Hours = 0;
    let lateCount = 0;
    let earlyLeaveCount = 0;
    let weekendWorked = 0;
    let holidayWorkHours = 0;

    // Track dates we have attendance for
    const attendanceDates = new Set<string>();

    for (const record of attendanceRecords) {
      const dateKey = new Date(record.date).toISOString().split('T')[0];
      attendanceDates.add(dateKey);

      const dayOfWeek = new Date(record.date).getDay();
      const isWeekend = weekendDays.includes(dayOfWeek);
      const isHoliday = holidayDateSet.has(dateKey);

      // Get total hours worked on this day
      const regularHours = record.workHours?.regular || 0;
      const overtimeHours = record.workHours?.overtime || 0;
      const ot1FromRecord = record.payrollOvertime?.ot1Hours || 0;
      const ot2FromRecord = record.payrollOvertime?.ot2Hours || 0;

      switch (record.status) {
        case 'present':
          daysWorked += 1;
          // Check if worked on a weekend or holiday
          if (isWeekend || isHoliday) {
            weekendWorked++;
            // ALL HOURS worked on holiday/weekend → OT2 rate
            holidayWorkHours += regularHours + overtimeHours;
            ot2Hours += regularHours + overtimeHours + ot1FromRecord + ot2FromRecord;
          } else {
            // Regular working day - OT1 for regular overtime
            ot1Hours += ot1FromRecord;
            ot2Hours += ot2FromRecord; // Explicitly marked OT2
          }
          break;
        case 'half_day':
          daysWorked += 0.5;
          if (isWeekend || isHoliday) {
            // Half day on holiday/weekend - all hours are OT2
            holidayWorkHours += (regularHours + overtimeHours) / 2;
            ot2Hours += (regularHours + overtimeHours) / 2 + ot1FromRecord + ot2FromRecord;
          } else {
            ot1Hours += ot1FromRecord;
            ot2Hours += ot2FromRecord;
          }
          break;
        case 'absent':
          daysAbsent += 1;
          break;
        case 'holiday':
          holidaysFromAttendance += 1;
          // If there's any work logged on a holiday, it's all OT2
          if (regularHours > 0 || overtimeHours > 0) {
            holidayWorkHours += regularHours + overtimeHours;
            ot2Hours += regularHours + overtimeHours + ot1FromRecord + ot2FromRecord;
          }
          break;
        case 'weekend':
          // If there's any work logged on a weekend, it's all OT2
          if (regularHours > 0 || overtimeHours > 0 || ot1FromRecord > 0 || ot2FromRecord > 0) {
            weekendWorked++;
            holidayWorkHours += regularHours + overtimeHours;
            ot2Hours += regularHours + overtimeHours + ot1FromRecord + ot2FromRecord;
          }
          break;
      }

      if (record.isLate) lateCount += 1;
      if (record.isEarlyLeave) earlyLeaveCount += 1;
    }

    // Get leave days (approved leaves in period)
    const leaveRecords = await Leave.find({
      userId: employeeId,
      startDate: { $lte: periodEnd },
      endDate: { $gte: periodStart },
      status: 'approved',
    });

    let paidLeaveDays = 0;
    let unpaidLeaveDays = 0;
    for (const leave of leaveRecords) {
      const leaveStart = leave.startDate > periodStart ? leave.startDate : periodStart;
      const leaveEnd = leave.endDate < periodEnd ? leave.endDate : periodEnd;
      const days = Math.ceil((leaveEnd.getTime() - leaveStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;
      const leaveDayCount = leave.halfDay ? 0.5 : days;

      if (leave.isPaidLeave !== false) {
        paidLeaveDays += leaveDayCount;
      } else {
        unpaidLeaveDays += leaveDayCount;
      }
    }

    const totalLeaveDays = paidLeaveDays + unpaidLeaveDays;

    if (!hasAttendanceRecords) {
      // Option C: No attendance records -> treat all expected working days as absent
      daysWorked = 0;
      daysAbsent = Math.max(0, expectedWorkingDays - totalLeaveDays);
    } else {
      // If attendance exists but not for all working days, treat missing days as absent
      const derivedAbsent = Math.max(0, expectedWorkingDays - daysWorked - totalLeaveDays);
      daysAbsent = Math.max(daysAbsent, derivedAbsent);
    }

    // Use holidays from Master if available, otherwise from attendance records
    const finalHolidayCount = holidaysFromMaster.length > 0 ? totalHolidays : holidaysFromAttendance;

    return {
      daysWorked,
      daysAbsent,
      leaveDays: totalLeaveDays,
      paidLeaveDays,
      unpaidLeaveDays,
      holidays: finalHolidayCount,
      paidHolidays: paidHolidaysCount,
      unpaidHolidays: unpaidHolidaysCount,
      halfDayHolidays: halfDayHolidaysCount,
      ot1Hours,
      ot2Hours,
      holidayWorkHours, // Hours worked on holidays/weekends (all at OT2)
      lateCount,
      earlyLeaveCount,
      weekendWorked,
      totalCalendarDays,
      totalWeekends,
      expectedWorkingDays,
      holidayDetails: holidaysFromMaster.map(h => ({
        date: h.date,
        name: h.name,
        type: h.type,
        isPaid: h.isPaid,
        isHalfDay: h.isHalfDay,
      })),
    };
  }

  // Calculate leave deductions
  private static async calculateLeaveDeductions(
    employeeId: Types.ObjectId,
    periodStart: Date,
    periodEnd: Date,
    basicSalary: number,
    payCycle: any
  ): Promise<number> {
    const unpaidLeaves = await Leave.find({
      userId: employeeId,
      startDate: { $lte: periodEnd },
      endDate: { $gte: periodStart },
      status: 'approved',
      isPaidLeave: false,
    });

    if (unpaidLeaves.length === 0) return 0;

    let totalUnpaidDays = 0;
    for (const leave of unpaidLeaves) {
      const leaveStart = leave.startDate > periodStart ? leave.startDate : periodStart;
      const leaveEnd = leave.endDate < periodEnd ? leave.endDate : periodEnd;
      const days = Math.ceil((leaveEnd.getTime() - leaveStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;
      totalUnpaidDays += leave.halfDay ? 0.5 : days;
    }

    const dailyRate = basicSalary / (payCycle.monthlyConfig?.workingDaysPerMonth || 22);
    return roundToTwo(totalUnpaidDays * dailyRate);
  }

  // Approve payroll run
  static async approvePayrollRun(id: string, approvalData: any, userId: string) {
    const payrollRun = await this.getPayrollRunById(id);

    if (payrollRun.status !== 'calculated' && payrollRun.status !== 'pending_approval') {
      throw errors.validation('Payroll run cannot be approved in current status');
    }

    payrollRun.approvalWorkflow.push({
      level: payrollRun.approvalWorkflow.length + 1,
      approverId: new Types.ObjectId(userId),
      status: 'approved',
      comments: approvalData.comments,
      timestamp: new Date(),
    });

    payrollRun.status = 'approved';
    payrollRun.approvedAt = new Date();
    payrollRun.approvedBy = new Types.ObjectId(userId);
    payrollRun.updatedBy = new Types.ObjectId(userId);

    await payrollRun.save();

    // Auto-reset PayCycle to next month after approval
    try {
      await PayCycleService.resetToNextMonth(
        payrollRun.payCycleId.toString(),
        userId
      );
    } catch (resetError) {
      // Log error but don't fail the approval
      console.error('Failed to reset PayCycle to next month:', resetError);
      // The reset can be done manually later if needed
    }

    return payrollRun;
  }

  // Finalize payroll run
  static async finalizePayrollRun(id: string, userId: string) {
    const payrollRun = await this.getPayrollRunById(id);

    if (payrollRun.status !== 'approved') {
      throw errors.validation('Only approved payroll runs can be finalized');
    }

    // Lock attendance records
    await Attendance.updateMany(
      {
        date: { $gte: payrollRun.periodStartDate, $lte: payrollRun.periodEndDate },
        payrollStatus: 'pending',
      },
      {
        payrollStatus: 'locked',
        payrollRunId: payrollRun._id,
        payrollProcessedAt: new Date(),
      }
    );

    // Lock leave records
    await Leave.updateMany(
      {
        startDate: { $lte: payrollRun.periodEndDate },
        endDate: { $gte: payrollRun.periodStartDate },
        status: 'approved',
        payrollStatus: 'pending',
      },
      {
        payrollStatus: 'locked',
        payrollRunId: payrollRun._id,
        payrollProcessedAt: new Date(),
      }
    );

    // Process advance deductions
    for (const empPayroll of payrollRun.employeePayrolls) {
      for (const advDed of empPayroll.advanceDeductions || []) {
        if (advDed.advanceId) {
          await AdvanceService.recordRepayment(
            advDed.advanceId.toString(),
            advDed.amount,
            payrollRun._id.toString(),
            userId
          );
        }
      }

      // Mark adhoc items as processed
      const adhocData = empPayroll.adhocItems as any;
      const adhocItemIds = [
        ...(adhocData?.earnings || []).map((a: any) => a.adhocId),
        ...(adhocData?.deductions || []).map((a: any) => a.adhocId),
      ];

      if (adhocItemIds.length > 0) {
        await AdhocEarningDeduction.updateMany(
          { _id: { $in: adhocItemIds } },
          {
            status: 'processed',
            processedAt: new Date(),
            payrollRunId: payrollRun._id,
          }
        );
      }
    }

    payrollRun.status = 'finalized';
    payrollRun.finalization = {
      finalizedAt: new Date(),
      finalizedBy: new Types.ObjectId(userId),
      bankFileGenerated: false,
    };
    payrollRun.updatedBy = new Types.ObjectId(userId);

    await payrollRun.save();

    // Automatically create archive for finalized payroll run
    try {
      const archive = await PayrollArchiveService.createFromPayrollRun(
        payrollRun._id.toString(),
        userId
      );

      // Update payroll run with archive reference
      if (payrollRun.finalization) {
        payrollRun.finalization.archiveId = archive._id;
      }
      await payrollRun.save();
    } catch (archiveError) {
      // Log error but don't fail the finalization
      console.error('Failed to create payroll archive:', archiveError);
      // The archive can be created manually later if needed
    }

    return payrollRun;
  }

  // Cancel payroll run
  static async cancelPayrollRun(id: string, reason: string, userId: string) {
    const payrollRun = await this.getPayrollRunById(id);

    if (['finalized', 'paid', 'cancelled'].includes(payrollRun.status)) {
      throw errors.validation('Cannot cancel this payroll run');
    }

    payrollRun.status = 'cancelled';
    payrollRun.cancellation = {
      cancelledAt: new Date(),
      cancelledBy: new Types.ObjectId(userId),
      reason,
    };
    payrollRun.updatedBy = new Types.ObjectId(userId);

    await payrollRun.save();

    return payrollRun;
  }

  // Rerun payroll - recalculate an existing payroll run with latest data
  // This is useful when attendance, adhoc items, or advances have changed
  static async rerunPayroll(id: string, userId: string) {
    const payrollRun = await this.getPayrollRunById(id);

    // Only allow rerun for draft, calculated, or pending_approval status
    if (!['draft', 'calculated', 'pending_approval'].includes(payrollRun.status)) {
      throw errors.validation(
        `Cannot rerun payroll in '${payrollRun.status}' status. Only draft, calculated, or pending approval payroll runs can be rerun.`
      );
    }

    // Store previous values for comparison
    const previousSummary = { ...payrollRun.summary };
    const previousEmployeeCount = payrollRun.employeePayrolls?.length || 0;

    // Reset status to processing
    payrollRun.status = 'processing';
    await payrollRun.save();

    try {
      const payCycle = await PayCycle.findById(payrollRun.payCycleId);
      if (!payCycle) {
        throw errors.notFound('PayCycle');
      }

      // Get all active employees in this pay cycle
      // Component definitions are fetched from LookupValue (categories: EARNING_COMPONENT, DEDUCTION_COMPONENT)
      const employees = await Employee.find({
        'salaryInfo.payCycleId': payrollRun.payCycleId,
        status: 'active',
      })
        .populate('assignedComponents.earnings.componentId')
        .populate('assignedComponents.deductions.componentId');

      const activeEmployees = employees.filter((employee: any) => employee.status === 'active');

      const employeePayrolls = [];
      let totalGrossEarnings = 0;
      let totalDeductions = 0;
      let totalAdvanceDeductions = 0;
      let totalNetPay = 0;
      let totalOvertimePay = 0;
      let totalAdhocEarnings = 0;
      let totalAdhocDeductions = 0;

      for (const employee of activeEmployees) {
        const employeePayroll = await this.calculateEmployeePayroll(
          employee,
          payCycle,
          payrollRun.periodStartDate,
          payrollRun.periodEndDate,
          payrollRun._id.toString()
        );

        employeePayrolls.push(employeePayroll);
        totalGrossEarnings += employeePayroll.grossSalary;
        totalDeductions += employeePayroll.totalDeductions;
        totalAdvanceDeductions += employeePayroll.totalAdvanceDeductions;
        totalNetPay += employeePayroll.netSalary;
        totalOvertimePay += employeePayroll.attendance.totalOvertimeAmount;
        totalAdhocEarnings += employeePayroll.adhocItems?.totalEarnings || 0;
        totalAdhocDeductions += employeePayroll.adhocItems?.totalDeductions || 0;
      }

      // Update payroll run with new calculations
      payrollRun.employeePayrolls = employeePayrolls as any;
      payrollRun.summary = {
        totalEmployees: employeePayrolls.length,
        processedEmployees: employeePayrolls.length,
        errorEmployees: 0,
        totalGrossEarnings: roundToTwo(totalGrossEarnings),
        totalDeductions: roundToTwo(totalDeductions),
        totalNetPay: roundToTwo(totalNetPay),
        totalTax: 0,
        totalOvertimePay: roundToTwo(totalOvertimePay),
        totalAdvanceDeductions: roundToTwo(totalAdvanceDeductions),
        totalAdhocEarnings: roundToTwo(totalAdhocEarnings),
        totalAdhocDeductions: roundToTwo(totalAdhocDeductions),
        currency: 'AED',
      };
      payrollRun.status = 'calculated';
      payrollRun.calculatedAt = new Date();
      payrollRun.calculatedBy = new Types.ObjectId(userId);
      payrollRun.updatedBy = new Types.ObjectId(userId);

      // Track rerun history
      if (!payrollRun.rerunHistory) {
        (payrollRun as any).rerunHistory = [];
      }
      (payrollRun as any).rerunHistory.push({
        rerunAt: new Date(),
        rerunBy: new Types.ObjectId(userId),
        previousSummary: {
          totalEmployees: previousEmployeeCount,
          totalGrossEarnings: previousSummary.totalGrossEarnings,
          totalDeductions: previousSummary.totalDeductions,
          totalNetPay: previousSummary.totalNetPay,
          totalOvertimePay: previousSummary.totalOvertimePay,
          totalAdvanceDeductions: previousSummary.totalAdvanceDeductions,
        },
        changes: {
          employeeCountChange: employeePayrolls.length - previousEmployeeCount,
          grossEarningsChange: roundToTwo(totalGrossEarnings - (previousSummary.totalGrossEarnings || 0)),
          deductionsChange: roundToTwo(totalDeductions - (previousSummary.totalDeductions || 0)),
          netPayChange: roundToTwo(totalNetPay - (previousSummary.totalNetPay || 0)),
        },
      });

      await payrollRun.save();

      return {
        payrollRun,
        changes: {
          previousEmployeeCount,
          currentEmployeeCount: employeePayrolls.length,
          previousNetPay: previousSummary.totalNetPay || 0,
          currentNetPay: roundToTwo(totalNetPay),
          netPayDifference: roundToTwo(totalNetPay - (previousSummary.totalNetPay || 0)),
          previousGrossEarnings: previousSummary.totalGrossEarnings || 0,
          currentGrossEarnings: roundToTwo(totalGrossEarnings),
          previousDeductions: previousSummary.totalDeductions || 0,
          currentDeductions: roundToTwo(totalDeductions),
          previousOvertimePay: previousSummary.totalOvertimePay || 0,
          currentOvertimePay: roundToTwo(totalOvertimePay),
        },
      };
    } catch (error) {
      // Revert status on error
      payrollRun.status = 'draft';
      await payrollRun.save();
      throw error;
    }
  }

  // Get payroll statistics
  static async getStatistics() {
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth();

    const stats = await PayrollRun.aggregate([
      {
        $facet: {
          byStatus: [
            { $group: { _id: '$status', count: { $sum: 1 } } },
          ],
          currentMonth: [
            {
              $match: {
                periodStartDate: { $gte: new Date(currentYear, currentMonth, 1) },
                status: { $nin: ['cancelled'] },
              },
            },
            {
              $group: {
                _id: null,
                totalNetPay: { $sum: '$summary.totalNetPay' },
                totalEmployees: { $sum: '$summary.totalEmployees' },
              },
            },
          ],
          yearToDate: [
            {
              $match: {
                periodStartDate: { $gte: new Date(currentYear, 0, 1) },
                status: 'finalized',
              },
            },
            {
              $group: {
                _id: null,
                totalNetPay: { $sum: '$summary.totalNetPay' },
              },
            },
          ],
        },
      },
    ]);

    return {
      byStatus: stats[0].byStatus,
      currentMonth: stats[0].currentMonth[0] || { totalNetPay: 0, totalEmployees: 0 },
      yearToDate: stats[0].yearToDate[0]?.totalNetPay || 0,
    };
  }
}
