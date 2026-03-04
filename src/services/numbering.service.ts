import mongoose from 'mongoose';
import NumberingConfig, { NumberingEntity } from '../models/NumberingConfig';
import Order from '../models/Order';
import Employee from '../models/Employee';
import Customer from '../models/Customer';
import Vendor from '../models/Vendor';
import Requisition from '../models/Requisition';
import PurchaseOrder from '../models/PurchaseOrder';
import PurchaseInvoice from '../models/PurchaseInvoice';
import PurchaseReturn from '../models/PurchaseReturn';
import Advance from '../models/Advance';

const DEFAULT_CONFIG: Record<NumberingEntity, { prefix: string; digitCount: number; useSeparator: boolean }> = {
  order: { prefix: 'ORD', digitCount: 6, useSeparator: true },
  invoice: { prefix: 'INV', digitCount: 6, useSeparator: true },
  employee: { prefix: 'EMP', digitCount: 5, useSeparator: true },
  customer: { prefix: 'CUST', digitCount: 5, useSeparator: true },
  vendor: { prefix: 'VND', digitCount: 5, useSeparator: true },
  requisition: { prefix: 'REQ', digitCount: 6, useSeparator: true },
  purchase_order: { prefix: 'PO', digitCount: 6, useSeparator: true },
  purchase_invoice: { prefix: 'PI', digitCount: 6, useSeparator: true },
  purchase_return: { prefix: 'PR', digitCount: 6, useSeparator: true },
  advance: { prefix: 'ADV', digitCount: 5, useSeparator: true },
};

const ENTITY_MODEL_AND_FIELD: Record<
  NumberingEntity,
  { model: mongoose.Model<any>; field: string; regexStripPrefix?: boolean }
> = {
  order: { model: Order, field: 'orderNumber', regexStripPrefix: true },
  invoice: { model: Order, field: 'orderNumber', regexStripPrefix: true }, // invoice uses order-based or own sequence; we use order for max
  employee: { model: Employee, field: 'employeeCode', regexStripPrefix: true },
  customer: { model: Customer, field: 'customerCode', regexStripPrefix: true },
  vendor: { model: Vendor, field: 'vendorCode', regexStripPrefix: true },
  requisition: { model: Requisition, field: 'requisitionNumber', regexStripPrefix: true },
  purchase_order: { model: PurchaseOrder, field: 'purchaseOrderNumber', regexStripPrefix: true },
  purchase_invoice: { model: PurchaseInvoice, field: 'invoiceNumber', regexStripPrefix: true },
  purchase_return: { model: PurchaseReturn, field: 'returnNumber', regexStripPrefix: true },
  advance: { model: Advance, field: 'advanceNumber', regexStripPrefix: true },
};

function formatCode(prefix: string, nextNumber: number, digitCount: number, useSeparator: boolean): string {
  const numPart = String(nextNumber).padStart(digitCount, '0');
  return useSeparator ? `${prefix}-${numPart}` : `${prefix}${numPart}`;
}

export class NumberingService {
  static async ensureDefaults(): Promise<void> {
    const existing = await NumberingConfig.find().select('entity');
    const existingEntities = new Set(existing.map((c) => c.entity));
    for (const entity of Object.keys(DEFAULT_CONFIG) as NumberingEntity[]) {
      if (!existingEntities.has(entity)) {
        const def = DEFAULT_CONFIG[entity];
        await NumberingConfig.create({
          entity,
          prefix: def.prefix,
          digitCount: def.digitCount,
          useSeparator: def.useSeparator,
        });
      }
    }
  }

  static async getAll(): Promise<Array<{ entity: string; prefix: string; digitCount: number; useSeparator: boolean }>> {
    await this.ensureDefaults();
    const list = await NumberingConfig.find().sort({ entity: 1 }).lean();
    const entities = Object.keys(DEFAULT_CONFIG) as NumberingEntity[];
    const map = new Map(list.map((c) => [c.entity, c]));
    return entities.map((entity) => {
      const row = map.get(entity) || DEFAULT_CONFIG[entity];
      return {
        entity,
        prefix: (row as any).prefix ?? DEFAULT_CONFIG[entity].prefix,
        digitCount: (row as any).digitCount ?? DEFAULT_CONFIG[entity].digitCount,
        useSeparator: (row as any).useSeparator ?? DEFAULT_CONFIG[entity].useSeparator,
      };
    });
  }

  static async update(
    entity: NumberingEntity,
    data: { prefix?: string; digitCount?: number; useSeparator?: boolean }
  ): Promise<void> {
    await NumberingConfig.findOneAndUpdate(
      { entity },
      {
        $set: {
          ...(data.prefix != null && { prefix: data.prefix.trim().toUpperCase() }),
          ...(data.digitCount != null && { digitCount: Math.max(1, Math.min(10, data.digitCount)) }),
          ...(data.useSeparator != null && { useSeparator: data.useSeparator }),
        },
      },
      { upsert: true }
    );
  }

  static async getNextCode(entity: NumberingEntity): Promise<string> {
    await this.ensureDefaults();
    const config = await NumberingConfig.findOne({ entity }).lean();
    const prefix = config?.prefix ?? DEFAULT_CONFIG[entity].prefix;
    const digitCount = config?.digitCount ?? DEFAULT_CONFIG[entity].digitCount;
    const useSeparator = config?.useSeparator ?? DEFAULT_CONFIG[entity].useSeparator;

    const { model, field } = ENTITY_MODEL_AND_FIELD[entity];
    const sep = useSeparator ? '-' : '';
    const regex = new RegExp(`^${prefix}${sep}(\\d+)$`);
    const docs = await model
      .find({ [field]: { $regex: `^${prefix}` } })
      .sort({ [field]: -1 })
      .limit(1)
      .select(field)
      .lean();

    let nextNumber = 1;
    if (docs.length > 0 && docs[0][field]) {
      const val = String(docs[0][field]);
      let m = val.match(regex);
      if (!m) m = val.match(new RegExp(`${prefix}[-]?(\\d+)`));
      // For codes like ADV-2024-00001, take the last numeric part
      if (!m) {
        const lastNum = val.match(/(\d+)(?!.*\d)/);
        if (lastNum) m = lastNum;
      }
      if (m) {
        const n = parseInt(m[1], 10);
        if (!isNaN(n)) nextNumber = n + 1;
      }
    }

    return formatCode(prefix, nextNumber, digitCount, useSeparator);
  }
}
