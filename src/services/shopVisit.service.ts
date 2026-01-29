import { Types } from 'mongoose';
import ShopVisit from '../models/ShopVisit';
import Customer from '../models/Customer';
import User from '../models/User';
import { errors } from '../utils/errors';
import { parsePagination, buildPaginatedResponse } from '../utils/helpers';
import { IPaginationQuery } from '../types';

export class ShopVisitService {
  // Check in at shop
  static async checkIn(userId: string, data: any, deviceInfo?: string) {
    const user = await User.findById(userId);
    if (!user) {
      throw errors.notFound('User');
    }

    const customer = await Customer.findById(data.customerId);
    if (!customer) {
      throw errors.notFound('Customer');
    }

    // Check if already checked in at another shop
    const activeVisit = await ShopVisit.findOne({
      userId: new Types.ObjectId(userId),
      status: 'in_progress',
    });

    if (activeVisit) {
      throw errors.conflict(
        'Already checked in at another location. Please check out first.'
      );
    }

    const visit = new ShopVisit({
      userId: new Types.ObjectId(userId),
      employeeId: user.employeeId,
      customerId: new Types.ObjectId(data.customerId),
      customerCode: customer.customerCode,
      customerName: customer.name,
      visitDate: new Date(),
      checkIn: {
        time: new Date(),
        location: data.location,
        deviceInfo,
      },
      visitType: data.visitType || 'scheduled',
      purpose: data.purpose,
      status: 'in_progress',
      createdBy: new Types.ObjectId(userId),
    });

    await visit.save();

    return visit;
  }

  // Check out from shop
  static async checkOut(visitId: string, userId: string, data: any, deviceInfo?: string) {
    const visit = await ShopVisit.findOne({
      _id: new Types.ObjectId(visitId),
      userId: new Types.ObjectId(userId),
    });

    if (!visit) {
      throw errors.notFound('Visit record');
    }

    if (visit.status !== 'in_progress') {
      throw errors.validation('Visit is not in progress');
    }

    visit.checkOut = {
      time: new Date(),
      location: data.location,
      deviceInfo,
    };

    // Calculate duration
    visit.calculateDuration();

    visit.notes = data.notes;
    visit.feedback = data.feedback;
    visit.nextVisitDate = data.nextVisitDate;
    visit.status = 'completed';
    visit.updatedBy = new Types.ObjectId(userId);

    await visit.save();

    return visit;
  }

  // Add activity during visit
  static async addActivity(visitId: string, userId: string, activity: any) {
    const visit = await ShopVisit.findOne({
      _id: new Types.ObjectId(visitId),
      userId: new Types.ObjectId(userId),
    });

    if (!visit) {
      throw errors.notFound('Visit record');
    }

    if (visit.status !== 'in_progress') {
      throw errors.validation('Cannot add activity to completed/cancelled visit');
    }

    visit.activities.push({
      type: activity.type,
      description: activity.description,
      referenceId: activity.referenceId ? new Types.ObjectId(activity.referenceId) : undefined,
      referenceType: activity.referenceType,
      amount: activity.amount,
      timestamp: new Date(),
    });

    await visit.save();

    return visit;
  }

  // Get shop visits with pagination
  static async getVisits(query: any, pagination: IPaginationQuery) {
    const { page, limit, skip } = parsePagination(pagination);

    const filter: any = {};

    if (query.userId) {
      filter.userId = new Types.ObjectId(query.userId);
    }

    if (query.employeeId) {
      filter.employeeId = query.employeeId;
    }

    if (query.customerId) {
      filter.customerId = new Types.ObjectId(query.customerId);
    }

    if (query.customerCode) {
      filter.customerCode = query.customerCode;
    }

    if (query.visitType) {
      filter.visitType = query.visitType;
    }

    if (query.status) {
      filter.status = query.status;
    }

    if (query.dateFrom || query.dateTo) {
      filter.visitDate = {};
      if (query.dateFrom) {
        filter.visitDate.$gte = new Date(query.dateFrom);
      }
      if (query.dateTo) {
        filter.visitDate.$lte = new Date(query.dateTo);
      }
    }

    const [visits, total] = await Promise.all([
      ShopVisit.find(filter)
        .populate('userId', 'employeeId firstName lastName fullName')
        .populate('customerId', 'customerCode name phone')
        .sort({ visitDate: -1 })
        .skip(skip)
        .limit(limit),
      ShopVisit.countDocuments(filter),
    ]);

    return buildPaginatedResponse(visits, total, page, limit);
  }

