import { Types } from 'mongoose';
import Advance from '../models/Advance';
import Employee from '../models/Employee';
import { errors } from '../utils/errors';
import { parsePagination, buildPaginatedResponse, addDays } from '../utils/helpers';
import { IPaginationQuery } from '../types';
import { NumberingService } from './numbering.service';

export class AdvanceService {
  // Get all advances with pagination and filters
  static async getAdvances(query: any, pagination: IPaginationQuery) {
    const { page, limit, skip } = parsePagination(pagination);

    const filter: any = {};

    // Employee filter
    if (query.employeeId) {
      filter.employeeId = new Types.ObjectId(query.employeeId);
    }

    // Status filter
    if (query.status) {
      filter.status = query.status;
    }

    // Type filter
    if (query.advanceType) {
      filter.advanceType = query.advanceType;
    }

    // Date range filter
    if (query.fromDate || query.toDate) {
      filter.requestDate = {};
      if (query.fromDate) {
        filter.requestDate.$gte = new Date(query.fromDate);
      }
      if (query.toDate) {
        filter.requestDate.$lte = new Date(query.toDate);
      }
    }

    // Pending approval filter
    if (query.pendingApproval === 'true') {
      filter.status = 'pending';
    }

    // Search filter
    if (query.search) {
      filter.$or = [
        { advanceNumber: { $regex: query.search, $options: 'i' } },
        { employeeName: { $regex: query.search, $options: 'i' } },
        { employeeCode: { $regex: query.search, $options: 'i' } },
      ];
    }

    const [advances, total] = await Promise.all([
      Advance.find(filter)
        .populate('employeeId', 'fullName employeeCode employment.department')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Advance.countDocuments(filter),
    ]);

    return buildPaginatedResponse(advances, total, page, limit);
  }

  // Get advance by ID
  static async getAdvanceById(id: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw errors.validation('Invalid advance ID');
    }

    const advance = await Advance.findById(id)
      .populate('employeeId', 'fullName employeeCode email employment salaryInfo')
      .populate('approvalWorkflow.approverId', 'fullName email')
      .populate('disbursement.disbursedBy', 'fullName');

    if (!advance) {
      throw errors.notFound('Advance');
    }

