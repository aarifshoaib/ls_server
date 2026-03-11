/**
 * Drop all products and seed Pulses & Beans from the provided table.
 * Packing = pcs per unit only. Barcodes must be 13 digits and unique.
 * Run: npx ts-node src/scripts/seedPulsesBeansProducts.ts
 */
import mongoose from 'mongoose';
import { config } from '../config';
import Product from '../models/Product';
import Category from '../models/Category';
import StockBatch from '../models/StockBatch';
import InventoryTransaction from '../models/InventoryTransaction';

const PULSES_BEANS_DATA = [
  { product_name: 'Black Chana/chickpeas', item_code: 'PB-001', barcode: '6297825891850', weight_g: 400, pcs_per_unit: 24, sell_price: 2.1 },
  { product_name: 'Black Chana/chickpeas', item_code: 'PB-002', barcode: '6297828900900', weight_g: 800, pcs_per_unit: 12, sell_price: 4.0 },
  { product_name: 'Black Eye Beans', item_code: 'PB-003', barcode: '6297821533242', weight_g: 400, pcs_per_unit: 20, sell_price: 2.75 },
  { product_name: 'Black Eye Beans', item_code: 'PB-004', barcode: '6297821243172', weight_g: 800, pcs_per_unit: 10, sell_price: 5.25 },
  { product_name: 'Broad Beans', item_code: 'PB-005', barcode: '6297825049428', weight_g: 400, pcs_per_unit: 20, sell_price: 6.95 },
  { product_name: 'Chana Dal', item_code: 'PB-006', barcode: '6297825333558', weight_g: 400, pcs_per_unit: 24, sell_price: 2.5 },
  { product_name: 'Chana Dal', item_code: 'PB-007', barcode: '6297827596326', weight_g: 800, pcs_per_unit: 12, sell_price: 4.75 },
  { product_name: 'Flex Seed', item_code: 'PB-008', barcode: '6297827563724', weight_g: 400, pcs_per_unit: 20, sell_price: 3.75 },
  { product_name: 'Foul Split', item_code: 'PB-009', barcode: '6297820903152', weight_g: 400, pcs_per_unit: 20, sell_price: 2.75 },
  { product_name: 'Foul Split', item_code: 'PB-010', barcode: '6297829559046', weight_g: 800, pcs_per_unit: 10, sell_price: 5.25 },
  { product_name: 'Green Lentil', item_code: 'PB-011', barcode: '6297820034450', weight_g: 400, pcs_per_unit: 24, sell_price: 3.25 },
  { product_name: 'Green Lentil', item_code: 'PB-012', barcode: '6297820583088', weight_g: 800, pcs_per_unit: 12, sell_price: 6.25 },
  { product_name: 'Green Peas -Dry', item_code: 'PB-013', barcode: '6297822190062', weight_g: 400, pcs_per_unit: 24, sell_price: 1.95 },
  { product_name: 'Green Peas -Dry', item_code: 'PB-014', barcode: '6297822912008', weight_g: 800, pcs_per_unit: 12, sell_price: 3.7 },
  { product_name: 'Horse Gram', item_code: 'PB-015', barcode: '6297824623414', weight_g: 400, pcs_per_unit: 24, sell_price: 2.5 },
  { product_name: 'Masoor Dal', item_code: 'PB-016', barcode: '6297825825374', weight_g: 400, pcs_per_unit: 24, sell_price: 2.4 },
  { product_name: 'Masoor Dal', item_code: 'PB-017', barcode: '6297821660412', weight_g: 800, pcs_per_unit: 12, sell_price: 4.5 },
  { product_name: 'Masoor Gota', item_code: 'PB-018', barcode: '6297820825256', weight_g: 400, pcs_per_unit: 24, sell_price: 2.6 },
  { product_name: 'Masoor Gota', item_code: 'PB-019', barcode: '6297829835492', weight_g: 800, pcs_per_unit: 12, sell_price: 5.0 },
  { product_name: 'Matar Dal', item_code: 'PB-020', barcode: '6297829369898', weight_g: 400, pcs_per_unit: 24, sell_price: 1.6 },
  { product_name: 'Matar Dal', item_code: 'PB-021', barcode: '6297823618046', weight_g: 800, pcs_per_unit: 12, sell_price: 3.25 },
  { product_name: 'Mix Dal', item_code: 'PB-022', barcode: '6297828867036', weight_g: 400, pcs_per_unit: 12, sell_price: 3.2 },
  { product_name: 'Moong Dal', item_code: 'PB-023', barcode: '6297822816078', weight_g: 400, pcs_per_unit: 24, sell_price: 2.95 },
  { product_name: 'Moong Dal', item_code: 'PB-024', barcode: '6297822018038', weight_g: 800, pcs_per_unit: 12, sell_price: 5.5 },
  { product_name: 'Moong Split', item_code: 'PB-025', barcode: '6297825213522', weight_g: 400, pcs_per_unit: 24, sell_price: 2.75 },
  { product_name: 'Moong Split', item_code: 'PB-026', barcode: '6297820486518', weight_g: 800, pcs_per_unit: 12, sell_price: 5.5 },
  { product_name: 'Moong Whole', item_code: 'PB-027', barcode: '6297828165262', weight_g: 400, pcs_per_unit: 24, sell_price: 2.6 },
  { product_name: 'Moong Whole', item_code: 'PB-028', barcode: '6297824523592', weight_g: 800, pcs_per_unit: 12, sell_price: 4.95 },
  { product_name: 'Red Chowly', item_code: 'PB-029', barcode: '6297820392086', weight_g: 400, pcs_per_unit: 24, sell_price: 3.0 },
  { product_name: 'Red Chowly', item_code: 'PB-030', barcode: '6297821886928', weight_g: 800, pcs_per_unit: 12, sell_price: 5.75 },
  { product_name: 'Red Kidney Beans', item_code: 'PB-031', barcode: '6297822756688', weight_g: 400, pcs_per_unit: 24, sell_price: 4.5 },
  { product_name: 'Red Kidney Beans', item_code: 'PB-032', barcode: '6297822478870', weight_g: 800, pcs_per_unit: 10, sell_price: 8.75 },
  { product_name: 'Red Masoor Whole', item_code: 'PB-033', barcode: '6297821193682', weight_g: 400, pcs_per_unit: 24, sell_price: 2.25 },
  { product_name: 'Red Masoor Whole', item_code: 'PB-034', barcode: '6297820451622', weight_g: 800, pcs_per_unit: 12, sell_price: 4.25 },
  { product_name: 'Toor Dal', item_code: 'PB-035', barcode: '6297828391814', weight_g: 400, pcs_per_unit: 24, sell_price: 3.5 },
  { product_name: 'Toor Dal', item_code: 'PB-036', barcode: '6297826710198', weight_g: 800, pcs_per_unit: 12, sell_price: 6.9 },
  { product_name: 'Urad Dal', item_code: 'PB-037', barcode: '6297828661016', weight_g: 400, pcs_per_unit: 24, sell_price: 3.4 },
  { product_name: 'Urad Dal', item_code: 'PB-038', barcode: '6297828995364', weight_g: 800, pcs_per_unit: 12, sell_price: 6.6 },
  { product_name: 'Urad Gota', item_code: 'PB-039', barcode: '6297820426354', weight_g: 400, pcs_per_unit: 24, sell_price: 3.25 },
  { product_name: 'Urad Gota', item_code: 'PB-040', barcode: '6297825326932', weight_g: 800, pcs_per_unit: 12, sell_price: 6.5 },
  { product_name: 'Urad Split', item_code: 'PB-041', barcode: '6297826431772', weight_g: 400, pcs_per_unit: 24, sell_price: 3.0 },
  { product_name: 'Urad Split', item_code: 'PB-042', barcode: '6297824075572', weight_g: 800, pcs_per_unit: 12, sell_price: 5.75 },
  { product_name: 'Urad Whole', item_code: 'PB-043', barcode: '6297822626134', weight_g: 400, pcs_per_unit: 24, sell_price: 3.0 },
  { product_name: 'Urad Whole', item_code: 'PB-044', barcode: '6297828216360', weight_g: 800, pcs_per_unit: 12, sell_price: 5.75 },
  { product_name: 'White chickpeas / Chana 12 mm', item_code: 'PB-045', barcode: '6297826233086', weight_g: 400, pcs_per_unit: 20, sell_price: 4.0 },
  { product_name: 'White chickpeas / Chana 12 mm', item_code: 'PB-046', barcode: '6297826731056', weight_g: 800, pcs_per_unit: 10, sell_price: 7.5 },
  { product_name: 'White chickpeas / Chana 9 mm', item_code: 'PB-047', barcode: '6297821195808', weight_g: 400, pcs_per_unit: 24, sell_price: 3.1 },
  { product_name: 'White chickpeas / Chana 9 mm', item_code: 'PB-048', barcode: '6297828425700', weight_g: 800, pcs_per_unit: 10, sell_price: 6.0 },
  { product_name: 'White kidney Beans', item_code: 'PB-049', barcode: '6297823391628', weight_g: 400, pcs_per_unit: 24, sell_price: 3.5 },
  { product_name: 'White kidney Beans', item_code: 'PB-050', barcode: '6297824524278', weight_g: 800, pcs_per_unit: 10, sell_price: 6.75 },
  { product_name: 'Yellow Masoor Dal', item_code: 'PB-051', barcode: '6297823679818', weight_g: 400, pcs_per_unit: 24, sell_price: 3.95 },
  { product_name: 'Yellow Masoor Dal', item_code: 'PB-052', barcode: '6297829407576', weight_g: 800, pcs_per_unit: 12, sell_price: 7.6 },
];

