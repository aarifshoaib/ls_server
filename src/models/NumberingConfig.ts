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
  prefix: string;
  digitCount: number;
  useSeparator: boolean; // true = "ORD-0001", false = "ORD0001"
}

const numberingConfigSchema = new Schema<INumberingConfig>(
  {
    entity: {
      type: String,
      required: true,
      unique: true,
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
    prefix: { type: String, required: true, trim: true, uppercase: true },
    digitCount: { type: Number, required: true, min: 1, max: 10, default: 5 },
    useSeparator: { type: Boolean, default: true },
  },
  { timestamps: true }
);

const NumberingConfig = mongoose.model<INumberingConfig>('NumberingConfig', numberingConfigSchema);
export default NumberingConfig;
