# Heat & Importance System Cleanup Plan

**Date:** 2025-01-19 (Updated: 2025-11-19)
**Status:** ✅ ALL PHASES COMPLETE - Production Deployed & Documented
**Goal:** Remove deprecated columns, indexes, and code from legacy heat model versions

**Progress:**
- ✅ Phase 1 Complete: Stale code removed (heat-v2.ts, unused methods)
- ✅ Phase 2 Complete: `star` column removed from schema & code
- ✅ Phase 3 Complete: Heat V2 columns & indexes removed from schema & code
- ✅ Phase 4 Complete: Dev testing passed successfully
- ✅ Phase 5 Complete: Production deployment successful (2025-11-19)
- ✅ Phase 6 Complete: Documentation updated to reflect hybrid approach (2025-11-19)

**Production Deployment Summary:**
- Database backup created: `backups/backup_pre_heat_cleanup_20251119_231017.sql` (349KB)
- Migration applied successfully to production database
- 8 deprecated columns removed (5 from tasks, 3 from settings)
- 3 deprecated indexes removed
- Build verified with no new errors
- Production application tested and working

### Changes Deployed to Production (2025-11-19)

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

**Migration Applied:**
- Production database migration successful
- All deprecated columns verified removed
- All deprecated indexes verified removed
- `heatSortIdx` updated correctly

**Commit:** `0628a35` - "Remove deprecated Heat V2 columns and legacy code"

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

### Resolution Status (Post-Deployment Analysis)

**Current Implementation: HYBRID APPROACH**

The system currently uses a **hybrid calculate-and-cache pattern**, NOT pure calculation:

1. **Server Side:**
   - Calculates heat/importance when mutations occur
   - Writes calculated values to `heat` and `importanceV1` columns
   - Uses stored `heat` for database-level sorting (ORDER BY)
   - Method: `taskRepository.updateHeat()` writes to both columns

2. **Client Side:**
   - Fetches tasks with stored `heat` and `importanceV1` values
   - Recalculates fresh values on every render: `_freshHeat`, `_freshImportance`
   - Uses fresh values for display and client-side sorting
   - Fresh calculations ensure timezone accuracy and current due date status

**Why This Matters:**

The stored columns (`heat`, `heatCalculatedAt`, `importanceV1`) are marked "DEPRECATED" in schema comments, but they are **actively used and necessary** for the current architecture. The comments are misleading because:

- Original plan was to implement pure calculation (Option 1 from current-heat-algorithm.md)
- Implementation was never completed
- System settled on hybrid approach for performance
- Comments were aspirational, not reflecting actual implementation

**Trade-offs of Current Hybrid Approach:**

✅ **Pros:**
- Fast database-level sorting for initial page load
- Index support for large task lists (1000+ tasks)
- Server can sort without calculating every task
- Client gets accurate display values via fresh calculation

❌ **Cons:**
- Data duplication (stored vs calculated values)
- Misleading "DEPRECATED" comments confuse developers
- Stored values become stale between mutations
- Two sources of truth (stored vs calculated)

**Options Moving Forward:**

**Option A: Keep Hybrid, Fix Documentation**
- Update schema comments to explain hybrid approach
- Document why columns are needed
- Update `current-heat-algorithm.md` to match reality
- **Effort:** 30 minutes
- **Risk:** None
- **Performance Impact:** None

**Option B: Complete Pure Calculation Migration**
- Remove `heat` and `importanceV1` columns
- Calculate all values in-memory after DB fetch
- Use in-memory sorting only
- Update all queries to remove ORDER BY heat
- **Effort:** 4-6 hours + testing
- **Risk:** Medium
- **Performance Impact:** Slower for 1000+ tasks, faster for <100 tasks

**Option C: Move to Calculated Fields (Postgres)**
- Use Postgres generated columns or views
- Database calculates heat on-the-fly from base properties
- Best of both worlds: no staleness + DB sorting
- **Effort:** 8-12 hours + extensive testing
- **Risk:** High
- **Performance Impact:** Depends on query patterns

**Recommendation:** **Option A** - Update documentation to reflect reality. The hybrid approach works well for current scale. Consider Option B or C only if:
- Task list regularly exceeds 5000+ items
- Staleness becomes a user-visible problem
- Performance profiling shows calculation overhead

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

### ⚠️ MISLEADING COMMENTS - DO NOT REMOVE

These columns are marked "DEPRECATED" in schema comments but are **actively used** in the hybrid approach:

