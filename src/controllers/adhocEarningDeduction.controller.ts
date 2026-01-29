import { Response } from 'express';
import AdhocEarningDeduction from '../models/AdhocEarningDeduction';
import Employee from '../models/Employee';
import { IAuthRequest } from '../types';
import { Types } from 'mongoose';

// Get all adhoc earning/deductions with filters
export const getAll = async (req: IAuthRequest, res: Response) => {
  try {
    const {
      page = 1,
      limit = 20,
      type,
      category,
      status,
      employeeId,
      month,
      year,
      search,
    } = req.query;

    const query: any = {};

    if (type) query.type = type;
    if (category) query.category = category;
    if (status) query.status = status;
    if (employeeId) query.employeeId = new Types.ObjectId(employeeId as string);
    if (month) query['payrollPeriod.month'] = parseInt(month as string);
    if (year) query['payrollPeriod.year'] = parseInt(year as string);

    if (search) {
      query.$or = [
        { referenceNumber: { $regex: search, $options: 'i' } },
        { employeeName: { $regex: search, $options: 'i' } },
        { employeeCode: { $regex: search, $options: 'i' } },
        { name: { $regex: search, $options: 'i' } },
      ];
    }

    const skip = (Number(page) - 1) * Number(limit);
    const total = await AdhocEarningDeduction.countDocuments(query);

    const items = await AdhocEarningDeduction.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit))
      .populate('employeeId', 'employeeCode fullName department')
      .populate('createdBy', 'firstName lastName');

    res.json({
      success: true,
      data: {
        items,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total,
          totalPages: Math.ceil(total / Number(limit)),
        },
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch adhoc items',
    });
  }
};

// Get by ID
export const getById = async (req: IAuthRequest, res: Response) => {
  try {
    const item = await AdhocEarningDeduction.findById(req.params.id)
      .populate('employeeId', 'employeeCode fullName department designation')
      .populate('createdBy', 'firstName lastName')
      .populate('approval.history.approverId', 'firstName lastName');

    if (!item) {
      return res.status(404).json({
        success: false,
        error: 'Adhoc item not found',
      });
    }

    return res.json({ success: true, data: item });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch adhoc item',
    });
  }
};

// Get by employee
export const getByEmployee = async (req: IAuthRequest, res: Response) => {
  try {
    const { employeeId } = req.params;
    const { month, year, status } = req.query;

    const query: any = { employeeId: new Types.ObjectId(employeeId) };

    if (month) query['payrollPeriod.month'] = parseInt(month as string);
    if (year) query['payrollPeriod.year'] = parseInt(year as string);
    if (status) query.status = status;

    const items = await AdhocEarningDeduction.find(query)
      .sort({ createdAt: -1 });

    res.json({ success: true, data: items });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch employee adhoc items',
    });
  }
};

// Get by payroll period
export const getByPeriod = async (req: IAuthRequest, res: Response) => {
  try {
    const { month, year } = req.params;
    const { status = 'approved', type } = req.query;

    const query: any = {
      'payrollPeriod.month': parseInt(month),
      'payrollPeriod.year': parseInt(year),
    };

    if (status) query.status = status;
    if (type) query.type = type;

    const items = await AdhocEarningDeduction.find(query)
      .populate('employeeId', 'employeeCode fullName department')
      .sort({ employeeName: 1, type: 1 });

    res.json({ success: true, data: items });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch period adhoc items',
    });
  }
};

// Create adhoc item
export const create = async (req: IAuthRequest, res: Response) => {
  try {
    const { employeeId, type, category, name, description, amount, month, year, notes } = req.body;

    // Validate employee
    const employee = await Employee.findById(employeeId);
    if (!employee) {
      return res.status(404).json({
        success: false,
        error: 'Employee not found',
      });
    }

    const adhocItem = new AdhocEarningDeduction({
      employeeId: employee._id,
      employeeCode: employee.employeeCode,
      employeeName: employee.fullName,
      type,
      category,
      name,
      description,
      amount,
      payrollPeriod: {
        month: parseInt(month),
        year: parseInt(year),
      },
      status: 'pending',
      approval: {
        requiredLevel: 1,
        currentLevel: 0,
        history: [],
      },
      payrollBehavior: {
        affectsGrossSalary: type === 'earning',
        affectsTaxableIncome: true,
        showInPayslip: true,
        payslipLabel: name,
      },
      notes,
      createdBy: req.user?._id,
      updatedBy: req.user?._id,
    });

    await adhocItem.save();

    return res.status(201).json({
      success: true,
      data: adhocItem,
      message: 'Adhoc item created successfully',
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to create adhoc item',
    });
  }
};

// Update adhoc item
export const update = async (req: IAuthRequest, res: Response) => {
  try {
    const item = await AdhocEarningDeduction.findById(req.params.id);

    if (!item) {
      return res.status(404).json({
        success: false,
        error: 'Adhoc item not found',
      });
    }

    // Only allow update if status is pending
    if (item.status !== 'pending') {
      return res.status(400).json({
        success: false,
        error: 'Cannot update item that is not in pending status',
      });
    }

    const allowedUpdates = ['name', 'description', 'amount', 'category', 'notes'];
    const updates = Object.keys(req.body)
      .filter(key => allowedUpdates.includes(key))
      .reduce((obj: any, key) => {
        obj[key] = req.body[key];
        return obj;
      }, {});

    updates.updatedBy = req.user?._id;

    const updatedItem = await AdhocEarningDeduction.findByIdAndUpdate(
      req.params.id,
      { $set: updates },
      { new: true }
    );

    return res.json({
      success: true,
      data: updatedItem,
      message: 'Adhoc item updated successfully',
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to update adhoc item',
    });
  }
};