    return advance;
  }

  // Get advances by employee
  static async getByEmployee(employeeId: string, includeCompleted: boolean = false) {
    const filter: any = {
      employeeId: new Types.ObjectId(employeeId),
    };

    if (!includeCompleted) {
      filter.status = { $nin: ['completed', 'cancelled', 'rejected'] };
    }

    const advances = await Advance.find(filter)
      .sort({ createdAt: -1 });

    return advances;
  }

  // Generate next advance number from numbering config
  static async generateAdvanceNumber(): Promise<string> {
    return NumberingService.getNextCode('advance');
  }

  // Create advance request
  static async createAdvance(data: any, userId: string) {
    // Validate employee
    const employee = await Employee.findById(data.employeeId);
    if (!employee) {
      throw errors.notFound('Employee');
    }

    if (employee.status !== 'active') {
      throw errors.validation('Cannot create advance for inactive employee');
    }

    // Check for existing pending/active advances
    const existingAdvance = await Advance.findOne({
      employeeId: data.employeeId,
      status: { $in: ['pending', 'approved', 'disbursed', 'repaying'] },
    });

    if (existingAdvance && data.advanceType !== 'emergency') {
      throw errors.validation('Employee already has an active advance. Complete or cancel it first.');
    }

    // Generate advance number
    data.advanceNumber = await this.generateAdvanceNumber();

    // Set employee details
    data.employeeCode = employee.employeeCode;
    data.employeeName = employee.fullName;

    // Initialize balances
    data.balances = {
      totalAmount: data.amount,
      paidAmount: 0,
      pendingAmount: data.amount,
    };

    // Generate repayment schedule if EMI
    if (data.repayment?.method === 'emi' && data.repayment.numberOfInstallments > 0) {
      data.repayment.schedule = this.generateRepaymentSchedule(
        data.amount,
        data.repayment.numberOfInstallments,
        data.repayment.startDate || addDays(new Date(), 30)
      );
    }

    data.requestedBy = userId;
    data.createdBy = userId;
    data.updatedBy = userId;

    const advance = new Advance(data);
    await advance.save();

    return advance;
  }

  // Generate repayment schedule
  private static generateRepaymentSchedule(
    amount: number,
    numberOfInstallments: number,
    startDate: Date
  ) {
    const installmentAmount = Math.round((amount / numberOfInstallments) * 100) / 100;
    const schedule = [];
    let remainingAmount = amount;
    let currentDate = new Date(startDate);

    for (let i = 1; i <= numberOfInstallments; i++) {
      const isLast = i === numberOfInstallments;
      const amount = isLast ? remainingAmount : installmentAmount;

      schedule.push({
        installmentNumber: i,
        dueDate: new Date(currentDate),
        amount,
        status: 'pending',
      });

      remainingAmount -= amount;
      // Move to next month
      currentDate = new Date(currentDate.setMonth(currentDate.getMonth() + 1));
    }

    return schedule;
  }

  // Approve advance
  static async approveAdvance(id: string, approvalData: any, userId: string) {
    const advance = await this.getAdvanceById(id);

    if (advance.status !== 'pending') {
      throw errors.validation('Only pending advances can be approved');
    }

    // Add approval to workflow
    advance.approvalWorkflow.push({
      level: advance.approvalWorkflow.length + 1,
      approverId: new Types.ObjectId(userId),
      approverName: approvalData.approverName,
      status: 'approved',
      comments: approvalData.comments,
      timestamp: new Date(),
    });

    advance.status = 'approved';
    advance.approvedBy = new Types.ObjectId(userId);
    advance.approvedAt = new Date();
    advance.updatedBy = new Types.ObjectId(userId);

    await advance.save();

    return advance;
  }

  // Reject advance
  static async rejectAdvance(id: string, rejectionData: any, userId: string) {
    const advance = await this.getAdvanceById(id);

    if (advance.status !== 'pending') {
      throw errors.validation('Only pending advances can be rejected');
    }

    // Add rejection to workflow
    advance.approvalWorkflow.push({
      level: advance.approvalWorkflow.length + 1,
      approverId: new Types.ObjectId(userId),
      approverName: rejectionData.approverName,
      status: 'rejected',
      comments: rejectionData.reason,
      timestamp: new Date(),
    });

    advance.status = 'rejected';
    advance.rejectionReason = rejectionData.reason;
    advance.updatedBy = new Types.ObjectId(userId);

    await advance.save();

    return advance;
  }

  // Disburse advance
  static async disburseAdvance(id: string, disbursementData: any, userId: string) {
    const advance = await this.getAdvanceById(id);

    if (advance.status !== 'approved') {
      throw errors.validation('Only approved advances can be disbursed');
    }

    advance.status = 'disbursed';
    advance.disbursement = {
      date: new Date(),
      disbursedAt: new Date(),
      disbursedBy: new Types.ObjectId(userId),
      method: (disbursementData.paymentMethod || 'bank_transfer') as 'bank_transfer' | 'cash' | 'cheque',
      reference: disbursementData.reference,
    };
    advance.updatedBy = new Types.ObjectId(userId);

    // If full repayment method, move to repaying status
    if (advance.repayment.method === 'full') {
      advance.status = 'repaying';
    } else {
      advance.status = 'repaying';
    }

    await advance.save();

    return advance;
  }

  // Record repayment (called during payroll processing)
  static async recordRepayment(
    advanceId: string,
    amount: number,
    payrollRunId: string,
    userId: string
  ) {
    const advance = await this.getAdvanceById(advanceId);

    if (!['disbursed', 'repaying'].includes(advance.status)) {
      throw errors.validation('Cannot record repayment for this advance');
    }

    // Update balances
    advance.balances.paidAmount += amount;
    advance.balances.pendingAmount -= amount;

    // Update schedule if EMI
    if (advance.repayment.method === 'emi') {
      const pendingInstallment = advance.repayment.schedule.find(
        (s: any) => s.status === 'pending'
      );
      if (pendingInstallment) {
        pendingInstallment.status = 'deducted';
        pendingInstallment.deductedAt = new Date();
        pendingInstallment.payrollRunId = new Types.ObjectId(payrollRunId);
      }
    }

    // Check if fully repaid
    if (advance.balances.pendingAmount <= 0) {
      advance.status = 'completed';
      advance.completedAt = new Date();
    }

    advance.updatedBy = new Types.ObjectId(userId);
    await advance.save();

    return advance;
  }

  // Get pending repayments for an employee
  static async getPendingRepayments(employeeId: string, periodEnd?: Date) {
    const advances = await Advance.find({
      employeeId: new Types.ObjectId(employeeId),
      status: { $in: ['disbursed', 'repaying'] },
      'balances.pendingAmount': { $gt: 0 },
    });

    const repayments = [];

    for (const advance of advances) {
      if (advance.repayment.method === 'full') {
        repayments.push({
          advanceId: advance._id,
          advanceNumber: advance.advanceNumber,
          amount: advance.balances.pendingAmount,
        });
      } else {
        // Find next pending installment
        const nextInstallment = advance.repayment.schedule.find(
          (s: any) => s.status === 'pending'
        );
        if (nextInstallment) {
          if (periodEnd && new Date(nextInstallment.dueDate) > periodEnd) {
            continue;
          }
          repayments.push({
            advanceId: advance._id,
            advanceNumber: advance.advanceNumber,
            amount: nextInstallment.amount,
            installmentNumber: nextInstallment.installmentNumber,
            dueDate: nextInstallment.dueDate,
          });
        }
      }
    }

    return repayments;
  }

  // Cancel advance
  static async cancelAdvance(id: string, reason: string, userId: string) {
    const advance = await this.getAdvanceById(id);

    if (['completed', 'cancelled'].includes(advance.status)) {
      throw errors.validation('Cannot cancel this advance');
    }

    if (['disbursed', 'repaying'].includes(advance.status) && advance.balances.paidAmount > 0) {
      throw errors.validation('Cannot cancel advance with repayments. Use write-off instead.');
    }

    advance.status = 'cancelled';
    advance.cancellationReason = reason;
    advance.updatedBy = new Types.ObjectId(userId);

    await advance.save();

    return advance;
  }

  // Get advance statistics
  static async getStatistics() {
    const stats = await Advance.aggregate([
      {
        $facet: {
          byStatus: [
            { $group: { _id: '$status', count: { $sum: 1 }, totalAmount: { $sum: '$amount' } } },
          ],
          pendingApproval: [
            { $match: { status: 'pending' } },
            { $count: 'count' },
          ],
          totalOutstanding: [
            { $match: { status: { $in: ['disbursed', 'repaying'] } } },
            { $group: { _id: null, total: { $sum: '$balances.pendingAmount' } } },
          ],
        },
      },
    ]);

    return {
      byStatus: stats[0].byStatus,
      pendingApproval: stats[0].pendingApproval[0]?.count || 0,
      totalOutstanding: stats[0].totalOutstanding[0]?.total || 0,
    };
  }
}