| Column | Schema Line | Current Status | Actual Usage | Comment Should Say |
|--------|-------------|----------------|--------------|-------------------|
| `heat` | [schema.ts:61](../lib/db/schema.ts#L61) | ⚠️ **ACTIVELY USED** | Database sorting, cached value written by mutations | "Cached heat value for database-level sorting; client recalculates fresh values on render" |
| `heatCalculatedAt` | [schema.ts:62](../lib/db/schema.ts#L62) | ⚠️ **ACTIVELY USED** | Timestamp tracking for heat updates | "Timestamp when heat was last calculated and stored" |
| `importanceV1` | [schema.ts:69](../lib/db/schema.ts#L69) | ⚠️ **ACTIVELY USED** | Cached importance, written on mutations | "Cached importance for performance; client recalculates fresh values on render" |
| `touchCount` | [schema.ts:66](../lib/db/schema.ts#L66) | ✅ Comment fixed | Incremented on touch actions | Already updated: "Still used - incremented on touch" |
| `heatSortIdx` | [schema.ts:104](../lib/db/schema.ts#L104) | ✅ Comment fixed | Database index for sorting | Already updated: "Heat sorting index (still used for database-level sorting)" |

**Key Understanding:**

The system uses a **two-stage calculation pattern**:

1. **Stored Values** (for performance):
   - `heat`: Written to DB on mutations via `updateHeat()`
   - `importanceV1`: Written to DB on mutations
   - Used by database for: `ORDER BY heat`, initial fetch, index lookups

2. **Fresh Values** (for accuracy):
   - `_freshHeat`: Calculated on client render from current time
   - `_freshImportance`: Calculated on client render from current due date
   - Used by client for: display, sorting, UI decisions
   - Ensures timezone accuracy and current due date weights

This hybrid approach provides:
- Fast initial page load (pre-sorted from DB)
- Accurate display (fresh calculations)
- Good performance for 1000+ tasks

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

## Phase 6: Post-Cleanup Documentation ✅ COMPLETE

**Date Completed:** 2025-11-19
**Status:** ✅ All documentation updates complete

### ✅ Completed Tasks

1. **Fix Misleading Schema Comments**
   - ✅ Updated `heat` column comment in [lib/db/schema.ts:62](../lib/db/schema.ts#L62)
   - ✅ Updated `heatCalculatedAt` column comment in [lib/db/schema.ts:63](../lib/db/schema.ts#L63)
   - ✅ Updated `importanceV1` column comment in [lib/db/schema.ts:70](../lib/db/schema.ts#L70)
   - ✅ Added explanation comment about hybrid approach at top of heat fields section

2. **Update Heat Algorithm Documentation**
   - ✅ Updated [current-heat-algorithm.md](current-heat-algorithm.md) to document hybrid approach
   - ✅ Clarified "Implementation Status" section - explains hybrid vs pure calculation
   - ✅ Documented when/why to use stored vs fresh values in data flow section
   - ✅ Added architecture decision explanation with tradeoffs
   - ✅ Updated conclusion to reflect hybrid pattern decision

3. **Code Documentation**
   - ✅ Added comprehensive JSDoc to `taskRepository.updateHeat()` explaining why it writes to DB
   - ✅ Enhanced JSDoc for `calculateHeat()` in heat-v3.ts explaining when/where it's called
   - ✅ Added detailed JSDoc to `TaskWithFreshValues` type explaining purpose of _fresh* fields
   - ✅ Updated file-level comment in heat-v3.ts to reflect hybrid architecture
   - ✅ Documented complete data flow: mutation → updateHeat → DB → fetch → fresh calculation → display

4. **Future Decision Point**
   - ✅ Documented in current-heat-algorithm.md "Future Improvements" section
   - ✅ Defined metrics to trigger reconsideration (5000+ tasks, staleness issues, performance problems)
   - ✅ Documented pros/cons in heat-cleanup-plan.md analysis section

---

## Questions RESOLVED

1. **Heat Storage Decision** ✅
   - **RESOLVED:** Keep hybrid approach (calculate-and-cache pattern)
   - Stored values used for DB sorting performance
   - Fresh values calculated on render for accuracy
   - Works well for current scale (100-1000 tasks)
   - See "Resolution Status" section above for full analysis

2. **touchCount Field** ✅
   - **RESOLVED:** Field IS actively used, comment was misleading
   - Incremented on touch actions for activity tracking
   - Schema comment has been corrected to "Still used - incremented on touch"
   - No removal needed

3. **importanceV1 Field** ✅
   - **RESOLVED:** Same hybrid pattern as heat
   - Calculated server-side and stored for DB performance
   - Recalculated client-side for fresh display values
   - Comment needs update to explain hybrid approach
   - Not deprecated, just cached

## Open Questions for Phase 6

1. **Pure Calculation Migration**
   - At what task count does hybrid approach become a problem?
   - Would Postgres generated columns provide better solution?
   - What's the performance impact of calculating 5000+ tasks in-memory?

2. **Cache Staleness**
   - Is staleness of stored values causing user-visible issues?
   - How often do users notice incorrect heat/importance on initial load?
   - Should we add cache invalidation based on time-since-calculation?

3. **Documentation Standards**
   - How do we prevent future misleading "DEPRECATED" comments?
   - Should we add linting rules for schema comment patterns?
   - Do we need formal ADR process for architecture decisions?

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

**Phase 1-5 (Cleanup & Deployment):**
- ✅ All truly deprecated columns removed from schema (8 columns)
- ✅ All unused indexes dropped (3 indexes)
- ✅ heat-v2.ts file deleted (655 lines)
- ✅ Unused repository methods removed (snooze, recalculateAllHeat)
- ✅ All tests passing (build verified)
- ✅ Production deployed successfully (2025-11-19)
- ✅ Production verified working
- ✅ Backup created and rollback plan ready

**Phase 6 (Documentation) - COMPLETE:**
- ✅ Misleading "DEPRECATED" comments corrected
- ✅ Documentation updated to reflect hybrid approach
- ✅ Architecture decision recorded
- ✅ Code comments explain data flow
- ✅ Future decision criteria documented

---

## References

- [lib/db/schema.ts](../lib/db/schema.ts) - Database schema definitions
- [docs/current-heat-algorithm.md](../docs/current-heat-algorithm.md) - Heat algorithm documentation (has discrepancies)
- [lib/scoring/heat-v3.ts](../lib/scoring/heat-v3.ts) - Current heat implementation
- [lib/scoring/heat-v2.ts](../lib/scoring/heat-v2.ts) - Deprecated, to be deleted
- [lib/db/repositories/task-repository.ts](../lib/db/repositories/task-repository.ts) - Task data access layer
