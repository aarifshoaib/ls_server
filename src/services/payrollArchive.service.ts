import { Types } from 'mongoose';
import PayrollArchive from '../models/PayrollArchive';
import PayrollRun from '../models/PayrollRun';
import Employee from '../models/Employee';
import { errors } from '../utils/errors';
import { parsePagination, buildPaginatedResponse } from '../utils/helpers';
import { IPaginationQuery } from '../types';

export class PayrollArchiveService {
  // Backfill archives for finalized payroll runs without archives
  static async backfillFromFinalizedRuns(userId: string) {
    const finalizedPayrolls = await PayrollRun.find({
      status: 'finalized',
    }).populate('payCycleId');

    let created = 0;
    let skipped = 0;
    let failed = 0;

    for (const payrollRun of finalizedPayrolls) {
      const existingArchive = await PayrollArchive.findOne({
        payrollRunId: payrollRun._id,
      });

      if (existingArchive) {
        skipped++;
        continue;
      }

      try {
        await this.createFromPayrollRun(payrollRun._id.toString(), userId);
        created++;
      } catch (error) {
        failed++;
      }
    }

    return { created, skipped, failed };
  }
  // Get all archives with pagination and filters
  static async getArchives(query: any, pagination: IPaginationQuery) {
    const { page, limit, skip } = parsePagination(pagination);

    const filter: any = {};

    // Pay cycle filter
    if (query.payCycleId) {
      filter.payCycleId = new Types.ObjectId(query.payCycleId);
    }

    // Year filter
    if (query.year) {
      const startOfYear = new Date(query.year, 0, 1);
      const endOfYear = new Date(query.year, 11, 31, 23, 59, 59);
      filter.periodStartDate = { $gte: startOfYear };
      filter.periodEndDate = { $lte: endOfYear };
    }

    // Month filter
    if (query.year && query.month) {
      const startOfMonth = new Date(query.year, query.month - 1, 1);
      const endOfMonth = new Date(query.year, query.month, 0, 23, 59, 59);
      filter.periodStartDate = { $gte: startOfMonth };
      filter.periodEndDate = { $lte: endOfMonth };
    }

    // Search filter
    if (query.search) {
      filter.$or = [
        { archiveNumber: { $regex: query.search, $options: 'i' } },
        { 'employeeSnapshots.employeeName': { $regex: query.search, $options: 'i' } },
        { 'employeeSnapshots.employeeCode': { $regex: query.search, $options: 'i' } },
      ];
    }

    const [archives, total] = await Promise.all([
      PayrollArchive.find(filter)
        .populate('payCycleId', 'name code')
        .select('-employeeSnapshots') // Exclude heavy field for list
        .sort({ archivedAt: -1 })
        .skip(skip)
        .limit(limit),
      PayrollArchive.countDocuments(filter),
    ]);

    return buildPaginatedResponse(archives, total, page, limit);
  }

  // Get archive by ID
  static async getArchiveById(id: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw errors.validation('Invalid archive ID');
    }

    const archive = await PayrollArchive.findById(id)
      .populate('payCycleId', 'name code');

    if (!archive) {
      throw errors.notFound('PayrollArchive');
    }

