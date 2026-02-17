import { Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { errors } from '../utils/errors';
import { IAuthRequest, IJWTPayload } from '../types';
import User from '../models/User';

export const authMiddleware = async (
  req: IAuthRequest,
  _res: Response,
  next: NextFunction
) => {
  try {
    // Get token from header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next(errors.unauthorized());
    }

    const token = authHeader.split(' ')[1];

    // Verify token
    const decoded = jwt.verify(token, config.jwt.accessSecret) as IJWTPayload;

    // Get user and check status
    const user = await User.findById(decoded.sub).select('-passwordHash -passwordSalt');

    if (!user) {
      return next(errors.unauthorized());
    }

    if (user.status !== 'active') {
      return next(errors.accountInactive());
    }

    // Attach user to request
    req.user = user;
    req.permissions = decoded.permissions;

    next();
  } catch (error: any) {
    if (error.name === 'TokenExpiredError') {
      return next(errors.tokenExpired());
    }
    if (error.name === 'JsonWebTokenError') {
      return next(errors.invalidToken());
    }
    next(error);
  }
};

export const optionalAuth = async (
  req: IAuthRequest,
  _res: Response,
  next: NextFunction
) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next();
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, config.jwt.accessSecret) as IJWTPayload;

    const user = await User.findById(decoded.sub).select('-passwordHash -passwordSalt');

    if (user && user.status === 'active') {
      req.user = user;
      req.permissions = decoded.permissions;
    }

    next();
  } catch (error) {
    // If token is invalid, just continue without user
    next();
  }
};

// Middleware to require specific roles
export const requireRole = (roles: string[]) => {
  return async (req: IAuthRequest, _res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        return next(errors.unauthorized());
      }

      // Check if user has one of the required roles
      if (!roles.includes(req.user.role)) {
        return next(errors.forbidden('Access denied. Insufficient permissions.'));
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};
