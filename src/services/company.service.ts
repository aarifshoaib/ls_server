import { Types } from 'mongoose';
import Company from '../models/Company';
import { errors } from '../utils/errors';
import { IUser } from '../types';
import { canAccessCompanyId, getAccessibleCompanyIds, GLOBAL_COMPANY_ROLES } from '../utils/companyScope';

export class CompanyService {
  static async listForUser(user: IUser | undefined) {
    const filter: Record<string, unknown> = { isActive: true };
    const scope = getAccessibleCompanyIds(user);
    if (scope !== 'all') {
      if (scope.length === 0) return [];
      filter._id = { $in: scope };
    }
    return Company.find(filter).sort({ name: 1 }).lean();
  }

  static async getById(id: string, user?: IUser) {
    if (!Types.ObjectId.isValid(id)) throw errors.validation('Invalid company ID');
    const company = await Company.findById(id).lean();
    if (!company) throw errors.notFound('Company');
    if (user && !canAccessCompanyId(user, company._id)) {
      throw errors.forbidden('Access denied to this company');
    }
    return company;
  }

  static async create(data: { code: string; name: string; legalName?: string; taxId?: string; address?: string; phone?: string; email?: string }, userId: string) {
    const code = String(data.code || '').trim().toUpperCase();
    const name = String(data.name || '').trim();
    if (!code || !name) throw errors.validation('Company code and name are required');

    const existing = await Company.findOne({ code });
    if (existing) throw errors.duplicateEntry('Company code', code);

    const company = await Company.create({
      code,
      name,
      legalName: data.legalName,
      taxId: data.taxId,
      address: data.address,
      phone: data.phone,
      email: data.email,
      createdBy: new Types.ObjectId(userId),
      updatedBy: new Types.ObjectId(userId),
    });
    return company.toObject();
  }

  static async update(id: string, data: Partial<{ name: string; legalName: string; taxId: string; address: string; phone: string; email: string; isActive: boolean }>, userId: string) {
    if (!Types.ObjectId.isValid(id)) throw errors.validation('Invalid company ID');
    const company = await Company.findByIdAndUpdate(
      id,
      { ...data, updatedBy: new Types.ObjectId(userId) },
      { new: true }
    ).lean();
    if (!company) throw errors.notFound('Company');
    return company;
  }

  /** First active company — used by migration / default assignment */
  static async getFirstActiveId(): Promise<Types.ObjectId | null> {
    const c = await Company.findOne({ isActive: true }).sort({ createdAt: 1 }).select('_id').lean();
    return c?._id ?? null;
  }

  static assertUserCanManageCompanies(user: IUser) {
    if (!GLOBAL_COMPANY_ROLES.includes(user.role as any)) {
      throw errors.forbidden('Only administrators can manage companies');
    }
  }
}
