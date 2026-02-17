import { Types } from 'mongoose';
import EarningDeduction from '../models/EarningDeduction';
import { errors } from '../utils/errors';
import { parsePagination, buildPaginatedResponse } from '../utils/helpers';
import { IPaginationQuery } from '../types';

export class EarningDeductionService {
  // Get all earning/deductions with pagination and filters
  static async getEarningDeductions(query: any, pagination: IPaginationQuery) {
    const { page, limit, skip } = parsePagination(pagination);

    const filter: any = {};

    // Type filter (earning or deduction)
    if (query.type) {
      filter.type = query.type;
    }

    // Category filter
    if (query.category) {
      filter.category = query.category;
    }

    // Active filter
    if (query.isActive !== undefined) {
      filter.isActive = query.isActive === 'true' || query.isActive === true;
    }

    // Search filter
    if (query.search) {
      filter.$or = [
        { name: { $regex: query.search, $options: 'i' } },
        { code: { $regex: query.search, $options: 'i' } },
        { description: { $regex: query.search, $options: 'i' } },
      ];
    }

    const [earningDeductions, total] = await Promise.all([
      EarningDeduction.find(filter)
        .sort({ type: 1, 'payrollBehavior.sortOrder': 1, name: 1 })
        .skip(skip)
        .limit(limit),
      EarningDeduction.countDocuments(filter),
    ]);

    return buildPaginatedResponse(earningDeductions, total, page, limit);
  }

  // Get all active components for assignment (no pagination)
  static async getActiveComponents(type?: 'earning' | 'deduction') {
    const filter: any = { isActive: true };

    if (type) {
      filter.type = type;
    }

    const components = await EarningDeduction.find(filter)
      .sort({ type: 1, 'payrollBehavior.sortOrder': 1, name: 1 });

    return components;
  }

  // Get earning/deduction by ID
  static async getEarningDeductionById(id: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw errors.validation('Invalid earning/deduction ID');
    }

    const earningDeduction = await EarningDeduction.findById(id);

    if (!earningDeduction) {
      throw errors.notFound('EarningDeduction');
    }

    return earningDeduction;
  }

  // Get earning/deduction by code
  static async getByCode(code: string) {
    const earningDeduction = await EarningDeduction.findOne({
      code: code.toUpperCase(),
    });

    if (!earningDeduction) {
      throw errors.notFound('EarningDeduction');
    }

    return earningDeduction;
  }

  // Create earning/deduction
  static async createEarningDeduction(data: any, userId: string) {
    data.code = data.code.toUpperCase();

    // Check if code already exists
    const existing = await EarningDeduction.findOne({ code: data.code });
    if (existing) {
      throw errors.duplicateEntry('Code', data.code);
    }

    // Validate calculation method
    this.validateCalculation(data);

    data.createdBy = userId;
    data.updatedBy = userId;

    const earningDeduction = new EarningDeduction(data);
    await earningDeduction.save();

    return earningDeduction;
  }

  // Update earning/deduction
  static async updateEarningDeduction(id: string, data: any, userId: string) {
    const earningDeduction = await this.getEarningDeductionById(id);

    // Cannot update system components
    if (earningDeduction.isSystem && data.code) {
      throw errors.validation('Cannot modify code of system components');
    }

    // Check for duplicate code if code is being changed
    if (data.code && data.code.toUpperCase() !== earningDeduction.code) {
      const existing = await EarningDeduction.findOne({
        code: data.code.toUpperCase(),
        _id: { $ne: earningDeduction._id },
      });

      if (existing) {
        throw errors.duplicateEntry('Code', data.code);
      }

      data.code = data.code.toUpperCase();
    }

    // Validate and normalize calculation if provided - merge with existing calculation first
    if (data.calculation) {
      // Merge existing calculation with new data to ensure complete validation
      const existingCalc = earningDeduction.calculation
        ? JSON.parse(JSON.stringify(earningDeduction.calculation))
        : {};
      const mergedCalculation = {
        ...existingCalc,
        ...data.calculation,
      };
      // Validate (and apply defaults like percentageOf=['BASIC'])
      this.validateCalculation({ calculation: mergedCalculation });
      // Use the normalized calculation for the update
      data.calculation = mergedCalculation;
    }

    data.updatedBy = userId;

    Object.assign(earningDeduction, data);
    await earningDeduction.save();

    return earningDeduction;
  }

  // Delete earning/deduction
  static async deleteEarningDeduction(id: string) {
    const earningDeduction = await this.getEarningDeductionById(id);

    // Cannot delete system components
    if (earningDeduction.isSystem) {
      throw errors.validation('Cannot delete system components');
    }

    // Soft delete by setting inactive
    earningDeduction.isActive = false;
    await earningDeduction.save();

    return { message: 'Earning/deduction deactivated successfully' };
  }

  // Validate calculation configuration
  private static validateCalculation(data: any) {
    const { calculation } = data;

    if (!calculation || !calculation.method) {
      return;
    }

    switch (calculation.method) {
      case 'fixed':
        if (calculation.fixedAmount === undefined || calculation.fixedAmount < 0) {
          throw errors.validation('Fixed amount is required and must be non-negative');
        }
        break;

      case 'percentage':
        // Default percentageOf to BASIC if not provided
        if (!calculation.percentageOf || calculation.percentageOf.length === 0) {
          calculation.percentageOf = ['BASIC'];
        }
        if (calculation.percentageValue === undefined || calculation.percentageValue < 0) {
          throw errors.validation('Percentage value is required and must be non-negative');
        }
        break;

      case 'slab':
        if (!calculation.slabs || calculation.slabs.length === 0) {
          throw errors.validation('Slabs are required for slab-based calculation');
        }
        // Validate slab structure
        for (const slab of calculation.slabs) {
          if (slab.from === undefined || slab.to === undefined) {
            throw errors.validation('Each slab must have from and to values');
          }
          if (slab.from > slab.to) {
            throw errors.validation('Slab from value cannot be greater than to value');
          }
        }
        break;
    }
  }

  // Calculate component amount
  static calculateAmount(
    component: any,
    basicSalary: number,
    otherEarnings: Map<string, number> = new Map()
  ): number {
    const { calculation } = component;

    switch (calculation.method) {
      case 'fixed':
        return calculation.fixedAmount || 0;

      case 'percentage':
        let base = 0;
        for (const baseCode of calculation.percentageOf || []) {
          if (baseCode === 'BASIC') {
            base += basicSalary;
          } else {
            base += otherEarnings.get(baseCode) || 0;
          }
        }
        return (base * (calculation.percentageValue || 0)) / 100;

      case 'slab':
        for (const slab of calculation.slabs || []) {
          if (basicSalary >= slab.from && basicSalary <= slab.to) {
            if (slab.rate) {
              return (basicSalary * slab.rate) / 100;
            }
            return slab.fixedAmount || 0;
          }
        }
        return 0;

      default:
        return 0;
    }
  }

}
