import { Response, NextFunction } from 'express';
import { IAuthRequest } from '../types';
import Vendor from '../models/Vendor';
import { errors } from '../utils/errors';
import { parsePagination, buildPaginatedResponse, generateCode } from '../utils/helpers';

export class VendorController {
  static async getAll(req: IAuthRequest, res: Response, next: NextFunction) {
    try {
      const { page, limit, skip } = parsePagination(req.query);
      const filter: Record<string, unknown> = {};

      if (req.query.status) {
        filter.status = req.query.status;
      }

      if (req.query.search) {
        filter.$or = [
          { name: { $regex: req.query.search, $options: 'i' } },
          { vendorCode: { $regex: req.query.search, $options: 'i' } },
          { companyName: { $regex: req.query.search, $options: 'i' } },
          { phone: { $regex: req.query.search, $options: 'i' } },
        ];
      }

      const [vendors, total] = await Promise.all([
        Vendor.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
        Vendor.countDocuments(filter),
      ]);

      const result = buildPaginatedResponse(vendors, total, page, limit);

      res.json({ success: true, ...result });
    } catch (error) {
      next(error);
    }
  }

  static async getById(req: IAuthRequest, res: Response, next: NextFunction) {
    try {
      const vendor = await Vendor.findById(req.params.id);

      if (!vendor) {
        throw errors.notFound('Vendor');
      }

      res.json({ success: true, data: vendor });
    } catch (error) {
      next(error);
    }
  }

  static async create(req: IAuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user?._id?.toString() || '';

      const count = await Vendor.countDocuments();
      const vendorCode = generateCode('VND', count + 1, 5);

      const vendorData = {
        ...req.body,
        vendorCode,
        createdBy: userId,
        updatedBy: userId,
      };

      const vendor = new Vendor(vendorData);
      await vendor.save();

      res.status(201).json({
        success: true,
        data: vendor,
        message: 'Vendor created successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  static async update(req: IAuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user?._id?.toString() || '';

      const vendor = await Vendor.findById(req.params.id);
      if (!vendor) {
        throw errors.notFound('Vendor');
      }

      Object.assign(vendor, req.body);
      (vendor as any).updatedBy = userId;

      await vendor.save();

      res.json({
        success: true,
        data: vendor,
        message: 'Vendor updated successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  static async delete(req: IAuthRequest, res: Response, next: NextFunction) {
    try {
      const vendor = await Vendor.findById(req.params.id);
      if (!vendor) {
        throw errors.notFound('Vendor');
      }

      await Vendor.findByIdAndDelete(req.params.id);

      res.json({
        success: true,
        message: 'Vendor deleted successfully',
      });
    } catch (error) {
      next(error);
    }
  }
}
