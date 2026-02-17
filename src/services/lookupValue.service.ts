import { Types } from 'mongoose';
import LookupValue from '../models/LookupValue';
import { errors } from '../utils/errors';
import { parsePagination, buildPaginatedResponse } from '../utils/helpers';
import { IPaginationQuery } from '../types';

export class LookupValueService {
  // Get all lookup values with pagination and filters
  static async getLookupValues(query: any, pagination: IPaginationQuery) {
    const { page, limit, skip } = parsePagination(pagination);

    const filter: any = {};

    // Category filter
    if (query.category) {
      filter.category = query.category;
    }

    // Active filter
    if (query.isActive !== undefined) {
      filter.isActive = query.isActive === 'true' || query.isActive === true;
    }

    // Parent filter
    if (query.parentId) {
      filter.parentId = new Types.ObjectId(query.parentId);
    } else if (query.rootOnly === 'true') {
      filter.parentId = null;
    }

    // Search filter
    if (query.search) {
      filter.$or = [
        { name: { $regex: query.search, $options: 'i' } },
        { code: { $regex: query.search, $options: 'i' } },
        { nameAr: { $regex: query.search, $options: 'i' } },
      ];
    }

    const [lookupValues, total] = await Promise.all([
      LookupValue.find(filter)
        .sort({ 'metadata.sortOrder': 1, name: 1 })
        .skip(skip)
        .limit(limit),
      LookupValue.countDocuments(filter),
    ]);

    return buildPaginatedResponse(lookupValues, total, page, limit);
  }

  // Get lookup values by category (no pagination, for dropdowns)
  static async getByCategory(category: string, includeInactive: boolean = false) {
    const filter: any = { category };

    if (!includeInactive) {
      filter.isActive = true;
    }

    const lookupValues = await LookupValue.find(filter)
      .sort({ 'metadata.sortOrder': 1, name: 1 });

    return lookupValues;
  }

  // Get lookup value by ID
  static async getLookupValueById(id: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw errors.validation('Invalid lookup value ID');
    }

    const lookupValue = await LookupValue.findById(id);

    if (!lookupValue) {
      throw errors.notFound('LookupValue');
    }

    return lookupValue;
  }

  // Get lookup value by category and code
  static async getByCode(category: string, code: string) {
    const lookupValue = await LookupValue.findOne({
      category,
      code: code.toUpperCase(),
    });

    if (!lookupValue) {
      throw errors.notFound('LookupValue');
    }

    return lookupValue;
  }

  // Create lookup value
  static async createLookupValue(data: any, userId: string) {
    data.code = data.code.toUpperCase();

    // Check if code already exists in category
    const existing = await LookupValue.findOne({
      category: data.category,
      code: data.code,
    });

    if (existing) {
      throw errors.duplicateEntry('Code', `${data.category}/${data.code}`);
    }

    // Validate parent if provided
    if (data.parentId) {
      const parent = await LookupValue.findById(data.parentId);
      if (!parent) {
        throw errors.validation('Parent lookup value not found');
      }
      if (parent.category !== data.category) {
        throw errors.validation('Parent must be in the same category');
      }
    }

    data.createdBy = userId;
    data.updatedBy = userId;

    const lookupValue = new LookupValue(data);
    await lookupValue.save();

    return lookupValue;
  }

  // Update lookup value
  static async updateLookupValue(id: string, data: any, userId: string) {
    const lookupValue = await this.getLookupValueById(id);

    // Cannot update system lookup values
    if (lookupValue.isSystem && (data.code || data.category)) {
      throw errors.validation('Cannot modify code or category of system lookup values');
    }

    // Check for duplicate code if code is being changed
    if (data.code && data.code.toUpperCase() !== lookupValue.code) {
      const existing = await LookupValue.findOne({
        category: lookupValue.category,
        code: data.code.toUpperCase(),
        _id: { $ne: lookupValue._id },
      });

      if (existing) {
        throw errors.duplicateEntry('Code', data.code);
      }

      data.code = data.code.toUpperCase();
    }

    data.updatedBy = userId;

    Object.assign(lookupValue, data);
    await lookupValue.save();

    return lookupValue;
  }

  // Delete lookup value
  static async deleteLookupValue(id: string) {
    const lookupValue = await this.getLookupValueById(id);

    // Cannot delete system lookup values
    if (lookupValue.isSystem) {
      throw errors.validation('Cannot delete system lookup values');
    }

    // Check if has children
    const hasChildren = await LookupValue.exists({ parentId: lookupValue._id });
    if (hasChildren) {
      throw errors.validation('Cannot delete lookup value with children. Delete children first.');
    }

    await lookupValue.deleteOne();

    return { message: 'Lookup value deleted successfully' };
  }

  // Get all categories
  static async getCategories() {
    const categories = await LookupValue.distinct('category');
    return categories.sort();
  }

  // Bulk create lookup values
  static async bulkCreate(data: any[], userId: string) {
    const lookupValues = data.map((item) => ({
      ...item,
      code: item.code.toUpperCase(),
      createdBy: userId,
      updatedBy: userId,
    }));

    const result = await LookupValue.insertMany(lookupValues, { ordered: false });
    return result;
  }
}
