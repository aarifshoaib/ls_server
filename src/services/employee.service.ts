import { Types } from 'mongoose';
import Employee from '../models/Employee';
import User from '../models/User';
import { errors } from '../utils/errors';
import { parsePagination, buildPaginatedResponse, generateCode } from '../utils/helpers';
import { IPaginationQuery } from '../types';

export class EmployeeService {
  // Get all employees with pagination and filters
  static async getEmployees(query: any, pagination: IPaginationQuery) {
    const { page, limit, skip } = parsePagination(pagination);

    const filter: any = {};

    // Status filter
    if (query.status) {
      filter.status = query.status;
    }

    // Department filter
    if (query.department) {
      filter['employment.department'] = query.department;
    }

    // Designation filter
    if (query.designation) {
      filter['employment.designation'] = query.designation;
    }

    // Employment type filter
    if (query.employmentType) {
      filter['employment.employmentType'] = query.employmentType;
    }

    // Pay cycle filter - check both string and ObjectId formats (database may store either)
    if (query.payCycleId) {
      if (Types.ObjectId.isValid(query.payCycleId)) {
        // Match both string and ObjectId formats since DB may have inconsistent types
        filter['salaryInfo.payCycleId'] = {
          $in: [query.payCycleId, new Types.ObjectId(query.payCycleId)]
        };
        console.log('[EmployeeService] PayCycle filter:', JSON.stringify(filter['salaryInfo.payCycleId']));
      } else {
        // Invalid payCycleId, return empty result
        console.log('[EmployeeService] Invalid payCycleId:', query.payCycleId);
        return buildPaginatedResponse([], 0, page, limit);
      }
    }

    // Search filter
    if (query.search) {
      filter.$or = [
        { fullName: { $regex: query.search, $options: 'i' } },
        { employeeCode: { $regex: query.search, $options: 'i' } },
        { email: { $regex: query.search, $options: 'i' } },
        { phone: { $regex: query.search, $options: 'i' } },
      ];
    }

    console.log('[EmployeeService] Full filter:', JSON.stringify(filter));

    const [employees, total] = await Promise.all([
      Employee.find(filter)
        .populate('salaryInfo.payCycleId', 'name code')
        .populate('userId', 'email role status')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Employee.countDocuments(filter),
    ]);

    console.log('[EmployeeService] Found employees:', employees.length, 'total:', total);

    return buildPaginatedResponse(employees, total, page, limit);
  }

  // Get employee by ID
  static async getEmployeeById(id: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw errors.validation('Invalid employee ID');
    }

    const employee = await Employee.findById(id)
      .populate('salaryInfo.payCycleId')
      .populate('userId', 'email role status lastLogin')
      .populate('employment.reportingTo', 'fullName employeeCode')
      .populate('assignedComponents.earnings.componentId')
      .populate('assignedComponents.deductions.componentId');

    if (!employee) {
      throw errors.notFound('Employee');
    }

