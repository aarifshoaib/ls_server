import mongoose, { Schema } from 'mongoose';
import { IAttendance, IClockRecord, ILocation } from '../types';

const locationSchema = new Schema<ILocation>(
  {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point',
    },
    coordinates: {
      type: [Number],
      required: true,
    },
    address: String,
  },
  { _id: false }
);

const clockRecordSchema = new Schema<IClockRecord>(
  {
    time: {
      type: Date,
      required: true,
    },
    location: locationSchema,
    deviceInfo: String,
    notes: String,
  },
  { _id: false }
);

const attendanceSchema = new Schema<IAttendance>(
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
    date: {
      type: Date,
      required: true,
      index: true,
    },
    clockIn: {
      type: clockRecordSchema,
      required: false, // Not required for absent/half_day/leave status
    },
    clockOut: clockRecordSchema,
    workHours: {
      regular: {
        type: Number,
        default: 0,
      },
      overtime: {
        type: Number,
        default: 0,
      },
      total: {
        type: Number,
        default: 0,
      },
    },
    status: {
      type: String,
      enum: ['present', 'half_day', 'absent', 'leave', 'holiday', 'weekend'],
      default: 'present',
      index: true,
    },
    isLate: {
      type: Boolean,
      default: false,
    },
    lateMinutes: {
      type: Number,
      default: 0,
    },
    isEarlyLeave: {
      type: Boolean,
      default: false,
    },
    earlyLeaveMinutes: {
      type: Number,
      default: 0,
    },
    breakDuration: {
      type: Number,
      default: 0,
    },
    notes: String,
    approvedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    approvedAt: Date,
    // Payroll-specific overtime breakdown
    payrollOvertime: {
      ot1Hours: {
        type: Number,
        default: 0,
      },
      ot1Rate: {
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
      totalOvertimeAmount: {
        type: Number,
        default: 0,
      },
    },
    // Payroll processing status
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
  },
  {
    timestamps: true,
  }
);

// Indexes
attendanceSchema.index({ userId: 1, date: 1 }, { unique: true });
attendanceSchema.index({ employeeId: 1, date: -1 });
attendanceSchema.index({ status: 1, date: -1 });
attendanceSchema.index({ createdAt: -1 });

// Virtual for formatted date
attendanceSchema.virtual('dateString').get(function () {
  return this.date.toISOString().split('T')[0];
});

const Attendance = mongoose.model<IAttendance>('Attendance', attendanceSchema);

export default Attendance;
