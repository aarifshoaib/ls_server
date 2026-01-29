import { Types } from 'mongoose';
import Leave from '../models/Leave';
import LeaveBalance from '../models/LeaveBalance';
import ApprovalConfig from '../models/ApprovalConfig';
import User from '../models/User';
import Attendance from '../models/Attendance';
import { errors } from '../utils/errors';
import { parsePagination, buildPaginatedResponse } from '../utils/helpers';
import { IPaginationQuery, ILeaveApproval } from '../types';

export class LeaveService {
  // Create leave request
  static async createLeave(data: any, userId: string) {
    const user = await User.findById(userId);
    if (!user) {
      throw errors.notFound('User');
    }

    // Calculate total days
    const startDate = new Date(data.startDate);
    const endDate = new Date(data.endDate);
    const diffTime = Math.abs(endDate.getTime() - startDate.getTime());
    const totalDays = data.halfDay ? 0.5 : Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;

    // Check leave balance
    const year = startDate.getFullYear();
    const balance = await LeaveBalance.findOne({
      userId: new Types.ObjectId(userId),
      year,
    });

    if (balance && data.leaveType !== 'unpaid') {
      const leaveTypeBalance = (balance as any)[data.leaveType];
      if (leaveTypeBalance && leaveTypeBalance.available < totalDays) {
        throw errors.validation(
          `Insufficient ${data.leaveType} leave balance. Available: ${leaveTypeBalance.available} days`
        );
      }
    }

    // Get approval workflow configuration
    const approvalConfig = await ApprovalConfig.findOne({
      type: 'leave',
      isActive: true,
    });

    let approvalWorkflow: ILeaveApproval[] = [];
    if (approvalConfig) {
      approvalWorkflow = await this.buildApprovalWorkflow(approvalConfig, user);
    }

    // Create leave request
    const leave = new Leave({
      userId: new Types.ObjectId(userId),
      employeeId: user.employeeId,
      leaveType: data.leaveType,
      startDate,
      endDate,
      totalDays,
      halfDay: data.halfDay || false,
      reason: data.reason,
      contactNumber: data.contactNumber,
      emergencyContact: data.emergencyContact,
      attachments: data.attachments || [],
      status: 'pending',
      currentApprovalLevel: 1,
      approvalWorkflow,
      createdBy: new Types.ObjectId(userId),
    });

    await leave.save();

    // Update pending count in balance
    if (balance && data.leaveType !== 'unpaid') {
      balance.updatePendingCount(data.leaveType, totalDays, 'add');
      await balance.save();
    }

    return leave;
  }

  // Build approval workflow based on config
  static async buildApprovalWorkflow(config: any, _user: any): Promise<ILeaveApproval[]> {
    const workflow: ILeaveApproval[] = [];

    for (const level of config.levels) {
      // Determine approvers based on role or specific IDs
      let approverIds: Types.ObjectId[] = [];

      if (level.approverRole) {
        // Find users with this role
        const approvers = await User.find({
          role: level.approverRole,
          status: 'active',
        }).limit(level.minimumApprovals);

        approverIds = approvers.map((a) => a._id);
      } else if (level.approverIds && level.approverIds.length > 0) {
        approverIds = level.approverIds;
      }

      // Add approval records for each approver
      for (const approverId of approverIds) {
        const approver = await User.findById(approverId);
        if (approver) {
          workflow.push({
            level: level.level,
            approverId: approver._id,
            approverName: approver.fullName,
            status: 'pending',
          });
        }
      }
    }

    return workflow;
  }

