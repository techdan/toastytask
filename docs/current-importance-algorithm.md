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
   // components/tasks/task-list.tsx
   const tasksWithImportance = tasks.map(task => ({
     ...task,
     _calculatedImportance: calculateImportanceV1(task)
   }));

   // Sort by calculated importance
   const sortedTasks = sortBy(tasksWithImportance, t => -t._calculatedImportance);
   ```

3. **Update server endpoints** - Stop reading/writing importanceV1
   ```typescript
   // app/api/tasks/route.ts - GET
   const tasks = await db.select().from(tasks)
     .where(eq(tasks.userId, session.user.id));

   // Don't add importance to response - client will calculate
   return NextResponse.json(tasks);
   ```

   ```typescript
   // app/api/tasks/route.ts - POST
   const taskData = { ...validated, userId: session.user.id };
   // Remove: taskData.importanceV1 = calculateImportanceV1(taskData);
   await db.insert(tasks).values(taskData);
   ```

   ```typescript
   // app/api/tasks/[id]/route.ts - PATCH
   await db.update(tasks)
     .set(updateData) // No importanceV1 in updateData
     .where(and(eq(tasks.id, taskId), eq(tasks.userId, session.user.id)));

   // Remove conditional recalculation logic (lines 46-54)
   ```

4. **Update heat calculations** - Still need importance, but calculate fresh
   ```typescript
   // app/api/tasks/[id]/heat/route.ts
   const currentTask = await fetchTask(taskId);

   // Calculate fresh importance (not stored)
   const currentImportance = calculateImportanceV1(currentTask);

   // Calculate heat using fresh importance
   const currentHeat = calculateHeatScore({
     ...currentTask,
     importanceV1: currentImportance // Use calculated, not stored
   });
   ```

5. **Update star toggle** - Remove importance storage
   ```typescript
   // app/api/tasks/[id]/star/route.ts
   await db.update(tasks)
     .set({ starLevel: newStarLevel }) // Remove: importanceV1
     .where(eq(tasks.id, taskId));

   // Calculate fresh for heat calculation
   const freshImportance = calculateImportanceV1({ ...task, starLevel: newStarLevel });
   const freshHeat = calculateHeatScore({ ...task, importanceV1: freshImportance });

   await db.update(tasks)
     .set({ heat: freshHeat }) // Only update heat, not importance
     .where(eq(tasks.id, taskId));
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

## Implementation Checklist

### Phase 1: Code Changes (No Schema Migration)

- [ ] Update `calculateImportanceV1()` to accept optional `now` parameter
- [ ] Remove `importanceV1` from GET /api/tasks response
- [ ] Remove `importanceV1` assignments in POST /api/tasks
- [ ] Remove `importanceV1` assignments in PATCH /api/tasks/[id]
- [ ] Remove conditional recalculation logic in PATCH handler
- [ ] Update star toggle to not write `importanceV1`
- [ ] Update heat/cool to calculate importance fresh (already doing this)
- [ ] Add `useTaskImportance()` hook for client-side calculation
- [ ] Update TaskRow to calculate importance via hook
- [ ] Update HeatBadge to calculate importance via hook
- [ ] Update TaskList sorting to calculate importance
- [ ] Remove CRITICAL FIX comments (no longer needed)
- [ ] Update optimistic updates to not set `importanceV1`
- [ ] Test all importance-related features
- [ ] Test all heat-related features (depend on importance)
- [ ] Deploy to staging and verify

### Phase 2: Schema Migration

- [ ] Create migration to drop `active_importance_idx`
- [ ] Create migration to drop `importance_v1` column
- [ ] Deploy migration to production
- [ ] Update Task TypeScript type (remove `importanceV1`)
- [ ] Remove any remaining `importanceV1` references
- [ ] Update tests to not expect `importanceV1` field
- [ ] Update documentation

### Phase 3: Optimization

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
- [ ] No references to `importanceV1` in codebase
- [ ] Storage reduced (no importance field + index)
- [ ] Documentation updated

**Phase 3 Success:**
- [ ] Performance meets targets (<50ms for 500 tasks)
- [ ] No production incidents
- [ ] Positive developer feedback (simpler code)
- [ ] Architecture documented for future developers

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

**Recommendation:** Migrate importance to pure calculation using the two-phase approach outlined above. This will eliminate staleness issues, simplify the codebase, and create consistent patterns across scoring systems.

**Next step:** Implement Phase 1 (no schema changes) to prove the concept and verify performance.
