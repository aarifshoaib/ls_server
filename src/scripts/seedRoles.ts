import mongoose from 'mongoose';
import { config } from '../config';
import Role from '../models/Role';

/**
 * Permission Matrix:
 * C = create, R = read, U = update, D = delete, P = process
 * - = no access
 * COL = collection only (own records) - treated as RU for now
 *
 * Modules:
 * OMS: dashboard, products, categories, customers, orders, inventory, payments, reports
 * Payroll: employees, pay_cycles, attendance, holidays, advances, adhoc_items, payroll_process, payroll_runs, payroll_archives, payroll_reports
 * Settings: lookup_values, users
 */

interface RoleDefinition {
  name: string;
  displayName: string;
  description: string;
  isSystem: boolean;
  permissions: { module: string; actions: string[] }[];
}

// Helper function to convert permission string to actions array
const parsePermissions = (permStr: string): string[] => {
  if (!permStr || permStr === '-') return [];
  const actions: string[] = [];
  const str = permStr.toUpperCase().replace('(COL)', '');
  if (str.includes('C')) actions.push('create');
  if (str.includes('R')) actions.push('read');
  if (str.includes('U')) actions.push('update');
  if (str.includes('D')) actions.push('delete');
  if (str.includes('P')) actions.push('process');
  return actions;
};

// Build permissions array from a permission map
const buildPermissions = (permMap: Record<string, string>): { module: string; actions: string[] }[] => {
  return Object.entries(permMap)
    .filter(([_, perms]) => perms && perms !== '-')
    .map(([module, perms]) => ({
      module,
      actions: parsePermissions(perms),
    }));
};

