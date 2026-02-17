import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/errors';
import { config } from '../config';

export const errorHandler = (
  err: Error | AppError,
  req: Request,
  res: Response,
  _next: NextFunction
) => {
  // Default error values
  let statusCode = 500;
  let code = 'INTERNAL_ERROR';
  let message = 'Something went wrong';
  let details = null;

  // Handle AppError instances
  if (err instanceof AppError) {
    statusCode = err.statusCode;
    code = err.code;
    message = err.message;
    details = err.details;
  }

  // Handle Mongoose validation errors
  if (err.name === 'ValidationError') {
    statusCode = 400;
    code = 'VALIDATION_ERROR';
    message = 'Validation failed';
    details = err.message;
  }

  // Handle Mongoose duplicate key error
  if (err.name === 'MongoServerError' && (err as any).code === 11000) {
    statusCode = 409;
    code = 'DUPLICATE_ENTRY';
    message = 'Duplicate entry found';
    const field = Object.keys((err as any).keyPattern)[0];
    details = { field };
  }

  // Handle Mongoose cast error
  if (err.name === 'CastError') {
    statusCode = 400;
    code = 'INVALID_ID';
    message = 'Invalid ID format';
  }

  // Log error
  console.error('Error:', {
    message: err.message,
    code,
    stack: err.stack,
    path: req.path,
    method: req.method,
  });

  // Don't leak error details in production
  if (config.env === 'production' && !(err instanceof AppError)) {
    message = 'Something went wrong';
    details = null;
  }

  res.status(statusCode).json({
    success: false,
    error: message,
    code,
    ...(details && { details }),
    ...(config.env === 'development' && { stack: err.stack }),
  });
};

export const notFound = (req: Request, _res: Response, next: NextFunction) => {
  const error = new AppError(
    `Route not found: ${req.originalUrl}`,
    404,
    'ROUTE_NOT_FOUND'
  );
  next(error);
};
