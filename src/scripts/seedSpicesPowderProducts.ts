/**
 * Seed products from CSV or Excel (.xlsx). Uses Category column (PB, SP, SW, etc.) to assign each row to the correct category.
 * Rules: packing = pcs per unit only; barcode 13 digits, unique (skip duplicates).
 * Save your sheet as backend/data/spices-powder.xlsx or .csv
 * Run: npx ts-node src/scripts/seedSpicesPowderProducts.ts
 * Or: npx ts-node src/scripts/seedSpicesPowderProducts.ts path/to/file.xlsx
 */
import fs from 'fs';
import path from 'path';
import * as XLSX from 'xlsx';
import mongoose from 'mongoose';
import { config } from '../config';
import Product from '../models/Product';
import Category from '../models/Category';

function parseWeight(val: string): number {
  const s = String(val || '').trim().toLowerCase();
  const num = parseFloat(s.replace(/[^0-9.]/g, ''));
  if (s.includes('kg')) return Math.round(num * 1000);
  return Math.round(num); // gm
}

function parsePcsPerUnit(val: string): number {
  const s = String(val || '').trim();
  const m = s.match(/^(\d+)\s*x/);
  return m ? parseInt(m[1], 10) : 1;
}

function parseCsvLine(line: string): string[] {
  const matches = line.match(/("(?:[^"]|"")*"|[^,\r\n]*)/g) || [];
  return matches.map((m) => m.replace(/^"|"$/g, '').replace(/""/g, '"').trim());
}

function loadCsv(filePath: string): RowData[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];

  const headers = parseCsvLine(lines[0]).map((h) => h.toLowerCase());
  const getCol = (values: string[], ...keys: string[]): string => {
    const i = headers.findIndex((h) => keys.some((k) => h.includes(k)));
    return i >= 0 ? (values[i] || '').trim() : '';
  };

  const rows: RowData[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseCsvLine(lines[i]);
    const productName = getCol(values, 'product name', 'product', 'name') || getCol(values, 'spices', 'pulses');
    const categoryCode = getCol(values, 'category');
    const itemCode = getCol(values, 'product code', 'item code', 'item', 'code');
    const barcode = getCol(values, 'barcode');
    const weightStr = getCol(values, 'quantity', 'weight', 'unit');
    const packingStr = getCol(values, 'package type', 'packing');
    const priceStr = getCol(values, 'price', 'sell');

    if (!productName || !barcode) continue;

    const weight = parseWeight(weightStr || '100');
    const pcsPerUnit = parsePcsPerUnit(packingStr || '1 x');
    const sellPrice = parseFloat(String(priceStr || '0').replace(/[^0-9.]/g, '')) || 0;

    const code = (categoryCode || 'SP').trim().toUpperCase();
    rows.push({
      product_name: productName.trim(),
      category_code: code || 'SP',
      item_code: (itemCode || `${code}-${String(i).padStart(3, '0')}`).trim(),
      barcode: String(barcode).trim(),
      weight_g: weight,
      pcs_per_unit: Math.max(1, pcsPerUnit),
      sell_price: sellPrice,
    });
  }
  return rows;
}

type RowData = { product_name: string; category_code: string; item_code: string; barcode: string; weight_g: number; pcs_per_unit: number; sell_price: number };

function loadExcel(filePath: string): RowData[] {
  const workbook = XLSX.readFile(filePath);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1 }) as string[][];
  if (rows.length < 2) return [];

  const headers = rows[0].map((h) => String(h || '').toLowerCase().trim());
  const getCol = (values: string[], ...keys: string[]): string => {
    const i = headers.findIndex((h) => keys.some((k) => h.includes(k)));
    return i >= 0 ? String(values[i] ?? '').trim() : '';
  };

  const result: RowData[] = [];
  for (let i = 1; i < rows.length; i++) {
    const values = rows[i].map((v) => String(v ?? ''));
    const productName = getCol(values, 'product name', 'product', 'name') || getCol(values, 'spices', 'pulses');
    const categoryCode = getCol(values, 'category');
    const itemCode = getCol(values, 'product code', 'item code', 'item', 'code');
    const barcode = getCol(values, 'barcode');
    const weightStr = getCol(values, 'quantity', 'weight', 'unit');
    const packingStr = getCol(values, 'package type', 'packing');
    const priceStr = getCol(values, 'price', 'sell');

    if (!productName || !barcode) continue;

    const weight = parseWeight(weightStr || '100');
    const pcsPerUnit = parsePcsPerUnit(packingStr || '1 x');
    const sellPrice = parseFloat(String(priceStr || '0').replace(/[^0-9.]/g, '')) || 0;

    const code = (categoryCode || 'SP').trim().toUpperCase();
    result.push({
      product_name: productName.trim(),
      category_code: code || 'SP',
      item_code: (itemCode || `${code}-${String(i).padStart(3, '0')}`).trim(),
      barcode: String(barcode).trim(),
      weight_g: weight,
      pcs_per_unit: Math.max(1, pcsPerUnit),
      sell_price: sellPrice,
    });
  }
  return result;
}

function loadData(filePath: string): RowData[] {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.xlsx' || ext === '.xls') return loadExcel(filePath);
  return loadCsv(filePath);
}

