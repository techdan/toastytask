# Heat Model Production Deployment Guide

**Migration ID:** heat-production-migration.sql
**Tracking:** toodle-91bf - Consolidate heat migrations for production deployment
**Status:** Ready for Production
**Risk Level:** Low (Non-destructive, backwards compatible, idempotent)

## Overview

This guide covers the deployment of the complete Heat Model system (V2, V3, and V4) to production. This consolidated migration brings the production database from Heat V1 (basic heat field) to Heat V4 (complete point-based heat system) in a single, idempotent script.

## What Changes

### Database Schema Changes

#### Heat V2 - Data Model and Indexes
**New Columns (tasks table):**
- `heat_calculated_at` (timestamp) - Last heat calculation timestamp
- `heat_touch_count` (real) - Legacy click counter (deprecated in V3)
- `other_touch_count` (integer) - Legacy activity counter (deprecated in V3)
- `last_heat_touched_at` (timestamp) - Last heat touch timestamp
- `cold_storage_at` (timestamp) - Cold storage timestamp

**New Column (settings table):**
- `sort_mode` (text, enum: 'importance' | 'heat') - Sort mode toggle

**New Indexes:**
- `tasks_heat_sort_idx` - For heat-based sorting
- `tasks_cold_storage_idx` - For cold storage queries
- `tasks_resurfacing_idx` - For snooze/resurface queries
- `tasks_new_task_idx` - For identifying new tasks

#### Heat V3 - Enhanced Star System and Direct Adjustment
**New Columns:**
- `star_level` (integer, 0-3) - Replaces boolean `star` field
  - 0 = none, 1 = blue, 2 = yellow, 3 = orange
- `heat_adjustment` (real) - Direct heat adjustment in points

**Data Migration:**
- `star = true` → `star_level = 2` (yellow)
- `star = false` → `star_level = 0` (none)
- `heat_touch_count` → `heat_adjustment` (formula: `(count / 20) * 0.45`)

**New Constraints:**
- `tasks_star_level_check` - Ensures star_level is 0-3
- `tasks_heat_adjustment_check` - Ensures heat_adjustment is ±45

#### Heat V4 - Point-Based Normalization
**Data Transformations:**
- `heat` scale: 0.0-1.0 → 0-145 points (multiply by 145)
- `heat_adjustment` scale: ±0.45 → ±45 points (multiply by 100)

**Updated Constraints:**
- `tasks_heat_check` - Ensures heat is 0-145

### Fields Kept for Rollback Safety (Deprecated)
- `star` (boolean) - Use `star_level` instead
- `heat_touch_count` (real) - Use `heat_adjustment` instead
- `other_touch_count` (integer) - Removed in V3, kept for safety

## Prerequisites

### 1. Database Backup
**CRITICAL:** Always backup before running migrations!

```bash
# Create timestamped backup
pg_dump "$PROD_DATABASE_URL" > backup_pre_heat_production_$(date +%Y%m%d_%H%M%S).sql
```

### 2. Verify Prerequisites
- [ ] Database user has ALTER TABLE permissions
- [ ] No active database locks on `tasks` or `settings` tables
- [ ] Connection to production database is stable
- [ ] Backup has been created and verified

### 3. Review Current Data
```sql
-- Check current database state
SELECT
  EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'tasks' AND column_name = 'heat_calculated_at') as has_v2,
  EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'tasks' AND column_name = 'star_level') as has_v3,
  MAX(heat) as max_heat,
  COUNT(*) as task_count
FROM tasks
WHERE deleted_at IS NULL AND heat IS NOT NULL;

-- Check current starred tasks
SELECT COUNT(*) FROM tasks WHERE star = true AND deleted_at IS NULL;

-- Sample data review
SELECT id, title, star, heat
FROM tasks
WHERE deleted_at IS NULL
ORDER BY heat DESC
LIMIT 10;
```

## Deployment Steps

### Step 1: Test Migration Locally (REQUIRED)

Before deploying to production, test the migration on a local database:

```bash
# Test against local database
node lib/db/scripts/deploy-heat-production.js

# Verify migration succeeded
node lib/db/scripts/check-prod-schema.js
```

### Step 2: Production Deployment

Once local testing is successful, deploy to production:

```bash
# Set production database URL
export PROD_DATABASE_URL="your-production-database-url"

# Run migration
node lib/db/scripts/deploy-heat-production.js

# Monitor output for errors
# The script will show:
# - Pre-migration state
# - Migration progress with detailed logging
# - Post-migration verification
# - Sample migrated data
# - Success/failure summary
```

