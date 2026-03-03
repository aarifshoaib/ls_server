import mongoose, { Schema } from 'mongoose';

export interface IModulePermission {
  module: string;
  actions: string[];
}

export interface IRole {
  _id: mongoose.Types.ObjectId;
  name: string;
  displayName: string;
  description?: string;
  permissions: IModulePermission[];
  isSystem: boolean;
  isActive: boolean;
  createdBy?: mongoose.Types.ObjectId;
  updatedBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const modulePermissionSchema = new Schema<IModulePermission>(
  {
    module: {
      type: String,
      required: true,
    },
    actions: [{
      type: String,
    }],
  },
  { _id: false }
);

const roleSchema = new Schema<IRole>(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      index: true,
    },
    displayName: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    permissions: [modulePermissionSchema],
    isSystem: {
      type: Boolean,
      default: false,
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

// Available modules in the system
export const MODULES = [
  // OMS Modules
  'dashboard',
  'products',
  'categories',
  'customers',
  'orders',
  'inventory',
  'payments',
  'reports',
  // Procurement
  'vendors',
  'requisitions',
  'purchase_orders',
  'purchase_invoices',
  // Payroll Modules
  'employees',
  'pay_cycles',
  'attendance',
  'holidays',
  'advances',
  'adhoc_items',
  'payroll_process',
  'payroll_runs',
  'payroll_archives',
  'payroll_reports',
  // Settings Modules
  'lookup_values',
  'users',
] as const;

// Available actions per module
export const ACTIONS = [
  'create',
  'read',
  'update',
  'delete',
  'process',         // For payroll processing
] as const;

const Role = mongoose.model<IRole>('Role', roleSchema);

export default Role;
