import mongoose, { Schema } from 'mongoose';
import { ILeaveBalance, ILeaveBalanceByType } from '../types';

const leaveBalanceByTypeSchema = new Schema<ILeaveBalanceByType>(
  {
    allocated: {
      type: Number,
      required: true,
      default: 0,
    },
    used: {
      type: Number,
      default: 0,
    },
    pending: {
      type: Number,
      default: 0,
    },
    available: {
      type: Number,
      required: true,
      default: 0,
    },
    carriedForward: {
      type: Number,
      default: 0,
    },
  },
  { _id: false }
);

const leaveBalanceSchema = new Schema<ILeaveBalance>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    employeeId: {
      type: String,
      required: true,
      index: true,
    },
    year: {
      type: Number,
      required: true,
      index: true,
    },
    annual: {
      type: leaveBalanceByTypeSchema,
      required: true,
      default: {},
    },
    sick: {
      type: leaveBalanceByTypeSchema,
      required: true,
      default: {},
    },
    casual: {
      type: leaveBalanceByTypeSchema,
      required: true,
      default: {},
    },
    unpaid: {
      type: leaveBalanceByTypeSchema,
      required: true,
      default: {},
    },
    maternity: {
      type: leaveBalanceByTypeSchema,
      default: {},
    },
    paternity: {
      type: leaveBalanceByTypeSchema,
      default: {},
    },
    emergency: {
      type: leaveBalanceByTypeSchema,
      default: {},
    },
    other: {
      type: leaveBalanceByTypeSchema,
      default: {},
    },
    lastUpdated: {
      type: Date,
      default: Date.now,
    },
    updatedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
leaveBalanceSchema.index({ userId: 1, year: 1 }, { unique: true });
leaveBalanceSchema.index({ employeeId: 1, year: -1 });
leaveBalanceSchema.index({ year: -1 });

// Method to update balance after leave approval/rejection
leaveBalanceSchema.methods.updateBalance = function (
  leaveType: string,
  days: number,
  operation: 'deduct' | 'add'
) {
  const balance = (this as any)[leaveType] as ILeaveBalanceByType;
  if (!balance) return;

  if (operation === 'deduct') {
    balance.used += days;
    balance.available = balance.allocated + balance.carriedForward - balance.used;
  } else {
    balance.used = Math.max(0, balance.used - days);
    balance.available = balance.allocated + balance.carriedForward - balance.used;
  }

  this.lastUpdated = new Date();
};

// Method to update pending count
leaveBalanceSchema.methods.updatePendingCount = function (
  leaveType: string,
  days: number,
  operation: 'add' | 'remove'
) {
  const balance = (this as any)[leaveType] as ILeaveBalanceByType;
  if (!balance) return;

  if (operation === 'add') {
    balance.pending += days;
  } else {
    balance.pending = Math.max(0, balance.pending - days);
  }

  this.lastUpdated = new Date();
};

const LeaveBalance = mongoose.model<ILeaveBalance>('LeaveBalance', leaveBalanceSchema);

export default LeaveBalance;
