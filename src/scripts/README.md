# Backend Scripts

This directory contains utility scripts for database maintenance and migrations.

## Available Scripts

### 1. Backfill Payroll Archives

**Purpose**: Creates PayrollArchive records for all finalized payroll runs that don't already have an archive.

**When to use**:
- After upgrading the system to include automatic archive creation
- If archives were deleted or missing for some finalized payroll runs
- To ensure historical payroll data is properly archived

**How to run**:

```bash
# From the backend directory
cd /Users/arif.safiyullah/myWorkspace/react/oms/backend

# Run using ts-node
npx ts-node src/scripts/backfillPayrollArchives.ts

# Or if you have ts-node installed globally
ts-node src/scripts/backfillPayrollArchives.ts
```

**What it does**:
1. Connects to MongoDB using the MONGODB_URI from your .env file
2. Finds all payroll runs with status='finalized'
3. For each finalized payroll run:
   - Checks if a PayrollArchive already exists
   - If not, creates a new archive with a snapshot of the payroll data
   - Links the archive back to the payroll run
4. Provides a summary of:
   - Total finalized payrolls found
   - Archives created
   - Skipped (already existing)
   - Any errors encountered

**Example output**:
```
🚀 Starting Payroll Archive Backfill Script

✅ Connected to MongoDB
🔍 Searching for finalized payroll runs without archives...

Found 5 finalized payroll runs

✅ Created: PAY-2024-01-001 → Archive ARC-MONTHLY-202401-001
✅ Created: PAY-2024-01-002 → Archive ARC-MONTHLY-202401-002
⏭️  Skipped: PAY-2024-02-001 - Archive already exists (ARC-MONTHLY-202402-001)
✅ Created: PAY-2024-02-002 → Archive ARC-MONTHLY-202402-002
❌ Error processing PAY-2024-03-001: Invalid pay cycle data

============================================================
📊 Summary:
   Total finalized payrolls: 5
   ✅ Archives created: 3
   ⏭️  Skipped (already exists): 1
   ❌ Errors: 1
============================================================

✅ Script completed successfully

👋 Disconnected from MongoDB
```

**Safety**:
- The script is idempotent - safe to run multiple times
- It will skip payroll runs that already have archives
- Uses try-catch to handle errors gracefully without stopping the entire process
- Does not modify existing archives or payroll runs

**Requirements**:
- MongoDB connection string in .env file
- TypeScript and ts-node installed
- Backend dependencies installed (`npm install`)

## Adding New Scripts

When creating new scripts:
1. Place them in this directory
2. Follow the naming convention: `descriptive-name.ts`
3. Include proper error handling
4. Add logging for progress tracking
5. Update this README with script documentation
6. Make scripts idempotent when possible
