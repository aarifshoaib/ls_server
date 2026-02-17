import mongoose, { Schema } from 'mongoose';
import { IApprovalConfig, IApprovalLevel, IApprovalCondition } from '../types';

const approvalConditionSchema = new Schema<IApprovalCondition>(
  {
    field: {
      type: String,
      required: true,
    },
    operator: {
      type: String,
      enum: ['equals', 'greater_than', 'less_than', 'contains', 'in_range'],
      required: true,
    },
    value: {
      type: Schema.Types.Mixed,
      required: true,
    },
  },
  { _id: false }
);

const approvalLevelSchema = new Schema<IApprovalLevel>(
  {
    level: {
      type: Number,
      required: true,
    },
    name: {
      type: String,
      required: true,
    },
    approverRole: String,
    approverIds: [
      {
        type: Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    approverEmails: [String],
    isAutoApproved: {
      type: Boolean,
      default: false,
    },
    autoApprovalConditions: [approvalConditionSchema],
    timeoutHours: Number,
    isParallel: {
      type: Boolean,
      default: false,
    },
    minimumApprovals: {
      type: Number,
      default: 1,
    },
  },
  { _id: false }
);

const approvalConfigSchema = new Schema<IApprovalConfig>(
  {
    name: {
      type: String,
      required: true,
      unique: true,
    },
    type: {
      type: String,
      enum: ['leave', 'overtime', 'expense', 'purchase', 'custom'],
      required: true,
      index: true,
    },
    description: String,
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    applicableFor: {
      roles: [String],
      departments: [String],
      employeeIds: [
        {
          type: Schema.Types.ObjectId,
          ref: 'User',
        },
      ],
    },
    conditions: [approvalConditionSchema],
    levels: {
      type: [approvalLevelSchema],
      required: true,
      validate: {
        validator: function (levels: IApprovalLevel[]) {
          return levels.length > 0;
        },
        message: 'At least one approval level is required',
      },
    },
    notificationSettings: {
      notifyOnSubmit: {
        type: Boolean,
        default: true,
      },
      notifyOnApproval: {
        type: Boolean,
        default: true,
      },
      notifyOnRejection: {
        type: Boolean,
        default: true,
      },
      reminderIntervalHours: {
        type: Number,
        default: 24,
      },
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: {},
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
approvalConfigSchema.index({ name: 1 }, { unique: true });
approvalConfigSchema.index({ type: 1, isActive: 1 });
approvalConfigSchema.index({ 'applicableFor.roles': 1 });
approvalConfigSchema.index({ 'applicableFor.departments': 1 });

const ApprovalConfig = mongoose.model<IApprovalConfig>('ApprovalConfig', approvalConfigSchema);

export default ApprovalConfig;