  // Get leave requests with pagination
  static async getLeaves(query: any, pagination: IPaginationQuery) {
    const { page, limit, skip } = parsePagination(pagination);

    const filter: any = {};

    if (query.userId) {
      filter.userId = new Types.ObjectId(query.userId);
    }

    if (query.employeeId) {
      filter.employeeId = query.employeeId;
    }

    if (query.leaveType) {
      filter.leaveType = query.leaveType;
    }

    if (query.status) {
      filter.status = query.status;
    }

    if (query.dateFrom || query.dateTo) {
      filter.startDate = {};
      if (query.dateFrom) {
        filter.startDate.$gte = new Date(query.dateFrom);
      }
      if (query.dateTo) {
        filter.startDate.$lte = new Date(query.dateTo);
      }
    }

    // Filter for pending approvals by specific approver
    if (query.approverId) {
      filter['approvalWorkflow'] = {
        $elemMatch: {
          approverId: new Types.ObjectId(query.approverId),
          status: 'pending',
        },
      };
      filter.status = 'pending';
    }

    const [leaves, total] = await Promise.all([
      Leave.find(filter)
        .populate('userId', 'employeeId firstName lastName fullName')
        .populate('finalApproverId', 'firstName lastName fullName')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Leave.countDocuments(filter),
    ]);

    return buildPaginatedResponse(leaves, total, page, limit);
  }

  // Get leave by ID
  static async getLeaveById(id: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw errors.validation('Invalid leave ID');
    }

    const leave = await Leave.findById(id)
      .populate('userId', 'employeeId firstName lastName fullName email phone')
      .populate('finalApproverId', 'firstName lastName fullName')
      .populate('cancelledBy', 'firstName lastName fullName')
      .populate('approvalWorkflow.approverId', 'firstName lastName fullName');

    if (!leave) {
      throw errors.notFound('Leave request');
    }

