import mongoose, { Schema } from 'mongoose';
import { ILookupValue } from '../types';

const lookupValueSchema = new Schema<ILookupValue>(
  {
    category: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    code: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
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
    description: {
      type: String,
      trim: true,
    },
    parentId: {
      type: Schema.Types.ObjectId,
      ref: 'LookupValue',
      default: null,
      index: true,
    },
    parentCode: {
      type: String,
      trim: true,
    },
    metadata: {
      color: String,
      icon: String,
      sortOrder: {
        type: Number,
        default: 0,
      },
      additionalData: {
        type: Schema.Types.Mixed,
      },
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    isSystem: {
      type: Boolean,
      default: false,
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

// Compound index for unique category + code combination
lookupValueSchema.index({ category: 1, code: 1 }, { unique: true });
lookupValueSchema.index({ category: 1, isActive: 1 });
lookupValueSchema.index({ 'metadata.sortOrder': 1 });

const LookupValue = mongoose.model<ILookupValue>('LookupValue', lookupValueSchema);

export default LookupValue;
