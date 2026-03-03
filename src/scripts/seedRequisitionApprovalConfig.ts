import mongoose from 'mongoose';
import { config } from '../config';
import ApprovalConfig from '../models/ApprovalConfig';

async function seedRequisitionApprovalConfig() {
  try {
    console.log('Connecting to database...');
    await mongoose.connect(config.mongoUri);
    console.log('Connected to database');

    const payload = {
      name: 'requisition_approval',
      type: 'custom' as const,
      description: 'Product requisitions require approval before creating Purchase Orders',
      isActive: true,
      applicableFor: { roles: [] },
      levels: [
        { level: 1, name: 'Any Authorized Approver', isParallel: true, minimumApprovals: 1, approverRole: 'accountant' },
        { level: 2, name: 'Admin', isParallel: true, minimumApprovals: 1, approverRole: 'admin' },
        { level: 3, name: 'Super Admin', isParallel: true, minimumApprovals: 1, approverRole: 'super_admin' },
        { level: 4, name: 'Head of Department', isParallel: true, minimumApprovals: 1, approverRole: 'hod' },
      ],
      notificationSettings: {
        notifyOnSubmit: true,
        notifyOnApproval: true,
        notifyOnRejection: true,
        reminderIntervalHours: 24,
      },
      metadata: { module: 'requisitions', approvalMode: 'anyone_can_approve' },
    };

    const result = await ApprovalConfig.findOneAndUpdate(
      { name: 'requisition_approval' },
      payload,
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    console.log('==============================================');
    console.log('  REQUISITION APPROVAL CONFIG SEEDED!          ');
    console.log('==============================================');
    console.log(`Config ID: ${result._id}`);
    console.log(`Active: ${result.isActive}`);
    console.log('==============================================');

    process.exit(0);
  } catch (error) {
    console.error('Seed requisition approval config error:', error);
    process.exit(1);
  }
}

seedRequisitionApprovalConfig();
