# Heat V5 - Cleanup Plan: Remove Deprecated Columns

**Migration ID:** heat-v5-cleanup.sql
**Status:** Planning
**Risk Level:** Low-Medium (Removes unused columns, but irreversible)

## Overview

This migration removes deprecated database columns and indexes that were kept for rollback safety during the Heat V2/V3/V4 migrations. Now that the heat and importance systems are stable and working correctly, we can safely remove these unused fields to clean up the schema.

## Deprecated Columns to Remove

### Tasks Table

| Column | Type | Reason for Removal | Replaced By |
|--------|------|-------------------|-------------|
| `star` | boolean | Replaced by multi-level star system | `star_level` (0-3) |
| `heat_touch_count` | real | Replaced by direct adjustment tracking | `heat_adjustment` (±45 pts) |
| `other_touch_count` | integer | Activity tracking removed from algorithm | N/A (not needed) |
| `touch_count` | integer | Legacy counter, never used | N/A (not needed) |
| `next_surface_at` | timestamp | Snooze feature removed from algorithm | N/A (feature removed) |
| `cold_storage_at` | timestamp | Auto-archival feature removed | N/A (feature removed) |

### Total: 6 columns to remove

## Deprecated Indexes to Remove

| Index | Reason for Removal |
|-------|-------------------|
| `tasks_cold_storage_idx` | References removed `cold_storage_at` column |
| `tasks_resurfacing_idx` | References removed `next_surface_at` column |
| `tasks_new_task_idx` | References removed `heat_touch_count` and `other_touch_count` columns |

### Total: 3 indexes to remove

### Indexes to Keep

| Index | Reason to Keep |
|-------|----------------|
| `tasks_heat_sort_idx` | Still potentially useful for heat-based sorting queries (even though heat is calculated) |

## Code References Audit

### ✅ No Code References Found

The following deprecated columns have **no active references** in application code:
- `star` - All code updated to use `starLevel`
- `heat_touch_count` - heat-v2.ts is legacy, not imported anywhere
- `other_touch_count` - heat-v2.ts is legacy, not imported anywhere
- `touch_count` - Never referenced in any code
- `next_surface_at` - heat-v2.ts is legacy, not imported anywhere
- `cold_storage_at` - heat-v2.ts is legacy, not imported anywhere

### ⚠️ Legacy Files to Review

These files reference deprecated columns but are **not actively used**:
- `lib/scoring/heat-v2.ts` - Legacy heat algorithm (v2), superseded by heat-v3.ts
  - Can be moved to `lib/scoring/archive/` for historical reference

## Migration Strategy

### Phase 1: Pre-Migration Checklist

- [ ] Verify all application code uses `star_level` (not `star`)
- [ ] Verify all application code uses `heat_adjustment` (not `heat_touch_count`)
- [ ] Confirm heat-v2.ts is not imported anywhere
- [ ] Create full database backup
- [ ] Test migration on local database
- [ ] Test migration on staging database (if available)

### Phase 2: Migration Execution

The migration will be **idempotent** and **safe to re-run**:

1. Drop deprecated indexes (if exist)
2. Drop deprecated columns (if exist)
3. Verify schema is clean

### Phase 3: Post-Migration Verification

1. Verify columns and indexes are removed
2. Verify application still functions correctly
3. Run full test suite
4. Monitor production for errors

## Migration SQL (Preview)

```sql
-- Heat V5 Cleanup Migration
-- Remove deprecated columns and indexes

BEGIN;

-- Drop deprecated indexes
DROP INDEX IF EXISTS tasks_cold_storage_idx;
DROP INDEX IF EXISTS tasks_resurfacing_idx;
DROP INDEX IF EXISTS tasks_new_task_idx;

-- Drop deprecated columns
ALTER TABLE tasks DROP COLUMN IF EXISTS star;
ALTER TABLE tasks DROP COLUMN IF EXISTS heat_touch_count;
ALTER TABLE tasks DROP COLUMN IF EXISTS other_touch_count;
ALTER TABLE tasks DROP COLUMN IF EXISTS touch_count;
ALTER TABLE tasks DROP COLUMN IF EXISTS next_surface_at;
ALTER TABLE tasks DROP COLUMN IF EXISTS cold_storage_at;

-- Verify cleanup
DO $$
BEGIN
  RAISE NOTICE 'Heat V5 cleanup completed successfully';
END $$;

COMMIT;
```

## Rollback Strategy

**WARNING:** This migration is **irreversible** - once columns are dropped, their data is lost.

### Prevention Strategy (Recommended)

Before running this migration in production:
1. Create a full database backup
2. Test on local database first
3. Test on staging database
4. Verify application works without these columns
5. Keep backup for at least 30 days after migration

### Emergency Rollback (If Needed)

If issues arise after migration:
1. Restore from backup (data loss since migration)
2. OR add columns back with default values (loses historical data):

```sql
-- Emergency rollback: Add columns back (data will be lost!)
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS star boolean DEFAULT false;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS heat_touch_count real DEFAULT 0;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS other_touch_count integer DEFAULT 0;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS touch_count integer DEFAULT 0;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS next_surface_at timestamp with time zone;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS cold_storage_at timestamp with time zone;

-- Note: This restores the schema but NOT the data!
```

## Files to Update

After migration is complete, update these files:

1. **Schema Definition**
   - `lib/db/schema.ts` - Remove deprecated column definitions
   - `lib/db/migrations/HEAT_PRODUCTION_DEPLOYMENT_GUIDE.md` - Update to include V5
   - `lib/db/migrations/heat-production-migration.sql` - Add V5 cleanup section

2. **Legacy Code**
   - `lib/scoring/heat-v2.ts` - Move to `lib/scoring/archive/` folder

3. **Documentation**
   - `docs/current-heat-algorithm.md` - Verify no references to deprecated fields
   - Update any other docs that reference old columns

## Timeline

1. **Week 1:** Planning and code audit (✅ Current phase)
2. **Week 2:** Local and staging testing
3. **Week 3:** Production backup and migration
4. **Week 4:** Monitor and verify

## Success Criteria

- [ ] All deprecated columns removed from database
- [ ] All deprecated indexes removed from database
- [ ] Schema file updated and clean
- [ ] Application functions correctly in production
- [ ] No errors in production logs for 7 days
- [ ] Database backup created and verified

## References

- Current heat algorithm: [docs/current-heat-algorithm.md](../../docs/current-heat-algorithm.md)
- Schema definition: [lib/db/schema.ts](../schema.ts)
- Heat V2/V3/V4 deployment: [HEAT_PRODUCTION_DEPLOYMENT_GUIDE.md](HEAT_PRODUCTION_DEPLOYMENT_GUIDE.md)
