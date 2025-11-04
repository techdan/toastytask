# Heat V3 Migration Guide

**Migration ID:** heat-v3-migration.sql
**Epic:** toodle-174 - Heat Algorithm V3 - Simplified Model
**Status:** Ready for Production
**Risk Level:** Low (Non-destructive, backwards compatible)

## Overview

This migration implements Heat V3, a radical simplification of the heat algorithm:
- **Enhanced star system:** Boolean → 4 levels (0=none, 1=blue, 2=yellow, 3=orange)
- **Direct heat tracking:** Click counting → Direct adjustment (-0.45 to +0.45)
- **Simplified model:** 3 components (vs 6 in V2): base importance, heat adjustment, recency

## What Changes

### New Columns
- `star_level` (integer, 0-3): Replaces boolean `star` field
- `heat_adjustment` (real, -0.45 to +0.45): Replaces `heat_touch_count`

### Migrated Data
- `star = true` → `star_level = 2` (yellow)
- `star = false` → `star_level = 0` (none)
- `heat_touch_count` → `heat_adjustment` (formula: `(count / 20) * 0.45`)

### Deprecated Fields (NOT removed, kept for rollback safety)
- `star` (boolean)
- `heat_touch_count` (real)
- `other_touch_count` (integer) - V2 feature removed in V3
- `touch_count` (integer) - V1 legacy field

## Pre-Deployment Checklist

### 1. Database Backup
```bash
# Create backup before migration
pg_dump $DATABASE_URL > backup_pre_heat_v3_$(date +%Y%m%d_%H%M%S).sql
```

### 2. Verify Prerequisites
- [ ] Heat V2 migration is already applied
- [ ] Database has `star` and `heat_touch_count` columns
- [ ] No active database locks on `tasks` table
- [ ] Database user has ALTER TABLE permissions

### 3. Review Current Data
```sql
-- Check current starred tasks
SELECT COUNT(*) FROM tasks WHERE star = true AND deleted_at IS NULL;

-- Check current heated tasks
SELECT COUNT(*) FROM tasks WHERE heat_touch_count != 0 AND deleted_at IS NULL;

-- Sample data review
SELECT id, title, star, heat_touch_count, heat
FROM tasks
WHERE deleted_at IS NULL
ORDER BY heat DESC
LIMIT 10;
```

## Deployment Steps

### Local Testing (Required First)
```bash
# Test against local database
node lib/db/scripts/deploy-heat-v3.js

# Verify migration succeeded
psql $DATABASE_URL -c "SELECT column_name FROM information_schema.columns WHERE table_name = 'tasks' AND column_name IN ('star_level', 'heat_adjustment');"
```

### Production Deployment
```bash
# 1. Set production database URL
export DATABASE_URL="your-production-database-url"

# 2. Run migration
node lib/db/scripts/deploy-heat-v3.js

# 3. Monitor output for errors
# The script will show:
# - Migration status
# - Verification results
# - Sample migrated data
# - Success/failure summary
```

### Expected Output
```
======================================================================
Heat Model v3 Production Deployment
======================================================================
✓ Connected to PostgreSQL
✓ Migration file loaded
✓ Migration applied successfully!
✓ Tasks table columns: star_level, heat_adjustment
✓ Heat v3 constraints
✓ Star migration: X tasks migrated
✓ Heat adjustment migration: Y tasks migrated
======================================================================
```

## Post-Deployment Verification

### 1. Verify Schema Changes
```sql
-- Check new columns exist
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'tasks'
  AND column_name IN ('star_level', 'heat_adjustment')
ORDER BY column_name;

-- Check constraints
SELECT constraint_name
FROM information_schema.constraint_column_usage
WHERE table_name = 'tasks'
  AND constraint_name IN ('tasks_star_level_check', 'tasks_heat_adjustment_check');
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

-- Verify heat adjustment migration
-- All tasks with heat_touch_count != 0 should have heat_adjustment != 0
SELECT
  COUNT(*) FILTER (WHERE heat_touch_count != 0) as heated_old,
  COUNT(*) FILTER (WHERE heat_adjustment != 0) as adjusted_new,
  COUNT(*) FILTER (WHERE heat_touch_count != 0 AND heat_adjustment = 0) as failed_migration
FROM tasks
WHERE deleted_at IS NULL;
-- failed_migration should be 0
```

### 3. Verify Heat Calculation
```sql
-- Check heat values are still reasonable (0.0 to 1.0)
SELECT
  MIN(heat) as min_heat,
  MAX(heat) as max_heat,
  AVG(heat) as avg_heat,
  COUNT(*) FILTER (WHERE heat < 0 OR heat > 1) as out_of_range
FROM tasks
WHERE deleted_at IS NULL;
-- out_of_range should be 0
```

### 4. Test API Endpoints
After code deployment:
```bash
# Test star cycling
curl -X POST http://localhost:3000/api/tasks/[id]/star

# Test heat
curl -X POST http://localhost:3000/api/tasks/[id]/touch

# Test cool
curl -X POST http://localhost:3000/api/tasks/[id]/cool
```

## Rollback Procedure

If issues arise, the migration is designed for safe rollback:

### Option 1: Quick Rollback (Revert to V2 behavior)
No database changes needed - just revert code to use old fields:
```typescript
// Use old fields temporarily
const starBonus = task.star ? 1 : 0;  // Instead of task.starLevel
const adjustment = (task.heatTouchCount / 20) * 0.45;  // Instead of task.heatAdjustment
```

### Option 2: Full Rollback (Remove V3 columns)
Only if you want to completely remove V3:
```sql
-- WARNING: This loses V3 data!
-- Only run if you're sure you want to completely rollback

BEGIN;

-- Drop constraints
ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_star_level_check;
ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_heat_adjustment_check;

-- Drop columns
ALTER TABLE tasks DROP COLUMN IF EXISTS star_level;
ALTER TABLE tasks DROP COLUMN IF EXISTS heat_adjustment;

COMMIT;
```
