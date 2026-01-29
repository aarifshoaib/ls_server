import { Types } from 'mongoose';
import Holiday from '../models/Holiday';
import { errors } from '../utils/errors';
import { parsePagination, buildPaginatedResponse } from '../utils/helpers';
import { IPaginationQuery } from '../types';

// Helper function to extract year from date string using UTC
// This avoids timezone issues when date like "2026-01-02" is parsed
function getUTCYear(date: Date | string): number {
  const d = new Date(date);
  return d.getUTCFullYear();
}

// Helper function to parse a date string (YYYY-MM-DD) or Date and return a UTC midnight Date
// This ensures dates are stored consistently at UTC midnight regardless of server timezone
function parseUTCDate(date: Date | string): Date {
  const d = new Date(date);
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth();
  const day = d.getUTCDate();
  return new Date(Date.UTC(year, month, day, 0, 0, 0, 0));
}

export class HolidayService {
  // Get all holidays with pagination and filters
  static async getHolidays(query: any, pagination: IPaginationQuery) {
    const { page, limit, skip } = parsePagination(pagination);

    const filter: any = {};

    // Active status filter
    if (query.isActive !== undefined) {
      filter.isActive = query.isActive === 'true';
    }

    // Year filter
    if (query.year) {
      filter.year = parseInt(query.year);
    }

    // Type filter
    if (query.type) {
      filter.type = query.type;
    }

    // Applicable to filter
    if (query.applicableTo) {
      filter.applicableTo = query.applicableTo;
    }

    // Department filter
    if (query.department) {
      filter.$or = [
        { applicableTo: 'all' },
        { applicableTo: 'department', departments: query.department },
      ];
    }

    // Location filter
    if (query.location) {
      filter.$or = [
        { applicableTo: 'all' },
        { applicableTo: 'location', locations: query.location },
      ];
    }

    // Search filter
    if (query.search) {
      filter.$or = [
        { name: { $regex: query.search, $options: 'i' } },
        { description: { $regex: query.search, $options: 'i' } },
      ];
    }

    const [holidays, total] = await Promise.all([
      Holiday.find(filter)
        .populate('createdBy', 'fullName email')
        .populate('updatedBy', 'fullName email')
        .sort({ date: -1 })
        .skip(skip)
        .limit(limit),
      Holiday.countDocuments(filter),
    ]);

    return buildPaginatedResponse(holidays, total, page, limit);
  }

  // Get holiday by ID
  static async getHolidayById(id: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw errors.validation('Invalid holiday ID');
    }

    const holiday = await Holiday.findById(id)
      .populate('createdBy', 'fullName email')
      .populate('updatedBy', 'fullName email');

    if (!holiday) {
      throw errors.notFound('Holiday');
    }

