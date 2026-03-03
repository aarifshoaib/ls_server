import mongoose from 'mongoose';
import { config } from '../config';
import ApprovalConfig from '../models/ApprovalConfig';

async function seedPurchaseOrderApprovalConfig() {
  try {
    await mongoose.connect(config.mongoUri);

    const payload = {
      name: 'purchase_order_approval',
      type: 'custom' as const,
      description: 'Purchase orders require approval before sending to vendor',
      isActive: true,
      applicableFor: { roles: [] },
      levels: [
        { level: 1, name: 'Any Authorized Approver', isParallel: true, minimumApprovals: 1, approverRole: 'accountant' },
        { level: 2, name: 'Admin', isParallel: true, minimumApprovals: 1, approverRole: 'admin' },
        { level: 3, name: 'Super Admin', isParallel: true, minimumApprovals: 1, approverRole: 'super_admin' },
        { level: 4, name: 'HOD', isParallel: true, minimumApprovals: 1, approverRole: 'hod' },
      ],
      notificationSettings: {
        notifyOnSubmit: true,
        notifyOnApproval: true,
        notifyOnRejection: true,
        reminderIntervalHours: 24,
      },
      metadata: { module: 'purchase_orders', approvalMode: 'anyone_can_approve' },
    };

    const result = await ApprovalConfig.findOneAndUpdate(
      { name: 'purchase_order_approval' },
      payload,
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    console.log('Purchase Order approval config seeded:', result._id);
    process.exit(0);
  } catch (error) {
    console.error('Seed error:', error);
    process.exit(1);
  }
}

seedPurchaseOrderApprovalConfig();
