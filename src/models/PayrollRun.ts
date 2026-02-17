import mongoose, { Schema } from 'mongoose';
import { IPayrollRun } from '../types';

const payrollRunSchema = new Schema<IPayrollRun>(
  {
    runNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    // Period Information
    payCycleId: {
      type: Schema.Types.ObjectId,
      ref: 'PayCycle',
      required: true,
      index: true,
    },
    payCycleName: {
      type: String,
      required: true,
    },
    // Pay Month in MMYYYY format (from PayCycle master)
    payMonth: {
      type: String,
      index: true,
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
    // Number of days in the period
    periodDays: {
      type: Number,
    },
    paymentDate: {
      type: Date,
    },
    // Processing Status
    status: {
      type: String,
      enum: ['draft', 'processing', 'calculated', 'pending_approval', 'approved', 'finalized', 'paid', 'cancelled'],
      default: 'draft',
      index: true,
    },
    // Summary Totals
    summary: {
      totalEmployees: {
        type: Number,
        default: 0,
      },
      processedEmployees: {
        type: Number,
        default: 0,
      },
      errorEmployees: {
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
      totalTax: {
        type: Number,
        default: 0,
      },
      totalOvertimePay: {
        type: Number,
        default: 0,
      },
      totalAdvanceDeductions: {
        type: Number,
        default: 0,
      },
      currency: {
        type: String,
        default: 'AED',
      },
    },
    // Employee Payroll Details
    employeePayrolls: [{
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
      department: String,
      designation: String,
      // Attendance Summary
      attendance: {
        totalWorkingDays: {
          type: Number,
          default: 0,
        },
        daysWorked: {
          type: Number,
          default: 0,
        },
        daysAbsent: {
          type: Number,
          default: 0,
        },
        paidLeaveDays: {
          type: Number,
          default: 0,
        },
        unpaidLeaveDays: {
          type: Number,
          default: 0,
        },
        holidays: {
          type: Number,
          default: 0,
        },
        weekends: {
          type: Number,
          default: 0,
        },
        // Overtime
        ot1Hours: {
          type: Number,
          default: 0,
        },
        ot1Rate: {
          type: Number,
          default: 0,
        },
        ot1Amount: {
          type: Number,
          default: 0,
        },
        ot2Hours: {
          type: Number,
          default: 0,
        },
        ot2Rate: {
          type: Number,
          default: 0,
        },
        ot2Amount: {
          type: Number,
          default: 0,
        },
        totalOvertimeAmount: {
          type: Number,
          default: 0,
        },
        // Late arrivals
        lateArrivals: {
          type: Number,
          default: 0,
        },
        lateDeductionAmount: {
          type: Number,
          default: 0,
        },
      },
      // Earnings Breakdown
      earnings: [{
        componentId: {
          type: Schema.Types.ObjectId,
          ref: 'EarningDeduction',
        },
        componentCode: String,
        componentName: String,
        amount: {
          type: Number,
          default: 0,
        },
        isProrated: {
          type: Boolean,
          default: false,
        },
        proratedDays: Number,
        fullAmount: Number,
      }],
      totalEarnings: {
        type: Number,
        default: 0,
      },
      // Deductions Breakdown
      deductions: [{
        componentId: {
          type: Schema.Types.ObjectId,
          ref: 'EarningDeduction',
        },
        componentCode: String,
        componentName: String,
        amount: {
          type: Number,
          default: 0,
        },
      }],
      totalDeductions: {
        type: Number,
        default: 0,
      },
      // Advance Deductions
      advanceDeductions: [{
        advanceId: {
          type: Schema.Types.ObjectId,
          ref: 'Advance',
        },
        advanceNumber: String,
        installmentNumber: Number,
        amount: {
          type: Number,
          default: 0,
        },
      }],
      totalAdvanceDeductions: {
        type: Number,
        default: 0,
      },
      // Final Amounts
      grossSalary: {
        type: Number,
        default: 0,
      },
      netSalary: {
        type: Number,
        default: 0,
      },
      // Bank Details (snapshot)
      bankDetails: {
        bankName: String,
        accountNumber: String,
        accountHolderName: String,
        iban: String,
      },
      // Status
      status: {
        type: String,
        enum: ['pending', 'calculated', 'error', 'finalized'],
        default: 'pending',
      },
      errorMessage: String,
      // Proration Info
      proration: {
        isProrated: {
          type: Boolean,
          default: false,
        },
        reason: {
          type: String,
          enum: ['new_joinee', 'termination', 'mid_month_change'],
        },
        effectiveDays: Number,
        totalDays: Number,
        prorationFactor: Number,
      },
    }],
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
    // Processing Log
    processingLog: [{
      action: {
        type: String,
        required: true,
      },
      timestamp: {
        type: Date,
        default: Date.now,
      },
      performedBy: {
        type: Schema.Types.ObjectId,
        ref: 'User',
      },
      details: String,
    }],
    // Finalization
    finalization: {
      finalizedAt: Date,
      finalizedBy: {
        type: Schema.Types.ObjectId,
        ref: 'User',
      },
      archiveId: {
        type: Schema.Types.ObjectId,
        ref: 'PayrollArchive',
      },
      bankFileGenerated: {
        type: Boolean,
        default: false,
      },
      bankFileName: String,
      bankFileUrl: String,
    },
    // Rerun History (for tracking recalculations)
    rerunHistory: [{
      rerunAt: {
        type: Date,
        required: true,
      },
      rerunBy: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true,
      },
      previousSummary: {
        totalEmployees: Number,
        totalGrossEarnings: Number,
        totalDeductions: Number,
        totalNetPay: Number,
        totalOvertimePay: Number,
        totalAdvanceDeductions: Number,
      },
      changes: {
        employeeCountChange: Number,
        grossEarningsChange: Number,
        deductionsChange: Number,
        netPayChange: Number,
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
payrollRunSchema.index({ payCycleId: 1, periodStartDate: 1, periodEndDate: 1 });
payrollRunSchema.index({ 'employeePayrolls.employeeId': 1 });
payrollRunSchema.index({ createdAt: -1 });

const PayrollRun = mongoose.model<IPayrollRun>('PayrollRun', payrollRunSchema);

export default PayrollRun;