// Approve adhoc item
export const approve = async (req: IAuthRequest, res: Response) => {
  try {
    const { comments } = req.body;
    const item = await AdhocEarningDeduction.findById(req.params.id);

    if (!item) {
      return res.status(404).json({
        success: false,
        error: 'Adhoc item not found',
      });
    }

    if (item.status !== 'pending') {
      return res.status(400).json({
        success: false,
        error: 'Item is not in pending status',
      });
    }

    item.approval.currentLevel = 1;
    item.approval.history.push({
      level: 1,
      approverId: req.user?._id,
      approverName: `${req.user?.firstName} ${req.user?.lastName}`,
      action: 'approved',
      comments,
      timestamp: new Date(),
    });
    item.status = 'approved';
    item.updatedBy = req.user?._id;

    await item.save();

    return res.json({
      success: true,
      data: item,
      message: 'Adhoc item approved successfully',
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to approve adhoc item',
    });
  }
};

// Reject adhoc item
export const reject = async (req: IAuthRequest, res: Response) => {
  try {
    const { comments } = req.body;
    const item = await AdhocEarningDeduction.findById(req.params.id);

    if (!item) {
      return res.status(404).json({
        success: false,
        error: 'Adhoc item not found',
      });
    }

    if (item.status !== 'pending') {
      return res.status(400).json({
        success: false,
        error: 'Item is not in pending status',
      });
    }

    item.approval.history.push({
      level: 1,
      approverId: req.user?._id,
      approverName: `${req.user?.firstName} ${req.user?.lastName}`,
      action: 'rejected',
      comments,
      timestamp: new Date(),
    });
    item.status = 'rejected';
    item.updatedBy = req.user?._id;

    await item.save();

    return res.json({
      success: true,
      data: item,
      message: 'Adhoc item rejected',
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to reject adhoc item',
    });
  }
};

// Cancel adhoc item
export const cancel = async (req: IAuthRequest, res: Response) => {
  try {
    const item = await AdhocEarningDeduction.findById(req.params.id);

    if (!item) {
      return res.status(404).json({
        success: false,
        error: 'Adhoc item not found',
      });
    }

    if (!['pending', 'approved'].includes(item.status)) {
      return res.status(400).json({
        success: false,
        error: 'Cannot cancel item that is already processed or cancelled',
      });
    }

    item.status = 'cancelled';
    item.updatedBy = req.user?._id;

    await item.save();

    return res.json({
      success: true,
      data: item,
      message: 'Adhoc item cancelled',
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to cancel adhoc item',
    });
  }
};

// Delete adhoc item (only pending)
export const remove = async (req: IAuthRequest, res: Response) => {
  try {
    const item = await AdhocEarningDeduction.findById(req.params.id);

    if (!item) {
      return res.status(404).json({
        success: false,
        error: 'Adhoc item not found',
      });
    }

    if (item.status !== 'pending') {
      return res.status(400).json({
        success: false,
        error: 'Cannot delete item that is not in pending status',
      });
    }

    await AdhocEarningDeduction.findByIdAndDelete(req.params.id);

    return res.json({
      success: true,
      message: 'Adhoc item deleted successfully',
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to delete adhoc item',
    });
  }
};

// Get summary by period
export const getSummaryByPeriod = async (req: IAuthRequest, res: Response) => {
  try {
    const { month, year } = req.params;

    const summary = await AdhocEarningDeduction.aggregate([
      {
        $match: {
          'payrollPeriod.month': parseInt(month),
          'payrollPeriod.year': parseInt(year),
          status: { $in: ['approved', 'processed'] },
        },
      },
      {
        $group: {
          _id: { type: '$type', status: '$status' },
          count: { $sum: 1 },
          totalAmount: { $sum: '$amount' },
        },
      },
    ]);

    const byEmployee = await AdhocEarningDeduction.aggregate([
      {
        $match: {
          'payrollPeriod.month': parseInt(month),
          'payrollPeriod.year': parseInt(year),
          status: 'approved',
        },
      },
      {
        $group: {
          _id: '$employeeId',
          employeeCode: { $first: '$employeeCode' },
          employeeName: { $first: '$employeeName' },
          totalEarnings: {
            $sum: {
              $cond: [{ $eq: ['$type', 'earning'] }, '$amount', 0],
            },
          },
          totalDeductions: {
            $sum: {
              $cond: [{ $eq: ['$type', 'deduction'] }, '$amount', 0],
            },
          },
          itemCount: { $sum: 1 },
        },
      },
      { $sort: { employeeName: 1 } },
    ]);

    res.json({
      success: true,
      data: {
        summary,
        byEmployee,
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch summary',
    });
  }
};

export default {
  getAll,
  getById,
  getByEmployee,
  getByPeriod,
  create,
  update,
  approve,
  reject,
  cancel,
  remove,
  getSummaryByPeriod,
};
