import { Response, NextFunction } from 'express';
import { IAuthRequest } from '../types';
import { AuthService } from '../services/auth.service';

export class AuthController {
  static async login(req: IAuthRequest, res: Response, next: NextFunction) {
    try {
      const { email, password } = req.body;
      const deviceInfo = req.headers['user-agent'];

      const result = await AuthService.login(email, password, deviceInfo);

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  static async refresh(req: IAuthRequest, res: Response, next: NextFunction) {
    try {
      const { refreshToken } = req.body;

      const result = await AuthService.refreshTokens(refreshToken);

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  static async logout(req: IAuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { refreshToken } = req.body;
      const userId = req.user?._id.toString();

      if (!userId) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }

      const result = await AuthService.logout(userId, refreshToken);

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  static async getMe(req: IAuthRequest, res: Response, next: NextFunction) {
    try {
      const user = req.user;

      // req.user is the Mongoose document fetched by the auth middleware; its
      // permissions field only contains custom per-user overrides (usually empty).
      // The full computed permissions are decoded from the JWT by the middleware
      // and stored on req.permissions.  We merge them here so callers such as
      // the BFF session endpoint always receive the correct permission list.
      const userWithPermissions = {
        ...user?.toObject(),
        permissions: req.permissions || [],
      };

      res.json({
        success: true,
        data: userWithPermissions,
      });
    } catch (error) {
      next(error);
    }
  }
}