/** Filter to valid rows only; skip invalid/duplicate barcodes and log skipped. */
function filterValidRows(data: RowData[], existingBarcodes: Set<string>): RowData[] {
  const barcodeDigitsOnly = /^\d{13}$/;
  const seenInFile = new Set<string>();
  const valid: typeof data = [];

  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    const bc = String(row.barcode).trim();

    if (!barcodeDigitsOnly.test(bc)) {
      console.log(`Skipped ${row.item_code}: barcode must be exactly 13 digits`);
      continue;
    }
    if (seenInFile.has(bc)) {
      console.log(`Skipped ${row.item_code} (${row.product_name}): duplicate barcode within file`);
      continue;
    }
    if (existingBarcodes.has(bc)) {
      console.log(`Skipped ${row.item_code} (${row.product_name}): barcode already exists in database`);
      continue;
    }
    seenInFile.add(bc);
    existingBarcodes.add(bc);
    valid.push(row);
  }
  return valid;
}

async function run() {
  const dataDir = path.join(__dirname, '../../data');
  const defaultPath = fs.existsSync(path.join(dataDir, 'spices-powder.xlsx'))
    ? path.join(dataDir, 'spices-powder.xlsx')
    : path.join(dataDir, 'spices-powder.csv');
  const filePath = process.argv[2] || defaultPath;

  if (!fs.existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    console.error('Save your Spices Powder sheet as backend/data/spices-powder.xlsx or .csv');
    console.error('Columns: Product Name, Category, Product Code, Barcode, Quantity, Package Type, Price');
    console.error('Or pass path: npx ts-node src/scripts/seedSpicesPowderProducts.ts path/to/file.xlsx');
    process.exit(1);
  }

  try {
    await mongoose.connect(config.mongoUri);
    console.log('Connected to database');

    const loaded = loadData(filePath);
    if (loaded.length === 0) {
      console.error('No rows found. Expected columns: Product Name, Category, Product Code, Barcode, Quantity, Package Type, Price');
      process.exit(1);
    }
    console.log(`Loaded ${loaded.length} rows from CSV`);

    const existingProducts = await Product.find({}, 'variants').lean();
    const existingBarcodes = new Set<string>();
    for (const p of existingProducts) {
      for (const v of (p as any).variants || []) {
        if (v.barcode) existingBarcodes.add(String(v.barcode).trim());
      }
    }

    const data = filterValidRows(loaded, existingBarcodes);
    if (data.length === 0) {
      console.error('No valid rows to import (all skipped due to invalid/duplicate barcodes).');
      process.exit(1);
    }
    console.log(`Migrating ${data.length} of ${loaded.length} rows (${loaded.length - data.length} skipped)`);

    const categories = await Category.find({ parentId: { $ne: null } }).lean();
    const categoryByCode = Object.fromEntries(categories.map((c: any) => [String(c.code || '').toUpperCase(), c]));
    const missingCodes = [...new Set(data.map((r) => r.category_code))].filter((c) => !categoryByCode[c]);
    if (missingCodes.length > 0) {
      console.error('Categories not found for codes:', missingCodes.join(', '));
      console.error('Available:', Object.keys(categoryByCode).join(', '));
      process.exit(1);
    }

    const suvaiBrand = { _id: new mongoose.Types.ObjectId(), name: 'Suvai' };
    const roundToTwo = (v: number) => Math.round(v * 100) / 100;

    const grouped = data.reduce<Record<string, RowData[]>>((acc, row) => {
      const key = `${row.category_code}::${row.product_name}`;
      if (!acc[key]) acc[key] = [];
      acc[key].push(row);
      return acc;
    }, {});

    const groupKeys = Object.keys(grouped).sort();
    const products: any[] = [];
    const skuCountByCat: Record<string, number> = {};
    for (const key of groupKeys) {
      const [catCode, prodName] = key.split('::');
      const variants = grouped[key];
      const cat = categoryByCode[catCode];
      skuCountByCat[catCode] = (skuCountByCat[catCode] || 0) + 1;
      const suffix = await Product.countDocuments({ sku: new RegExp(`^SUVAI-${catCode}-`) });
      const sku = `SUVAI-${catCode}-${String((suffix || 0) + skuCountByCat[catCode]).padStart(3, '0')}`;
      products.push({
        sku,
        name: prodName,
        description: prodName,
        category: {
          _id: cat._id,
          name: cat.name,
          path: cat.path,
        },
        brand: suvaiBrand,
        baseUnit: 'g',
        images: [],
        tags: ['suvai', catCode.toLowerCase()],
        attributes: {},
        variants: variants.map((v) => ({
          variantSku: v.item_code,
          name: v.weight_g >= 1000 ? `${v.weight_g / 1000} kg Pack` : `${v.weight_g}g Pack`,
          size: v.weight_g,
          unit: 'g',
          displaySize: v.weight_g >= 1000 ? `${v.weight_g / 1000} kg` : `${v.weight_g}g`,
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
      });
    }

    await Product.insertMany(products);
    console.log(`Inserted ${products.length} products (${data.length} variants total)`);
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
