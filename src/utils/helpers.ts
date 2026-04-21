import { IPaginationQuery, IPaginatedResponse } from '../types';
import { DEFAULT_PAGINATION } from './constants';

export const generateCode = (prefix: string, number: number, length: number = 5): string => {
  return `${prefix}-${String(number).padStart(length, '0')}`;
};

export const generateSKU = (name: string): string => {
  return name
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '-')
    .replace(/-+/g, '-')
    .substring(0, 20);
};

export const generateSlug = (text: string): string => {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
};

export const calculatePercentage = (value: number, total: number): number => {
  if (total === 0) return 0;
  return (value / total) * 100;
};

export const roundToTwo = (num: number): number => {
  return Math.round(num * 100) / 100;
};

/**
 * Round to nearest 0.25 AED (25 / 50 / 75 fils — e.g. 16.12 → 16.00, 16.13 → 16.25).
 * Used for invoice grand totals and AR so customer outstanding matches billed cash steps.
 */
export const roundToNearestQuarterDirham = (num: number): number => {
  const fils = Math.round(num * 100);
  const quarterFils = Math.round(fils / 25) * 25;
  return roundToTwo(quarterFils / 100);
};

export const parsePagination = (query: IPaginationQuery) => {
  const page = Math.max(1, parseInt(String(query.page || DEFAULT_PAGINATION.PAGE)));
  const limit = Math.min(
    DEFAULT_PAGINATION.MAX_LIMIT,
    Math.max(1, parseInt(String(query.limit || DEFAULT_PAGINATION.LIMIT)))
  );
  const skip = (page - 1) * limit;

  return { page, limit, skip };
};

export const buildPaginatedResponse = <T>(
  data: T[],
  total: number,
  page: number,
  limit: number
): IPaginatedResponse<T> => {
  const totalPages = Math.ceil(total / limit);

  return {
    data,
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    },
  };
};

export const sanitizeObject = (obj: any, fieldsToRemove: string[] = []): any => {
  const sanitized = { ...obj };
  fieldsToRemove.forEach((field) => {
    delete sanitized[field];
  });
  return sanitized;
};

export const isValidEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

export const isValidPhone = (phone: string): boolean => {
  const phoneRegex = /^[\d\s\-\+\(\)]+$/;
  return phoneRegex.test(phone) && phone.replace(/\D/g, '').length >= 7;
};

export const formatCurrency = (amount: number, currency: string = 'AED'): string => {
  return `${currency} ${amount.toFixed(2)}`;
};

export const addDays = (date: Date, days: number): Date => {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
};

export const daysBetween = (date1: Date, date2: Date): number => {
  const oneDay = 24 * 60 * 60 * 1000;
  return Math.round(Math.abs((date1.getTime() - date2.getTime()) / oneDay));
};

export const isOverdue = (dueDate: Date): boolean => {
  return new Date() > dueDate;
};

export const getDaysOverdue = (dueDate: Date): number => {
  if (!isOverdue(dueDate)) return 0;
  return daysBetween(new Date(), dueDate);
};