    return archive;
  }

  // Get archive by payroll run ID
  static async getByPayrollRunId(payrollRunId: string) {
    const archive = await PayrollArchive.findOne({
      payrollRunId: new Types.ObjectId(payrollRunId),
    }).populate('payCycleId', 'name code');

    if (!archive) {
      throw errors.notFound('PayrollArchive');
    }

    return archive;
  }

  // Generate archive number
  static async generateArchiveNumber(payCycleCode: string): Promise<string> {
    const year = new Date().getFullYear();
    const month = String(new Date().getMonth() + 1).padStart(2, '0');
    const prefix = `ARC-${payCycleCode}-${year}${month}`;

    const lastArchive = await PayrollArchive.findOne({
      archiveNumber: { $regex: `^${prefix}` },
    })
      .sort({ archiveNumber: -1 })
      .select('archiveNumber');

    if (!lastArchive) {
      return `${prefix}-001`;
    }

    const lastNumber = parseInt(lastArchive.archiveNumber.split('-').pop() || '0');
    return `${prefix}-${String(lastNumber + 1).padStart(3, '0')}`;
  }

  // Create archive from finalized payroll run
  static async createFromPayrollRun(payrollRunId: string, userId: string) {
    const payrollRun = await PayrollRun.findById(payrollRunId)
      .populate('payCycleId');

    if (!payrollRun) {
      throw errors.notFound('PayrollRun');
    }

    if (payrollRun.status !== 'finalized') {
      throw errors.validation('Only finalized payroll runs can be archived');
    }

    // Check if already archived
    const existingArchive = await PayrollArchive.findOne({ payrollRunId });
    if (existingArchive) {
      throw errors.validation('Payroll run is already archived');
    }

    const payCycle = payrollRun.payCycleId as any;
    const archiveNumber = await this.generateArchiveNumber(payCycle.code);

    const employeeIds = payrollRun.employeePayrolls.map((emp: any) => emp.employeeId);
    const employeeDocs = await Employee.find({ _id: { $in: employeeIds } })
      .select('email phone')
      .lean();
    const employeeContactMap = new Map<string, { email?: string; phone?: string }>();
    employeeDocs.forEach((emp: any) => {
      employeeContactMap.set(emp._id.toString(), { email: emp.email, phone: emp.phone });
    });

    // Create employee snapshots
    const employeeSnapshots = payrollRun.employeePayrolls.map((emp: any) => ({
      employeeId: emp.employeeId,
      employeeCode: emp.employeeCode,
      employeeName: emp.employeeName,
      employeeEmail: employeeContactMap.get(emp.employeeId.toString())?.email,
      employeePhone: employeeContactMap.get(emp.employeeId.toString())?.phone,
      department: emp.department,
      designation: emp.designation,
      basicSalary: emp.basicSalary,
      totalDeductions: emp.totalDeductions,
      totalAdvanceDeductions: emp.totalAdvanceDeductions,
      earnings: emp.earnings,
      deductions: emp.deductions,
      advanceDeductions: emp.advanceDeductions,
      grossSalary: emp.grossSalary,
      netSalary: emp.netSalary,
      attendance: emp.attendance,
      proration: emp.proration,
      bankDetails: emp.bankDetails,
      currency: emp.currency || 'AED',
    }));

    const archive = new PayrollArchive({
      archiveNumber,
      payrollRunId: payrollRun._id,
      runNumber: payrollRun.runNumber,
      payCycleId: payrollRun.payCycleId,
      payCycleName: payCycle.name,
      periodStartDate: payrollRun.periodStartDate,
      periodEndDate: payrollRun.periodEndDate,
      paymentDate: payrollRun.paymentDate,
      summary: payrollRun.summary,
      employeeSnapshots,
      status: 'archived',
      archivedAt: new Date(),
      archivedBy: new Types.ObjectId(userId),
      createdBy: userId,
      updatedBy: userId,
    });

    await archive.save();

    // Update payroll run with archive reference
    if (!payrollRun.finalization) {
      payrollRun.finalization = { bankFileGenerated: false };
    }
    payrollRun.finalization.archiveId = archive._id;
    await payrollRun.save();

    return archive;
  }

  // Get employee payslip from archive
  static async getEmployeePayslip(archiveId: string, employeeId: string) {
    const archive = await this.getArchiveById(archiveId);

    const employeeSnapshot = archive.employeeSnapshots.find(
      (emp: any) => emp.employeeId.toString() === employeeId
    );

    if (!employeeSnapshot) {
      throw errors.notFound('Employee payslip');
    }

    return {
      archive: {
        archiveNumber: archive.archiveNumber,
        runNumber: archive.runNumber,
        payCycleName: archive.payCycleName,
        periodStartDate: archive.periodStartDate,
        periodEndDate: archive.periodEndDate,
        paymentDate: archive.paymentDate,
      },
      payslip: employeeSnapshot,
    };
  }

  // Get employee payslip history
  static async getEmployeePayslipHistory(employeeId: string, pagination: IPaginationQuery) {
    const { page, limit, skip } = parsePagination(pagination);

    const archives = await PayrollArchive.aggregate([
      { $unwind: '$employeeSnapshots' },
      { $match: { 'employeeSnapshots.employeeId': new Types.ObjectId(employeeId) } },
      { $sort: { periodEndDate: -1 } },
      { $skip: skip },
      { $limit: limit },
      {
        $project: {
          archiveNumber: 1,
          runNumber: 1,
          payCycleName: 1,
          periodStartDate: 1,
          periodEndDate: 1,
          paymentDate: 1,
          payslip: '$employeeSnapshots',
        },
      },
    ]);

    const total = await PayrollArchive.countDocuments({
      'employeeSnapshots.employeeId': new Types.ObjectId(employeeId),
    });

    return buildPaginatedResponse(archives, total, page, limit);
  }

  // Lock archive (prevent modifications)
  static async lockArchive(id: string, userId: string) {
    const archive = await this.getArchiveById(id);

    if (archive.status === 'locked') {
      throw errors.validation('Archive is already locked');
    }

    archive.status = 'locked';
    archive.lockedAt = new Date();
    archive.lockedBy = new Types.ObjectId(userId);
    archive.updatedBy = new Types.ObjectId(userId);

    await archive.save();

    return archive;
  }

  // Update files (after generating reports)
  static async updateFiles(id: string, files: any, userId: string) {
    const archive = await this.getArchiveById(id);

    if (archive.status === 'locked') {
      throw errors.validation('Cannot update locked archive');
    }

    archive.files = {
      ...archive.files,
      ...files,
    };
    archive.updatedBy = new Types.ObjectId(userId);

    await archive.save();

    return archive;
  }

  // Get archive statistics
  static async getStatistics() {
    const currentYear = new Date().getFullYear();

    const stats = await PayrollArchive.aggregate([
      {
        $facet: {
          totalArchives: [{ $count: 'count' }],
          byYear: [
            {
              $group: {
                _id: { $year: '$periodEndDate' },
                count: { $sum: 1 },
                totalNetPay: { $sum: '$summary.totalNetPay' },
              },
            },
            { $sort: { _id: -1 } },
            { $limit: 5 },
          ],
          currentYear: [
            {
              $match: {
                periodStartDate: { $gte: new Date(currentYear, 0, 1) },
              },
            },
            {
              $group: {
                _id: { month: { $month: '$periodEndDate' } },
                count: { $sum: 1 },
                totalNetPay: { $sum: '$summary.totalNetPay' },
              },
            },
            { $sort: { '_id.month': 1 } },
          ],
        },
      },
    ]);

    return {
      totalArchives: stats[0].totalArchives[0]?.count || 0,
      byYear: stats[0].byYear,
      currentYear: stats[0].currentYear,
    };
  }
}