### Expected Output

```
======================================================================
Heat Model Production Deployment
======================================================================
Target database: aws-1-us-east-2.pooler.supabase.com:6543/postgres

Connecting to PostgreSQL...
✓ Connected to PostgreSQL

Checking current database state...
  Total tasks: 76
  Heat V2 applied: No
  Heat V3 applied: No
  Heat V4 applied: No (max heat: 0.7)

⚠ Database needs migration.
  Proceeding with consolidated heat migration...

Reading migration file: .../heat-production-migration.sql
✓ Migration file loaded

Applying migration...
----------------------------------------------------------------------
[Migration SQL output with detailed progress]
----------------------------------------------------------------------

✓ Migration applied successfully!

Verifying migration results...
✓ Heat columns present:
  - cold_storage_at (timestamp with time zone)
  - heat_adjustment (real)
  - heat_calculated_at (timestamp with time zone)
  - heat_touch_count (real)
  - last_heat_touched_at (timestamp with time zone)
  - other_touch_count (integer)
  - star_level (integer)

✓ Constraints present:
  - tasks_heat_adjustment_check
  - tasks_heat_check
  - tasks_star_level_check

✓ Indexes present:
  - tasks_cold_storage_idx
  - tasks_heat_sort_idx
  - tasks_new_task_idx
  - tasks_resurfacing_idx

Sample of migrated data (top 5 by heat):
  [Sample task data]

Heat distribution:
  [Heat band distribution]

======================================================================
✓ Deployment completed successfully!
======================================================================
```

## Post-Deployment Verification

### 1. Verify Schema Changes

```sql
-- Check new columns exist
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'tasks'
  AND column_name IN (
    'heat_calculated_at', 'heat_touch_count', 'other_touch_count',
    'last_heat_touched_at', 'cold_storage_at',
    'star_level', 'heat_adjustment'
  )
ORDER BY column_name;

-- Check constraints
SELECT constraint_name
FROM information_schema.constraint_column_usage
WHERE table_name = 'tasks'
  AND constraint_name IN (
    'tasks_star_level_check',
    'tasks_heat_adjustment_check',
    'tasks_heat_check'
  );

-- Check indexes
SELECT indexname
FROM pg_indexes
WHERE tablename = 'tasks'
  AND indexname IN (
    'tasks_heat_sort_idx',
    'tasks_cold_storage_idx',
    'tasks_resurfacing_idx',
    'tasks_new_task_idx'
  );
```

### 2. Verify Data Migration

```sql
-- Verify star migration
-- All tasks with star=true should have star_level >= 1
SELECT
  COUNT(*) FILTER (WHERE star = true) as starred_old,
  COUNT(*) FILTER (WHERE star_level > 0) as starred_new,
  COUNT(*) FILTER (WHERE star = true AND star_level = 0) as failed_migration
FROM tasks
WHERE deleted_at IS NULL;
-- failed_migration should be 0

-- Verify heat normalization (should be in 0-145 range)
SELECT
  MIN(heat) as min_heat,
  MAX(heat) as max_heat,
  AVG(heat) as avg_heat,
  COUNT(*) FILTER (WHERE heat < 0 OR heat > 145) as out_of_range
FROM tasks
WHERE deleted_at IS NULL;
-- out_of_range should be 0

-- Verify adjustment normalization (should be in ±45 range)
SELECT
  MIN(heat_adjustment) as min_adj,
  MAX(heat_adjustment) as max_adj,
  COUNT(*) FILTER (WHERE heat_adjustment < -45 OR heat_adjustment > 45) as out_of_range
FROM tasks
WHERE deleted_at IS NULL;
-- out_of_range should be 0
```

### 3. Test Application Endpoints

After deploying the updated application code:

```bash
# Test star cycling (should cycle through 0 → 1 → 2 → 3 → 0)
curl -X POST https://your-app.com/api/tasks/[id]/star

# Test heat (should add ±5 or ±10 points based on context)
curl -X POST https://your-app.com/api/tasks/[id]/heat

# Test cool (should subtract ±5 or ±10 points based on context)
curl -X POST https://your-app.com/api/tasks/[id]/cool

# Verify task list shows correct heat values
curl https://your-app.com/api/tasks
```

### 4. UI Verification Checklist

- [ ] Heat values display as 0-145 points (not 0-1 percentages)
- [ ] Star icon cycles through 4 states (none, blue, yellow, orange)
- [ ] Heat/cool buttons increment/decrement by ±5 or ±10 points
- [ ] Heat tooltip shows point-based breakdown
- [ ] Heat colors match importance color bands
- [ ] Task sorting works in both importance and heat modes

