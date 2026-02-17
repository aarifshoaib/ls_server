import mongoose, { Schema } from 'mongoose';
import { IAttendanceSettings, IWorkingHours, IHoliday } from '../types';

const workingHoursSchema = new Schema<IWorkingHours>(
  {
    dayOfWeek: {
      type: Number,
      required: true,
      min: 0,
      max: 6,
    },
    isWorkingDay: {
      type: Boolean,
      default: true,
    },
    startTime: {
      type: String,
      required: true,
    },
    endTime: {
      type: String,
      required: true,
    },
    breakDuration: {
      type: Number,
      default: 60,
    },
  },
  { _id: false }
);

const holidaySchema = new Schema<IHoliday>(
  {
    name: {
      type: String,
      required: true,
    },
    date: {
      type: Date,
      required: true,
    },
    type: {
      type: String,
      enum: ['national', 'religious', 'company', 'optional'],
      default: 'company',
    },
    isRecurring: {
      type: Boolean,
      default: false,
    },
    description: String,
  },
  { _id: true }
);

const attendanceSettingsSchema = new Schema<IAttendanceSettings>(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      required: true,
      unique: true,
    },
    workingHours: {
      type: [workingHoursSchema],
      required: true,
      default: [
        { dayOfWeek: 0, isWorkingDay: false, startTime: '09:00', endTime: '18:00', breakDuration: 60 },
        { dayOfWeek: 1, isWorkingDay: true, startTime: '09:00', endTime: '18:00', breakDuration: 60 },
        { dayOfWeek: 2, isWorkingDay: true, startTime: '09:00', endTime: '18:00', breakDuration: 60 },
        { dayOfWeek: 3, isWorkingDay: true, startTime: '09:00', endTime: '18:00', breakDuration: 60 },
        { dayOfWeek: 4, isWorkingDay: true, startTime: '09:00', endTime: '18:00', breakDuration: 60 },
        { dayOfWeek: 5, isWorkingDay: true, startTime: '09:00', endTime: '18:00', breakDuration: 60 },
        { dayOfWeek: 6, isWorkingDay: false, startTime: '09:00', endTime: '18:00', breakDuration: 60 },
      ],
    },
    lateArrivalThresholdMinutes: {
      type: Number,
      default: 15,
    },
    earlyLeaveThresholdMinutes: {
      type: Number,
      default: 30,
    },
    halfDayThresholdHours: {
      type: Number,
      default: 4,
    },
    overtimeEnabled: {
      type: Boolean,
      default: true,
    },
    overtimeThresholdHours: {
      type: Number,
      default: 8,
    },
    requireClockInLocation: {
      type: Boolean,
      default: true,
    },
    allowedClockInRadius: {
      type: Number,
      default: 500,
    },
    autoClockOutEnabled: {
      type: Boolean,
      default: false,
    },
    autoClockOutTime: {
      type: String,
      default: '20:00',
    },
    holidays: {
      type: [holidaySchema],
      default: [],
    },
    leaveTypes: {
      type: [
        {
          type: String,
          name: String,
          defaultAllocation: Number,
          requiresApproval: Boolean,
          allowCarryForward: Boolean,
          maxCarryForward: Number,
        },
      ],
      default: [
        { type: 'annual', name: 'Annual Leave', defaultAllocation: 30, requiresApproval: true, allowCarryForward: true, maxCarryForward: 10 },
        { type: 'sick', name: 'Sick Leave', defaultAllocation: 15, requiresApproval: false, allowCarryForward: false, maxCarryForward: 0 },
        { type: 'casual', name: 'Casual Leave', defaultAllocation: 7, requiresApproval: true, allowCarryForward: false, maxCarryForward: 0 },
      ],
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
attendanceSettingsSchema.index({ organizationId: 1 }, { unique: true });
attendanceSettingsSchema.index({ 'holidays.date': 1 });

const AttendanceSettings = mongoose.model<IAttendanceSettings>(
  'AttendanceSettings',
  attendanceSettingsSchema
);

export default AttendanceSettings;
