import { Response, NextFunction } from 'express';
import { IAuthRequest } from '../types';
import { LookupValueService } from '../services/lookupValue.service';

export class LookupValueController {
  static async getAll(req: IAuthRequest, res: Response, next: NextFunction) {
    try {
      const result = await LookupValueService.getLookupValues(req.query, req.query);

      res.json({
        success: true,
        ...result,
      });
    } catch (error) {
      next(error);
    }
  }

  static async getById(req: IAuthRequest, res: Response, next: NextFunction) {
    try {
      const lookupValue = await LookupValueService.getLookupValueById(req.params.id);

      res.json({
        success: true,
        data: lookupValue,
      });
    } catch (error) {
      next(error);
    }
  }

  static async getByCategory(req: IAuthRequest, res: Response, next: NextFunction) {
    try {
      const { category } = req.params;
      const includeInactive = req.query.includeInactive === 'true';
      const lookupValues = await LookupValueService.getByCategory(category, includeInactive);

      res.json({
        success: true,
        data: lookupValues,
      });
    } catch (error) {
      next(error);
    }
  }

  static async getByCode(req: IAuthRequest, res: Response, next: NextFunction) {
    try {
      const { category, code } = req.params;
      const lookupValue = await LookupValueService.getByCode(category, code);

      res.json({
        success: true,
        data: lookupValue,
      });
    } catch (error) {
      next(error);
    }
  }

  static async create(req: IAuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user?._id.toString() || '';
      const lookupValue = await LookupValueService.createLookupValue(req.body, userId);

      res.status(201).json({
        success: true,
        data: lookupValue,
        message: 'Lookup value created successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  static async update(req: IAuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user?._id.toString() || '';
      const lookupValue = await LookupValueService.updateLookupValue(req.params.id, req.body, userId);

      res.json({
        success: true,
        data: lookupValue,
        message: 'Lookup value updated successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  static async delete(req: IAuthRequest, res: Response, next: NextFunction) {
    try {
      const result = await LookupValueService.deleteLookupValue(req.params.id);

      res.json({
        success: true,
        ...result,
      });
    } catch (error) {
      next(error);
    }
  }

  static async getCategories(_req: IAuthRequest, res: Response, next: NextFunction) {
    try {
      const categories = await LookupValueService.getCategories();

      res.json({
        success: true,
        data: categories,
      });
    } catch (error) {
      next(error);
    }
  }

  static async bulkCreate(req: IAuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user?._id.toString() || '';
      const result = await LookupValueService.bulkCreate(req.body, userId);

      res.status(201).json({
        success: true,
        data: result,
        message: `${result.length} lookup values created successfully`,
      });
    } catch (error) {
      next(error);
    }
  }
}
