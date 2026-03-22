import { Response, NextFunction } from 'express';
import { IAuthRequest } from '../types';
import { EmployeeService } from '../services/employee.service';

export class EmployeeController {
  static async getAll(req: IAuthRequest, res: Response, next: NextFunction) {
    try {
      const result = await EmployeeService.getEmployees(req.query, req.query);

      res.json({
        success: true,
        ...result,
      });
    } catch (error) {
      next(error);
    }
  }

  static async getById(req: IAuthRequest, res: Response, next: NextFunction) {
    try {
      const employee = await EmployeeService.getEmployeeById(req.params.id);

      res.json({
        success: true,
        data: employee,
      });
    } catch (error) {
      next(error);
    }
  }

  static async getByCode(req: IAuthRequest, res: Response, next: NextFunction) {
    try {
      const employee = await EmployeeService.getByCode(req.params.code);

      res.json({
        success: true,
        data: employee,
      });
    } catch (error) {
      next(error);
    }
  }

  static async getByUserId(req: IAuthRequest, res: Response, next: NextFunction) {
    try {
      const employee = await EmployeeService.getByUserId(req.params.userId);

      res.json({
        success: true,
        data: employee,
      });
    } catch (error) {
      next(error);
    }
  }

  static async create(req: IAuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user?._id.toString() || '';
      const employee = await EmployeeService.createEmployee(req.body, userId);

      res.status(201).json({
        success: true,
        data: employee,
        message: 'Employee created successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  static async update(req: IAuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user?._id.toString() || '';
      const employee = await EmployeeService.updateEmployee(req.params.id, req.body, userId);

      res.json({
        success: true,
        data: employee,
        message: 'Employee updated successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  static async delete(req: IAuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user?._id.toString() || '';
      const employee = await EmployeeService.getEmployeeById(req.params.id);
      employee.status = 'inactive';
      employee.updatedBy = userId as any;
      await employee.save();

      res.json({
        success: true,
        message: 'Employee deactivated successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  static async updateSalary(req: IAuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user?._id.toString() || '';
      const employee = await EmployeeService.updateSalary(req.params.id, req.body, userId);

      res.json({
        success: true,
        data: employee,
        message: 'Employee salary updated successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  static async assignComponents(req: IAuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user?._id.toString() || '';
      const employee = await EmployeeService.assignComponents(req.params.id, req.body, userId);

      res.json({
        success: true,
        data: employee,
        message: 'Components assigned successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  static async terminate(req: IAuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user?._id.toString() || '';
      const employee = await EmployeeService.terminateEmployee(req.params.id, req.body, userId);

      res.json({
        success: true,
        data: employee,
        message: 'Employee terminated successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  static async linkToUser(req: IAuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user?._id.toString() || '';
      const employee = await EmployeeService.linkToUser(req.params.id, req.body.userId, userId);

      res.json({
        success: true,
        data: employee,
        message: 'Employee linked to user successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  static async unlinkFromUser(req: IAuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user?._id.toString() || '';
      const employee = await EmployeeService.unlinkFromUser(req.params.id, userId);

      res.json({
        success: true,
        data: employee,
        message: 'Employee unlinked from user successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  static async getByPayCycle(req: IAuthRequest, res: Response, next: NextFunction) {
    try {
      const activeOnly = req.query.activeOnly !== 'false';
      const employees = await EmployeeService.getByPayCycle(req.params.payCycleId, activeOnly);

      res.json({
        success: true,
        data: employees,
      });
    } catch (error) {
      next(error);
    }
  }

  static async getForDropdown(req: IAuthRequest, res: Response, next: NextFunction) {
    try {
      const employees = await EmployeeService.getEmployeesForDropdown(req.query);

      res.json({
        success: true,
        data: employees,
      });
    } catch (error) {
      next(error);
    }
  }

  static async getStatistics(_req: IAuthRequest, res: Response, next: NextFunction) {
    try {
      const statistics = await EmployeeService.getStatistics();

      res.json({
        success: true,
        data: statistics,
      });
    } catch (error) {
      next(error);
    }
  }

  static async getDocumentExpiry(req: IAuthRequest, res: Response, next: NextFunction) {
    try {
      const daysAhead = Math.min(365, Math.max(0, parseInt(String(req.query.daysAhead || 90), 10) || 90));
      const result = await EmployeeService.getDocumentExpiry(daysAhead);

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
}