  // Get visit by ID
  static async getVisitById(id: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw errors.validation('Invalid visit ID');
    }

    const visit = await ShopVisit.findById(id)
      .populate('userId', 'employeeId firstName lastName fullName phone')
      .populate('customerId', 'customerCode name companyName phone addresses');

    if (!visit) {
      throw errors.notFound('Visit record');
    }

    return visit;
  }

  // Get active visit for user
  static async getActiveVisit(userId: string) {
    const visit = await ShopVisit.findOne({
      userId: new Types.ObjectId(userId),
      status: 'in_progress',
    }).populate('customerId', 'customerCode name phone addresses');

    return visit;
  }

  // Update visit
  static async updateVisit(id: string, data: any, userId: string) {
    const visit = await this.getVisitById(id);

    if (visit.userId.toString() !== userId) {
      throw errors.forbidden('update this visit');
    }

    // Update allowed fields
    if (data.purpose) visit.purpose = data.purpose;
    if (data.notes) visit.notes = data.notes;
    if (data.feedback) visit.feedback = data.feedback;
    if (data.nextVisitDate) visit.nextVisitDate = data.nextVisitDate;
    if (data.photos) visit.photos = data.photos;

    visit.updatedBy = new Types.ObjectId(userId);

    await visit.save();

    return visit;
  }

  // Cancel visit
  static async cancelVisit(id: string, userId: string, reason?: string) {
    const visit = await this.getVisitById(id);

    if (visit.userId.toString() !== userId) {
      throw errors.forbidden('cancel this visit');
    }

    if (visit.status !== 'in_progress') {
      throw errors.validation('Only in-progress visits can be cancelled');
    }

    visit.status = 'cancelled';
    visit.notes = reason || visit.notes;
    visit.updatedBy = new Types.ObjectId(userId);

    await visit.save();

    return visit;
  }

  // Get visit statistics for a user
  static async getVisitStats(userId: string, dateFrom?: Date, dateTo?: Date) {
    const filter: any = {
      userId: new Types.ObjectId(userId),
      status: 'completed',
    };

    if (dateFrom || dateTo) {
      filter.visitDate = {};
      if (dateFrom) filter.visitDate.$gte = dateFrom;
      if (dateTo) filter.visitDate.$lte = dateTo;
    }

    const visits = await ShopVisit.find(filter);

    const stats = {
      totalVisits: visits.length,
      scheduledVisits: visits.filter((v) => v.visitType === 'scheduled').length,
      unscheduledVisits: visits.filter((v) => v.visitType === 'unscheduled').length,
      averageDuration: visits.reduce((sum, v) => sum + v.duration, 0) / visits.length || 0,
      totalActivities: visits.reduce((sum, v) => sum + v.activities.length, 0),
      averageCustomerSatisfaction:
        visits
          .filter((v) => v.feedback?.customerSatisfaction)
          .reduce((sum, v) => sum + (v.feedback?.customerSatisfaction || 0), 0) /
          visits.filter((v) => v.feedback?.customerSatisfaction).length || 0,
    };

    return stats;
  }

  // Get visits by location (nearby)
  static async getNearbyVisits(
    longitude: number,
    latitude: number,
    maxDistance: number = 5000
  ) {
    const visits = await ShopVisit.find({
      'checkIn.location': {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates: [longitude, latitude],
          },
          $maxDistance: maxDistance,
        },
      },
      status: 'completed',
    })
      .populate('userId', 'employeeId firstName lastName fullName')
      .populate('customerId', 'customerCode name')
      .limit(20);

    return visits;
  }

  // Get visit summary for customer
  static async getCustomerVisitHistory(customerId: string, limit: number = 10) {
    if (!Types.ObjectId.isValid(customerId)) {
      throw errors.validation('Invalid customer ID');
    }

    const visits = await ShopVisit.find({
      customerId: new Types.ObjectId(customerId),
    })
      .populate('userId', 'employeeId firstName lastName fullName')
      .sort({ visitDate: -1 })
      .limit(limit);

    const totalVisits = await ShopVisit.countDocuments({
      customerId: new Types.ObjectId(customerId),
    });

    const lastVisit = visits[0] || null;

    return {
      totalVisits,
      recentVisits: visits,
      lastVisit,
    };
  }
}
