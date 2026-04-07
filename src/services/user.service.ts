import bcrypt from 'bcryptjs';
import User from '../models/User';
import { Types } from 'mongoose';
import { config } from '../config';

interface GetAllParams {
  page: number;
  limit: number;
  search?: string;
  role?: string;
  status?: string;
  sortBy: string;
  sortOrder: 'asc' | 'desc';
}

export class UserService {
  private static async hashPassword(password: string): Promise<{ hash: string; salt: string }> {
    const salt = await bcrypt.genSalt(config.bcrypt.saltRounds);
    const hash = await bcrypt.hash(password, salt);
    return { hash, salt };
  }

  private static generateEmployeeId(): string {
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.random().toString(36).substring(2, 5).toUpperCase();
    return `EMP-${timestamp}${random}`;
  }

  static async getAll(params: GetAllParams) {
    const { page, limit, search, role, status, sortBy, sortOrder } = params;

    const query: any = {};

    if (search) {
      query.$or = [
        { firstName: { $regex: search, $options: 'i' } },
        { lastName: { $regex: search, $options: 'i' } },
        { fullName: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { employeeId: { $regex: search, $options: 'i' } },
      ];
    }

    if (role) {
      query.role = role;
    }

    if (status) {
      query.status = status;
    }

    const sort: any = {};
    sort[sortBy] = sortOrder === 'asc' ? 1 : -1;

    const skip = (page - 1) * limit;

    const [users, total] = await Promise.all([
      User.find(query)
        .select('-passwordHash -passwordSalt -refreshTokens')
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .lean(),
      User.countDocuments(query),
    ]);

    // Add computed fields
    const usersWithFields = users.map(user => ({
      ...user,
      roleLabel: user.role.charAt(0).toUpperCase() + user.role.slice(1).replace(/_/g, ' '),
      statusLabel: user.status.charAt(0).toUpperCase() + user.status.slice(1),
      statusColor: user.status === 'active' ? 'success' : user.status === 'inactive' ? 'default' : 'error',
    }));

    return {
      users: usersWithFields,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  static async getById(id: string) {
    const user = await User.findById(id)
      .select('-passwordHash -passwordSalt -refreshTokens')
      .lean();

    if (!user) return null;

    return {
      ...user,
      roleLabel: user.role.charAt(0).toUpperCase() + user.role.slice(1).replace(/_/g, ' '),
      statusLabel: user.status.charAt(0).toUpperCase() + user.status.slice(1),
      statusColor: user.status === 'active' ? 'success' : user.status === 'inactive' ? 'default' : 'error',
    };
  }

  static async create(data: any, createdBy: Types.ObjectId) {
    const { hash: passwordHash, salt } = await this.hashPassword(data.password);
    const employeeId = data.employeeId || this.generateEmployeeId();

    const { password: _pw, companyIds: rawCompanyIds, ...rest } = data as any;
    let companyIds: Types.ObjectId[] | undefined;
    if (Array.isArray(rawCompanyIds) && rawCompanyIds.length > 0) {
      companyIds = rawCompanyIds.map((id: string) =>
        typeof id === 'string' ? new Types.ObjectId(id) : id
      );
    }

    const user = new User({
      ...rest,
      companyIds,
      employeeId,
      passwordHash,
      passwordSalt: salt,
      fullName: `${data.firstName} ${data.lastName}`,
      createdBy,
      updatedBy: createdBy,
    });

    await user.save();

    const result = user.toObject() as any;
    delete result.passwordHash;
    delete result.passwordSalt;
    delete result.refreshTokens;

    return {
      ...result,
      roleLabel: result.role.charAt(0).toUpperCase() + result.role.slice(1).replace(/_/g, ' '),
      statusLabel: result.status.charAt(0).toUpperCase() + result.status.slice(1),
      statusColor: result.status === 'active' ? 'success' : result.status === 'inactive' ? 'default' : 'error',
    };
  }

  static async update(id: string, data: any, updatedBy: Types.ObjectId) {
    // Remove password related fields from update data
    const { password, passwordHash, passwordSalt, companyIds: rawCompanyIds, ...updateData } = data;

    if (Array.isArray(rawCompanyIds)) {
      (updateData as any).companyIds = rawCompanyIds.map((id: string) =>
        typeof id === 'string' ? new Types.ObjectId(id) : id
      );
    }

    // Update fullName if firstName or lastName changed
    if (updateData.firstName || updateData.lastName) {
      const existingUser = await User.findById(id);
      if (existingUser) {
        updateData.fullName = `${updateData.firstName || existingUser.firstName} ${updateData.lastName || existingUser.lastName}`;
      }
    }

    const user = await User.findByIdAndUpdate(
      id,
      { ...updateData, updatedBy },
      { new: true }
    )
      .select('-passwordHash -passwordSalt -refreshTokens')
      .lean();

    if (!user) return null;

    return {
      ...user,
      roleLabel: user.role.charAt(0).toUpperCase() + user.role.slice(1).replace(/_/g, ' '),
      statusLabel: user.status.charAt(0).toUpperCase() + user.status.slice(1),
      statusColor: user.status === 'active' ? 'success' : user.status === 'inactive' ? 'default' : 'error',
    };
  }

  static async delete(id: string) {
    return User.findByIdAndDelete(id);
  }

  static async updateStatus(id: string, status: string, updatedBy: Types.ObjectId) {
    const user = await User.findByIdAndUpdate(
      id,
      { status, updatedBy },
      { new: true }
    )
      .select('-passwordHash -passwordSalt -refreshTokens')
      .lean();

    if (!user) return null;

    return {
      ...user,
      roleLabel: user.role.charAt(0).toUpperCase() + user.role.slice(1).replace(/_/g, ' '),
      statusLabel: user.status.charAt(0).toUpperCase() + user.status.slice(1),
      statusColor: user.status === 'active' ? 'success' : user.status === 'inactive' ? 'default' : 'error',
    };
  }

  static async changePassword(id: string, newPassword: string) {
    const pwd = typeof newPassword === 'string' ? newPassword.trim() : newPassword;
    const { hash: passwordHash, salt } = await this.hashPassword(pwd);

    const user = await User.findByIdAndUpdate(id, {
      passwordHash,
      passwordSalt: salt,
    });

    return !!user;
  }

  static async changeOwnPassword(id: string, currentPassword: string, newPassword: string) {
    const user = await User.findById(id).select('+passwordHash +passwordSalt');
    if (!user) return false;

    // Verify current password (bcrypt.compare works with hash only)
    const isValid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isValid) {
      return false;
    }

    // Set new password
    const { hash: passwordHash, salt } = await this.hashPassword(newPassword);

    await User.findByIdAndUpdate(id, {
      passwordHash,
      passwordSalt: salt,
    });

    return true;
  }
}
