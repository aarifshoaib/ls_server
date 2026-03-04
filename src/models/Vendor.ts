import mongoose, { Schema } from 'mongoose';
import { IVendor, IVendorAddress } from '../types';

const vendorAddressSchema = new Schema<IVendorAddress>({
  type: {
    type: String,
    enum: ['billing', 'delivery'],
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
  isDefault: {
    type: Boolean,
    default: false,
  },
  contactPerson: String,
  contactPhone: String,
});

const vendorSchema = new Schema<IVendor>(
  {
    vendorCode: {
      type: String,
      required: true,
      unique: true,
      index: true,
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
    },
    contactPerson: String,
    email: {
      type: String,
      lowercase: true,
      trim: true,
    },
    phone: {
      type: String,
      required: true,
      index: true,
    },
    alternatePhone: String,
    taxId: String,
    addresses: [vendorAddressSchema],
    paymentTermsDays: {
      type: Number,
      default: 30,
    },
    status: {
      type: String,
      enum: ['active', 'inactive'],
      default: 'active',
      index: true,
    },
    notes: String,
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

vendorSchema.index({ vendorCode: 1 });
vendorSchema.index({ name: 'text', companyName: 'text' });
vendorSchema.index({ status: 1 });

const Vendor = mongoose.model<IVendor>('Vendor', vendorSchema);

export default Vendor;
