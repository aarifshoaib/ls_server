import mongoose, { Schema } from 'mongoose';
import { IUser, IRefreshToken, IUserPreferences } from '../types';

const refreshTokenSchema = new Schema<IRefreshToken>(
  {
    token: { type: String, required: true },
    deviceInfo: String,
    createdAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, required: true },
  },
  { _id: false }
);

const userPreferencesSchema = new Schema<IUserPreferences>(
  {
    theme: String,
    language: { type: String, default: 'en' },
    timezone: String,
    notifications: {
      email: { type: Boolean, default: true },
      push: { type: Boolean, default: true },
      sms: { type: Boolean, default: false },
    },
  },
  { _id: false }
);

const userSchema = new Schema<IUser>(
  {
    employeeId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    passwordHash: {
      type: String,
      required: true,
      select: false,
    },
    passwordSalt: {
      type: String,
      required: true,
      select: false,
    },
    firstName: {
      type: String,
      required: true,
      trim: true,
    },
    lastName: {
      type: String,
      required: true,
      trim: true,
    },
    fullName: {
      type: String,
      required: true,
    },
    avatar: String,
    phone: String,
    role: {
      type: String,
      required: true,
      enum: ['super_admin', 'admin', 'hod', 'accountant', 'supervisor', 'sales_team', 'delivery_team', 'hrm'],
      default: 'sales_team',
      index: true,
    },
    permissions: [String],
    department: String,
    warehouseId: {
      type: Schema.Types.ObjectId,
      ref: 'Warehouse',
    },
    /** Payroll / HR: companies this user may access (empty = none unless super_admin/admin) */
    companyIds: [
      {
        type: Schema.Types.ObjectId,
        ref: 'Company',
      },
    ],
    territories: [String],
    status: {
      type: String,
      enum: ['active', 'inactive', 'suspended'],
      default: 'active',
      index: true,
    },
    lastLogin: Date,
    failedLoginAttempts: {
      type: Number,
      default: 0,
    },
    lockedUntil: Date,
    refreshTokens: [refreshTokenSchema],
    preferences: {
      type: userPreferencesSchema,
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
userSchema.index({ email: 1 });
userSchema.index({ employeeId: 1 });
userSchema.index({ role: 1, status: 1 });

// Pre-save middleware to set fullName
userSchema.pre('save', function (next) {
  if (this.isModified('firstName') || this.isModified('lastName')) {
    this.fullName = `${this.firstName} ${this.lastName}`;
  }
  next();
});

const User = mongoose.model<IUser>('User', userSchema);

export default User;
