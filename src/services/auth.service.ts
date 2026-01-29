import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { Types } from 'mongoose';
import User from '../models/User';
import { config } from '../config';
import { errors } from '../utils/errors';
import { ROLE_PERMISSIONS } from '../utils/constants';
import { IUser, IJWTPayload } from '../types';

export class AuthService {
  // Generate access token
  static generateAccessToken(user: IUser): string {
    const permissions = this.getUserPermissions(user);

    const payload: IJWTPayload = {
      sub: user._id.toString(),
      email: user.email,
      role: user.role,
      permissions,
      ...(user.warehouseId && { warehouseId: user.warehouseId.toString() }),
    };

    return jwt.sign(payload, config.jwt.accessSecret, {
      expiresIn: config.jwt.accessExpiresIn as string,
    } as jwt.SignOptions);
  }

  // Generate refresh token
  static generateRefreshToken(user: IUser, deviceInfo?: string): string {
    const payload = {
      sub: user._id.toString(),
      tokenId: new Types.ObjectId().toString(),
      deviceInfo,
    };

    return jwt.sign(payload, config.jwt.refreshSecret, {
      expiresIn: config.jwt.refreshExpiresIn as string,
    } as jwt.SignOptions);
  }

  // Get user permissions based on role
  static getUserPermissions(user: IUser): string[] {
    // If user has custom permissions, use those
    if (user.permissions && user.permissions.length > 0) {
      return user.permissions;
    }

    // Otherwise, use role-based permissions
    const rolePermissions = ROLE_PERMISSIONS[user.role];

    if (rolePermissions === '*') {
      return ['*'];
    }

    if (typeof rolePermissions === 'object') {
      const permissions: string[] = [];
      Object.entries(rolePermissions).forEach(([module, actions]) => {
        if (Array.isArray(actions)) {
          actions.forEach((action) => {
            permissions.push(`${module}.${action}`);
          });
        }
      });
      return permissions;
    }

    return [];
  }

  // Hash password
  static async hashPassword(password: string): Promise<{ hash: string; salt: string }> {
    const salt = await bcrypt.genSalt(config.bcrypt.saltRounds);
    const hash = await bcrypt.hash(password, salt);
    return { hash, salt };
  }

  // Verify password
  static async verifyPassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  // Login
  static async login(email: string, password: string, deviceInfo?: string) {
    // Find user with password fields
    const user = await User.findOne({ email }).select('+passwordHash +passwordSalt');

    if (!user) {
      throw errors.invalidCredentials();
    }

    // Check if account is locked
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw errors.accountLocked();
    }

    // Verify password
    const isValid = await this.verifyPassword(password, user.passwordHash);

    if (!isValid) {
      // Increment failed login attempts
      user.failedLoginAttempts += 1;

      // Lock account after 5 failed attempts
      if (user.failedLoginAttempts >= 5) {
        user.lockedUntil = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes
      }

      await user.save();
      throw errors.invalidCredentials();
    }

    // Check account status
    if (user.status !== 'active') {
      throw errors.accountInactive();
    }

    // Reset failed login attempts
    user.failedLoginAttempts = 0;
    user.lockedUntil = undefined;
    user.lastLogin = new Date();

    // Generate tokens
    const accessToken = this.generateAccessToken(user);
    const refreshToken = this.generateRefreshToken(user, deviceInfo);

    // Save refresh token
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days

    user.refreshTokens.push({
      token: refreshToken,
      deviceInfo,
      createdAt: new Date(),
      expiresAt,
    });

    // Keep only last 5 refresh tokens
    if (user.refreshTokens.length > 5) {
      user.refreshTokens = user.refreshTokens.slice(-5);
    }

    await user.save();

    // Remove sensitive fields
    const userObject = user.toObject() as any;
    delete userObject.passwordHash;
    delete userObject.passwordSalt;
    delete userObject.refreshTokens;

    return {
      user: userObject,
      accessToken,
      refreshToken,
      expiresIn: '15m',
    };
  }

  // Refresh tokens
  static async refreshTokens(refreshToken: string) {
    try {
      // Verify refresh token
      const decoded = jwt.verify(refreshToken, config.jwt.refreshSecret) as any;

      // Find user with refresh token
      const user = await User.findOne({
        _id: decoded.sub,
        'refreshTokens.token': refreshToken,
        'refreshTokens.expiresAt': { $gt: new Date() },
      });

      if (!user) {
        throw errors.invalidToken();
      }

      // Generate new tokens
      const newAccessToken = this.generateAccessToken(user);
      const newRefreshToken = this.generateRefreshToken(user, decoded.deviceInfo);

      // Remove old refresh token and add new one
      user.refreshTokens = user.refreshTokens.filter((t) => t.token !== refreshToken);

      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);

      user.refreshTokens.push({
        token: newRefreshToken,
        deviceInfo: decoded.deviceInfo,
        createdAt: new Date(),
        expiresAt,
      });

      await user.save();

      return {
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
        expiresIn: '15m',
      };
    } catch (error: any) {
      if (error.name === 'TokenExpiredError' || error.name === 'JsonWebTokenError') {
        throw errors.invalidToken();
      }
      throw error;
    }
  }

  // Logout
  static async logout(userId: string, refreshToken?: string) {
    const user = await User.findById(userId);

    if (!user) {
      throw errors.notFound('User');
    }

    if (refreshToken) {
      // Remove specific refresh token
      user.refreshTokens = user.refreshTokens.filter((t) => t.token !== refreshToken);
    } else {
      // Remove all refresh tokens
      user.refreshTokens = [];
    }

    await user.save();

    return { message: 'Logged out successfully' };
  }
}
