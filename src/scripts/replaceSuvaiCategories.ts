/**
 * Migration: Drop all categories under Suvai and insert new categories.
 * Run: npx ts-node src/scripts/replaceSuvaiCategories.ts
 */
import mongoose from 'mongoose';
import { config } from '../config';
import Category from '../models/Category';
import Product from '../models/Product';

const slugify = (value: string) =>
  value
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const NEW_SUBCATEGORIES = [
  { name: 'Pulses & Beans', code: 'PB' },
  { name: 'Spices Powder', code: 'SP' },
  { name: 'Spices Whole', code: 'SW' },
  { name: 'Assorted Whole', code: 'AW' },
  { name: 'Assorted Powder', code: 'AP' },
  { name: 'Dry Fruits', code: 'DF' },
  { name: 'Chakki Atta/Maida', code: 'CA' },
  { name: 'Sugar', code: 'S' },
  { name: 'Rice', code: 'R' },
];

// Map old Suvai subcategory names to new category names (for product migration)
const OLD_TO_NEW_NAME: Record<string, string> = {
  'Suvai Pulses & Beans': 'Pulses & Beans',
  'Suvai Spices Powder': 'Spices Powder',
  'Suvai Spices Whole': 'Spices Whole',
  'Suvai Assorted Whole': 'Assorted Whole',
  'Suvai Assorted Powder': 'Assorted Powder',
  'Suvai Chakki Atta/Maida': 'Chakki Atta/Maida',
  'Suvai Dry Fruits': 'Dry Fruits',
  'Suvai Rice': 'Rice',
  'Suvai Sugar': 'Sugar',
  'Suvai Oil': 'Dry Fruits', // Oil removed; map to closest or Dry Fruits
};

async function run() {
  try {
    await mongoose.connect(config.mongoUri);
    console.log('Connected to database');

    const suvai = await Category.findOne({
      $or: [
        { slug: 'suvai' },
        { slug: 'suvai-brand' },
        { name: /^Suvai/i },
      ],
    });
    if (!suvai) {
      const roots = await Category.find({ parentId: null }).select('name slug').lean();
      console.error('Suvai category not found. Root categories:', roots);
      process.exit(1);
    }

    const oldChildren = await Category.find({ parentId: suvai._id });
    console.log(`Found ${oldChildren.length} existing subcategories under Suvai`);

    // Build old _id -> new category name mapping for products
    const oldIdToNewName: Record<string, string> = {};
    for (const c of oldChildren) {
      const newName = OLD_TO_NEW_NAME[c.name];
      if (newName) oldIdToNewName[c._id.toString()] = newName;
    }

    // Delete old subcategories
    const deleteResult = await Category.deleteMany({ parentId: suvai._id });
    console.log(`Deleted ${deleteResult.deletedCount} subcategories`);

    // Insert new subcategories
    const newCategories = await Category.insertMany(
      NEW_SUBCATEGORIES.map((item, index) => ({
        name: item.name,
        code: item.code,
        slug: `suvai-${slugify(item.code)}`,
        description: item.name,
        parentId: suvai._id,
        path: `${suvai.name}/${item.name}`,
        pathIds: [suvai._id],
        level: 1,
        sortOrder: index + 1,
        isActive: true,
        productCount: 0,
      }))
    );
    console.log(`Inserted ${newCategories.length} new subcategories`);

    // Build new name -> category map
    const newNameToCat = Object.fromEntries(newCategories.map((c) => [c.name, c]));

    // Update products: replace old category refs with new ones
    const products = await Product.find({ 'category._id': { $in: oldChildren.map((c) => c._id) } });
    let updated = 0;
    for (const product of products) {
      const cat = product.category as { _id: mongoose.Types.ObjectId; name: string; path: string } | undefined;
      if (!cat) continue;
      const newName = oldIdToNewName[cat._id.toString()];
      const newCat = newName ? newNameToCat[newName] : null;
      if (newCat) {
        (product as any).category = {
          _id: newCat._id,
          name: newCat.name,
          path: newCat.path,
        };
        await product.save();
        updated++;
      }
    }
    console.log(`Updated ${updated} products with new category references`);

    // Update productCount on new categories
    for (const cat of newCategories) {
      const count = await Product.countDocuments({ 'category._id': cat._id });
      await Category.updateOne({ _id: cat._id }, { productCount: count });
    }

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
