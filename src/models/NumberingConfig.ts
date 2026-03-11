import mongoose, { Schema } from 'mongoose';

export type NumberingEntity =
  | 'order'
  | 'invoice'
  | 'employee'
  | 'customer'
  | 'vendor'
  | 'requisition'
  | 'purchase_order'
  | 'purchase_invoice'
  | 'purchase_return'
  | 'advance';

export interface INumberingConfig {
  entity: NumberingEntity;
  scopeType?: 'department' | null;
  scopeValue?: string | null;
  prefix: string;
  digitCount: number;
  useSeparator: boolean; // true = "ORD-0001", false = "ORD0001"
}

const numberingConfigSchema = new Schema<INumberingConfig>(
  {
    entity: {
      type: String,
      required: true,
      enum: [
        'order',
        'invoice',
        'employee',
        'customer',
        'vendor',
        'requisition',
        'purchase_order',
        'purchase_invoice',
        'purchase_return',
        'advance',
      ],
    },
    scopeType: {
      type: String,
      enum: ['department', null],
      default: null,
      index: true,
    },
    scopeValue: {
      type: String,
      trim: true,
      uppercase: true,
      default: null,
      index: true,
    },
    prefix: { type: String, required: true, trim: true, uppercase: true },
    digitCount: { type: Number, required: true, min: 1, max: 10, default: 5 },
    useSeparator: { type: Boolean, default: true },
  },
  { timestamps: true }
);

numberingConfigSchema.index(
  { entity: 1, scopeType: 1, scopeValue: 1 },
  { unique: true }
);

const NumberingConfig = mongoose.model<INumberingConfig>('NumberingConfig', numberingConfigSchema);
export default NumberingConfig;
