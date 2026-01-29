import mongoose, { Schema } from 'mongoose';
import { IEarningDeduction } from '../types';

const earningDeductionSchema = new Schema<IEarningDeduction>(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    nameAr: {
      type: String,
      trim: true,
    },
    type: {
      type: String,
      required: true,
      enum: ['earning', 'deduction'],
      index: true,
    },
    category: {
      type: String,
      required: true,
      enum: ['fixed', 'variable', 'statutory', 'reimbursement'],
      index: true,
    },
    calculation: {
      method: {
        type: String,
        required: true,
        enum: ['fixed', 'percentage', 'formula', 'slab'],
      },
      fixedAmount: Number,
      percentageOf: [String],
      percentageValue: Number,
      formula: String,
      slabs: [{
        from: Number,
        to: Number,
        rate: Number,
        fixedAmount: Number,
      }],
    },
    constraints: {
      minValue: Number,
      maxValue: Number,
      maxPercentageOfGross: Number,
    },
    // Note: Component-employee mapping is handled via employee.assignedComponents
    // Components must be explicitly assigned to employees (no "apply to all" behavior)
    payrollBehavior: {
      affectsGrossSalary: {
        type: Boolean,
        default: true,
      },
      affectsTaxableIncome: {
        type: Boolean,
        default: true,
      },
      affectsNetSalary: {
        type: Boolean,
        default: true,
      },
      prorationApplicable: {
        type: Boolean,
        default: true,
      },
      showInPayslip: {
        type: Boolean,
        default: true,
      },
      payslipDisplayOrder: {
        type: Number,
        default: 0,
      },
    },
    statutory: {
      isStatutory: {
        type: Boolean,
        default: false,
      },
      regulatoryBody: String,
      complianceCode: String,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    effectiveFrom: {
      type: Date,
      required: true,
      default: Date.now,
    },
    effectiveTo: Date,
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
earningDeductionSchema.index({ type: 1, isActive: 1 });
earningDeductionSchema.index({ category: 1, isActive: 1 });
earningDeductionSchema.index({ 'payrollBehavior.payslipDisplayOrder': 1 });

const EarningDeduction = mongoose.model<IEarningDeduction>('EarningDeduction', earningDeductionSchema);

export default EarningDeduction;
