/**
 * One-time migration: create default company and assign all employees without companyId.
 * Run: npx ts-node src/scripts/migrateCompanies.ts
 */
import mongoose from 'mongoose';
import { config } from '../config';
import Company from '../models/Company';
import Employee from '../models/Employee';

async function run() {
  await mongoose.connect(config.mongoUri);
  console.log('Connected to MongoDB');

  let company = await Company.findOne({ code: 'DEFAULT' });
  if (!company) {
    company = await Company.create({
      code: 'DEFAULT',
      name: 'Default Company',
      legalName: 'Default Company',
      isActive: true,
    });
    console.log('Created default company:', company._id.toString());
  } else {
    console.log('Default company exists:', company._id.toString());
  }

  const cid = company._id;
  const res = await Employee.updateMany(
    { $or: [{ companyId: { $exists: false } }, { companyId: null }] },
    { $set: { companyId: cid } }
  );
  console.log('Employees updated:', res.modifiedCount);

  await mongoose.disconnect();
  console.log('Done.');
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
