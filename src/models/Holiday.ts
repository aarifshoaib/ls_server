import mongoose, { Schema } from 'mongoose';
import { IHolidayMaster } from '../types';

const holidaySchema = new Schema<IHolidayMaster>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    date: {
      type: Date,
      required: true,
      index: true,
    },
    year: {
      type: Number,
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: ['public', 'religious', 'company', 'optional'],
      required: true,
      index: true,
    },
    isHalfDay: {
      type: Boolean,
      default: false,
    },
    applicableTo: {
      type: String,
      enum: ['all', 'department', 'location'],
      default: 'all',
      index: true,
    },
    departments: {
      type: [String],
      default: [],
    },
    locations: {
      type: [String],
      default: [],
    },
    isPaid: {
      type: Boolean,
      default: true,
    },
    description: {
      type: String,
      trim: true,
    },
    isActive: {
      type: Boolean,
      default: true,
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

// Pre-save middleware to extract year from date
// Uses getUTCFullYear to avoid timezone issues (e.g., Jan 1 in UTC+4 becoming Dec 31)
holidaySchema.pre('save', function(next) {
  if (this.date) {
    const d = new Date(this.date);
    this.year = d.getUTCFullYear();
  }
  next();
});

// Compound indexes for efficient queries
holidaySchema.index({ year: 1, date: 1 });
holidaySchema.index({ year: 1, isActive: 1 });
holidaySchema.index({ date: 1, isActive: 1 });
holidaySchema.index({ type: 1, year: 1 });
holidaySchema.index({ applicableTo: 1, year: 1 });

// Text index for search
holidaySchema.index({ name: 'text', description: 'text' });

// Validation for conditional fields
holidaySchema.pre('validate', function(next) {
  if (this.applicableTo === 'department' && (!this.departments || this.departments.length === 0)) {
    next(new Error('Departments are required when applicableTo is "department"'));
  } else if (this.applicableTo === 'location' && (!this.locations || this.locations.length === 0)) {
    next(new Error('Locations are required when applicableTo is "location"'));
  } else {
    next();
  }
});

const Holiday = mongoose.model<IHolidayMaster>('Holiday', holidaySchema);

export default Holiday;