    return leave;
  }

  // Approve/Reject leave
  static async processLeaveApproval(
    leaveId: string,
    approverId: string,
    action: 'approve' | 'reject',
    comments?: string
  ) {
    const leave = await this.getLeaveById(leaveId);

    if (leave.status !== 'pending') {
      throw errors.validation(`Leave is already ${leave.status}`);
    }

    // Find approver's record in workflow
    const approverIndex = leave.approvalWorkflow.findIndex(
      (a) => a.approverId.toString() === approverId && a.status === 'pending'
    );

    if (approverIndex === -1) {
      throw errors.forbidden('approve/reject this leave request');
    }

    // Update approval record
    leave.approvalWorkflow[approverIndex].status = action === 'approve' ? 'approved' : 'rejected';
    leave.approvalWorkflow[approverIndex].comments = comments;
    leave.approvalWorkflow[approverIndex].timestamp = new Date();

    if (action === 'reject') {
      // Reject the entire leave
      leave.status = 'rejected';
      leave.rejectionReason = comments;
      leave.finalApproverId = new Types.ObjectId(approverId);
      leave.finalApprovalDate = new Date();

      // Remove from pending count
      const balance = await LeaveBalance.findOne({
        userId: leave.userId,
        year: leave.startDate.getFullYear(),
      });

      if (balance && leave.leaveType !== 'unpaid') {
        balance.updatePendingCount(leave.leaveType, leave.totalDays, 'remove');
        await balance.save();
      }
    } else {
      // Check if all approvals at current level are complete
      const currentLevelApprovals = leave.approvalWorkflow.filter(
        (a) => a.level === leave.currentApprovalLevel
      );
      const allApproved = currentLevelApprovals.every((a) => a.status === 'approved');

      if (allApproved) {
        // Move to next level or approve
        const nextLevel = leave.currentApprovalLevel + 1;
        const hasNextLevel = leave.approvalWorkflow.some((a) => a.level === nextLevel);

        if (hasNextLevel) {
          leave.currentApprovalLevel = nextLevel;
        } else {
          // Final approval
          leave.status = 'approved';
          leave.finalApproverId = new Types.ObjectId(approverId);
          leave.finalApprovalDate = new Date();

          // Update leave balance
          await this.updateLeaveBalance(leave, 'approve');

          // Create attendance records for leave days
          await this.createAttendanceForLeave(leave);
        }
      }
    }

    await leave.save();

    return leave;
  }

  // Update leave balance
  static async updateLeaveBalance(leave: any, action: 'approve' | 'cancel') {
    const balance = await LeaveBalance.findOne({
      userId: leave.userId,
      year: leave.startDate.getFullYear(),
    });

    if (!balance || leave.leaveType === 'unpaid') {
      return;
    }

    // Remove from pending
    balance.updatePendingCount(leave.leaveType, leave.totalDays, 'remove');

    if (action === 'approve') {
      // Deduct from available
      balance.updateBalance(leave.leaveType, leave.totalDays, 'deduct');
    }

    await balance.save();
  }

  // Create attendance records for approved leave
  static async createAttendanceForLeave(leave: any) {
    const startDate = new Date(leave.startDate);
    const endDate = new Date(leave.endDate);
    const records = [];

    for (let date = new Date(startDate); date <= endDate; date.setDate(date.getDate() + 1)) {
      const attendanceDate = new Date(date);
      attendanceDate.setHours(0, 0, 0, 0);

      // Check if attendance already exists
      const existing = await Attendance.findOne({
        userId: leave.userId,
        date: attendanceDate,
      });

      if (!existing) {
        records.push({
          userId: leave.userId,
          employeeId: leave.employeeId,
          date: attendanceDate,
          clockIn: {
            time: attendanceDate,
          },
          status: 'leave',
          notes: `${leave.leaveType} leave approved`,
        });
      }
    }

    if (records.length > 0) {
      await Attendance.insertMany(records);
    }
  }

  // Cancel leave
  static async cancelLeave(leaveId: string, userId: string, reason: string) {
    const leave = await this.getLeaveById(leaveId);

    if (leave.userId.toString() !== userId) {
      throw errors.forbidden('cancel this leave request');
    }

    if (leave.status === 'cancelled') {
      throw errors.validation('Leave is already cancelled');
    }

    if (leave.status === 'approved') {
      // Restore balance
      await this.updateLeaveBalance(leave, 'cancel');

      // Remove attendance records
      await Attendance.deleteMany({
        userId: leave.userId,
        date: { $gte: leave.startDate, $lte: leave.endDate },
        status: 'leave',
      });
    }

    leave.status = 'cancelled';
    leave.cancelledBy = new Types.ObjectId(userId);
    leave.cancelledAt = new Date();
    leave.cancellationReason = reason;

    await leave.save();

    return leave;
  }

  // Get leave balance
  static async getLeaveBalance(userId: string, year?: number) {
    const targetYear = year || new Date().getFullYear();

    let balance = await LeaveBalance.findOne({
      userId: new Types.ObjectId(userId),
      year: targetYear,
    });

    // Create balance if not exists
    if (!balance) {
      balance = await this.initializeLeaveBalance(userId, targetYear);
    }

    return balance;
  }

  // Initialize leave balance for a user
  static async initializeLeaveBalance(userId: string, year: number) {
    const user = await User.findById(userId);
    if (!user) {
      throw errors.notFound('User');
    }

    const balance = new LeaveBalance({
      userId: new Types.ObjectId(userId),
      employeeId: user.employeeId,
      year,
      annual: { allocated: 30, used: 0, pending: 0, available: 30, carriedForward: 0 },
      sick: { allocated: 15, used: 0, pending: 0, available: 15, carriedForward: 0 },
      casual: { allocated: 7, used: 0, pending: 0, available: 7, carriedForward: 0 },
      unpaid: { allocated: 0, used: 0, pending: 0, available: 0, carriedForward: 0 },
    });

    await balance.save();

    return balance;
  }

  // Update leave balance (admin)
  static async updateLeaveBalanceAdmin(balanceId: string, data: any, userId: string) {
    if (!Types.ObjectId.isValid(balanceId)) {
      throw errors.validation('Invalid balance ID');
    }

    const balance = await LeaveBalance.findById(balanceId);
    if (!balance) {
      throw errors.notFound('Leave balance');
    }

    // Update balance for each leave type
    const leaveTypes = ['annual', 'sick', 'casual', 'unpaid', 'maternity', 'paternity'];

    for (const type of leaveTypes) {
      if (data[type]) {
        (balance as any)[type] = {
          ...(balance as any)[type],
          ...data[type],
        };

        // Recalculate available
        const typeBalance = (balance as any)[type];
        typeBalance.available =
          typeBalance.allocated + typeBalance.carriedForward - typeBalance.used;
      }
    }

    balance.updatedBy = new Types.ObjectId(userId);
    balance.lastUpdated = new Date();

    await balance.save();

    return balance;
  }
}
