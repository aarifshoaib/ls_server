import mongoose from 'mongoose';
import { config } from '../config';
import LookupValue from '../models/LookupValue';

async function seedComponents() {
  try {
    console.log('Connecting to database...');
    await mongoose.connect(config.mongoUri);
    console.log('Connected to database');

    // Define earning components
    const earningComponents = [
      {
        category: 'EARNING_COMPONENT',
        code: 'BASIC',
        name: 'Basic Salary',
        nameAr: 'الراتب الأساسي',
        description: 'Base monthly salary',
        isActive: true,
        metadata: {
          sortOrder: 1,
          additionalData: {
            calculationType: 'fixed',
            isTaxable: true,
            isStatutory: true,
            displayOrder: 1,
          },
        },
      },
      {
        category: 'EARNING_COMPONENT',
        code: 'HRA',
        name: 'Housing Allowance',
        nameAr: 'بدل السكن',
        description: 'Monthly housing allowance',
        isActive: true,
        metadata: {
          sortOrder: 2,
          additionalData: {
            calculationType: 'fixed',
            isTaxable: false,
            isStatutory: false,
            displayOrder: 2,
          },
        },
      },
      {
        category: 'EARNING_COMPONENT',
        code: 'TRANSPORT',
        name: 'Transport Allowance',
        nameAr: 'بدل النقل',
        description: 'Monthly transport allowance',
        isActive: true,
        metadata: {
          sortOrder: 3,
          additionalData: {
            calculationType: 'fixed',
            isTaxable: false,
            isStatutory: false,
            displayOrder: 3,
          },
        },
      },
      {
        category: 'EARNING_COMPONENT',
        code: 'FOOD',
        name: 'Food Allowance',
        nameAr: 'بدل الطعام',
        description: 'Monthly food allowance',
        isActive: true,
        metadata: {
          sortOrder: 4,
          additionalData: {
            calculationType: 'fixed',
            isTaxable: false,
            isStatutory: false,
            displayOrder: 4,
          },
        },
      },
      {
        category: 'EARNING_COMPONENT',
        code: 'PHONE',
        name: 'Phone Allowance',
        nameAr: 'بدل الهاتف',
        description: 'Monthly phone/communication allowance',
        isActive: true,
        metadata: {
          sortOrder: 5,
          additionalData: {
            calculationType: 'fixed',
            isTaxable: false,
            isStatutory: false,
            displayOrder: 5,
          },
        },
      },
      {
        category: 'EARNING_COMPONENT',
        code: 'OT',
        name: 'Overtime',
        nameAr: 'العمل الإضافي',
        description: 'Overtime earnings calculated from attendance',
        isActive: true,
        metadata: {
          sortOrder: 10,
          additionalData: {
            calculationType: 'formula',
            isTaxable: true,
            isStatutory: false,
            displayOrder: 10,
            isSystemCalculated: true,
          },
        },
      },
      {
        category: 'EARNING_COMPONENT',
        code: 'BONUS',
        name: 'Bonus',
        nameAr: 'المكافأة',
        description: 'Performance or adhoc bonus',
        isActive: true,
        metadata: {
          sortOrder: 11,
          additionalData: {
            calculationType: 'fixed',
            isTaxable: true,
            isStatutory: false,
            displayOrder: 11,
          },
        },
      },
      {
        category: 'EARNING_COMPONENT',
        code: 'COMMISSION',
        name: 'Commission',
        nameAr: 'العمولة',
        description: 'Sales commission',
        isActive: true,
        metadata: {
          sortOrder: 12,
          additionalData: {
            calculationType: 'fixed',
            isTaxable: true,
            isStatutory: false,
            displayOrder: 12,
          },
        },
      },
    ];

    // Define deduction components
    const deductionComponents = [
      {
        category: 'DEDUCTION_COMPONENT',
        code: 'ABSENT',
        name: 'Absent Deduction',
        nameAr: 'خصم الغياب',
        description: 'Deduction for absent days',
        isActive: true,
        metadata: {
          sortOrder: 1,
          additionalData: {
            calculationType: 'formula',
            displayOrder: 1,
            isSystemCalculated: true,
          },
        },
      },
      {
        category: 'DEDUCTION_COMPONENT',
        code: 'ADVANCE',
        name: 'Advance Deduction',
        nameAr: 'خصم السلفة',
        description: 'Salary advance repayment',
        isActive: true,
        metadata: {
          sortOrder: 2,
          additionalData: {
            calculationType: 'fixed',
            displayOrder: 2,
            isSystemCalculated: true,
          },
        },
      },
      {
        category: 'DEDUCTION_COMPONENT',
        code: 'LOAN',
        name: 'Loan Deduction',
        nameAr: 'خصم القرض',
        description: 'Loan EMI deduction',
        isActive: true,
        metadata: {
          sortOrder: 3,
          additionalData: {
            calculationType: 'fixed',
            displayOrder: 3,
          },
        },
      },
      {
        category: 'DEDUCTION_COMPONENT',
        code: 'LATE',
        name: 'Late Arrival Deduction',
        nameAr: 'خصم التأخير',
        description: 'Deduction for late arrivals',
        isActive: true,
        metadata: {
          sortOrder: 4,
          additionalData: {
            calculationType: 'formula',
            displayOrder: 4,
            isSystemCalculated: true,
          },
        },
      },
      {
        category: 'DEDUCTION_COMPONENT',
        code: 'UNPAID_LEAVE',
        name: 'Unpaid Leave Deduction',
        nameAr: 'خصم الإجازة غير المدفوعة',
        description: 'Deduction for unpaid leave days',
        isActive: true,
        metadata: {
          sortOrder: 5,
          additionalData: {
            calculationType: 'formula',
            displayOrder: 5,
            isSystemCalculated: true,
          },
        },
      },
      {
        category: 'DEDUCTION_COMPONENT',
        code: 'OTHER_DEDUCTION',
        name: 'Other Deductions',
        nameAr: 'خصومات أخرى',
        description: 'Miscellaneous deductions',
        isActive: true,
        metadata: {
          sortOrder: 10,
          additionalData: {
            calculationType: 'fixed',
            displayOrder: 10,
          },
        },
      },
    ];

    // Upsert earning components
    console.log('\nSeeding Earning Components...');
    for (const component of earningComponents) {
      await LookupValue.findOneAndUpdate(
        { category: component.category, code: component.code },
        component,
        { upsert: true, new: true }
      );
      console.log(`  ✓ ${component.code}: ${component.name}`);
    }

    // Upsert deduction components
    console.log('\nSeeding Deduction Components...');
    for (const component of deductionComponents) {
      await LookupValue.findOneAndUpdate(
        { category: component.category, code: component.code },
        component,
        { upsert: true, new: true }
      );
      console.log(`  ✓ ${component.code}: ${component.name}`);
    }

    // Get counts
    const earningCount = await LookupValue.countDocuments({ category: 'EARNING_COMPONENT' });
    const deductionCount = await LookupValue.countDocuments({ category: 'DEDUCTION_COMPONENT' });

    console.log('\n==============================================');
    console.log('    COMPONENT SEEDING COMPLETED!              ');
    console.log('==============================================');
    console.log(`  Earning Components:   ${earningCount}`);
    console.log(`  Deduction Components: ${deductionCount}`);
    console.log('==============================================\n');

    process.exit(0);
  } catch (error) {
    console.error('Seed error:', error);
    process.exit(1);
  }
}

seedComponents();
