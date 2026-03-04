import { Response, NextFunction } from 'express';
import { IAuthRequest } from '../types';
import Customer from '../models/Customer';
import { errors } from '../utils/errors';
import { parsePagination, buildPaginatedResponse } from '../utils/helpers';
import { NumberingService } from '../services/numbering.service';

export class CustomerController {
  static async getAll(req: IAuthRequest, res: Response, next: NextFunction) {
    try {
      const { page, limit, skip } = parsePagination(req.query);
      const filter: any = {};

      if (req.query.status) {
        filter.status = req.query.status;
      }

      if (req.query.search) {
        filter.$or = [
          { name: { $regex: req.query.search, $options: 'i' } },
          { customerCode: { $regex: req.query.search, $options: 'i' } },
          { phone: { $regex: req.query.search, $options: 'i' } },
        ];
      }

      const [customers, total] = await Promise.all([
        Customer.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
        Customer.countDocuments(filter),
      ]);

      const result = buildPaginatedResponse(customers, total, page, limit);

      res.json({ success: true, ...result });
    } catch (error) {
      next(error);
    }
  }

  static async getById(req: IAuthRequest, res: Response, next: NextFunction) {
    try {
      const customer = await Customer.findById(req.params.id);

      if (!customer) {
        throw errors.notFound('Customer');
      }

      res.json({ success: true, data: customer });
    } catch (error) {
      next(error);
    }
  }

  static async create(req: IAuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user?._id.toString() || '';

      // Generate customer code from numbering config
      const customerCode = await NumberingService.getNextCode('customer');

      const customerData = {
        ...req.body,
        customerCode,
        creditInfo: {
          creditLimit: req.body.creditLimit || 0,
          currentOutstanding: 0,
          availableCredit: req.body.creditLimit || 0,
          creditTermDays: req.body.creditTermDays || 30,
          creditStatus: 'active',
        },
        createdBy: userId,
        updatedBy: userId,
      };

      const customer = new Customer(customerData);
      await customer.save();

      res.status(201).json({
        success: true,
        data: customer,
        message: 'Customer created successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  static async update(req: IAuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user?._id.toString() || '';

      const customer = await Customer.findById(req.params.id);
      if (!customer) {
        throw errors.notFound('Customer');
      }

      Object.assign(customer, req.body);
      (customer as any).updatedBy = userId;

      await customer.save();

      res.json({
        success: true,
        data: customer,
        message: 'Customer updated successfully',
      });
    } catch (error) {
      next(error);
    }
  }
}
