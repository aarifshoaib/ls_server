import mongoose, { Schema } from 'mongoose';
import { IPayrollArchive } from '../types';

const payrollArchiveSchema = new Schema<IPayrollArchive>(
  {
    archiveNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    // Source Information
    payrollRunId: {
      type: Schema.Types.ObjectId,
      ref: 'PayrollRun',
      required: true,
      unique: true,
      index: true,
    },
    runNumber: {
      type: String,
      required: true,
    },
    // Period
    payCycleId: {
      type: Schema.Types.ObjectId,
      ref: 'PayCycle',
      required: true,
    },
    payCycleName: {
      type: String,
      required: true,
    },
    periodStartDate: {
      type: Date,
      required: true,
      index: true,
    },
    periodEndDate: {
      type: Date,
      required: true,
      index: true,
    },
    paymentDate: {
      type: Date,
      required: true,
    },
    // Summary (snapshot)
    summary: {
      totalEmployees: {
        type: Number,
        default: 0,
      },
      totalGrossEarnings: {
        type: Number,
        default: 0,
      },
      totalDeductions: {
        type: Number,
        default: 0,
      },
      totalNetPay: {
        type: Number,
        default: 0,
      },
      currency: {
        type: String,
        default: 'AED',
      },
    },
    // Complete Employee Data (frozen snapshot)
    employeeSnapshots: [{
      employeeId: {
        type: Schema.Types.ObjectId,
        ref: 'Employee',
        required: true,
      },
      employeeCode: {
        type: String,
        required: true,
      },
      employeeName: {
        type: String,
        required: true,
      },
      employeeEmail: String,
      employeePhone: String,
      department: String,
      designation: String,
      basicSalary: {
        type: Number,
        default: 0,
      },
      totalDeductions: {
        type: Number,
        default: 0,
      },
      totalAdvanceDeductions: {
        type: Number,
        default: 0,
      },
      // Complete attendance data
      attendance: {
        type: Schema.Types.Mixed,
      },
      // Complete earnings breakdown
      earnings: [{
        componentCode: String,
        componentName: String,
        amount: Number,
      }],
      // Complete deductions breakdown
      deductions: [{
        componentCode: String,
        componentName: String,
        amount: Number,
      }],
      // Advance deductions
      advanceDeductions: [{
        advanceNumber: String,
        amount: Number,
      }],
      grossSalary: {
        type: Number,
        default: 0,
      },
      netSalary: {
        type: Number,
        default: 0,
      },
      // Bank details at time of payment
      bankDetails: {
        bankName: String,
        accountNumber: String,
        accountHolderName: String,
        iban: String,
      },
      // Proration info
      proration: {
        isProrated: Boolean,
        reason: String,
        prorationFactor: Number,
      },
      // Payslip PDF
      payslipUrl: String,
      payslipGeneratedAt: Date,
    }],
    // Files
    files: {
      summaryReportUrl: String,
      bankFileUrl: String,
      payslipsZipUrl: String,
    },
    // Archive Status
    status: {
      type: String,
      enum: ['archived', 'locked'],
      default: 'archived',
    },
    // Audit
    archivedAt: {
      type: Date,
      default: Date.now,
    },
    archivedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    lockedAt: Date,
    lockedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    // Audit fields
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
payrollArchiveSchema.index({ periodStartDate: 1, periodEndDate: 1 });
payrollArchiveSchema.index({ 'employeeSnapshots.employeeId': 1 });
payrollArchiveSchema.index({ archivedAt: -1 });

const PayrollArchive = mongoose.model<IPayrollArchive>('PayrollArchive', payrollArchiveSchema);

export default PayrollArchive;