function validateBarcodes() {
  const barcodeDigitsOnly = /^\d{13}$/;
  const seen = new Set<string>();
  const errors: string[] = [];

  for (let i = 0; i < PULSES_BEANS_DATA.length; i++) {
    const row = PULSES_BEANS_DATA[i];
    const bc = String(row.barcode).trim();

    if (!barcodeDigitsOnly.test(bc)) {
      errors.push(`Row ${i + 1} (${row.item_code}): barcode "${bc}" must be exactly 13 digits`);
    }
    if (seen.has(bc)) {
      errors.push(`Row ${i + 1} (${row.item_code}): duplicate barcode "${bc}"`);
    }
    seen.add(bc);
  }

  return errors;
}

async function run() {
  try {
    await mongoose.connect(config.mongoUri);
    console.log('Connected to database');

    const barcodeErrors = validateBarcodes();
    if (barcodeErrors.length > 0) {
      console.error('Barcode validation failed:');
      barcodeErrors.forEach((e) => console.error('  -', e));
      process.exit(1);
    }
    console.log(`Barcodes OK: ${PULSES_BEANS_DATA.length} items, all 13-digit and unique`);

    const pbCategory = await Category.findOne({ code: 'PB' });
    if (!pbCategory) {
      console.error('Pulses & Beans category (code PB) not found. Run replace-suvai-categories first.');
      process.exit(1);
    }

    const suvaiBrand = { _id: new mongoose.Types.ObjectId(), name: 'Suvai' };
    const roundToTwo = (v: number) => Math.round(v * 100) / 100;

    console.log('Dropping all products and related data...');
    await StockBatch.deleteMany({});
    await InventoryTransaction.deleteMany({});
    const delResult = await Product.deleteMany({});
    console.log(`Deleted ${delResult.deletedCount} products`);

    const grouped = PULSES_BEANS_DATA.reduce<Record<string, typeof PULSES_BEANS_DATA>>((acc, row) => {
      const key = row.product_name;
      if (!acc[key]) acc[key] = [];
      acc[key].push(row);
      return acc;
    }, {});

    const productNames = Object.keys(grouped).sort();
    const products = productNames.map((prodName, idx) => {
      const variants = grouped[prodName];
      const sku = `SUVAI-PB-${String(idx + 1).padStart(3, '0')}`;
      return {
        sku,
        name: prodName,
        description: prodName,
        category: {
          _id: pbCategory._id,
          name: pbCategory.name,
          path: pbCategory.path,
        },
        brand: suvaiBrand,
        baseUnit: 'g',
        images: [],
        tags: ['suvai', 'pulses', 'beans'],
        attributes: {},
        variants: variants.map((v) => ({
          variantSku: `${v.item_code}`,
          name: `${v.weight_g}g Pack`,
          size: v.weight_g,
          unit: 'g',
          displaySize: `${v.weight_g}g`,
          barcode: v.barcode,
          itemCode: v.item_code,
          salesUom: {
            unitLabel: 'unit',
            pcsPerUnit: v.pcs_per_unit,
          },
          price: {
            basePrice: roundToTwo(v.sell_price * 0.75),
            sellingPrice: v.sell_price,
            taxRate: 5,
            taxInclusive: false,
          },
          stock: {
            quantity: 0,
            reservedQuantity: 0,
            availableQuantity: 0,
            reorderLevel: 10,
            reorderQuantity: v.pcs_per_unit * 2,
          },
          status: 'active',
          weight: v.weight_g + 20,
        })),
        status: 'active',
      };
    });

    await Product.insertMany(products);
    console.log(`Inserted ${products.length} products (${PULSES_BEANS_DATA.length} variants total)`);
    console.log('Done.');
  } catch (err) {
    console.error(err);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    process.exit(0);
  }
}

run();