const rolesData: RoleDefinition[] = [
  {
    name: 'super_admin',
    displayName: 'Super Admin',
    description: 'Full system access with all permissions',
    isSystem: true,
    permissions: buildPermissions({
      // OMS
      dashboard: 'R',
      products: 'CRU',
      categories: 'CRU',
      customers: 'CRU',
      orders: 'CRU',
      inventory: 'R',
      payments: 'RU',
      reports: 'R',
      // Payroll
      employees: 'CRU',
      pay_cycles: 'CRU',
      attendance: 'CRUD',
      holidays: 'CRUD',
      advances: 'CRUD',
      adhoc_items: 'CRUD',
      payroll_process: 'P',
      payroll_runs: 'R',
      payroll_archives: 'R',
      payroll_reports: 'R',
      // Settings
      lookup_values: 'R',
      users: 'CRU',
    }),
  },
  {
    name: 'admin',
    displayName: 'Admin',
    description: 'Administrative access to most system features',
    isSystem: true,
    permissions: buildPermissions({
      // OMS
      dashboard: 'R',
      products: 'CRU',
      categories: 'CRU',
      customers: 'CRU',
      orders: 'CRU',
      inventory: 'R',
      payments: 'RU',
      reports: 'R',
      // Payroll
      employees: 'CRU',
      pay_cycles: 'CRU',
      attendance: 'CRUD',
      holidays: 'CRUD',
      advances: 'CRUD',
      adhoc_items: 'CRUD',
      payroll_process: 'P',
      payroll_runs: '-',
      payroll_archives: 'R',
      payroll_reports: 'R',
      // Settings
      lookup_values: 'R',
      users: 'CRU',
    }),
  },
  {
    name: 'hod',
    displayName: 'Head of Department',
    description: 'Department head with limited payroll visibility',
    isSystem: true,
    permissions: buildPermissions({
      // OMS
      dashboard: 'R',
      products: 'CR',
      categories: 'R',
      customers: 'CRU',
      orders: 'CRU',
      inventory: 'R',
      payments: 'RU',
      reports: 'R',
      // Payroll
      employees: 'R',
      pay_cycles: '-',
      attendance: 'R',
      holidays: 'R',
      advances: '-',
      adhoc_items: '-',
      payroll_process: '-',
      payroll_runs: '-',
      payroll_archives: '-',
      payroll_reports: '-',
      // Settings
      lookup_values: '-',
      users: '-',
    }),
  },
  {
    name: 'accountant',
    displayName: 'Accountant',
    description: 'Finance and accounting access with payroll visibility',
    isSystem: true,
    permissions: buildPermissions({
      // OMS
      dashboard: 'R',
      products: 'R',
      categories: 'R',
      customers: 'CR',
      orders: 'CRU',
      inventory: 'R',
      payments: 'RU',
      reports: 'R',
      // Payroll
      employees: 'R',
      pay_cycles: 'R',
      attendance: 'CRUD',
      holidays: 'CRUD',
      advances: 'R',
      adhoc_items: 'R',
      payroll_process: '-',
      payroll_runs: '-',
      payroll_archives: 'R',
      payroll_reports: 'R',
      // Settings
      lookup_values: '-',
      users: '-',
    }),
  },
  {
    name: 'supervisor',
    displayName: 'Supervisor',
    description: 'Team supervisor with order creation access',
    isSystem: true,
    permissions: buildPermissions({
      // OMS
      dashboard: 'R',
      products: 'R',
      categories: 'R',
      customers: 'R',
      orders: 'CR',
      inventory: 'R',
      payments: 'RU',
      reports: 'R',
      // Payroll
      employees: '-',
      pay_cycles: '-',
      attendance: 'R',
      holidays: 'R',
      advances: '-',
      adhoc_items: '-',
      payroll_process: '-',
      payroll_runs: '-',
      payroll_archives: '-',
      payroll_reports: '-',
      // Settings
      lookup_values: '-',
      users: '-',
    }),
  },
  {
    name: 'sales_team',
    displayName: 'Sales Team',
    description: 'Sales team member with order creation access',
    isSystem: true,
    permissions: buildPermissions({
      // OMS
      dashboard: 'R',
      products: 'R',
      categories: 'R',
      customers: 'R',
      orders: 'CR',
      inventory: 'R',
      payments: 'RU',
      reports: 'R',
      // Payroll - No access
      employees: '-',
      pay_cycles: '-',
      attendance: '-',
      holidays: '-',
      advances: '-',
      adhoc_items: '-',
      payroll_process: '-',
      payroll_runs: '-',
      payroll_archives: '-',
      payroll_reports: '-',
      // Settings
      lookup_values: '-',
      users: '-',
    }),
  },
  {
    name: 'delivery_team',
    displayName: 'Delivery Team',
    description: 'Delivery team member with read-only access',
    isSystem: true,
    permissions: buildPermissions({
      // OMS
      dashboard: 'R',
      products: 'R',
      categories: 'R',
      customers: 'R',
      orders: 'R',
      inventory: 'R',
      payments: 'RU',
      reports: 'R',
      // Payroll - No access
      employees: '-',
      pay_cycles: '-',
      attendance: '-',
      holidays: '-',
      advances: '-',
      adhoc_items: '-',
      payroll_process: '-',
      payroll_runs: '-',
      payroll_archives: '-',
      payroll_reports: '-',
      // Settings
      lookup_values: '-',
      users: '-',
    }),
  },
  {
    name: 'hrm',
    displayName: 'HRM',
    description: 'Human Resource Management with full payroll access',
    isSystem: true,
    permissions: buildPermissions({
      // OMS - Only Dashboard
      dashboard: 'R',
      products: '-',
      categories: '-',
      customers: '-',
      orders: '-',
      inventory: '-',
      payments: '-',
      reports: '-',
      // Payroll - Full access
      employees: 'CRU',
      pay_cycles: 'CRU',
      attendance: 'CRUD',
      holidays: 'CRUD',
      advances: 'CRUD',
      adhoc_items: 'CRU',
      payroll_process: 'P',
      payroll_runs: 'P',
      payroll_archives: 'R',
      payroll_reports: 'R',
      // Settings
      lookup_values: '-',
      users: '-',
    }),
  },
];

async function seedRoles() {
  try {
    console.log('Connecting to database...');
    await mongoose.connect(config.mongoUri);
    console.log('Connected to database');

    // Clear existing roles
    console.log('Clearing existing roles...');
    await Role.deleteMany({});

    // Insert new roles
    console.log('Creating roles...');
    const roles = await Role.insertMany(rolesData);

    console.log('\n==============================================');
    console.log('       ROLES SEEDED SUCCESSFULLY!             ');
    console.log('==============================================');
    console.log('\nRoles Created:');
    roles.forEach((role) => {
      const moduleCount = role.permissions.length;
      console.log(`  - ${role.displayName} (${role.name}) - ${moduleCount} modules`);
    });
    console.log('==============================================\n');

    process.exit(0);
  } catch (error) {
    console.error('Seed roles error:', error);
    process.exit(1);
  }
}

seedRoles();
