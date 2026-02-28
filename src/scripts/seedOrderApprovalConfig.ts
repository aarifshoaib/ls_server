import mongoose from 'mongoose';
import { config } from '../config';
import ApprovalConfig from '../models/ApprovalConfig';

async function seedOrderApprovalConfig() {
  try {
    console.log('Connecting to database...');
    await mongoose.connect(config.mongoUri);
    console.log('Connected to database');

    const approvalConfigPayload = {
      name: 'order_creation_approval',
      type: 'custom' as const,
      description: 'Sales orders require approval before creation',
      isActive: true,
      applicableFor: {
        roles: ['sales_team'],
      },
      levels: [
        {
          level: 1,
          name: 'Any Authorized Approver',
          isParallel: true,
          minimumApprovals: 1,
          approverRole: 'accountant',
        },
        {
          level: 2,
          name: 'Admin',
          isParallel: true,
          minimumApprovals: 1,
          approverRole: 'admin',
        },
        {
          level: 3,
          name: 'Super Admin',
          isParallel: true,
          minimumApprovals: 1,
          approverRole: 'super_admin',
        },
        {
          level: 4,
          name: 'Head of Department',
          isParallel: true,
          minimumApprovals: 1,
          approverRole: 'hod',
        },
      ],
      notificationSettings: {
        notifyOnSubmit: true,
        notifyOnApproval: true,
        notifyOnRejection: true,
        reminderIntervalHours: 24,
      },
      metadata: {
        module: 'orders',
        approvalMode: 'anyone_can_approve',
      },
    };

    const result = await ApprovalConfig.findOneAndUpdate(
      { name: 'order_creation_approval' },
      approvalConfigPayload,
      {
        new: true,
        upsert: true,
        setDefaultsOnInsert: true,
      }
    );

    console.log('==============================================');
    console.log('  ORDER APPROVAL CONFIG SEEDED SUCCESSFULLY!  ');
    console.log('==============================================');
    console.log(`Config ID: ${result._id}`);
    console.log(`Active: ${result.isActive}`);
    console.log('Approver roles: accountant, admin, super_admin, hod');
    console.log('==============================================');

    process.exit(0);
  } catch (error) {
    console.error('Seed order approval config error:', error);
    process.exit(1);
  }
}

seedOrderApprovalConfig();
