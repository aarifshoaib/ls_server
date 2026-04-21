import { Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import { IAuthRequest } from '../types';
import Customer from '../models/Customer';
import { errors } from '../utils/errors';
import { parsePagination, buildPaginatedResponse } from '../utils/helpers';
import { NumberingService } from '../services/numbering.service';
import {
  getCustomerOrderFinancialSnapshot,
  getLatestOutstandingByCustomerIds,
} from '../services/customerOrderStats.service';

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

      const ledgerOutstanding = await getLatestOutstandingByCustomerIds(
        customers.map((c) => c._id as mongoose.Types.ObjectId)
      );

      const enriched = customers.map((c) => {
        const o = c.toObject();
        const ci = o.creditInfo || ({} as { creditLimit?: number; currentOutstanding?: number });
        const limit = Number(ci.creditLimit) || 0;
        const embedded = Number(ci.currentOutstanding) || 0;
        const idKey = String(c._id);
        const out = ledgerOutstanding.has(idKey) ? ledgerOutstanding.get(idKey)! : embedded;
        const prevFs = ((o as any).financialSummary || {}) as Record<string, unknown>;
        return {
          ...o,
          creditInfo: {
            ...ci,
            currentOutstanding: out,
            availableCredit: Math.max(0, Math.round((limit - out) * 100) / 100),
          },
          financialSummary: {
            ...prevFs,
            totalOutstanding: out,
          },
        };
      });

      const result = buildPaginatedResponse(enriched, total, page, limit);

      res.json({ success: true, ...result });
    } catch (error) {
      next(error);
    }
  }

  static async getById(req: IAuthRequest, res: Response, next: NextFunction) {
    try {
      const customer = await Customer.findById(req.params.id).lean();

      if (!customer) {
        throw errors.notFound('Customer');
      }

      const snap = await getCustomerOrderFinancialSnapshot(req.params.id);
      const prevFs = (customer as any).financialSummary || {};
      const creditLimit = (customer as any).creditInfo?.creditLimit ?? 0;
      const embeddedOutstanding = Number((customer as any).creditInfo?.currentOutstanding) || 0;
      const ledgerMap = await getLatestOutstandingByCustomerIds([
        new mongoose.Types.ObjectId(req.params.id),
      ]);
      const reconciledOutstanding = ledgerMap.has(req.params.id)
        ? ledgerMap.get(req.params.id)!
        : embeddedOutstanding;
      const availableCredit = Math.round(Math.max(0, creditLimit - reconciledOutstanding) * 100) / 100;

      const financialSummary = {
        ...prevFs,
        totalOrders: snap.totalOrders,
        totalOrderValue: snap.totalOrderValue,
        averageOrderValue: snap.totalOrders > 0 ? snap.averageOrderValue : 0,
        lastOrderDate: snap.lastOrderDate ?? prevFs.lastOrderDate,
        totalOutstanding: reconciledOutstanding,
      };

      const creditInfo = {
        ...(customer as any).creditInfo,
        currentOutstanding: reconciledOutstanding,
        availableCredit,
      };

      res.json({
        success: true,
        data: { ...customer, financialSummary, creditInfo },
      });
    } catch (error) {
      next(error);
    }
  }

  static async create(req: IAuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user?._id.toString() || '';

      // Generate customer code from numbering config
      const customerCode = await NumberingService.getNextCode('customer');

      const creditLimit =
        Number(req.body.creditInfo?.creditLimit ?? req.body.creditLimit) || 0;
      const creditTermDays =
        Number(req.body.creditInfo?.creditTermDays ?? req.body.creditTermDays) || 30;

      const customerData = {
        ...req.body,
        customerCode,
        creditInfo: {
          creditLimit,
          currentOutstanding: 0,
          availableCredit: creditLimit,
          creditTermDays,
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

      const prevOutstanding = customer.creditInfo?.currentOutstanding ?? 0;
      const ciAny = customer.creditInfo as { toObject?: () => Record<string, unknown> } | undefined;
      const prevCreditDoc =
        ciAny && typeof ciAny.toObject === 'function'
          ? ciAny.toObject()
          : { ...(ciAny as Record<string, unknown> | undefined) };

      Object.assign(customer, req.body);
      (customer as any).updatedBy = userId;

      if (req.body.creditInfo) {
        const incoming = req.body.creditInfo as Record<string, unknown>;
        const old = (prevCreditDoc || {}) as Record<string, unknown>;
        const limit =
          incoming.creditLimit !== undefined
            ? Number(incoming.creditLimit) || 0
            : Number(old.creditLimit) || 0;
        const creditTermDays =
          incoming.creditTermDays !== undefined
            ? Number(incoming.creditTermDays) || 30
            : Number(old.creditTermDays) || 30;
        const creditStatus =
          (incoming.creditStatus as string) || (old.creditStatus as string) || 'active';

        (customer as any).creditInfo = {
          ...old,
          ...incoming,
          creditLimit: limit,
          creditTermDays,
          creditStatus,
          currentOutstanding: prevOutstanding,
          availableCredit: Math.max(0, Math.round((limit - prevOutstanding) * 100) / 100),
        };
      }

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
