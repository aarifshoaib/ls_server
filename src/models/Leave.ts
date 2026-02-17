import mongoose, { Schema } from 'mongoose';
import { ILeave, ILeaveApproval } from '../types';

const leaveApprovalSchema = new Schema<ILeaveApproval>(
  {
    level: {
      type: Number,
      required: true,
    },
    approverId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    approverName: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
    },
    comments: String,
    timestamp: Date,
  },
  { _id: false }
);

const leaveSchema = new Schema<ILeave>(
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
    leaveType: {
      type: String,
      enum: ['annual', 'sick', 'casual', 'unpaid', 'maternity', 'paternity', 'emergency', 'other'],
      required: true,
      index: true,
    },
    startDate: {
      type: Date,
      required: true,
      index: true,
    },
    endDate: {
      type: Date,
      required: true,
      index: true,
    },
    totalDays: {
      type: Number,
      required: true,
    },
    halfDay: {
      type: Boolean,
      default: false,
    },
    reason: {
      type: String,
      required: true,
    },
    contactNumber: String,
    emergencyContact: {
      name: String,
      phone: String,
    },
    attachments: [
      {
        url: String,
        filename: String,
        uploadedAt: Date,
      },
    ],
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected', 'cancelled'],
      default: 'pending',
      index: true,
    },
    currentApprovalLevel: {
      type: Number,
      default: 1,
    },
    approvalWorkflow: [leaveApprovalSchema],
    finalApproverId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    finalApprovalDate: Date,
    rejectionReason: String,
    cancelledBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    cancelledAt: Date,
    cancellationReason: String,
    // Payroll Impact
    isPaidLeave: {
      type: Boolean,
      default: true,
    },
    // Payroll Processing
    payrollStatus: {
      type: String,
      enum: ['pending', 'processed', 'locked'],
      default: 'pending',
      index: true,
    },
    payrollRunId: {
      type: Schema.Types.ObjectId,
      ref: 'PayrollRun',
    },
    payrollProcessedAt: Date,
    // Amount impact
    payrollImpact: {
      deductionAmount: {
        type: Number,
        default: 0,
      },
      deductionDays: {
        type: Number,
        default: 0,
      },
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
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
leaveSchema.index({ userId: 1, startDate: -1 });
leaveSchema.index({ employeeId: 1, status: 1 });
leaveSchema.index({ leaveType: 1, status: 1 });
leaveSchema.index({ status: 1, currentApprovalLevel: 1 });
leaveSchema.index({ createdAt: -1 });

// Virtual for leave duration description
leaveSchema.virtual('durationDescription').get(function () {
  if (this.halfDay) {
    return '0.5 day';
  }
  return this.totalDays === 1 ? '1 day' : `${this.totalDays} days`;
});

const Leave = mongoose.model<ILeave>('Leave', leaveSchema);

export default Leave;
