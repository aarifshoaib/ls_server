import mongoose, { Schema } from 'mongoose';
import { ICustomer, ICustomerAddress, ICreditInfo, IFinancialSummary, ICustomerPreferences, ICustomerNote } from '../types';

const customerAddressSchema = new Schema<ICustomerAddress>({
  type: {
    type: String,
    enum: ['billing', 'shipping'],
    required: true,
  },
  label: String,
  addressLine1: {
    type: String,
    required: true,
  },
  addressLine2: String,
  city: {
    type: String,
    required: true,
  },
  state: String,
  country: {
    type: String,
    required: true,
  },
  postalCode: String,
  landmark: String,
  coordinates: {
    lat: Number,
    lng: Number,
  },
  isDefault: {
    type: Boolean,
    default: false,
  },
  contactPerson: String,
  contactPhone: String,
});

const creditInfoSchema = new Schema<ICreditInfo>(
  {
    creditLimit: {
      type: Number,
      default: 0,
    },
    currentOutstanding: {
      type: Number,
      default: 0,
    },
    availableCredit: {
      type: Number,
      default: 0,
    },
    creditTermDays: {
      type: Number,
      default: 30,
    },
    creditStatus: {
      type: String,
      enum: ['active', 'suspended', 'blocked'],
      default: 'active',
    },
    lastCreditReviewDate: Date,
    nextCreditReviewDate: Date,
    creditScore: Number,
    riskCategory: {
      type: String,
      enum: ['low', 'medium', 'high'],
    },
  },
  { _id: false }
);

const financialSummarySchema = new Schema<IFinancialSummary>(
  {
    totalOrders: {
      type: Number,
      default: 0,
    },
    totalOrderValue: {
      type: Number,
      default: 0,
    },
    totalPaidAmount: {
      type: Number,
      default: 0,
    },
    totalOutstanding: {
      type: Number,
      default: 0,
    },
    overdueAmount: {
      type: Number,
      default: 0,
    },
    lastOrderDate: Date,
    lastPaymentDate: Date,
    lastPaymentAmount: Number,
    averageOrderValue: Number,
    averagePaymentDays: Number,
  },
  { _id: false }
);

const customerPreferencesSchema = new Schema<ICustomerPreferences>(
  {
    preferredPaymentMethod: String,
    preferredDeliveryTime: String,
    communicationPreference: String,
    language: {
      type: String,
      default: 'en',
    },
  },
  { _id: false }
);

const customerNoteSchema = new Schema<ICustomerNote>(
  {
    note: {
      type: String,
      required: true,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false }
);

const customerSchema = new Schema<ICustomer>(
  {
    customerCode: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    type: {
      type: String,
      enum: ['individual', 'business'],
      required: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      index: 'text',
    },
    companyName: {
      type: String,
      trim: true,
      index: 'text',
    },
    tradeLicenseNo: String,
    taxRegistrationNo: String,
    email: {
      type: String,
      unique: true,
      sparse: true,
      lowercase: true,
      trim: true,
    },
    phone: {
      type: String,
      required: true,
      index: true,
    },
    alternatePhone: String,
    addresses: [customerAddressSchema],
    creditInfo: {
      type: creditInfoSchema,
      default: {},
    },
    financialSummary: {
      type: financialSummarySchema,
      default: {},
    },
    priceGroup: {
      type: String,
      default: 'retail',
    },
    discountPercent: {
      type: Number,
      default: 0,
    },
    status: {
      type: String,
      enum: ['active', 'inactive', 'blocked'],
      default: 'active',
      index: true,
    },
    blockReason: String,
    assignedSalesRep: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    territory: String,
    preferences: {
      type: customerPreferencesSchema,
      default: {},
    },
    notes: [customerNoteSchema],
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
customerSchema.index({ customerCode: 1 });
customerSchema.index({ email: 1 }, { sparse: true });
customerSchema.index({ phone: 1 });
customerSchema.index({ name: 'text', companyName: 'text' });
customerSchema.index({ 'creditInfo.creditStatus': 1 });
customerSchema.index({ 'creditInfo.currentOutstanding': 1 });
customerSchema.index({ status: 1 });
customerSchema.index({ assignedSalesRep: 1 });
customerSchema.index({ priceGroup: 1 });

const Customer = mongoose.model<ICustomer>('Customer', customerSchema);

export default Customer;
