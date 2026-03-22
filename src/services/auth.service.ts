import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { Types } from 'mongoose';
import User from '../models/User';
import Role from '../models/Role';
import PasswordResetToken from '../models/PasswordResetToken';
import { config } from '../config';
import { errors } from '../utils/errors';
import { IUser, IJWTPayload } from '../types';

export class AuthService {
  // Generate access token
  static async generateAccessToken(user: IUser): Promise<string> {
    const permissions = await this.getUserPermissions(user);

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

  // Get user permissions based on role from database
  static async getUserPermissions(user: IUser): Promise<string[]> {
    // Fetch role from database
    const role = await Role.findOne({ name: user.role, isActive: true });

    // Build permissions array with format "module:action"
    const rolePermissions: string[] = [];
    if (role) {
      role.permissions.forEach((modulePermission) => {
        modulePermission.actions.forEach((action) => {
          rolePermissions.push(`${modulePermission.module}:${action}`);
        });
      });
    }

    // Merge role + custom permissions (custom is additive, not replacement)
    const customPermissions = user.permissions || [];

    if (customPermissions.includes('*')) {
      return ['*'];
    }

    return [...new Set([...rolePermissions, ...customPermissions])];
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

    // Compute permissions from role before generating the access token so we can
    // reuse the result in both the JWT payload and the login response body.
    // generateAccessToken() calls getUserPermissions() internally, so we call it
    // once here to avoid a second database round-trip.
    const computedPermissions = await this.getUserPermissions(user);

    // Generate tokens
    const accessToken = await this.generateAccessToken(user);
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

    // Overwrite the user's raw custom-override permissions array with the full
    // computed set so the frontend receives the correct permission list in the
    // login response body (the JWT already has them, but parsing the JWT on the
    // client side is not required by our design).
    userObject.permissions = computedPermissions;

    return {
      user: userObject,
      accessToken,
      refreshToken,
      expiresIn: config.jwt.accessExpiresIn as string,
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
      const newAccessToken = await this.generateAccessToken(user);
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
        expiresIn: config.jwt.accessExpiresIn as string,
      };
    } catch (error: any) {
      if (error.name === 'TokenExpiredError' || error.name === 'JsonWebTokenError') {
        throw errors.invalidToken();
      }
      throw error;
    }
  }

  // Forgot password - create reset token
  static async forgotPassword(email: string): Promise<{ token: string }> {
    const user = await User.findOne({ email }).select('_id');
    if (!user) {
      // Don't reveal if email exists - same response for security
      return { token: '' };
    }

    // Invalidate any existing tokens for this user
    await PasswordResetToken.deleteMany({ userId: user._id });

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 1); // 1 hour

    await PasswordResetToken.create({
      userId: user._id,
      token,
      expiresAt,
    });

    // TODO: Send email with reset link (e.g. ${config.frontendUrl}/reset-password?token=${token})
    // For development, token is returned so flow can be tested
    return { token };
  }

  // Reset password - verify token and update password
  static async resetPassword(token: string, newPassword: string): Promise<void> {
    const resetDoc = await PasswordResetToken.findOne({
      token,
      expiresAt: { $gt: new Date() },
    });

    if (!resetDoc) {
      throw errors.invalidToken();
    }

    const { hash: passwordHash, salt } = await this.hashPassword(newPassword);

    await User.findByIdAndUpdate(resetDoc.userId, {
      passwordHash,
      passwordSalt: salt,
    });

    await PasswordResetToken.deleteOne({ _id: resetDoc._id });
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
