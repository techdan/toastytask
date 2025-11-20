# Heat & Importance System Cleanup Plan

**Date:** 2025-01-19
**Status:** ✅ Code Changes Complete - Awaiting Dev Testing
**Goal:** Remove deprecated columns, indexes, and code from legacy heat model versions

**Progress:**
- ✅ Phase 1 Complete: Stale code removed (heat-v2.ts, unused methods)
- ✅ Phase 2 Complete: `star` column removed from schema & code
- ✅ Phase 3 Complete: Heat V2 columns & indexes removed from schema & code
- ⏳ Phase 4 Pending: Local testing required before commit
- ⏸️ Phase 5 Pending: Production deployment (after testing)

### Changes Completed (Not Yet Committed)

**Files Modified:**
1. `lib/db/schema.ts` - Removed deprecated columns: `star`, `nextSurfaceAt`, `coldStorageAt`, `heatTouchCount`, `otherTouchCount`, and snooze settings
2. `lib/db/schema.ts` - Removed deprecated indexes: `coldStorageIdx`, `resurfacingIdx`, `newTaskIdx`
3. `lib/db/schema.ts` - Updated `heatSortIdx` to remove reference to deleted `coldStorageAt` column
4. `lib/queries/use-task-mutations.ts` - Removed references to deprecated fields in optimistic updates
5. `components/tasks/quick-add.tsx` - Removed `star: false` field reference
6. `lib/db/seed.ts` - Changed `star: true` to `starLevel: 2`
7. `lib/scoring/importance-v1.ts` - Updated type definitions to remove `star` field
8. `lib/hooks/use-task-importance.ts` - Updated type definitions to remove `star` field

**Files Deleted:**
- `lib/scoring/heat-v2.ts` (655 lines of unused V2 algorithm)

**Repository Methods Removed:**
- `taskRepository.snooze()` - Never called, snooze feature removed
- `taskRepository.recalculateAllHeat()` - Never implemented

**Migration Script Created:**
- `migrations/cleanup-deprecated-heat-columns.sql` - Ready-to-run production migration

**Build Status:** ✅ Passing (no errors, only pre-existing warnings in recurrence system)

**Next Step:** Run `npm run db:push` to apply schema changes to dev database, then test thoroughly.

---

## Executive Summary

The heat and importance system has evolved through multiple versions (V1 → V2 → V3), leaving behind deprecated database columns, unused indexes, and obsolete code. This document identifies what can be safely removed and provides a migration plan.

**Key Finding:** There is a significant discrepancy between documentation and implementation regarding heat storage. The [current-heat-algorithm.md](current-heat-algorithm.md) states heat is "NEVER stored, only calculated on demand" (Option 1: Pure Calculation), but the codebase actively stores heat values in the database.

---

## Critical Discrepancy: Heat Storage

### What Documentation Says
From [docs/current-heat-algorithm.md](current-heat-algorithm.md):
- ✅ "**IMPLEMENTED: Option 1 - Pure Calculation with Stored Adjustments**"
- "Heat is calculated on demand, never stored"
- "Only `heatAdjustment` is persisted in database"
- "⏳ Phase 2: Remove `task.heat` column (pending migration)"

### What Code Actually Does
Reality from codebase analysis:
- ❌ `task.heat` column is **actively written** to database via `updateHeat()` method
- ❌ `updateHeat()` is called in **10+ locations** across the API
- ❌ Database queries **sort by `task.heat`** column
- ❌ `heatCalculatedAt` timestamp is written on every heat update

**Evidence:**
- [lib/db/repositories/task-repository.ts:339-345](../lib/db/repositories/task-repository.ts) - `updateHeat()` writes both `heat` and `heatCalculatedAt`
- [lib/db/repositories/task-repository.ts:80](../lib/db/repositories/task-repository.ts) - Sorts by `tasks.heat` column
- Called from: POST /api/tasks, PATCH /api/tasks/[id], POST /api/tasks/[id]/touch, POST /api/tasks/[id]/star, POST /api/tasks/[id]/notes, PATCH /api/notes/[id], DELETE /api/notes/[id]

### Resolution Needed

**Option A:** Update documentation to reflect current implementation
- Heat IS stored in database for performance (sorting, querying)
- Heat is recalculated on mutations and written back
- Remove "Phase 2" references from docs

