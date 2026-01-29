import mongoose, { Schema } from 'mongoose';
import { IPayCycle } from '../types';

const payCycleSchema = new Schema<IPayCycle>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    code: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
      index: true,
    },
    description: {
      type: String,
      trim: true,
    },
    // Pay Month in MMYYYY format (e.g., "012026" for January 2026)
    payMonth: {
      type: String,
      trim: true,
      index: true,
    },
    // Period dates for payroll processing
    periodStartDate: {
      type: Date,
    },
    periodEndDate: {
      type: Date,
    },
    // Period status for controlling attendance entry
    periodStatus: {
      type: String,
      enum: ['open', 'processing', 'closed'],
      default: 'open',
    },
    // Calculation method for payroll
    calculationMethod: {
      type: String,
      enum: ['daily_rate', 'fixed_monthly', 'hourly_rate'],
      default: 'daily_rate',
    },
    // Configurable weekend days (0=Sunday, 1=Monday, ..., 6=Saturday)
    weekendDays: {
      type: [Number],
      default: [5, 6], // Friday & Saturday (UAE default)
    },
    // Standard hours per day for OT calculation
    standardHoursPerDay: {
      type: Number,
      default: 8,
    },
    cycleType: {
      type: String,
      required: true,
      enum: ['monthly', 'bi_weekly', 'weekly', 'hourly'],
      default: 'monthly',
    },
    monthlyConfig: {
      payDay: {
        type: Number,
        min: 0,
        max: 31,
        default: 28, // 0 = last day of month
      },
      cutoffDay: {
        type: Number,
        min: 1,
        max: 31,
        default: 25,
      },
      periodStartDay: {
        type: Number,
        min: 1,
        max: 31,
        default: 1,
      },
    },
    weeklyConfig: {
      payDayOfWeek: {
        type: Number,
        min: 0,
        max: 6, // 0=Sunday, 6=Saturday
      },
      cycleStartDayOfWeek: {
        type: Number,
        min: 0,
        max: 6,
      },
    },
    overtimeRates: {
      ot1: {
        enabled: {
          type: Boolean,
          default: true,
        },
        multiplier: {
          type: Number,
          default: 1.25,
        },
        description: {
          type: String,
          default: 'Weekday Overtime',
        },
        maxHoursPerDay: Number,
        maxHoursPerMonth: Number,
      },
      ot2: {
        enabled: {
          type: Boolean,
          default: true,
        },
        multiplier: {
          type: Number,
          default: 1.5,
        },
        description: {
          type: String,
          default: 'Weekend/Holiday Overtime',
        },
        maxHoursPerDay: Number,
        maxHoursPerMonth: Number,
      },
    },
    prorationRules: {
      enabled: {
        type: Boolean,
        default: true,
      },
      method: {
        type: String,
        enum: ['calendar_days', 'working_days', 'fixed_days'],
        default: 'calendar_days',
      },
      fixedDaysPerMonth: {
        type: Number,
        default: 30,
      },
      includeJoiningMonth: {
        type: Boolean,
        default: true,
      },
      includeLeavingMonth: {
        type: Boolean,
        default: true,
      },
      midMonthRules: {
        newJoineeCutoff: {
          type: Number,
          default: 25, // Join after 25th = no salary for that month
        },
        leaverCutoff: {
          type: Number,
          default: 5, // Leave before 5th = no salary for that month
        },
      },
    },
    leaveDeductionRules: {
      deductUnpaidLeave: {
        type: Boolean,
        default: true,
      },
      deductLateArrival: {
        type: Boolean,
        default: false,
      },
      lateDeductionThreshold: {
        type: Number,
        default: 15, // Minutes
      },
      lateDeductionUnit: {
        type: String,
        enum: ['fixed_amount', 'hourly_rate', 'half_day', 'full_day'],
        default: 'fixed_amount',
      },
      lateDeductionValue: Number,
    },
    processingSettings: {
      autoProcessEnabled: {
        type: Boolean,
        default: false,
      },
      autoProcessDay: {
        type: Number,
        default: 28,
      },
      requireApproval: {
        type: Boolean,
        default: true,
      },
      approvalLevels: {
        type: Number,
        default: 1,
      },
      bankFileFormat: {
        type: String,
        enum: ['csv', 'xlsx', 'txt', 'wps'],
        default: 'csv',
      },
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    isDefault: {
      type: Boolean,
      default: false,
      index: true,
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
payCycleSchema.index({ isActive: 1, isDefault: 1 });
payCycleSchema.index({ payMonth: 1, isActive: 1 });
payCycleSchema.index({ periodStatus: 1, isActive: 1 });

const PayCycle = mongoose.model<IPayCycle>('PayCycle', payCycleSchema);

export default PayCycle;
