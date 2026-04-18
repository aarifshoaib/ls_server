import { Types } from 'mongoose';
import Product from '../models/Product';
import { errors } from '../utils/errors';
import { parsePagination, buildPaginatedResponse, generateSKU } from '../utils/helpers';
import { IPaginationQuery } from '../types';

export class ProductService {
  // Get all products with pagination and filters
  static async getProducts(query: any, pagination: IPaginationQuery) {
    const { page, limit, skip } = parsePagination(pagination);

    const filter: any = {};

    // Status filter
    if (query.status) {
      filter.status = query.status;
    }

    // Category filter
    if (query.categoryId) {
      filter['category._id'] = new Types.ObjectId(query.categoryId);
    }

    // Search filter (regex-escape user input for safe $regex)
    if (query.search) {
      const raw = String(query.search).trim();
      if (raw) {
        const escaped = raw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        filter.$or = [
          { name: { $regex: escaped, $options: 'i' } },
          { nameAr: { $regex: escaped, $options: 'i' } },
          { sku: { $regex: escaped, $options: 'i' } },
          { 'category.name': { $regex: escaped, $options: 'i' } },
          { tags: { $regex: escaped, $options: 'i' } },
          { 'variants.name': { $regex: escaped, $options: 'i' } },
          { 'variants.variantSku': { $regex: escaped, $options: 'i' } },
          { 'variants.barcode': { $regex: escaped, $options: 'i' } },
          { 'variants.itemCode': { $regex: escaped, $options: 'i' } },
        ];
      }
    }

    // Low stock filter
    if (query.lowStock === 'true') {
      filter.$expr = {
        $lte: [
          { $min: '$variants.stock.quantity' },
          { $min: '$variants.stock.reorderLevel' },
        ],
      };
    }

    const [products, total] = await Promise.all([
      Product.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
      Product.countDocuments(filter),
    ]);

    return buildPaginatedResponse(products, total, page, limit);
  }

  // Get product by ID
  static async getProductById(id: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw errors.validation('Invalid product ID');
    }

    const product = await Product.findById(id);

    if (!product) {
      throw errors.notFound('Product');
    }

    return product;
  }

  // Get product by SKU
  static async getProductBySku(sku: string) {
    const product = await Product.findOne({ sku: sku.toUpperCase() });

    if (!product) {
      throw errors.notFound('Product');
    }

    return product;
  }

  // Create product
  static async createProduct(data: any, userId: string) {
    // Generate SKU if not provided
    if (!data.sku) {
      let baseSku = generateSKU(data.name);
      let candidate = baseSku;
      let suffix = 2;
      while (await Product.findOne({ sku: candidate })) {
        candidate = `${baseSku}-${suffix}`;
        suffix++;
      }
      data.sku = candidate;
    } else {
      data.sku = data.sku.toUpperCase();
      const existingProduct = await Product.findOne({ sku: data.sku });
      if (existingProduct) {
        throw errors.duplicateEntry('SKU', data.sku);
      }
    }

    // Generate variant SKUs
    if (data.variants && data.variants.length > 0) {
      data.variants = data.variants.map((variant: any) => {
        if (!variant.variantSku) {
          variant.variantSku = `${data.sku}-${variant.displaySize.replace(/\s/g, '')}`.toUpperCase();
        }
        // Calculate available quantity
        variant.stock.availableQuantity =
          variant.stock.quantity - (variant.stock.reservedQuantity || 0);
        return variant;
      });
    }

    data.createdBy = userId;
    data.updatedBy = userId;

    const product = new Product(data);
    await product.save();

    return product;
  }

  // Update product
  static async updateProduct(id: string, data: any, userId: string) {
    const product = await this.getProductById(id);

    // Update variants if provided
    if (data.variants) {
      data.variants = data.variants.map((variant: any) => {
        if (!variant.variantSku) {
          variant.variantSku = `${product.sku}-${variant.displaySize.replace(/\s/g, '')}`.toUpperCase();
        }
        variant.stock.availableQuantity =
          variant.stock.quantity - (variant.stock.reservedQuantity || 0);
        return variant;
      });
    }

    data.updatedBy = userId;

    Object.assign(product, data);
    await product.save();

    return product;
  }

  // Delete product (soft delete)
  static async deleteProduct(id: string) {
    const product = await this.getProductById(id);

    product.status = 'inactive';
    await product.save();

    return { message: 'Product deleted successfully' };
  }

  // Get low stock products (reorder level is in selling units; quantity is in pieces)
  static async getLowStockProducts() {
    const idRows = await Product.aggregate<{ _id: Types.ObjectId }>([
      { $match: { status: 'active' } },
      { $unwind: '$variants' },
      { $match: { 'variants.status': 'active' } },
      {
        $addFields: {
          ppu: { $max: [{ $ifNull: ['$variants.salesUom.pcsPerUnit', 1] }, 1] },
          qtyPieces: { $ifNull: ['$variants.stock.quantity', 0] },
          reorder: { $ifNull: ['$variants.stock.reorderLevel', 0] },
        },
      },
      { $addFields: { qtyInUnits: { $divide: ['$qtyPieces', '$ppu'] } } },
      {
        $match: {
          $expr: {
            $or: [
              { $eq: ['$qtyPieces', 0] },
              {
                $and: [{ $gt: ['$qtyPieces', 0] }, { $lte: ['$qtyInUnits', '$reorder'] }],
              },
            ],
          },
        },
      },
      { $group: { _id: '$_id' } },
    ]);
    const ids = idRows.map((r) => r._id);
    if (!ids.length) return [];
    return Product.find({ _id: { $in: ids } }).sort({ name: 1 });
  }
}