**Option B:** Complete the migration to pure calculation
- Remove `task.heat` column as originally planned
- Calculate heat client-side only
- Change sorting to in-memory after fetch
- May impact performance for large task lists

**Recommendation:** Defer this decision. Focus cleanup on truly unused fields first.

---

## Stale Database Schema

### ✅ Safe to Remove - No Code Dependencies

#### Tasks Table Columns

| Column | Schema Line | Status | Used By | Notes |
|--------|-------------|--------|---------|-------|
| `coldStorageAt` | [schema.ts:70](../lib/db/schema.ts#L70) | ❌ DEPRECATED | Nothing | Auto-archival feature removed |
| `nextSurfaceAt` | [schema.ts:69](../lib/db/schema.ts#L69) | ❌ DEPRECATED | `snooze()` method only | Method never called |
| `heatTouchCount` | [schema.ts:73](../lib/db/schema.ts#L73) | ❌ DEPRECATED | Optimistic updates only | V2 click counter, replaced by `heatAdjustment` |
| `otherTouchCount` | [schema.ts:74](../lib/db/schema.ts#L74) | ❌ DEPRECATED | Optimistic updates only | Activity tracking removed in V3 |

#### Settings Table Columns

| Column | Schema Line | Status | Used By | Notes |
|--------|-------------|--------|---------|-------|
| `snoozeTodoDays` | [schema.ts:174](../lib/db/schema.ts#L174) | ❌ DEPRECATED | Nothing | Snooze feature removed |
| `snoozeWatchDays` | [schema.ts:175](../lib/db/schema.ts#L175) | ❌ DEPRECATED | Nothing | Snooze feature removed |
| `snoozeLaterDays` | [schema.ts:176](../lib/db/schema.ts#L176) | ❌ DEPRECATED | Nothing | Snooze feature removed |

#### Database Indexes

| Index Name | Schema Line | References | Status | Notes |
|------------|-------------|------------|--------|-------|
| `coldStorageIdx` | [schema.ts:115](../lib/db/schema.ts#L115) | `coldStorageAt`, `lastTouchedAt` | ❌ DEPRECATED | Cold storage removed |
| `resurfacingIdx` | [schema.ts:117](../lib/db/schema.ts#L117) | `nextSurfaceAt` | ❌ DEPRECATED | Snooze removed |
| `newTaskIdx` | [schema.ts:119](../lib/db/schema.ts#L119) | `heatTouchCount`, `otherTouchCount` | ❌ DEPRECATED | V2 counters removed |

### ⚠️ Requires Code Cleanup First

| Column | Schema Line | Blocker | Cleanup Required |
|--------|-------------|---------|------------------|
| `star` | [schema.ts:45](../lib/db/schema.ts#L45) | Compatibility assignment in optimistic update | Remove line in [use-task-mutations.ts:197](../lib/queries/use-task-mutations.ts#L197) |

### ❌ DO NOT REMOVE (Despite "DEPRECATED" Comments)

| Column | Schema Line | Status | Why Keep | Used By |
|--------|-------------|--------|----------|---------|
| `heat` | [schema.ts:62](../lib/db/schema.ts#L62) | ⚠️ Mislabeled | **Actively used** for sorting and storage | `updateHeat()` in 10+ places, sorting queries |
| `heatCalculatedAt` | [schema.ts:63](../lib/db/schema.ts#L63) | ⚠️ Mislabeled | Written by `updateHeat()` | Paired with `heat` column |
| `touchCount` | [schema.ts:76](../lib/db/schema.ts#L76) | ⚠️ Mislabeled | **Actively incremented** | [task-repository.ts:224](../lib/db/repositories/task-repository.ts#L224), [use-task-mutations.ts:704](../lib/queries/use-task-mutations.ts#L704) |
| `heatSortIdx` | [schema.ts:113](../lib/db/schema.ts#L113) | ⚠️ Mislabeled | **Actively used** for sorting | Supports `ORDER BY heat` queries |

---

## Stale Code

### ✅ Safe to Delete - Completely Unused

#### Files

1. **`lib/scoring/heat-v2.ts`** (655 lines)
   - Old heat calculation algorithm
   - **Zero imports** found in entire codebase
   - Fully replaced by `heat-v3.ts`
   - Last reference removed when V3 was implemented

#### Repository Methods

2. **`taskRepository.snooze()`** - [task-repository.ts:233-243](../lib/db/repositories/task-repository.ts#L233-L243)
   - Defined in interface: [interfaces.ts:29](../lib/db/repositories/interfaces.ts#L29)
   - **Never called** anywhere in codebase
   - No API route for snooze
   - Snooze feature was removed

3. **`taskRepository.recalculateAllHeat()`** - [task-repository.ts:347-351](../lib/db/repositories/task-repository.ts#L347-L351)
   - Defined in interface: [interfaces.ts:38](../lib/db/repositories/interfaces.ts#L38)
   - **Never implemented** (just logs placeholder message)
   - **Never called** anywhere in codebase

---

## Migration Plan

### Phase 1: Remove Stale Code (No Database Changes)

**Impact:** None - code is already unused
**Rollback:** Simple git revert
**Estimated Time:** 15 minutes

#### Steps

1. **Delete unused file**
   ```bash
   git rm lib/scoring/heat-v2.ts
   ```

2. **Remove unused repository methods**
   - Delete `snooze()` method from [task-repository.ts:233-243](../lib/db/repositories/task-repository.ts#L233-L243)
   - Delete `recalculateAllHeat()` method from [task-repository.ts:347-351](../lib/db/repositories/task-repository.ts#L347-L351)
   - Remove method signatures from [interfaces.ts:29,38](../lib/db/repositories/interfaces.ts#L29)

3. **Verify build**
   ```bash
   npm run build
   npm run lint
   ```

4. **Commit**
   ```bash
   git add -A
   git commit -m "Remove deprecated heat V2 code and unused repository methods"
   ```

---

### Phase 2: Remove `star` Boolean Column

**Impact:** Low - only used for schema compatibility
**Dependencies:** One line of code to remove
**Rollback:** Database migration rollback
**Estimated Time:** 20 minutes

#### Steps

1. **Remove code reference**
   - Edit [lib/queries/use-task-mutations.ts:197](../lib/queries/use-task-mutations.ts#L197)
   - Delete line: `star: false, // Deprecated V2 - kept for schema compatibility`

2. **Update schema**
   - Edit [lib/db/schema.ts:45](../lib/db/schema.ts#L45)
   - Delete line: `star: boolean("star").notNull().default(false), // DEPRECATED: Use starLevel instead`
   - Also remove from SQLite schema if exists

3. **Generate migration**
   ```bash
   npm run db:generate
   ```
   - Review generated migration SQL
   - Should contain: `ALTER TABLE tasks DROP COLUMN star;`

4. **Test in development**
   ```bash
   npm run db:push
   npm run dev
   # Test task creation, star toggling, etc.
   ```

5. **Commit**
   ```bash
   git add -A
   git commit -m "Remove deprecated 'star' boolean column (replaced by starLevel)"
   ```

---

### Phase 3: Remove Heat V2 Columns & Indexes

**Impact:** Medium - optimistic updates reference these fields
**Dependencies:** Update optimistic update logic
**Rollback:** Database migration rollback + code revert
**Estimated Time:** 45 minutes

#### Steps

1. **Remove optimistic update references**

   Edit [lib/queries/use-task-mutations.ts](../lib/queries/use-task-mutations.ts):

   **Lines 206-208:** Remove deprecated field assignments
   ```typescript
   // DELETE these lines:
   heatTouchCount: 0, // Deprecated V2 - kept for schema compatibility
   otherTouchCount: 0, // Deprecated V2 - kept for schema compatibility
   ```

   **Lines 210-211:** Remove deprecated field assignments
   ```typescript
   // DELETE these lines:
   nextSurfaceAt: null, // Deprecated V2 - kept for schema compatibility
   ```

2. **Update schema - Remove columns**

   Edit [lib/db/schema.ts](../lib/db/schema.ts):

   **Delete lines 69-76:**
   ```typescript
   // REMOVE:
   nextSurfaceAt: timestamp("next_surface_at", { mode: "date", withTimezone: true }),
   coldStorageAt: timestamp("cold_storage_at", { mode: "date", withTimezone: true }),
   heatTouchCount: real("heat_touch_count").notNull().default(0),
   otherTouchCount: integer("other_touch_count").notNull().default(0),
   touchCount: integer("touch_count").notNull().default(0), // KEEP THIS - still used
   ```

   **Note:** Keep `touchCount` - it's still being incremented!

3. **Update schema - Remove indexes**

   Edit [lib/db/schema.ts](../lib/db/schema.ts):

   **Delete lines 115-119:**
   ```typescript
   // REMOVE:
   coldStorageIdx: index("tasks_cold_storage_idx").on(table.coldStorageAt, table.lastTouchedAt),
   resurfacingIdx: index("tasks_resurfacing_idx").on(table.nextSurfaceAt),
   newTaskIdx: index("tasks_new_task_idx").on(table.heatTouchCount, table.otherTouchCount, table.completedAt),
   ```

4. **Remove snooze settings columns**

   Edit [lib/db/schema.ts](../lib/db/schema.ts):

   **Delete lines 174-176:**
   ```typescript
   // REMOVE:
   snoozeTodoDays: integer("snooze_todo_days").notNull().default(1),
   snoozeWatchDays: integer("snooze_watch_days").notNull().default(7),
   snoozeLaterDays: integer("snooze_later_days").notNull().default(30),
   ```

5. **Generate migration**
   ```bash
   npm run db:generate
   ```

   Review migration - should contain:
   ```sql
   ALTER TABLE tasks DROP COLUMN next_surface_at;
   ALTER TABLE tasks DROP COLUMN cold_storage_at;
   ALTER TABLE tasks DROP COLUMN heat_touch_count;
   ALTER TABLE tasks DROP COLUMN other_touch_count;

   DROP INDEX IF EXISTS tasks_cold_storage_idx;
   DROP INDEX IF EXISTS tasks_resurfacing_idx;
   DROP INDEX IF EXISTS tasks_new_task_idx;

   ALTER TABLE settings DROP COLUMN snooze_todo_days;
   ALTER TABLE settings DROP COLUMN snooze_watch_days;
   ALTER TABLE settings DROP COLUMN snooze_later_days;
   ```

6. **Test in development**
   ```bash
   npm run db:push
   npm run dev
   # Thoroughly test all task operations
   ```

7. **Commit**
   ```bash
   git add -A
   git commit -m "Remove Heat V2 deprecated columns and indexes

   Removes:
   - nextSurfaceAt (snooze removed)
   - coldStorageAt (auto-archival removed)
   - heatTouchCount (replaced by heatAdjustment in V3)
   - otherTouchCount (activity tracking removed)
   - Related indexes and snooze settings
   "
   ```

---

### Phase 4: Local Testing & Validation

**Impact:** None - testing in dev environment
**Risk:** Low - can rollback schema changes easily
**Estimated Time:** 30 minutes

#### Steps

1. **Apply schema changes to dev database**
   ```bash
   npm run db:push
   ```

2. **Start dev server**
   ```bash
   npm run dev
   ```

3. **Test all task operations**
   - [ ] Create new tasks (verify no `star` field errors)
   - [ ] Toggle star levels (1, 2, 3, back to 0)
   - [ ] Heat/cool tasks
   - [ ] Complete tasks (including recurring)
   - [ ] Edit task properties (priority, due date, etc.)
   - [ ] View task list sorting
   - [ ] Check that no database errors appear in logs

4. **Verify database state**
   ```bash
   # Connect to dev database and verify columns are gone
   psql $DATABASE_URL
   \d tasks;  -- Should NOT show: star, nextSurfaceAt, coldStorageAt, heatTouchCount, otherTouchCount
   \d settings;  -- Should NOT show: snoozeTodoDays, snoozeWatchDays, snoozeLaterDays
   ```

5. **If issues found**
   - Identify the problem
   - Fix code
   - Rollback schema: `git restore lib/db/schema.ts && npm run db:push`
   - Re-test

6. **If all tests pass**
   - Proceed to commit (Phase 5)

---

### Phase 5: Production Deployment

**Impact:** High - schema changes
**Risk:** Medium - columns are unused but still defined
**Rollback Plan:** Restore from backup, revert migration
**Estimated Time:** 30 minutes + monitoring

#### Pre-Deployment Checklist

- [ ] Phase 4 local testing completed successfully
- [ ] All functionality verified working
- [ ] Build passing with no errors
- [ ] Code changes committed to repository
- [ ] Production database backup taken
- [ ] Rollback migration prepared
- [ ] Deployment window scheduled (low traffic)

#### Deployment Steps

1. **Backup production database**
   ```bash
   # Example for Postgres
   pg_dump $PROD_DATABASE_URL > backup_pre_heat_cleanup_$(date +%Y%m%d).sql
   ```

2. **Deploy code changes**
   - Push to production branch
   - Let CI/CD deploy application code

3. **Run migration**
   ```bash
   # Set production database URL
   export DATABASE_URL="$PROD_DATABASE_URL"

   # Run migration
   npm run db:push
   # OR use drizzle-kit push for production
   ```

4. **Verify production**
   - Check application logs for errors
   - Test task creation, updates, heat/cool actions
   - Monitor error rates

5. **Monitor for 24 hours**
   - Watch for any unexpected errors
   - Check database performance
   - User feedback

#### Rollback Procedure (If Needed)

1. **Revert code deployment**
   ```bash
   git revert <commit-hash>
   git push production
   ```

2. **Restore database schema**
   ```bash
   # Restore from backup
   psql $PROD_DATABASE_URL < backup_pre_heat_cleanup_YYYYMMDD.sql
   ```

3. **Investigate issue**
   - Review error logs
   - Identify missed dependency
   - Fix and re-test in development

---

## Post-Cleanup Tasks

### Update Documentation

1. **Update schema documentation**
   - Remove references to deleted columns from any schema docs
   - Update ER diagrams if they exist

2. **Clarify heat storage in docs**
   - Update [current-heat-algorithm.md](current-heat-algorithm.md) to reflect actual implementation
   - Either remove "Phase 2" references OR create plan to actually implement pure calculation

3. **Update CHANGELOG**
   - Document removed columns and breaking changes (if any)

### Code Quality

1. **Remove deprecated comments**
   - Search for "DEPRECATED" comments referencing removed fields
   - Clean up inline comments about V2 vs V3

2. **TypeScript types**
   - Verify Task type is correct after column removal
   - Update any test fixtures or mocks

---

## Questions to Resolve

1. **Heat Storage Decision**
   - Should we keep storing heat (current) or complete migration to pure calculation?
   - Performance implications of in-memory sorting for large task lists?
   - Client-side calculation timezone issues?

2. **touchCount Field**
   - Why is this still being incremented if it's marked deprecated?
   - Is it used for analytics or future features?
   - Can it be removed or should deprecation comment be removed?

3. **importanceV1 Field**
   - Comment says "DEPRECATED: Will be calculated on render"
   - But it's actually being calculated server-side and stored
   - Is this the same discrepancy as heat storage?

---

## Estimated Total Effort

| Phase | Time | Risk |
|-------|------|------|
| Phase 1: Remove stale code | 15 min | Low |
| Phase 2: Remove `star` column | 20 min | Low |
| Phase 3: Remove V2 columns | 45 min | Medium |
| Phase 4: Production deployment | 30 min + 24h monitoring | Medium |
| **Total** | **~2 hours active + monitoring** | **Medium** |

---

## Success Criteria

- ✅ All deprecated columns removed from schema
- ✅ All unused indexes dropped
- ✅ heat-v2.ts file deleted
- ✅ Unused repository methods removed
- ✅ All tests passing
- ✅ Production running smoothly for 24h post-migration
- ✅ No references to removed fields in codebase
- ✅ Documentation updated to reflect reality

---

## References

- [lib/db/schema.ts](../lib/db/schema.ts) - Database schema definitions
- [docs/current-heat-algorithm.md](../docs/current-heat-algorithm.md) - Heat algorithm documentation (has discrepancies)
- [lib/scoring/heat-v3.ts](../lib/scoring/heat-v3.ts) - Current heat implementation
- [lib/scoring/heat-v2.ts](../lib/scoring/heat-v2.ts) - Deprecated, to be deleted
- [lib/db/repositories/task-repository.ts](../lib/db/repositories/task-repository.ts) - Task data access layer
