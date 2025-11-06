# Current Importance Algorithm

**Date:** 2025-11-05
**Status:** 🟡 Proposed Migration
**Version:** V1 (Point-Based, 2-14 scale)

This document describes the importance system architecture and proposes migrating from **cached calculation** to **pure calculation** (matching the heat system's approach). Importance is currently stored in the database but recalculated frequently, creating staleness windows and complexity.

> **Design Philosophy:** This document analyzes the problems with storing importance values and presents multiple architectural options. The recommended solution is **Option 1: Pure Calculation**, matching the successful architecture already used by the heat system.

---

## Problem Statement

The current importance system suffers from **architectural inconsistency** caused by maintaining multiple representations of a calculated value:

1. **Stored importance** (`task.importanceV1` in database) - becomes stale when time passes
2. **Cached importance** (`task.importanceV1` in TanStack Query) - mirrors stored staleness
3. **Recalculated importance** (selective on server) - fresh but inconsistently applied
4. **Optimistic importance** (calculated in `onMutate`) - uses fresh calculation

This leads to:
- Staleness windows between refetches (due date changes: today → overdue)
- Complex conditional recalculation logic (when to trust stored value?)
- "CRITICAL FIX" comments indicating architectural issues
- Database storage for a rarely-trusted value
- Maintenance burden (remembering when to recalculate)

**Core Issue:** Importance has a single formula:
- **Calculated from base properties:** priority + dueAt + starLevel
- No user adjustments (unlike heat's `heatAdjustment`)
- Time-dependent (due date comparison to current time)

The calculated value becomes stale when cached, requiring aggressive recalculation to maintain accuracy.

---

## Current Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│ CLIENT                                                       │
│ ┌─────────────────┐           ┌──────────────────┐         │
│ │ Base Properties │──────────▶│ calculateImportance() │         │
│ │ (priority, due) │           │  (optimistic)    │         │
│ └─────────────────┘           └──────────────────┘         │
│                                         │                    │
│                                         ▼                    │
│                              ┌─────────────────────┐        │
│                              │ TanStack Query Cache│        │
│                              │  importanceV1: 9    │◀────┐  │
│                              │  (can be stale!)    │     │  │
│                              └─────────────────────┘     │  │
└────────────────────────────────────────│────────────────┼──┘
                                         │ GET/POST      │
                                         ▼               │
┌────────────────────────────────────────────────────────┼──┐
│ SERVER                                                 │  │
│ ┌────────────────┐                                    │  │
│ │ GET /api/tasks │──▶ Fetch tasks with importanceV1  │  │
│ └────────────────┘         │                          │  │
│                            ▼                          │  │
│             For each task: calculateImportance()      │  │
│                  (IGNORE stored value!)               │  │
│                            │                          │  │
│                            ▼                          │  │
│                   Return fresh importance ────────────┘  │
│                                                          │
│ ┌─────────────────────┐                                 │
│ │ POST /api/tasks     │──▶ calculateImportance()        │
│ │ PATCH /api/tasks/id │         │                       │
│ │ POST .../star       │         ▼                       │
│ └─────────────────────┘    UPDATE importanceV1 = X     │
│                                  (store in DB)          │
│                                                          │
│ ┌──────────────────────────────────────────────┐       │
│ │ Database                                      │       │
│ │  tasks.importanceV1 (stored but rarely trusted)│      │
│ │  tasks.priority     (base property)          │       │
│ │  tasks.dueAt        (base property, time-sensitive)│  │
│ │  tasks.starLevel    (base property)          │       │
│ └──────────────────────────────────────────────┘       │
└────────────────────────────────────────────────────────┘

PROBLEM: Stored importanceV1 becomes stale when time passes
         (due date changes: "today" → "overdue")
         but we keep storing it despite recalculating frequently
```

---

## Design Goals

1. **Single source of truth** - one authoritative way to determine importance
2. **No staleness** - importance values are always current
3. **Efficient data transfer** - minimal payload over network
4. **Server authority** - server is the ultimate source of truth
5. **Client accuracy** - client-side data should match server without constant refetching
6. **Predictable optimistic updates** - client can accurately predict server response
7. **Simple architecture** - easy to understand and maintain
8. **Match heat system** - consistent patterns across scoring systems

---

## Architecture Options

### Option 1: Pure Calculation (Recommended)

**Principle:** Importance is NEVER stored, only calculated on demand from base properties.

#### Schema Changes
```typescript
// REMOVE: task.importanceV1 (cached value that becomes stale)
// KEEP: task.priority (base property)
// KEEP: task.dueAt (base property)
// KEEP: task.starLevel (base property)
```

#### Calculation Formula
```typescript
function calculateImportanceV1(task: Task, now: Date = new Date()): number {
  const priorityWeight = PRIORITY_WEIGHTS[task.priority]; // 2-5 pts
  const dueWeight = getDueWeight(task.dueAt, now);        // 0-6 pts
  const starPoints = task.starLevel;                      // 0-3 pts

  return priorityWeight + dueWeight + starPoints; // 2-14 pts
}
```

#### Data Flow

**1. Initial Page Load**
```
Client:
1. Fetch tasks from server (without importanceV1 field)
2. Calculate fresh importance for all tasks on render
3. Sort by importance in memory
4. Display sorted list

Server:
1. SELECT id, priority, dueAt, starLevel, ... FROM tasks
   (no importanceV1 in query)
2. Return raw task data
```

**2. Task Creation**
```
Client:
1. User enters priority/due/star
2. Optimistic: Calculate importance from inputs
3. Send mutation: { priority, dueAt, starLevel, ... }
4. Display task with calculated importance

Server:
1. Receive task data (no importanceV1)
2. INSERT into database (no importance field)
3. Return saved task
4. Client calculates importance on receipt
```

**3. Task Update**
```
Client:
1. User changes priority/due/star
2. Optimistic: Recalculate importance
3. Send mutation: { taskId, updates }
4. Display with new calculated importance

Server:
1. UPDATE base properties only
2. Return updated task
3. Client recalculates importance
```

**4. Star Toggle**
```
Client:
1. User clicks star → starLevel changes
2. Optimistic: Recalculate importance
3. Optimistic: Recalculate heat (uses new importance)
4. Send mutation: { taskId, newStarLevel }

Server:
1. UPDATE starLevel
2. Calculate fresh importance (for heat calculation)
3. Calculate fresh heat using fresh importance
4. UPDATE heat adjustment if needed
5. Return updated task
6. Client recalculates importance + heat
```

**5. Heat/Cool Actions**
```
Client:
1. Calculate fresh importance for current + neighbors
2. Calculate fresh heat for all
3. Send mutation: { taskId, visibleTaskIds: [IDs only] }
4. Optimistic: Calculate heat adjustment

Server:
1. Fetch tasks by IDs
2. Calculate fresh importance for all tasks
3. Calculate fresh heat for all tasks
4. Run context-aware positioning
5. Calculate heat adjustment delta
6. UPDATE heat adjustment (importance unchanged)
7. Return updated task
8. Client recalculates importance + heat on render
```

**6. Display Importance Badge**
```
Client (every render):
1. Calculate importance for task
2. Render badge with color/value
3. Calculate breakdown for tooltip
4. Display "Priority: High (4) + Due: Today (5) + Star: (2) = 11"
```

#### Benefits

✅ **No staleness** - Importance is always calculated from current time
✅ **Single source of truth** - The calculation function itself
✅ **Client/server consistency** - Both use identical calculation
✅ **Minimal storage** - Remove `importanceV1` field + index
✅ **Simpler code** - No conditional recalculation logic
✅ **No CRITICAL FIX comments** - Architecture prevents staleness
✅ **Matches heat system** - Consistent pattern across scoring
✅ **Easier testing** - Pure function, deterministic results
✅ **Better optimistic updates** - Client predicts server exactly

#### Challenges

⚠️ **Performance** - Calculating importance for many tasks repeatedly
- Mitigation: Calculation is extremely fast (~0.05ms per task)
- Mitigation: Already calculating on every GET request
- Mitigation: Use `useMemo` on client to cache within render cycle
- Mitigation: Database operations are orders of magnitude slower

⚠️ **Sorting without DB index** - Can't sort by importance in SQL
- Mitigation: Already sorting in-memory after fetch (line 84-105 in route.ts)
- Mitigation: Task counts are reasonable (<5000 tasks)
- Mitigation: In-memory sort is fast for this size

⚠️ **Migration complexity** - Need to remove database field
- Mitigation: Deploy code changes first, migrate schema later
- Mitigation: Can keep field temporarily but stop reading/writing

#### Implementation Steps

1. **Update calculation function** - Add `now` parameter with default
   ```typescript
   // lib/scoring/importance-v1.ts
   export function calculateImportanceV1(
     task: TaskBase,
     now: Date = new Date()
   ): number {
     // Calculation uses 'now' for due date comparison
   }
   ```

2. **Update client rendering** - Calculate on every render
   ```typescript
   // app/tasks/page.tsx
   const tasksWithImportance = useMemo(() => {
     const now = new Date();
     return filteredTasks.map(task => ({
       ...task,
       _calculatedImportance: calculateImportanceV1(task, now),
     }));
   }, [filteredTasks]);

   // Sort by calculated importance before passing to TaskRow
   const sortedTasks = useMemo(
     () => [...tasksWithImportance].sort((a, b) => b._calculatedImportance - a._calculatedImportance),
     [tasksWithImportance]
   );
   ```

3. **Update server endpoints** - Stop reading/writing `importanceV1`
   - **GET `/api/tasks`**: continue calculating a local `importance` for each task so you can sort and feed `calculateHeat`, but strip the value before sending the JSON response. This keeps the response payload aligned with the new client-side calculation.
   - **POST `/api/tasks`**: remove the assignment `taskData.importanceV1 = …` before inserting.
   - **PATCH `/api/tasks/[id]`**: delete the conditional block that writes `updates.importanceV1`; instead, calculate a temporary importance for heat only.
   - **POST `/api/tasks/[id]/star`**: compute `const importance = calculateImportanceV1({ ...existingTask, starLevel: newStarLevel })` for heat math, but do not persist it.
   - **Repository ordering**: update `lib/db/repositories/task-repository.ts` so the `"importance"` branch no longer references `tasks.importanceV1`. Sorting happens after fetch using the fresh calculation.

4. **Update heat calculations** - Still need importance, but calculate fresh
   ```typescript
   // app/api/tasks/[id]/heat/route.ts
   const existingTask = await taskRepository.findById(taskId, userId);

   // Calculate fresh importance (not stored)
   const currentImportance = calculateImportanceV1(existingTask);

   // Calculate heat using fresh importance
   const currentHeat = calculateHeat({
     ...existingTask,
     importanceV1: currentImportance, // Use calculated, not stored
   }, now);
   ```

5. **Update star toggle** - Remove importance storage
   ```typescript
   // app/api/tasks/[id]/star/route.ts
   const now = new Date();
   const updatedTask = await taskRepository.update(taskId, {
     starLevel: newStarLevel,
     lastTouchedAt: now,
   }, userId);

   // Calculate fresh for heat calculation (no DB write)
   const freshImportance = calculateImportanceV1({
     ...updatedTask,
     starLevel: newStarLevel,
   });
   const freshHeat = calculateHeat({
     ...updatedTask,
     importanceV1: freshImportance,
   }, now);

   await taskRepository.updateHeat(taskId, freshHeat, userId);
   ```

6. **Update client mutations** - Calculate, don't send
   ```typescript
   // lib/queries/use-task-mutations.ts
   onMutate: async ({ taskId, updates }) => {
     queryClient.setQueriesData<Task[]>({ queryKey: ["tasks"] }, (oldTasks) => {
       return oldTasks.map(t => {
         if (t.id !== taskId) return t;

         const updated = { ...t, ...updates };
         // Remove: updated.importanceV1 = calculateImportanceV1(updated);
         // Client will calculate on render instead

         return updated;
       });
     });
   }
   ```

7. **Remove importanceV1 from schema** - Run migration
   ```sql
   -- migration.sql
   DROP INDEX IF EXISTS active_importance_idx;
   ALTER TABLE tasks DROP COLUMN importance_v1;
   ```

8. **Add client-side calculation hook** - Consistent calculation
   ```typescript
   // lib/hooks/use-task-importance.ts
   export function useTaskImportance(task: Task): number {
     return useMemo(() => calculateImportanceV1(task), [
       task.priority,
       task.dueAt,
       task.starLevel,
     ]);
   }
   ```

---

### Option 2: Server Returns Full Sorted List

**Principle:** Server does ALL calculations and returns complete sorted list. Client just renders.

#### Data Flow
```
Client: Send request for tasks
Server:
  1. Fetch all tasks
  2. Calculate fresh importance for each
  3. Sort by importance
  4. Return ENTIRE sorted task list with calculated importance
Client: Render list as-is
```

#### Benefits
✅ Server is absolute authority
✅ No client/server mismatches possible
✅ Simpler client logic

#### Challenges
❌ Large payload - sending all tasks on every request (no filtering/pagination)
❌ Still calculates importance on every request (same as Option 1)
❌ Still stores importance in response (duplicating base properties)
❌ Harder to do optimistic updates (need to predict server sort)
❌ Bad UX on slow connections (wait for full list)

**Verdict:** Doesn't solve storage issue, adds payload overhead. Option 1 is cleaner.

---

### Option 3: Store Importance with Timestamp/Version

**Principle:** Store calculated importance but include version/timestamp. Detect staleness.

#### Schema Changes
```typescript
interface Task {
  importanceV1: number;
  importanceCalculatedAt: Date; // Timestamp of last calculation
  importanceVersion: number;    // Increments on recalculation
}
```

#### Data Flow
```
Client: GET /api/tasks
Server:
  1. Fetch tasks with importanceCalculatedAt
  2. For each task:
     if (now - importanceCalculatedAt > 1 hour) {
       recalculate and UPDATE
     }
  3. Return tasks with importance + freshness metadata
Client: Display with confidence in freshness
```

#### Benefits
✅ Explicit staleness detection
✅ Can control recalculation frequency

#### Challenges
❌ Still stores importance (adds complexity instead of removing storage)
❌ Arbitrary freshness thresholds (1 hour? 1 day?)
❌ Additional fields to maintain (calculatedAt, version)
❌ Edge case: Task due at 11:59 PM, checked at 11:58 PM (fresh!), becomes stale in 2 minutes
❌ Doesn't solve root cause (stored calculated value)

**Verdict:** Adds complexity without addressing architectural issue. Band-aid solution.

---

### Option 4: Background Job Updates Importance

**Principle:** Keep stored importance but update it constantly via background job.

#### Implementation
```typescript
// Background job runs every 5 minutes
async function updateStaleImportance() {
  const tasks = await taskRepository.findAll();
  const now = new Date();

  for (const task of tasks) {
    const freshImportance = calculateImportanceV1(task, now);
    if (freshImportance !== task.importanceV1) {
      await taskRepository.updateImportance(task.id, freshImportance);
    }
  }
}
```

#### Benefits
✅ Keeps stored importance relatively fresh
✅ Minimal code changes

#### Challenges
❌ Still stores importance (adds infrastructure instead of removing storage)
❌ Can still be stale between runs (up to 5 minutes)
❌ Adds server load (background jobs)
❌ Database write amplification (updating many tasks frequently)
❌ Operational complexity (monitoring, scheduling, failures)
❌ Doesn't solve the root problem

**Verdict:** Band-aid solution with significant operational overhead. Doesn't address architecture.

---

### Option 5: Aggressive Client-Side Caching

**Principle:** Calculate importance on client, cache in memory, recalculate on interval.

#### Implementation
```typescript
// Client-side only
const [tasks, setTasks] = useState<Task[]>([]);

useEffect(() => {
  const interval = setInterval(() => {
    setTasks(prev => prev.map(t => ({
      ...t,
      _importance: calculateImportanceV1(t)
    })));
  }, 60000); // Recalculate every minute

  return () => clearInterval(interval);
}, []);
```

#### Benefits
✅ No server changes needed
✅ Handles staleness on client

#### Challenges
❌ Still stores importance on server
❌ Client/server inconsistency (different recalculation timing)
❌ Interval overhead (recalculating even when idle)
❌ Doesn't work for server-side calculations (heat context math)
❌ Arbitrary interval (1 minute? 5 minutes?)

**Verdict:** Client-only solution doesn't address server staleness. Incomplete fix.

---

## Recommendation: Option 1 (Pure Calculation)

**Option 1** is the cleanest architectural solution because it:

1. **Eliminates the root cause** - Removes stored importance entirely, no staleness possible
2. **Reduces storage overhead** - Remove field + index, simplify schema
3. **Guarantees consistency** - Server and client use identical deterministic calculation
4. **Simplifies testing** - Pure functions are easy to test
5. **Enables accurate optimistic updates** - Client can predict server response exactly
6. **Performs well** - Importance calculation is trivial math, faster than database round-trips
7. **Matches heat system** - Consistent architecture pattern across scoring algorithms
8. **Removes conditional logic** - No more "when to recalculate" decisions
9. **Removes CRITICAL FIX comments** - Architecture prevents the problem

### Why This Works for Importance

**Importance is simpler than heat:**
- Heat has adjustment storage (`heatAdjustment`, `heatAdjustmentDate`)
- Importance has ZERO adjustment storage
- Importance is PURELY calculated from base properties
- **Perfect candidate for pure calculation**

**Importance calculation is cheap:**
```typescript
// Three lookups + one addition = ~0.05ms
const priorityWeight = WEIGHTS[task.priority];
const dueWeight = getDueWeight(task.dueAt, now);
const starPoints = task.starLevel;
return priorityWeight + dueWeight + starPoints;
```

**Already calculating frequently:**
- GET /api/tasks: Calculates for all tasks (ignores stored value)
- Heat/cool: Calculates for current + neighbors (ignores stored value)
- Optimistic updates: Calculates on every mutation
- **We're paying the calculation cost anyway, just storing redundantly**

---

### Migration Path

**Phase 1: Prove the concept (no schema changes)**

1. **Stop trusting stored importance**
   - Update GET /api/tasks to NOT return importanceV1 field
   - Update POST/PATCH to NOT write importanceV1 field
   - Keep field in database but ignore it
   - Calculate importance on-demand everywhere

2. **Update client to calculate on render**
   - Remove `task.importanceV1` from component props
   - Use `calculateImportanceV1(task)` in components
   - Add `useMemo` to cache within render cycle

3. **Update server to calculate on demand**
   - Heat calculations: Calculate importance fresh
   - Star toggle: Calculate importance fresh (for heat)
   - Remove all `importanceV1` assignments

4. **Test thoroughly**
   - Verify importance displays correctly
   - Verify sorting works correctly
   - Verify heat calculations use correct importance
   - Verify optimistic updates work
   - Verify time-based changes (today → overdue) work

**Phase 2: Remove stored importance (schema migration)**

1. **Deploy schema migration**
   ```sql
   DROP INDEX IF EXISTS active_importance_idx;
   ALTER TABLE tasks DROP COLUMN importance_v1;
   ```

2. **Update TypeScript types**
   ```typescript
   // Remove importanceV1 from Task interface
   export type Task = {
     // ... other fields
     // REMOVED: importanceV1: number;
   };
   ```

3. **Clean up code**
   - Remove all references to `task.importanceV1`
   - Remove conditional recalculation logic
   - Remove CRITICAL FIX comments
   - Simplify mutation handlers

**Phase 3: Optimize**

1. **Add client-side memoization**
   ```typescript
   function useTaskImportance(task: Task): number {
     return useMemo(
       () => calculateImportanceV1(task),
       [task.priority, task.dueAt, task.starLevel]
     );
   }
   ```

2. **Profile performance**
   - Monitor calculation costs in production
   - Verify no performance regression
   - Optimize if needed (unlikely)

3. **Document architecture**
   - Update CLAUDE.md to reference pure calculation
   - Document consistency with heat system
   - Add examples for future developers

---

## Performance Analysis

### Current System (Cached Calculation)

**Database Operations:**
- Reads: Fetch tasks WITH `importanceV1` field
- Writes: UPDATE `importanceV1` on create/update/star
- Index: `active_importance_idx` maintained on writes

**Calculations:**
- Server GET: Calculate for ALL tasks (ignore stored value)
- Server POST: Calculate once, store result
- Server PATCH: Calculate if fields changed, store result
- Server star: Calculate once, store result
- Client optimistic: Calculate on mutations
- **Total: Calculate frequently anyway, storage is redundant**

---

### Proposed System (Pure Calculation)

**Database Operations:**
- Reads: Fetch tasks WITHOUT `importanceV1` field (smaller payload)
- Writes: NEVER update importance (doesn't exist)
- Index: NONE (no importance field to index)

**Calculations:**
- Server GET: Calculate for ALL tasks (same as current)
- Server POST: Calculate for heat (don't store)
- Server PATCH: Calculate for heat (don't store)
- Server star: Calculate for heat (don't store)
- Client render: Calculate on every render (cached via `useMemo`)
- **Total: Same calculation frequency, no storage overhead**

---

### Calculation Cost Comparison

**Importance Calculation:**
```typescript
// 3 object lookups + 1 date comparison + 2 additions
const priorityWeight = PRIORITY_WEIGHTS[task.priority]; // O(1)
const dueWeight = getDueWeight(task.dueAt, now);        // O(1)
const starPoints = task.starLevel;                      // O(1)
return priorityWeight + dueWeight + starPoints;         // O(1)

// Estimated: <0.05ms per task
// For 100 tasks: ~5ms total
```

**Database Write:**
```sql
UPDATE tasks SET importance_v1 = 9 WHERE id = 'abc123';
-- Estimated: 5-20ms (includes index update)
```

**Network Round Trip:**
```
Client → Server → Database → Server → Client
-- Estimated: 50-500ms depending on connection
```

**Verdict:** Calculation is 100-1000x faster than alternatives. Performance impact is negligible.

---

### Sorting Performance

**Current: Database Index**
```sql
SELECT * FROM tasks
WHERE user_id = 'user123'
ORDER BY importance_v1 DESC
LIMIT 100;
-- Uses active_importance_idx
-- Fast for large tables (index scan)
```

**Proposed: In-Memory Sort**
```typescript
const tasks = await db.select().from(tasks)
  .where(eq(tasks.userId, userId));

// Calculate importance for each
const tasksWithImportance = tasks.map(t => ({
  ...t,
  _importance: calculateImportanceV1(t)
}));

// Sort in memory
const sorted = tasksWithImportance.sort((a, b) =>
  b._importance - a._importance
);
```

**Performance Comparison:**

| Task Count | DB Index Sort | In-Memory Sort | Difference |
|------------|---------------|----------------|------------|
| 100        | 5ms           | 5ms + 5ms calc = 10ms | +5ms |
| 500        | 8ms           | 8ms + 25ms calc = 33ms | +25ms |
| 1000       | 12ms          | 12ms + 50ms calc = 62ms | +50ms |
| 5000       | 25ms          | 25ms + 250ms calc = 275ms | +250ms |

**Analysis:**
- Small task counts (<500): Negligible difference (<30ms)
- Large task counts (5000): Noticeable but acceptable (+250ms)
- Most users have <500 active tasks
- Tradeoff: +30ms latency vs. eliminated staleness + simpler code

**Mitigation for large task counts:**
- Add pagination (only calculate visible tasks)
- Add virtual scrolling (only render visible rows)
- Profile real-world usage (how many users have >1000 active tasks?)

---

## Comparison Matrix

| Approach | Consistency | Storage | Simplicity | Maintenance | Performance | Migration |
|----------|-------------|---------|------------|-------------|-------------|-----------|
| **Option 1: Pure Calculation** | ✅ Perfect | ✅ None | ✅ High | ✅ Easy | ✅ Fast | Medium |
| Option 2: Full List Response | ✅ Perfect | ⚠️ Response only | ⚠️ Medium | ⚠️ Medium | ⚠️ Large payload | Low |
| Option 3: Timestamp/Version | ⚠️ Good | ❌ More fields | ❌ Low | ❌ Complex | ⚠️ Medium | High |
| Option 4: Background Jobs | ⚠️ Eventually | ❌ DB + jobs | ❌ Low | ❌ Complex | ❌ High load | Medium |
| Option 5: Client Caching | ❌ Client only | ❌ DB + client | ❌ Low | ❌ Complex | ⚠️ Intervals | Low |
| Current System | ❌ Staleness | ❌ DB + index | ❌ Complex | ❌ Hard | ⚠️ Index cost | N/A |

---

## Integration with Heat System

### Heat Depends on Importance

**Heat Formula (lib/scoring/heat-v3.ts):**
```typescript
heat = importance_points + recency_points + heat_adjustment - adjustment_decay
```

**Importance Contribution:**
```typescript
const importance = calculateImportanceV1(task); // 2-14
const importancePoints = ((importance - 2) / 12) * 95; // 0-95
```

**Impact of Pure Calculation:**
- Heat calculations need fresh importance
- Currently: Recalculate importance before heat (lines 98-101)
- With pure calculation: Same pattern, but no stored value to ignore
- **No change to heat system required** - it already recalculates importance

---

### Star/Priority/Due Changes

**Current Flow:**
```
User changes star → Update star + importance + heat (3 fields)
```

**With Pure Calculation:**
```
User changes star → Update star only → Calculate importance + heat on render
```

**Simplification:**
- Fewer database writes (1 instead of 3)
- Fewer fields to keep in sync
- Calculation ensures consistency

---

## Resolved Questions

1. **Will calculation performance be acceptable?**
   - ✅ Yes - importance calculation is trivial (<0.05ms per task)
   - ✅ Already calculating on every GET request
   - ✅ In-memory sort is fast for typical task counts

2. **How to sort without database index?**
   - ✅ Sort in-memory after calculation (already doing this)
   - ✅ Performance is acceptable for <5000 tasks
   - ✅ Can add pagination for larger task counts

3. **Will optimistic updates still work?**
   - ✅ Yes - client calculates same value as server
   - ✅ Deterministic calculation ensures consistency
   - ✅ No clock skew (uses current time on both sides)

4. **What about heat system integration?**
   - ✅ Heat already recalculates importance fresh
   - ✅ No changes needed to heat system
   - ✅ Simpler: no stored value to ignore

5. **How to handle migration rollback?**
   - ✅ Phase 1 keeps database field (can revert code changes)
   - ✅ Phase 2 removes field (requires migration rollback)
   - ✅ Deploy Phase 1 first, monitor, then Phase 2

---

## Future Considerations

### If Task Counts Grow Large (>5000 active tasks)

**Option A: Pagination**
```typescript
// Fetch first 100 tasks
const tasks = await db.select().from(tasks)
  .where(eq(tasks.userId, userId))
  .limit(100);

// Calculate importance for 100 (not 5000)
// Sort and display

// User scrolls → fetch next 100
```

**Option B: Virtual Scrolling**
```typescript
// Fetch all tasks
// Calculate importance for all
// Sort all
// Only RENDER visible 20-30 tasks (React Window)
```

**Option C: Restore DB Index (as optimization, not source of truth)**
```sql
-- Add importance_v1_computed as generated column
ALTER TABLE tasks ADD COLUMN importance_v1_computed INTEGER
  GENERATED ALWAYS AS (
    priority_weight + due_weight + star_level
  ) STORED;

CREATE INDEX active_importance_computed_idx
  ON tasks(user_id, status, importance_v1_computed);
```

**Decision:** Wait for real-world data. Premature optimization is root of evil.

---

## Critical Implementation Considerations

### 1. Type Safety During Transition

**Problem**: When you stop sending `importanceV1` from the API but before removing the schema field, TypeScript may complain in some areas.

**Solution**: Update heat calculation functions to accept importance as a parameter rather than requiring it on the task object. This allows gradual migration without breaking existing code.

```typescript
// Phase 1 refactor: lib/scoring/heat-v3.ts
export function calculateHeat(
  task: Pick<Task, "heatAdjustment" | "lastTouchedAt" | "lastHeatTouchedAt">,
  now: Date = new Date(),
  importance?: number // Add as optional parameter
): number {
  // Calculate importance if not provided
  const taskImportance = importance ??
    (('importanceV1' in task) ? task.importanceV1 :
      calculateImportanceV1(task as any));

  const importancePoints = calculateBaseImportancePoints(taskImportance);
  // ... rest of calculation
}
```

### 2. Heat Calculation Integration

**Current State**: `heat-v3.ts:218,264` directly access `task.importanceV1`.

**Phase 1 Strategy**:
- Update heat functions to accept `importance` as an optional parameter
- Calculate importance if not provided (backward compatibility)
- Pass calculated importance explicitly in all new code paths

### 3. Repository Sorting Removal

**Current Code** (task-repository.ts:105):
```typescript
const orderByColumn = {
  heat: tasks.heat,
  importance: tasks.importanceV1, // ⚠️ Remove this in Phase 1
  dueDate: tasks.dueAt,
  createdAt: tasks.createdAt,
  updatedAt: tasks.updatedAt,
}[sortBy];
```

**Phase 1 Action**: Remove the `importance` sorting option entirely since:
- `GET /api/tasks` doesn't pass sortBy parameter (sorts in-memory after fetch)
- All sorting is done in-memory after calculating fresh importance
- **Safe to remove from repository** ✅

### 4. Star Toggle Persistence

**Current Code** (app/api/tasks/[id]/star/route.ts:67-70):
```typescript
// Update importance in database (⚠️ Remove this write in Phase 1)
await taskRepository.update(taskId, {
  importanceV1: newImportance,
}, userId);
```

**Phase 1 Fix**: Remove the second update call entirely. Calculate importance for heat calculation only:
```typescript
// Recalculate importance (for heat calculation only - don't persist)
const newImportance = calculateImportanceV1({
  priority: updatedTask.priority,
  dueAt: updatedTask.dueAt,
  starLevel: newStarLevel,
});

// Pass calculated importance to heat calculation
const newHeat = calculateHeat({
  ...updatedTask,
  importanceV1: newImportance, // Temporary during transition
}, now, newImportance); // Pass explicitly
```

### 5. Migration Script Updates

**Files to update in Phase 1** (before Phase 2 schema changes):
- `lib/db/scripts/import-to-supabase.js:153` - references `importanceV1`
- `lib/db/scripts/migrate-sqlite-to-postgres.js:205` - references `importanceV1`

These scripts will break in Phase 2 if not updated to calculate importance instead of reading it.

### 6. Cache Invalidation Strategy

After deploying Phase 1, client caches may still have `importanceV1` from previous API responses.

**Options**:
1. Use `queryClient.invalidateQueries()` on all tasks queries after deployment
2. Bump API cache version in response headers
3. Wait for natural cache expiration (TanStack Query default: 5 minutes)

**Recommendation**: Use option 1 (invalidate) for immediate consistency.

---

## Implementation Checklist

### Phase 1: Code Changes (No Schema Migration)

#### Core Calculation Changes

- [ ] `lib/scoring/importance-v1.ts`: accept an optional `now` parameter so repeated calculations can share a timestamp.
- [ ] `lib/scoring/heat-v3.ts`: update `calculateHeat()` and `calculateHeatWithBreakdown()` to accept importance as optional parameter (backward compatibility during transition).

#### API Endpoint Changes

- [ ] `app/api/tasks/route.ts`: calculate importance locally for heat + sorting, but do not include it in the JSON payload.
- [ ] `app/api/tasks/[id]/route.ts`: drop `updates.importanceV1` writes and reuse a temporary calculation for heat.
- [ ] `app/api/tasks/[id]/star/route.ts`: stop persisting `importanceV1`; only use the fresh value when recalculating heat. Remove the second `taskRepository.update()` call.
- [ ] `app/api/tasks/[id]/heat` & `/cool`: verify they calculate importance fresh and pass it explicitly to heat calculations. No writes to `importanceV1`.

#### Repository Changes

- [ ] `lib/db/repositories/task-repository.ts`: remove the `orderBy(tasks.importanceV1)` branch from the orderByColumn map; rely on in-memory sorting post-fetch.

#### Client-Side Changes

- [ ] `lib/queries/use-task-mutations.ts`: eliminate optimistic `importanceV1` assignments in create/update/complete flows.
- [ ] `components/tasks/quick-add.tsx`: remove the placeholder `importanceV1` field when building the optimistic task.
- [ ] `app/tasks/page.tsx`: compute and sort using `calculateImportanceV1` before rendering.
- [ ] `components/tasks/heat-badge.tsx`: derive the displayed importance/tooltip breakdown via `calculateImportanceV1`/`calculateImportanceV1WithFactors` instead of a prop.
- [ ] `components/tasks/task-row.tsx`: consume the computed importance (directly or via a shared `useTaskImportance` hook).

#### Helper Functions & Hooks

- [ ] `lib/hooks/use-task-importance.ts`: add a memoized helper for components that need repeated calculations:
  ```typescript
  export function useTaskImportance(task: Task): number {
    return useMemo(
      () => calculateImportanceV1(task),
      [task.priority, task.dueAt, task.starLevel]
    );
  }
  ```

- [ ] `lib/scoring/calculate-task-importance.ts`: create helper for bulk importance calculation:
  ```typescript
  export function addCalculatedImportance<T extends { priority: string, dueAt?: Date | null, starLevel?: number }>(
    task: T,
    now: Date = new Date()
  ): T & { _importance: number } {
    return {
      ...task,
      _importance: calculateImportanceV1(task, now)
    };
  }
  ```

#### Migration Script Updates

- [ ] `lib/db/scripts/import-to-supabase.js`: update line 153 to calculate importance instead of reading `importanceV1`.
- [ ] `lib/db/scripts/migrate-sqlite-to-postgres.js`: update line 205 to calculate importance instead of reading `importanceV1`.

#### Testing & Cleanup

- [ ] Sweep CRITICAL FIX comments that referenced stale `importanceV1`.
- [ ] Add migration tests that verify calculated importance matches stored importance (during Phase 1).
- [ ] Add tests that verify heat calculation works without stored importance (simulate Phase 2).
- [ ] Regression-test importance displays, sorting, and heat integrations.
- [ ] Test all heat-related features (still depend on accurate importance inputs).
- [ ] Test heat/cool operations extensively (most complex code path).
- [ ] Verify no direct `importanceV1` sorting in queries: `grep -r "orderBy.*importanceV1" --include="*.ts"`.

#### Deployment

- [ ] Deploy to staging and verify behaviour with real data.
- [ ] Add performance monitoring to track calculation duration.
- [ ] Monitor for 1-2 weeks in production before proceeding to Phase 2.

### Phase 2: Schema Migration

- [ ] Create Postgres migrations to drop `active_importance_idx` and the `importance_v1` column.
- [ ] Deploy migrations to every environment.
- [ ] Update `lib/db/schema.ts` to remove the column definition.
- [ ] Update seed/import/export scripts that reference `importanceV1` (`lib/db/seed.ts`, `lib/db/scripts/*`).
- [ ] Update `types/index.ts` (and any other shared types) to drop the field.
- [ ] Sweep the codebase for residual `importanceV1` references and delete them.
- [ ] Update automated tests/fixtures to match the new schema.
- [ ] Refresh documentation to reflect the pure-calculation architecture.

### Phase 3: Terminology Migration (`importanceV1` → `importance`)

- [ ] Rename calculation helpers (`calculateImportanceV1`, `calculateImportanceV1WithFactors`, etc.) and related exports to the simplified `importance` naming.
- [ ] Update all API handlers, repositories, hooks, and components to use the new property name.
- [ ] Regenerate Drizzle/TypeScript types and ensure consumer code (tests, scripts) aligns with the new naming.
- [ ] Verify heat calculations consume the renamed field without intermediate adapters.
- [ ] Perform a repo-wide search to confirm no lingering `importanceV1` references.
- [ ] Announce the rename in release notes so integrators can adjust any custom tooling.

### Phase 4: Optimization

- [ ] Profile importance calculation performance
- [ ] Add memoization if needed (via `useMemo`)
- [ ] Consider pagination for large task lists
- [ ] Monitor production performance metrics
- [ ] Document architecture in CLAUDE.md

---

## Risk Assessment

### Low Risk
- ✅ Calculation is simple and well-tested
- ✅ Already calculating frequently (no new calculation burden)
- ✅ Pure function is easy to reason about
- ✅ Matches proven heat system architecture

### Medium Risk
- ⚠️ Performance at scale (>1000 tasks) - can add pagination if needed
- ⚠️ Migration requires careful testing - use two-phase approach

### High Risk
- ❌ None identified

**Overall Risk: Low**

---

## Success Criteria

**Phase 1 Success:**
- [ ] Importance displays correctly in all views
- [ ] Sorting by importance works correctly
- [ ] Heat calculations use correct importance
- [ ] Optimistic updates are accurate
- [ ] Time-based changes work (today → overdue)
- [ ] No performance regression (<100ms added latency)
- [ ] No CRITICAL FIX comments needed

**Phase 2 Success:**
- [ ] Database migration completes without errors
- [ ] All tests pass with removed field
- [ ] Application runs cleanly with field removed from persistence layer
- [ ] Storage reduced (no importance field + index)
- [ ] Documentation updated

**Phase 3 Success:**
- [ ] No references to `importanceV1` remain in the codebase
- [ ] All runtime and type-level references now use `importance`
- [ ] Shared utilities and UI components compile without aliasing the old name
- [ ] External integrations (webhooks, exports) validated against the new field
- [ ] Release notes published highlighting the rename

**Phase 4 Success:**
- [ ] Performance meets targets (<50ms for 500 tasks)
- [ ] No production incidents
- [ ] Positive developer feedback (simpler code)
- [ ] Architecture documented for future developers

---

## Critical Pitfalls to Avoid

### 1. Don't Remove Database Column Before Code Changes Are Deployed

**Wrong Order**:
```bash
# ❌ BAD: Schema change before code
1. Run migration to drop importance_v1 column
2. Deploy code changes
3. Application crashes (code still references removed column)
```

**Correct Order**:
```bash
# ✅ GOOD: Code changes before schema
1. Deploy Phase 1 code changes to production
2. Monitor for 1-2 weeks
3. Verify no references to stored importance
4. Then run Phase 2 schema migration
```

### 2. Watch for Migration Script Imports

The following scripts will **break silently** in Phase 2 if not updated in Phase 1:
- `lib/db/scripts/import-to-supabase.js:153`
- `lib/db/scripts/migrate-sqlite-to-postgres.js:205`

**Action**: Update these scripts in Phase 1 to calculate importance instead of reading it.

### 3. Beware of Cached Query Data

After deploying Phase 1, client caches may still contain `importanceV1` from previous API responses.

**Symptoms**:
- Tasks display old importance values
- Sorting appears incorrect
- Heat calculations use stale importance

**Solution**:
```typescript
// After Phase 1 deployment, add this to app initialization
queryClient.invalidateQueries({ queryKey: ["tasks"] });
```

Or wait 5 minutes for natural cache expiration.

### 4. Test Heat/Cool Operations Extensively

Heat/cool operations are the **most complex code paths** and depend heavily on accurate importance:
- They calculate context-aware positioning
- They need fresh importance for all neighbor tasks
- Time skew can cause positioning errors

**Test Cases**:
- Heat a task that becomes overdue during the operation
- Cool a task with neighbors that have different importance
- Heat/cool with >100 tasks in the list (performance test)

### 5. Don't Trust Type Errors Initially

During Phase 1, TypeScript may show errors like:
```typescript
// Property 'importanceV1' does not exist on type 'Task'
```

These are expected during the transition. The code is correct; types will be updated in Phase 2.

**Strategy**: Use type assertions sparingly and temporarily:
```typescript
const importance = (task as any).importanceV1 ?? calculateImportanceV1(task);
```

Remove these assertions in Phase 2 when the field is fully removed.

---

## Performance Monitoring

Add performance tracking to measure migration impact:

```typescript
// lib/monitoring/importance-calculation-metrics.ts
export function trackImportanceCalculation(taskCount: number, durationMs: number) {
  if (process.env.NODE_ENV === 'production') {
    console.log(`[Importance] Calculated ${taskCount} tasks in ${durationMs.toFixed(2)}ms (${(durationMs / taskCount).toFixed(2)}ms/task)`);
  }
}

// In app/api/tasks/route.ts
const startTime = performance.now();
tasks = tasks.map(task => ({
  ...task,
  _importance: calculateImportanceV1(task)
}));
const duration = performance.now() - startTime;
trackImportanceCalculation(tasks.length, duration);
```

**Acceptable Thresholds**:
- <0.1ms per task (excellent)
- 0.1-0.5ms per task (acceptable)
- >0.5ms per task (investigate optimization)

---

## Rollback Plan

### Phase 1 Rollback (If Issues Arise)

If critical issues are discovered after Phase 1 deployment:

1. **Revert code changes** (git revert)
2. **Re-enable importance writes**:
   ```typescript
   // Restore writes in API endpoints
   taskData.importanceV1 = calculateImportanceV1(taskData);
   ```
3. **Re-enable importance sorting**:
   ```typescript
   // Restore in task-repository.ts
   importance: tasks.importanceV1,
   ```
4. **Deploy rollback**
5. **Investigate root cause**

**Data Safety**: ✅ No data loss (database field still exists and contains last calculated values)

### Phase 2 Rollback (If Issues Arise)

If critical issues are discovered after Phase 2 schema migration:

1. **Run reverse migration**:
   ```sql
   ALTER TABLE tasks ADD COLUMN importance_v1 INTEGER;
   CREATE INDEX active_importance_idx ON tasks(deleted_at, importance_v1);
   ```
2. **Backfill importance values**:
   ```sql
   UPDATE tasks SET importance_v1 = (priority_weight + due_weight + star_level);
   ```
3. **Revert Phase 1 code changes**
4. **Deploy rollback**

**Data Safety**: ⚠️ Requires running backfill script to recalculate all importance values

**Recommendation**: Monitor Phase 1 extensively (1-2 weeks) to minimize Phase 2 rollback risk.

---

## Migration Timeline

**Recommended Timeline**:

| Phase | Duration | Milestone | Gate Criteria |
|-------|----------|-----------|---------------|
| **Phase 0: Preparation** | 2-3 days | Code review, test plan | Checklist complete, tests written |
| **Phase 1: Code Changes** | 1 week | Staging deployment | All tests pass, no regressions |
| **Phase 1: Production Soak** | 1-2 weeks | Monitor production | No incidents, performance acceptable |
| **Phase 2: Schema Migration** | 1 day | Drop database column | Migration successful, app healthy |
| **Phase 3: Terminology** | 2-3 days | Rename `importanceV1` → `importance` | Types clean, no build errors |
| **Phase 4: Optimization** | 1 week | Performance tuning | <50ms for 500 tasks |

**Total Duration**: 4-6 weeks

**Fastest Path** (if pressure to ship): 2 weeks (Phase 1 + immediate Phase 2, skip Phase 3-4)

---

## Documentation Updates

After completing migration, update these documents:

### Code Documentation
- [ ] `CLAUDE.md`: Add section on importance calculation architecture
- [ ] `lib/scoring/README.md`: Document pure calculation pattern
- [ ] `docs/architecture/scoring-systems.md`: Explain why importance uses pure calculation

### API Documentation
- [ ] Remove `importanceV1` from task schema in API docs
- [ ] Document that importance is calculated, not stored
- [ ] Update mobile API reference if applicable

### Developer Guide
- [ ] Add examples of calculating importance in React components
- [ ] Document the `useTaskImportance` hook
- [ ] Explain why we use pure calculation (avoid future developers adding storage back)

### Migration Log
- [ ] Create `docs/migrations/2025-11-importance-pure-calculation.md` with:
  - Decision rationale (link to analysis)
  - Timeline and milestones
  - Rollback procedures
  - Lessons learned

---

## Conclusion

The importance algorithm's cached calculation architecture creates unnecessary complexity:
- Stores values that are rarely trusted
- Requires aggressive recalculation to handle staleness
- Adds conditional logic for when to recalculate
- Maintains database index for rarely-used stored value

The heat system's **pure calculation approach** offers a cleaner, simpler architecture:
- Never store, always calculate
- No staleness possible
- Simpler code, easier maintenance
- Guaranteed client/server consistency
- Eliminates CRITICAL FIX workarounds

**Recommendation:** Migrate importance to pure calculation using the phased approach outlined above. This will eliminate staleness issues, simplify the codebase, and create consistent patterns across scoring systems.

**Next step:** Create beads epic and begin Phase 1 implementation.