    return employee;
  }

  // Get employee by code
  static async getByCode(code: string) {
    const employee = await Employee.findOne({
      employeeCode: code.toUpperCase(),
    })
      .populate('salaryInfo.payCycleId')
      .populate('userId', 'email role status');

    if (!employee) {
      throw errors.notFound('Employee');
    }

    return employee;
  }

  // Get employee by user ID
  static async getByUserId(userId: string) {
    const employee = await Employee.findOne({
      userId: new Types.ObjectId(userId),
    })
      .populate('salaryInfo.payCycleId')
      .populate('userId', 'email role status');

    return employee; // Can be null
  }

  // Generate next employee code
  static async generateEmployeeCode(): Promise<string> {
    const lastEmployee = await Employee.findOne()
      .sort({ employeeCode: -1 })
      .select('employeeCode');

    if (!lastEmployee) {
      return 'EMP-00001';
    }

    const lastNumber = parseInt(lastEmployee.employeeCode.replace('EMP-', '')) || 0;
    return generateCode('EMP', lastNumber + 1, 5);
  }

  // Create employee
  static async createEmployee(data: any, userId: string) {
    // Generate employee code if not provided
    if (!data.employeeCode) {
      data.employeeCode = await this.generateEmployeeCode();
    } else {
      data.employeeCode = data.employeeCode.toUpperCase();
    }

    // Check if employee code already exists
    const existingCode = await Employee.findOne({ employeeCode: data.employeeCode });
    if (existingCode) {
      throw errors.duplicateEntry('Employee Code', data.employeeCode);
    }

    // Check if email already exists
    const existingEmail = await Employee.findOne({ email: data.email.toLowerCase() });
    if (existingEmail) {
      throw errors.duplicateEntry('Email', data.email);
    }

    // Validate user link if provided
    if (data.userId) {
      const user = await User.findById(data.userId);
      if (!user) {
        throw errors.validation('Linked user not found');
      }
      // Check if user is already linked to another employee
      const existingLink = await Employee.findOne({ userId: data.userId });
      if (existingLink) {
        throw errors.validation('User is already linked to another employee');
      }
    }

    // Set full name
    data.fullName = `${data.firstName} ${data.lastName}`;

    data.createdBy = userId;
    data.updatedBy = userId;

    const employee = new Employee(data);
    await employee.save();

    return employee;
  }

  // Update employee
  static async updateEmployee(id: string, data: any, userId: string) {
    const employee = await this.getEmployeeById(id);

    // Check for duplicate email if email is being changed
    if (data.email && data.email.toLowerCase() !== employee.email) {
      const existingEmail = await Employee.findOne({
        email: data.email.toLowerCase(),
        _id: { $ne: employee._id },
      });
      if (existingEmail) {
        throw errors.duplicateEntry('Email', data.email);
      }
    }

    // Validate user link if being changed
    if (data.userId && (!employee.userId || data.userId !== employee.userId.toString())) {
      const user = await User.findById(data.userId);
      if (!user) {
        throw errors.validation('Linked user not found');
      }
      const existingLink = await Employee.findOne({
        userId: data.userId,
        _id: { $ne: employee._id },
      });
      if (existingLink) {
        throw errors.validation('User is already linked to another employee');
      }
    }

    // Update full name if names are changing
    if (data.firstName || data.lastName) {
      data.fullName = `${data.firstName || employee.firstName} ${data.lastName || employee.lastName}`;
    }

    data.updatedBy = userId;

    Object.assign(employee, data);
    await employee.save();

    return employee;
  }

  // Update salary
  static async updateSalary(id: string, salaryData: any, userId: string) {
    const employee = await this.getEmployeeById(id);

    // Add current salary to history
    if (employee.salaryInfo.basicSalary) {
      const historyEntry = {
        basicSalary: employee.salaryInfo.basicSalary,
        allowance: employee.salaryInfo.allowance,
        effectiveFrom: employee.salaryInfo.salaryHistory?.[0]?.effectiveFrom || employee.employment.joiningDate,
        reason: salaryData.reason || 'Salary revision',
        changedBy: new Types.ObjectId(userId),
        changedAt: new Date(),
      };

      if (!employee.salaryInfo.salaryHistory) {
        employee.salaryInfo.salaryHistory = [];
      }
      employee.salaryInfo.salaryHistory.unshift(historyEntry);
    }

    // Update salary info
    employee.salaryInfo.basicSalary = salaryData.basicSalary;
    employee.salaryInfo.allowance = salaryData.allowance || employee.salaryInfo.allowance;
    employee.salaryInfo.payCycleId = salaryData.payCycleId || employee.salaryInfo.payCycleId;
    employee.updatedBy = new Types.ObjectId(userId);

    await employee.save();

    return employee;
  }

  // Assign components
  static async assignComponents(id: string, components: any, userId: string) {
    const employee = await this.getEmployeeById(id);

    if (!employee.assignedComponents) {
      employee.assignedComponents = { earnings: [], deductions: [] };
    }

    if (components.earnings) {
      employee.assignedComponents.earnings = components.earnings.map((component: any) => ({
        componentId: component.componentId?._id || component.componentId,
        componentCode: component.componentCode,
        componentName: component.componentName,
        overrideValue: component.overrideValue,
        effectiveFrom: component.effectiveFrom,
        effectiveTo: component.effectiveTo,
        isActive: component.isActive !== false,
        isAttendanceBased: component.isAttendanceBased === true,
      }));
    }

    if (components.deductions) {
      employee.assignedComponents.deductions = components.deductions.map((component: any) => ({
        componentId: component.componentId?._id || component.componentId,
        componentCode: component.componentCode,
        componentName: component.componentName,
        overrideValue: component.overrideValue,
        effectiveFrom: component.effectiveFrom,
        effectiveTo: component.effectiveTo,
        isActive: component.isActive !== false,
        isAttendanceBased: component.isAttendanceBased === true,
      }));
    }

    employee.updatedBy = new Types.ObjectId(userId);
    await employee.save();

    return employee;
  }

  // Terminate employee
  static async terminateEmployee(id: string, terminationData: any, userId: string) {
    const employee = await this.getEmployeeById(id);

    if (employee.status === 'terminated') {
      throw errors.validation('Employee is already terminated');
    }

    employee.status = 'terminated';
    employee.terminationInfo = {
      terminationDate: terminationData.terminationDate || new Date(),
      lastWorkingDay: terminationData.lastWorkingDay || new Date(),
      reason: terminationData.reason,
      type: terminationData.terminationType || 'resignation',
      exitInterviewDone: terminationData.exitInterviewCompleted || false,
      fullAndFinalStatus: terminationData.finalSettlement?.status || 'pending',
    };
    employee.updatedBy = new Types.ObjectId(userId);

    await employee.save();

    return employee;
  }

  // Link employee to user
  static async linkToUser(employeeId: string, linkUserId: string, currentUserId: string) {
    const employee = await this.getEmployeeById(employeeId);

    // Check if user exists
    const user = await User.findById(linkUserId);
    if (!user) {
      throw errors.notFound('User');
    }

    // Check if user is already linked
    const existingLink = await Employee.findOne({
      userId: linkUserId,
      _id: { $ne: employee._id },
    });
    if (existingLink) {
      throw errors.validation('User is already linked to another employee');
    }

    employee.userId = new Types.ObjectId(linkUserId);
    employee.updatedBy = new Types.ObjectId(currentUserId);
    await employee.save();

    // Update user's employeeId
    user.employeeId = employee.employeeCode;
    await user.save();

    return employee;
  }

  // Unlink employee from user
  static async unlinkFromUser(employeeId: string, currentUserId: string) {
    const employee = await this.getEmployeeById(employeeId);

    if (!employee.userId) {
      throw errors.validation('Employee is not linked to any user');
    }

    // Update user's employeeId
    await User.findByIdAndUpdate(employee.userId, { $unset: { employeeId: 1 } });

    employee.userId = undefined;
    employee.updatedBy = new Types.ObjectId(currentUserId);
    await employee.save();

    return employee;
  }

  // Get employees by pay cycle
  static async getByPayCycle(payCycleId: string, activeOnly: boolean = true) {
    const filter: any = {
      'salaryInfo.payCycleId': new Types.ObjectId(payCycleId),
    };

    if (activeOnly) {
      filter.status = 'active';
    }

    const employees = await Employee.find(filter)
      .populate('salaryInfo.payCycleId')
      .populate('assignedComponents.earnings.componentId')
      .populate('assignedComponents.deductions.componentId')
      .sort({ employeeCode: 1 });

    return employees;
  }

  // Get employees for dropdown (minimal data)
  static async getEmployeesForDropdown(query: any = {}) {
    const filter: any = { status: 'active' };

    if (query.search) {
      filter.$or = [
        { fullName: { $regex: query.search, $options: 'i' } },
        { employeeCode: { $regex: query.search, $options: 'i' } },
      ];
    }

    const employees = await Employee.find(filter)
      .select('employeeCode fullName email employment.department')
      .sort({ fullName: 1 })
      .limit(50);

    return employees;
  }

  // Get employee statistics
  static async getStatistics() {
    const stats = await Employee.aggregate([
      {
        $facet: {
          byStatus: [
            { $group: { _id: '$status', count: { $sum: 1 } } },
          ],
          byDepartment: [
            { $match: { status: 'active' } },
            { $group: { _id: '$employment.department', count: { $sum: 1 } } },
          ],
          byEmploymentType: [
            { $match: { status: 'active' } },
            { $group: { _id: '$employment.employmentType', count: { $sum: 1 } } },
          ],
          totalActive: [
            { $match: { status: 'active' } },
            { $count: 'count' },
          ],
        },
      },
    ]);

    return {
      byStatus: stats[0].byStatus,
      byDepartment: stats[0].byDepartment,
      byEmploymentType: stats[0].byEmploymentType,
      totalActive: stats[0].totalActive[0]?.count || 0,
    };
  }
}
