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

      res.json({
        success: true,
        data: user,
      });
    } catch (error) {
      next(error);
    }
  }
}
