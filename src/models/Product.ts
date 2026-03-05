import mongoose, { Schema } from 'mongoose';
import { IProduct, IProductCategory, IProductBrand, IProductImage, IProductVariant, IVariantPrice, IVariantStock, IDimensions, ISeoMeta } from '../types';

const productCategorySchema = new Schema<IProductCategory>(
  {
    _id: { type: Schema.Types.ObjectId, required: true },
    name: { type: String, required: true },
    path: { type: String, required: true },
  },
  { _id: false }
);

const productBrandSchema = new Schema<IProductBrand>(
  {
    _id: { type: Schema.Types.ObjectId, required: true },
    name: { type: String, required: true },
  },
  { _id: false }
);

const productImageSchema = new Schema<IProductImage>(
  {
    url: { type: String, required: true },
    isPrimary: { type: Boolean, default: false },
    alt: String,
  },
  { _id: false }
);

const dimensionsSchema = new Schema<IDimensions>(
  {
    length: Number,
    width: Number,
    height: Number,
  },
  { _id: false }
);

const variantPriceSchema = new Schema<IVariantPrice>(
  {
    basePrice: { type: Number, required: true },
    sellingPrice: { type: Number, required: true },
    discountedPrice: Number,
    discountPercent: Number,
    taxRate: { type: Number, default: 5 },
    taxInclusive: { type: Boolean, default: false },
  },
  { _id: false }
);

const variantStockSchema = new Schema<IVariantStock>(
  {
    quantity: { type: Number, required: true, default: 0 },
    reservedQuantity: { type: Number, default: 0 },
    availableQuantity: { type: Number, required: true, default: 0 },
    reorderLevel: { type: Number, default: 10 },
    reorderQuantity: { type: Number, default: 50 },
    warehouseLocation: String,
  },
  { _id: false }
);

const productVariantSchema = new Schema<IProductVariant>({
  variantSku: {
    type: String,
    required: true,
    index: true,
  },
  name: {
    type: String,
    required: true,
  },
  size: {
    type: Number,
    required: true,
  },
  unit: {
    type: String,
    required: true,
  },
  displaySize: {
    type: String,
    required: true,
  },
  barcode: {
    type: String,
    unique: true,
    sparse: true,
  },
  itemCode: {
    type: String,
    trim: true,
  },
  salesUom: {
    unitLabel: {
      type: String,
      default: 'unit',
    },
    pcsPerUnit: {
      type: Number,
      min: 1,
    },
  },
  price: {
    type: variantPriceSchema,
    required: true,
  },
  stock: {
    type: variantStockSchema,
    required: true,
    default: {},
  },
  status: {
    type: String,
    enum: ['active', 'inactive', 'discontinued'],
    default: 'active',
  },
  weight: Number,
  dimensions: dimensionsSchema,
});

const seoMetaSchema = new Schema<ISeoMeta>(
  {
    title: String,
    description: String,
    keywords: [String],
  },
  { _id: false }
);

const productSchema = new Schema<IProduct>(
  {
    sku: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      index: 'text',
    },
    nameAr: {
      type: String,
      trim: true,
    },
    description: {
      type: String,
      index: 'text',
    },
    category: {
      type: productCategorySchema,
      required: true,
    },
    brand: productBrandSchema,
    baseUnit: {
      type: String,
      required: true,
    },
    images: [productImageSchema],
    tags: [String],
    attributes: {
      type: Schema.Types.Mixed,
      default: {},
    },
    variants: [productVariantSchema],
    status: {
      type: String,
      enum: ['active', 'inactive', 'draft'],
      default: 'active',
      index: true,
    },
    seoMeta: seoMetaSchema,
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
productSchema.index({ sku: 1 });
productSchema.index({ 'variants.variantSku': 1 });
productSchema.index({ 'variants.barcode': 1 }, { sparse: true });
productSchema.index({ name: 'text', description: 'text' });
productSchema.index({ 'category._id': 1 });
productSchema.index({ 'brand._id': 1 });
productSchema.index({ status: 1 });
productSchema.index({ tags: 1 });
productSchema.index({ 'variants.stock.availableQuantity': 1 });
productSchema.index({ createdAt: -1 });

const Product = mongoose.model<IProduct>('Product', productSchema);

export default Product;
