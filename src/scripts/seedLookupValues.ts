import mongoose from 'mongoose';
import { config } from '../config';
import LookupValue from '../models/LookupValue';

type LookupSeed = {
  category: string;
  code: string;
  name: string;
  sortOrder?: number;
};

const LOOKUP_SEEDS: LookupSeed[] = [
  // Employee basics
  { category: 'gender', code: 'male', name: 'Male', sortOrder: 1 },
  { category: 'gender', code: 'female', name: 'Female', sortOrder: 2 },
  { category: 'gender', code: 'other', name: 'Other', sortOrder: 3 },

  { category: 'marital_status', code: 'single', name: 'Single', sortOrder: 1 },
  { category: 'marital_status', code: 'married', name: 'Married', sortOrder: 2 },
  { category: 'marital_status', code: 'divorced', name: 'Divorced', sortOrder: 3 },
  { category: 'marital_status', code: 'widowed', name: 'Widowed', sortOrder: 4 },

  { category: 'employment_type', code: 'full_time', name: 'Full Time', sortOrder: 1 },
  { category: 'employment_type', code: 'part_time', name: 'Part Time', sortOrder: 2 },
  { category: 'employment_type', code: 'contract', name: 'Contract', sortOrder: 3 },
  { category: 'employment_type', code: 'probation', name: 'Probation', sortOrder: 4 },

  // Payroll/payment configuration
  { category: 'payment_mode', code: 'bank_transfer', name: 'Bank Transfer', sortOrder: 1 },
  { category: 'payment_mode', code: 'cash', name: 'Cash', sortOrder: 2 },
  { category: 'payment_mode', code: 'cheque', name: 'Cheque', sortOrder: 3 },
  { category: 'payment_mode', code: 'card', name: 'Card', sortOrder: 4 },

  { category: 'currency', code: 'AED', name: 'AED', sortOrder: 1 },
  { category: 'currency', code: 'USD', name: 'USD', sortOrder: 2 },
  { category: 'currency', code: 'EUR', name: 'EUR', sortOrder: 3 },
  { category: 'currency', code: 'GBP', name: 'GBP', sortOrder: 4 },

  // Attendance & leave
  { category: 'leave_type', code: 'sick', name: 'Sick Leave', sortOrder: 1 },
  { category: 'leave_type', code: 'casual', name: 'Casual Leave', sortOrder: 2 },
  { category: 'leave_type', code: 'annual', name: 'Annual Leave', sortOrder: 3 },
  { category: 'leave_type', code: 'unpaid', name: 'Unpaid Leave', sortOrder: 4 },

  { category: 'attendance_status', code: 'present', name: 'Present', sortOrder: 1 },
  { category: 'attendance_status', code: 'absent', name: 'Absent', sortOrder: 2 },
  { category: 'attendance_status', code: 'half_day', name: 'Half Day', sortOrder: 3 },
  { category: 'attendance_status', code: 'leave', name: 'Leave', sortOrder: 4 },
  { category: 'attendance_status', code: 'holiday', name: 'Holiday', sortOrder: 5 },

  // Advances
  { category: 'advance_type', code: 'salary_advance', name: 'Salary Advance', sortOrder: 1 },
  { category: 'advance_type', code: 'loan', name: 'Loan', sortOrder: 2 },
  { category: 'advance_type', code: 'emergency', name: 'Emergency', sortOrder: 3 },

  { category: 'repayment_method', code: 'full', name: 'Full Payment', sortOrder: 1 },
  { category: 'repayment_method', code: 'emi', name: 'EMI (Installments)', sortOrder: 2 },

  // Pay cycles
  { category: 'pay_cycle_type', code: 'monthly', name: 'Monthly', sortOrder: 1 },
  { category: 'pay_cycle_type', code: 'bi_weekly', name: 'Bi-Weekly', sortOrder: 2 },
  { category: 'pay_cycle_type', code: 'weekly', name: 'Weekly', sortOrder: 3 },

  { category: 'payroll_calculation_method', code: 'daily_rate', name: 'Daily Rate', sortOrder: 1 },
  { category: 'payroll_calculation_method', code: 'fixed_monthly', name: 'Fixed Monthly', sortOrder: 2 },
  { category: 'payroll_calculation_method', code: 'hourly_rate', name: 'Hourly Rate', sortOrder: 3 },

  // OMS - order statuses for wizard/progress (exact display order)
  { category: 'order_status', code: 'draft', name: 'Draft', sortOrder: 0 },
  { category: 'order_status', code: 'pending', name: 'Pending', sortOrder: 1 },
  { category: 'order_status', code: 'confirmed', name: 'Confirmed', sortOrder: 2 },
  { category: 'order_status', code: 'invoiced', name: 'Invoiced', sortOrder: 3 },
  { category: 'order_status', code: 'processing', name: 'Processing', sortOrder: 4 },
  { category: 'order_status', code: 'picked', name: 'Picked', sortOrder: 5 },
  { category: 'order_status', code: 'packed', name: 'Packed', sortOrder: 6 },
  { category: 'order_status', code: 'ready_to_deliver', name: 'Ready To Deliver', sortOrder: 7 },
  { category: 'order_status', code: 'ready_to_ship', name: 'Ready To Ship', sortOrder: 8 },
  { category: 'order_status', code: 'out_for_delivery', name: 'Out For Delivery', sortOrder: 9 },
  { category: 'order_status', code: 'shipped', name: 'Shipped', sortOrder: 10 },
  { category: 'order_status', code: 'delivered', name: 'Delivered', sortOrder: 11 },
  { category: 'order_status', code: 'cancelled', name: 'Cancelled', sortOrder: 12 },
  { category: 'order_status', code: 'returned', name: 'Returned', sortOrder: 13 },
  { category: 'order_status', code: 'partially_returned', name: 'Partially Returned', sortOrder: 14 },

  { category: 'payment_method', code: 'credit', name: 'Credit (Pay Later)', sortOrder: 1 },
  { category: 'payment_method', code: 'cod', name: 'Cash On Delivery', sortOrder: 2 },
  { category: 'payment_method', code: 'prepaid', name: 'Prepaid', sortOrder: 3 },

  { category: 'payment_status', code: 'pending', name: 'Pending', sortOrder: 1 },
  { category: 'payment_status', code: 'partial', name: 'Partial', sortOrder: 2 },
  { category: 'payment_status', code: 'paid', name: 'Paid', sortOrder: 3 },
  { category: 'payment_status', code: 'refunded', name: 'Refunded', sortOrder: 4 },
];

const upsertLookupValue = async (seed: LookupSeed) => {
  const { category, code, name, sortOrder = 0 } = seed;

  await LookupValue.findOneAndUpdate(
    { category, code: code.toUpperCase() },
    {
      category,
      code: code.toUpperCase(),
      name,
      isActive: true,
      metadata: {
        sortOrder,
      },
    },
    { upsert: true, new: true }
  );
};

async function seedLookupValues() {
  try {
    console.log('Connecting to database...');
    await mongoose.connect(config.mongoUri);
    console.log('Connected to database');

    console.log('\nSeeding Lookup Values...');
    for (const seed of LOOKUP_SEEDS) {
      await upsertLookupValue(seed);
      console.log(`  ✓ ${seed.category}/${seed.code}`);
    }

    console.log('\n==============================================');
    console.log('    LOOKUP VALUE SEEDING COMPLETED!          ');
    console.log('==============================================\n');

    process.exit(0);
  } catch (error) {
    console.error('Seed error:', error);
    process.exit(1);
  }
}

seedLookupValues();
