import { Response, NextFunction } from 'express';
import { IAuthRequest } from '../types';
import { CompanyService } from '../services/company.service';

export class CompanyController {
  static async list(req: IAuthRequest, res: Response, next: NextFunction) {
    try {
      const companies = await CompanyService.listForUser(req.user);
      res.json({ success: true, data: companies });
    } catch (e) {
      next(e);
    }
  }

  static async getById(req: IAuthRequest, res: Response, next: NextFunction) {
    try {
      const company = await CompanyService.getById(req.params.id, req.user);
      res.json({ success: true, data: company });
    } catch (e) {
      next(e);
    }
  }

  static async create(req: IAuthRequest, res: Response, next: NextFunction) {
    try {
      CompanyService.assertUserCanManageCompanies(req.user!);
      const data = await CompanyService.create(req.body, req.user!._id.toString());
      res.status(201).json({ success: true, data, message: 'Company created' });
    } catch (e) {
      next(e);
    }
  }

  static async update(req: IAuthRequest, res: Response, next: NextFunction) {
    try {
      CompanyService.assertUserCanManageCompanies(req.user!);
      const data = await CompanyService.update(req.params.id, req.body, req.user!._id.toString());
      res.json({ success: true, data, message: 'Company updated' });
    } catch (e) {
      next(e);
    }
  }
}
