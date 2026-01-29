import mongoose, { Schema } from 'mongoose';
import { IAdvance } from '../types';

const advanceSchema = new Schema<IAdvance>(
  {
    advanceNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    employeeId: {
      type: Schema.Types.ObjectId,
      ref: 'Employee',
      required: true,
      index: true,
    },
    employeeCode: {
      type: String,
      required: true,
      index: true,
    },
    employeeName: {
      type: String,
      required: true,
    },
    // Advance Details
    advanceType: {
      type: String,
      required: true,
      enum: ['salary_advance', 'loan', 'emergency'],
      index: true,
    },
    requestDate: {
      type: Date,
      required: true,
      default: Date.now,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    currency: {
      type: String,
      default: 'AED',
    },
    reason: {
      type: String,
      required: true,
    },
    // Repayment Configuration
    repayment: {
      method: {
        type: String,
        enum: ['full', 'emi'],
        default: 'emi',
      },
      numberOfInstallments: {
        type: Number,
        default: 1,
        min: 1,
      },
      installmentAmount: {
        type: Number,
        default: 0,
      },
      startFromPayCycle: {
        type: Date,
      },
      endByPayCycle: Date,
      schedule: [{
        installmentNumber: {
          type: Number,
          required: true,
        },
        dueDate: {
          type: Date,
          required: true,
        },
        amount: {
          type: Number,
          required: true,
        },
        status: {
          type: String,
          enum: ['pending', 'deducted', 'skipped'],
          default: 'pending',
        },
        payrollRunId: {
          type: Schema.Types.ObjectId,
          ref: 'PayrollRun',
        },
        deductedAt: Date,
        notes: String,
      }],
    },
    // Balances
    balances: {
      totalAmount: {
        type: Number,
        default: 0,
      },
      paidAmount: {
        type: Number,
        default: 0,
      },
      pendingAmount: {
        type: Number,
        default: 0,
      },
      writeOffAmount: {
        type: Number,
        default: 0,
      },
    },
    // Status
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected', 'disbursed', 'repaying', 'completed', 'cancelled'],
      default: 'pending',
      index: true,
    },
    // Approval Workflow
    approvalWorkflow: [{
      level: {
        type: Number,
        required: true,
      },
      approverId: {
        type: Schema.Types.ObjectId,
        ref: 'User',
      },
      approverName: String,
      status: {
        type: String,
        enum: ['pending', 'approved', 'rejected'],
        default: 'pending',
      },
      comments: String,
      timestamp: Date,
    }],
    // Approval tracking
    approvedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    approvedAt: Date,
    rejectedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    rejectedAt: Date,
    rejectionReason: String,
    // Disbursement
    disbursement: {
      date: Date,
      method: {
        type: String,
        enum: ['bank_transfer', 'cash', 'cheque'],
      },
      reference: String,
      disbursedBy: {
        type: Schema.Types.ObjectId,
        ref: 'User',
      },
    },
    // Attachments
    attachments: [{
      name: String,
      url: String,
      uploadedAt: {
        type: Date,
        default: Date.now,
      },
    }],
    // Audit
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
advanceSchema.index({ employeeId: 1, status: 1 });
advanceSchema.index({ 'repayment.schedule.status': 1 });
advanceSchema.index({ createdAt: -1 });

// Pre-save middleware to calculate balances
advanceSchema.pre('save', function(next) {
  if (this.isModified('amount') || this.isModified('repayment.schedule')) {
    this.balances.totalAmount = this.amount;

    // Calculate paid amount from schedule
    const paidAmount = this.repayment.schedule
      .filter(s => s.status === 'deducted')
      .reduce((sum, s) => sum + s.amount, 0);

    this.balances.paidAmount = paidAmount;
    this.balances.pendingAmount = this.amount - paidAmount - this.balances.writeOffAmount;
  }
  next();
});

const Advance = mongoose.model<IAdvance>('Advance', advanceSchema);

export default Advance;
