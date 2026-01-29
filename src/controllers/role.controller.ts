import { Request, Response } from 'express';
import Role, { MODULES, ACTIONS } from '../models/Role';
import User from '../models/User';
import { IAuthRequest } from '../types';

export class RoleController {
  // Get all roles
  static async getAll(req: Request, res: Response): Promise<void> {
    try {
      const { isActive, search } = req.query;

      const query: any = {};

      if (isActive !== undefined) {
        query.isActive = isActive === 'true';
      }

      if (search) {
        query.$or = [
          { name: { $regex: search, $options: 'i' } },
          { displayName: { $regex: search, $options: 'i' } },
          { description: { $regex: search, $options: 'i' } },
        ];
      }

      const roles = await Role.find(query).sort({ isSystem: -1, name: 1 });

      // Get user counts per role
      const userCounts = await User.aggregate([
        { $group: { _id: '$role', count: { $sum: 1 } } },
      ]);

      const userCountMap: Record<string, number> = {};
      userCounts.forEach((uc) => {
        userCountMap[uc._id] = uc.count;
      });

      const rolesWithCount = roles.map((role) => ({
        ...role.toObject(),
        userCount: userCountMap[role.name] || 0,
      }));

      res.json({
        success: true,
        data: rolesWithCount,
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to fetch roles',
      });
    }
  }

  // Get role by ID
  static async getById(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      const role = await Role.findById(id);

      if (!role) {
        res.status(404).json({
          success: false,
          error: 'Role not found',
        });
        return;
      }

      // Get user count for this role
      const userCount = await User.countDocuments({ role: role.name });

      res.json({
        success: true,
        data: {
          ...role.toObject(),
          userCount,
        },
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to fetch role',
      });
    }
  }

  // Get role by name
  static async getByName(req: Request, res: Response): Promise<void> {
    try {
      const { name } = req.params;

      const role = await Role.findOne({ name: name.toLowerCase() });

      if (!role) {
        res.status(404).json({
          success: false,
          error: 'Role not found',
        });
        return;
      }

      res.json({
        success: true,
        data: role,
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to fetch role',
      });
    }
  }

  // Get available modules and actions
  static async getModulesAndActions(_req: Request, res: Response): Promise<void> {
    try {
      res.json({
        success: true,
        data: {
          modules: MODULES,
          actions: ACTIONS,
        },
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to fetch modules and actions',
      });
    }
  }

  // Create role
  static async create(req: IAuthRequest, res: Response): Promise<void> {
    try {
      const { name, displayName, description, permissions, isActive } = req.body;

      // Check if role name already exists
      const existingRole = await Role.findOne({ name: name.toLowerCase() });
      if (existingRole) {
        res.status(400).json({
          success: false,
          error: 'Role with this name already exists',
        });
        return;
      }

      const role = new Role({
        name: name.toLowerCase(),
        displayName,
        description,
        permissions: permissions || [],
        isActive: isActive !== undefined ? isActive : true,
        isSystem: false,
        createdBy: req.user?._id,
      });

      await role.save();

      res.status(201).json({
        success: true,
        data: role,
        message: 'Role created successfully',
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to create role',
      });
    }
  }

  // Update role
  static async update(req: IAuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { displayName, description, permissions, isActive } = req.body;

      const role = await Role.findById(id);

      if (!role) {
        res.status(404).json({
          success: false,
          error: 'Role not found',
        });
        return;
      }

      // Prevent updating system roles (except permissions)
      if (role.isSystem && (req.body.name || req.body.isActive === false)) {
        res.status(400).json({
          success: false,
          error: 'Cannot modify system role name or deactivate it',
        });
        return;
      }

      // Update fields
      if (displayName) role.displayName = displayName;
      if (description !== undefined) role.description = description;
      if (permissions) role.permissions = permissions;
      if (isActive !== undefined && !role.isSystem) role.isActive = isActive;
      role.updatedBy = req.user?._id;

      await role.save();

      res.json({
        success: true,
        data: role,
        message: 'Role updated successfully',
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to update role',
      });
    }
  }

  // Delete role
  static async delete(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      const role = await Role.findById(id);

      if (!role) {
        res.status(404).json({
          success: false,
          error: 'Role not found',
        });
        return;
      }

      if (role.isSystem) {
        res.status(400).json({
          success: false,
          error: 'Cannot delete system role',
        });
        return;
      }

      // Check if any users have this role
      const userCount = await User.countDocuments({ role: role.name });
      if (userCount > 0) {
        res.status(400).json({
          success: false,
          error: `Cannot delete role. ${userCount} user(s) are assigned to this role.`,
        });
        return;
      }

      await Role.findByIdAndDelete(id);

      res.json({
        success: true,
        message: 'Role deleted successfully',
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to delete role',
      });
    }
  }
}
