export class AppError extends Error {
  statusCode: number;
  code: string;
  details?: any;
  isOperational: boolean;

  constructor(message: string, statusCode: number, code: string, details: any = null) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }
}

export const errors = {
  notFound: (resource: string) =>
    new AppError(`${resource} not found`, 404, 'NOT_FOUND'),

  unauthorized: () => new AppError('Authentication required', 401, 'UNAUTHORIZED'),

  forbidden: (action: string) =>
    new AppError(`You don't have permission to ${action}`, 403, 'FORBIDDEN'),

  validation: (details: any) =>
    new AppError('Validation failed', 400, 'VALIDATION_ERROR', details),

  conflict: (message: string) => new AppError(message, 409, 'CONFLICT'),

  insufficientStock: (product: string, available: number, required: number) =>
    new AppError(`Insufficient stock for ${product}`, 400, 'INSUFFICIENT_STOCK', {
      available,
      required,
    }),

  insufficientCredit: (available: number, required: number) =>
    new AppError('Customer has insufficient credit', 400, 'INSUFFICIENT_CREDIT', {
      available,
      required,
    }),

  invalidCredentials: () =>
    new AppError('Invalid email or password', 401, 'INVALID_CREDENTIALS'),

  tokenExpired: () => new AppError('Token expired', 401, 'TOKEN_EXPIRED'),

  invalidToken: () => new AppError('Invalid token', 401, 'INVALID_TOKEN'),

  accountLocked: () =>
    new AppError('Account is locked. Please try again later.', 403, 'ACCOUNT_LOCKED'),

  accountInactive: () =>
    new AppError('Account is not active', 403, 'ACCOUNT_INACTIVE'),

  invalidStatusTransition: (from: string, to: string) =>
    new AppError(
      `Invalid status transition: ${from} → ${to}`,
      400,
      'INVALID_STATUS_TRANSITION'
    ),

  duplicateEntry: (field: string, value: string) =>
    new AppError(`${field} '${value}' already exists`, 409, 'DUPLICATE_ENTRY', {
      field,
      value,
    }),
};
