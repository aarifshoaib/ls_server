import { Response, NextFunction } from 'express';
import { IAuthRequest } from '../types';
import { errors } from '../utils/errors';

export const requirePermission = (...requiredPermissions: string[]) => {
  return (req: IAuthRequest, _res: Response, next: NextFunction) => {
    const userPermissions = req.permissions || [];
    const userRole = req.user?.role;

    // Super admin has all permissions
    if (userRole === 'super_admin') {
      return next();
    }

    // Check if user has any of the required permissions
    const hasPermission = requiredPermissions.some(
      (permission) =>
        userPermissions.includes(permission) || userPermissions.includes('*')
    );

    if (!hasPermission) {
      return next(
        errors.forbidden(
          `perform this action. Required: ${requiredPermissions.join(' or ')}`
        )
      );
    }

    next();
  };
};

export const requireRole = (...roles: string[]) => {
  return (req: IAuthRequest, _res: Response, next: NextFunction) => {
    const userRole = req.user?.role;

    if (!userRole || !roles.includes(userRole)) {
      return next(errors.forbidden('access this resource'));
    }

    next();
  };
};
