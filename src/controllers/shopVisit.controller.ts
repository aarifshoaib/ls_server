import { Response, NextFunction } from 'express';
import { IAuthRequest } from '../types';
import { ShopVisitService } from '../services/shopVisit.service';

export class ShopVisitController {
  // Check in at shop
  static async checkIn(req: IAuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user?._id.toString() || '';
      const deviceInfo = req.headers['user-agent'];

      const visit = await ShopVisitService.checkIn(userId, req.body, deviceInfo);

      res.status(201).json({
        success: true,
        data: visit,
        message: 'Checked in successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  // Check out from shop
  static async checkOut(req: IAuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user?._id.toString() || '';
      const deviceInfo = req.headers['user-agent'];

      const visit = await ShopVisitService.checkOut(
        req.params.id,
        userId,
        req.body,
        deviceInfo
      );

      res.json({
        success: true,
        data: visit,
        message: 'Checked out successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  // Add activity during visit
  static async addActivity(req: IAuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user?._id.toString() || '';
      const visit = await ShopVisitService.addActivity(req.params.id, userId, req.body);

      res.json({
        success: true,
        data: visit,
        message: 'Activity added successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  // Get all visits
  static async getAll(req: IAuthRequest, res: Response, next: NextFunction) {
    try {
      const result = await ShopVisitService.getVisits(req.query, req.query);

      res.json({
        success: true,
        ...result,
      });
    } catch (error) {
      next(error);
    }
  }

  // Get visit by ID
  static async getById(req: IAuthRequest, res: Response, next: NextFunction) {
    try {
      const visit = await ShopVisitService.getVisitById(req.params.id);

      res.json({
        success: true,
        data: visit,
      });
    } catch (error) {
      next(error);
    }
  }

  // Get active visit
  static async getActiveVisit(req: IAuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user?._id.toString() || '';
      const visit = await ShopVisitService.getActiveVisit(userId);

      res.json({
        success: true,
        data: visit,
      });
    } catch (error) {
      next(error);
    }
  }

  // Get today's visits
  static async getTodayVisits(req: IAuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user?._id.toString() || '';
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const result = await ShopVisitService.getVisits(
        {
          userId,
          dateFrom: today.toISOString(),
          dateTo: tomorrow.toISOString()
        },
        { limit: 100 }
      );

      res.json({
        success: true,
        data: result.data || [],
      });
    } catch (error) {
      next(error);
    }
  }

  // Update visit
  static async update(req: IAuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user?._id.toString() || '';
      const visit = await ShopVisitService.updateVisit(req.params.id, req.body, userId);

      res.json({
        success: true,
        data: visit,
        message: 'Visit updated successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  // Cancel visit
  static async cancel(req: IAuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user?._id.toString() || '';
      const { reason } = req.body;

      const visit = await ShopVisitService.cancelVisit(req.params.id, userId, reason);

      res.json({
        success: true,
        data: visit,
        message: 'Visit cancelled successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  // Get my visits
  static async getMyVisits(req: IAuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user?._id.toString() || '';
      const result = await ShopVisitService.getVisits({ ...req.query, userId }, req.query);

      res.json({
        success: true,
        ...result,
      });
    } catch (error) {
      next(error);
    }
  }

  // Get visit statistics
  static async getStats(req: IAuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.params.userId || req.user?._id.toString() || '';
      const dateFrom = req.query.dateFrom ? new Date(req.query.dateFrom as string) : undefined;
      const dateTo = req.query.dateTo ? new Date(req.query.dateTo as string) : undefined;

      const stats = await ShopVisitService.getVisitStats(userId, dateFrom, dateTo);

      res.json({
        success: true,
        data: stats,
      });
    } catch (error) {
      next(error);
    }
  }

  // Get nearby visits
  static async getNearby(req: IAuthRequest, res: Response, next: NextFunction) {
    try {
      const longitude = parseFloat(req.query.longitude as string);
      const latitude = parseFloat(req.query.latitude as string);
      const maxDistance = req.query.maxDistance
        ? parseInt(req.query.maxDistance as string)
        : 5000;

      const visits = await ShopVisitService.getNearbyVisits(longitude, latitude, maxDistance);

      res.json({
        success: true,
        data: visits,
      });
    } catch (error) {
      next(error);
    }
  }

  // Get customer visit history
  static async getCustomerHistory(req: IAuthRequest, res: Response, next: NextFunction) {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 10;
      const result = await ShopVisitService.getCustomerVisitHistory(req.params.customerId, limit);

      res.json({
        success: true,
        ...result,
      });
    } catch (error) {
      next(error);
    }
  }
}
