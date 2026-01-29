import mongoose, { Schema } from 'mongoose';
import { IAdhocEarningDeduction } from '../types';

const adhocEarningDeductionSchema = new Schema<IAdhocEarningDeduction>(
  {
    // Reference Number
    referenceNumber: {
      type: String,
      unique: true,
      trim: true,
      index: true,
    },
    // Employee Reference
    employeeId: {
      type: Schema.Types.ObjectId,
      ref: 'Employee',
      required: true,
      index: true,
    },
    employeeCode: {
      type: String,
      required: true,
    },
    employeeName: {
      type: String,
      required: true,
    },
    // Type
    type: {
      type: String,
      required: true,
      enum: ['earning', 'deduction'],
      index: true,
    },
    // Category for classification
    category: {
      type: String,
      required: true,
      enum: [
        'bonus',
        'incentive',
        'commission',
        'overtime_adjustment',
        'arrears',
        'reimbursement',
        'allowance_adjustment',
        'fine',
        'penalty',
        'loan_recovery',
        'damage_deduction',
        'advance_adjustment',
        'tax_adjustment',
        'other'
      ],
    },
    // Description
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    // Amount
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    currency: {
      type: String,
      default: 'AED',
    },
    // Payroll Period - Which month/period this applies to
    payrollPeriod: {
      month: {
        type: Number,
        required: true,
        min: 1,
        max: 12,
      },
      year: {
        type: Number,
        required: true,
      },
    },
    // Associated payroll run (set when processed)
    payrollRunId: {
      type: Schema.Types.ObjectId,
      ref: 'PayrollRun',
      index: true,
    },
    // Processed timestamp
    processedAt: {
      type: Date,
    },
    // Status
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected', 'processed', 'cancelled'],
      default: 'pending',
      index: true,
    },
    // Approval
    approval: {
      requiredLevel: {
        type: Number,
        default: 1,
      },
      currentLevel: {
        type: Number,
        default: 0,
      },
      history: [{
        level: Number,
        approverId: {
          type: Schema.Types.ObjectId,
          ref: 'User',
        },
        approverName: String,
        action: {
          type: String,
          enum: ['approved', 'rejected'],
        },
        comments: String,
        timestamp: {
          type: Date,
          default: Date.now,
        },
      }],
    },
    // Affects Payroll Calculations
    payrollBehavior: {
      affectsGrossSalary: {
        type: Boolean,
        default: true,
      },
      affectsTaxableIncome: {
        type: Boolean,
        default: true,
      },
      showInPayslip: {
        type: Boolean,
        default: true,
      },
      payslipLabel: String,
    },
    // Supporting Documents
    attachments: [{
      fileName: String,
      fileUrl: String,
      fileType: String,
      uploadedAt: {
        type: Date,
        default: Date.now,
      },
    }],
    // Notes
    notes: String,
    internalNotes: String,
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

// Generate reference number before saving
adhocEarningDeductionSchema.pre('save', async function (next) {
  if (!this.referenceNumber) {
    const typePrefix = this.type === 'earning' ? 'AE' : 'AD';
    const year = this.payrollPeriod.year;
    const month = String(this.payrollPeriod.month).padStart(2, '0');

    // Count existing adhoc items for this period
    const count = await mongoose.model('AdhocEarningDeduction').countDocuments({
      'payrollPeriod.year': year,
      'payrollPeriod.month': this.payrollPeriod.month,
    });

    this.referenceNumber = `${typePrefix}-${year}${month}-${String(count + 1).padStart(4, '0')}`;
  }
  next();
});

// Indexes
adhocEarningDeductionSchema.index({ employeeId: 1, 'payrollPeriod.year': 1, 'payrollPeriod.month': 1 });
adhocEarningDeductionSchema.index({ 'payrollPeriod.year': 1, 'payrollPeriod.month': 1, status: 1 });
adhocEarningDeductionSchema.index({ createdAt: -1 });

const AdhocEarningDeduction = mongoose.model<IAdhocEarningDeduction>('AdhocEarningDeduction', adhocEarningDeductionSchema);

export default AdhocEarningDeduction;
