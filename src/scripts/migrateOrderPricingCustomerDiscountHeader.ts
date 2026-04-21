/**
 * Migrates persisted orders to header-only customer discount (matches `buildPricedOrderItems`).
 * Delegates to `recomputeOrderPricing.ts`, which rewrites `items` + `pricing` + `balanceDue` per order.
 *
 * From the backend folder:
 *   npx ts-node src/scripts/migrateOrderPricingCustomerDiscountHeader.ts --dry-run
 *   npx ts-node src/scripts/migrateOrderPricingCustomerDiscountHeader.ts
 *   npx ts-node src/scripts/migrateOrderPricingCustomerDiscountHeader.ts --order-number=ORD-0001
 */
import { spawnSync } from 'child_process';
import * as path from 'path';

const backendRoot = path.join(__dirname, '..', '..');
const target = path.join('src', 'scripts', 'recomputeOrderPricing.ts');
const passthrough = process.argv.slice(2);

console.log('migrateOrderPricingCustomerDiscountHeader → recomputeOrderPricing.ts\n');

const result = spawnSync('npx', ['ts-node', target, ...passthrough], {
  cwd: backendRoot,
  stdio: 'inherit',
  env: process.env,
});

process.exit(result.status ?? 1);