    return holiday;
  }

  // Create holiday
  static async createHoliday(data: any, userId: string) {
    // Check for duplicate holiday on the same date
    const existingHoliday = await Holiday.findOne({
      date: data.date,
      name: data.name,
    });

    if (existingHoliday) {
      throw errors.duplicateEntry('Holiday on this date', data.name);
    }

    // Extract year from date (using UTC to avoid timezone issues)
    data.year = getUTCYear(data.date);
    // Normalize date to UTC midnight for consistent storage
    data.date = parseUTCDate(data.date);

    // Validate applicableTo dependencies
    if (data.applicableTo === 'department' && (!data.departments || data.departments.length === 0)) {
      throw errors.validation('Departments are required when applicableTo is "department"');
    }

    if (data.applicableTo === 'location' && (!data.locations || data.locations.length === 0)) {
      throw errors.validation('Locations are required when applicableTo is "location"');
    }

    // Clear departments/locations if not applicable
    if (data.applicableTo === 'all') {
      data.departments = [];
      data.locations = [];
    } else if (data.applicableTo === 'department') {
      data.locations = [];
    } else if (data.applicableTo === 'location') {
      data.departments = [];
    }

    data.createdBy = userId;
    data.updatedBy = userId;

    const holiday = new Holiday(data);
    await holiday.save();

    return holiday;
  }

  // Update holiday
  static async updateHoliday(id: string, data: any, userId: string) {
    const holiday = await this.getHolidayById(id);

    // Check for duplicate if name or date is being changed
    if (data.name || data.date) {
      const checkName = data.name || holiday.name;
      const checkDate = data.date || holiday.date;

      const existingHoliday = await Holiday.findOne({
        _id: { $ne: holiday._id },
        date: checkDate,
        name: checkName,
      });

      if (existingHoliday) {
        throw errors.duplicateEntry('Holiday on this date', checkName);
      }
    }

    // Update year if date is changing (using UTC to avoid timezone issues)
    if (data.date) {
      data.year = getUTCYear(data.date);
      // Normalize date to UTC midnight for consistent storage
      data.date = parseUTCDate(data.date);
    }

    // Validate applicableTo dependencies
    const applicableTo = data.applicableTo || holiday.applicableTo;

    if (applicableTo === 'department') {
      const departments = data.departments || holiday.departments;
      if (!departments || departments.length === 0) {
        throw errors.validation('Departments are required when applicableTo is "department"');
      }
      data.locations = [];
    } else if (applicableTo === 'location') {
      const locations = data.locations || holiday.locations;
      if (!locations || locations.length === 0) {
        throw errors.validation('Locations are required when applicableTo is "location"');
      }
      data.departments = [];
    } else if (applicableTo === 'all') {
      data.departments = [];
      data.locations = [];
    }

    data.updatedBy = userId;

    Object.assign(holiday, data);
    await holiday.save();

    return holiday;
  }

  // Delete holiday (soft delete by setting isActive to false)
  static async deleteHoliday(id: string, userId: string) {
    const holiday = await this.getHolidayById(id);

    holiday.isActive = false;
    holiday.updatedBy = new Types.ObjectId(userId);
    await holiday.save();

    return holiday;
  }

  // Get holidays for a specific period (date range)
  static async getHolidaysForPeriod(startDate: Date, endDate: Date, options?: {
    department?: string;
    location?: string;
    activeOnly?: boolean;
  }) {
    const filter: any = {
      date: {
        $gte: startDate,
        $lte: endDate,
      },
    };

    // Filter by active status
    if (options?.activeOnly !== false) {
      filter.isActive = true;
    }

    // Filter by department
    if (options?.department) {
      filter.$or = [
        { applicableTo: 'all' },
        { applicableTo: 'department', departments: options.department },
      ];
    }

    // Filter by location
    if (options?.location) {
      filter.$or = [
        { applicableTo: 'all' },
        { applicableTo: 'location', locations: options.location },
      ];
    }

    const holidays = await Holiday.find(filter)
      .sort({ date: 1 })
      .select('name date type isHalfDay isPaid description applicableTo departments locations');

    return holidays;
  }

  // Get holidays by year
  static async getHolidaysByYear(year: number, activeOnly: boolean = true) {
    const filter: any = { year };

    if (activeOnly) {
      filter.isActive = true;
    }

    const holidays = await Holiday.find(filter)
      .sort({ date: 1 })
      .select('name date type isHalfDay isPaid description applicableTo departments locations');

    return holidays;
  }

  // Get holiday statistics
  static async getStatistics(year?: number) {
    const filter: any = { isActive: true };

    if (year) {
      filter.year = year;
    }

    const stats = await Holiday.aggregate([
      { $match: filter },
      {
        $facet: {
          byType: [
            { $group: { _id: '$type', count: { $sum: 1 } } },
          ],
          byYear: [
            { $group: { _id: '$year', count: { $sum: 1 } } },
            { $sort: { _id: -1 } },
            { $limit: 5 },
          ],
          byApplicableTo: [
            { $group: { _id: '$applicableTo', count: { $sum: 1 } } },
          ],
          totalCount: [
            { $count: 'count' },
          ],
          paidCount: [
            { $match: { isPaid: true } },
            { $count: 'count' },
          ],
          halfDayCount: [
            { $match: { isHalfDay: true } },
            { $count: 'count' },
          ],
        },
      },
    ]);

    return {
      byType: stats[0].byType,
      byYear: stats[0].byYear,
      byApplicableTo: stats[0].byApplicableTo,
      totalCount: stats[0].totalCount[0]?.count || 0,
      paidCount: stats[0].paidCount[0]?.count || 0,
      halfDayCount: stats[0].halfDayCount[0]?.count || 0,
    };
  }

  // Bulk create holidays
  static async bulkCreateHolidays(holidays: any[], userId: string) {
    const results = {
      success: [] as any[],
      errors: [] as any[],
    };

    for (const holidayData of holidays) {
      try {
        // Check for duplicate
        const existingHoliday = await Holiday.findOne({
          date: holidayData.date,
          name: holidayData.name,
        });

        if (existingHoliday) {
          results.errors.push({
            data: holidayData,
            error: `Holiday "${holidayData.name}" on ${holidayData.date} already exists`,
          });
          continue;
        }

        // Extract year from date (using UTC to avoid timezone issues)
        holidayData.year = getUTCYear(holidayData.date);
        // Normalize date to UTC midnight for consistent storage
        holidayData.date = parseUTCDate(holidayData.date);

        // Clear departments/locations based on applicableTo
        if (holidayData.applicableTo === 'all') {
          holidayData.departments = [];
          holidayData.locations = [];
        } else if (holidayData.applicableTo === 'department') {
          holidayData.locations = [];
        } else if (holidayData.applicableTo === 'location') {
          holidayData.departments = [];
        }

        holidayData.createdBy = userId;
        holidayData.updatedBy = userId;

        const holiday = new Holiday(holidayData);
        await holiday.save();

        results.success.push(holiday);
      } catch (error: any) {
        results.errors.push({
          data: holidayData,
          error: error.message || 'Failed to create holiday',
        });
      }
    }

    return results;
  }

  // Check if a date is a holiday
  static async isHoliday(date: Date, options?: {
    department?: string;
    location?: string;
  }) {
    const filter: any = {
      date: {
        $gte: new Date(date.setHours(0, 0, 0, 0)),
        $lte: new Date(date.setHours(23, 59, 59, 999)),
      },
      isActive: true,
    };

    // Filter by department
    if (options?.department) {
      filter.$or = [
        { applicableTo: 'all' },
        { applicableTo: 'department', departments: options.department },
      ];
    }

    // Filter by location
    if (options?.location) {
      filter.$or = [
        { applicableTo: 'all' },
        { applicableTo: 'location', locations: options.location },
      ];
    }

    const holiday = await Holiday.findOne(filter);

    return holiday ? {
      isHoliday: true,
      holiday,
    } : {
      isHoliday: false,
      holiday: null,
    };
  }
}
