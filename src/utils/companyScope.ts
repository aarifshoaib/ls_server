import { Types } from 'mongoose';
import { IUser } from '../types';

/** Roles that can access all companies (no row-level filter) */
export const GLOBAL_COMPANY_ROLES = ['super_admin', 'admin'] as const;

export type CompanyScope = Types.ObjectId[] | 'all';

/**
 * Returns company ObjectIds the user may access, or 'all' for global roles.
 */
export function getAccessibleCompanyIds(user: IUser | undefined | null): CompanyScope {
  if (!user) return [];
  const role = user.role as string;
  if (GLOBAL_COMPANY_ROLES.includes(role as any)) return 'all';
  const raw = (user as any).companyIds;
  if (!raw || !Array.isArray(raw) || raw.length === 0) return [];
  return raw.map((id: unknown) =>
    typeof id === 'string' ? new Types.ObjectId(id) : (id as Types.ObjectId)
  );
}

/**
 * Merges Mongo filter with company scope for Employee (and other company-scoped) queries.
 */
export function mergeCompanyFilter(
  baseFilter: Record<string, unknown>,
  user: IUser | undefined | null
): Record<string, unknown> {
  const scope = getAccessibleCompanyIds(user);
  if (scope === 'all') return { ...baseFilter };
  if (scope.length === 0) return { ...baseFilter, _id: { $in: [] } };
  return { ...baseFilter, companyId: { $in: scope } };
}

export function canAccessCompanyId(
  user: IUser | undefined | null,
  companyId: Types.ObjectId | string | undefined | null
): boolean {
  if (!companyId) return false;
  const scope = getAccessibleCompanyIds(user);
  if (scope === 'all') return true;
  const cid = typeof companyId === 'string' ? companyId : companyId.toString();
  return scope.some((id) => id.toString() === cid);
}

export function canAccessEmployee(
  user: IUser | undefined | null,
  employee: { companyId?: Types.ObjectId | null }
): boolean {
  if (!employee.companyId) {
    return getAccessibleCompanyIds(user) === 'all';
  }
  return canAccessCompanyId(user, employee.companyId);
}