## Rollback Procedure

If issues arise, the migration is designed for safe rollback:

### Option 1: Quick Rollback (Revert to V1 behavior)

No database changes needed - just revert application code to use old fields:

```typescript
// Temporary workaround in code
const starBonus = task.star ? 1 : 0;  // Instead of task.starLevel
const heat = task.heat / 145;  // Convert back to 0-1 scale for display
```

### Option 2: Partial Rollback (V4 → V3 normalization)

Revert just the point-based normalization:

```sql
BEGIN;

-- Revert heat scale
UPDATE tasks SET heat = heat / 145 WHERE heat IS NOT NULL;

-- Revert adjustment scale
UPDATE tasks SET heat_adjustment = heat_adjustment / 100 WHERE heat_adjustment IS NOT NULL;

-- Update constraints
ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_heat_adjustment_check;
ALTER TABLE tasks ADD CONSTRAINT tasks_heat_adjustment_check
  CHECK (heat_adjustment >= -0.45 AND heat_adjustment <= 0.45);

ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_heat_check;

COMMIT;
```

### Option 3: Full Rollback (Remove all V2/V3/V4 changes)

**WARNING:** This loses all V2/V3/V4 data! Only use if absolutely necessary.

```sql
BEGIN;

-- Restore from backup
\i backup_pre_heat_production_YYYYMMDD_HHMMSS.sql

-- OR manually drop columns (data loss!)
ALTER TABLE tasks DROP COLUMN IF EXISTS heat_calculated_at;
ALTER TABLE tasks DROP COLUMN IF EXISTS heat_touch_count;
ALTER TABLE tasks DROP COLUMN IF EXISTS other_touch_count;
ALTER TABLE tasks DROP COLUMN IF EXISTS last_heat_touched_at;
ALTER TABLE tasks DROP COLUMN IF EXISTS cold_storage_at;
ALTER TABLE tasks DROP COLUMN IF EXISTS star_level;
ALTER TABLE tasks DROP COLUMN IF EXISTS heat_adjustment;

-- Drop constraints
ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_star_level_check;
ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_heat_adjustment_check;
ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_heat_check;

-- Drop indexes
DROP INDEX IF EXISTS tasks_heat_sort_idx;
DROP INDEX IF EXISTS tasks_cold_storage_idx;
DROP INDEX IF EXISTS tasks_resurfacing_idx;
DROP INDEX IF EXISTS tasks_new_task_idx;

COMMIT;
```

## Migration Safety Features

This migration is designed with safety in mind:

1. **Idempotent:** Safe to run multiple times - checks if changes already applied
2. **Non-destructive:** Keeps old columns for rollback (star, heat_touch_count)
3. **Backwards compatible:** Old fields remain functional during transition
4. **Detailed logging:** Comprehensive progress and verification output
5. **Automatic verification:** Built-in post-migration checks

## Performance Impact

- **Migration duration:** ~1-5 seconds for small databases (<10K tasks), ~10-30 seconds for larger databases
- **Downtime required:** None (migration can run while app is online)
- **Performance improvement:** Indexes added will improve heat-based queries

## Troubleshooting

### Migration fails with "column already exists"
- **Cause:** Migration partially applied before
- **Solution:** Safe to re-run, script will skip existing columns

### Migration fails with "constraint already exists"
- **Cause:** Constraints from partial migration
- **Solution:** Safe to re-run, script will skip existing constraints

### Heat values out of range after migration
- **Cause:** Data corruption or manual edits
- **Solution:** Run verification queries and contact support

### Application shows old heat values
- **Cause:** Application code not deployed yet
- **Solution:** Deploy updated application code that uses new fields

## Support

If you encounter issues during deployment:

1. Check the verification queries in this guide
2. Review the migration output logs
3. Test the rollback procedure on a backup
4. Create a GitHub issue at https://github.com/your-repo/toodle/issues

## References

- Migration script: [lib/db/migrations/heat-production-migration.sql](heat-production-migration.sql)
- Deployment script: [lib/db/scripts/deploy-heat-production.js](../scripts/deploy-heat-production.js)
- Schema checker: [lib/db/scripts/check-prod-schema.js](../scripts/check-prod-schema.js)
- Algorithm spec: [docs/heat-algorithm-v3.md](../../docs/heat-algorithm-v3.md)
- Tracking bead: toodle-91bf
