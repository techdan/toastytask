# Current Heat Algorithm

**Date:** 2025-11-04
**Status:** ✅ Implemented (Current System)
**Version:** Point-Based (0-145 scale)

This document describes the current heat system architecture, which uses pure calculation from base properties + manual adjustments. Heat is never stored, eliminating staleness issues and enabling predictable optimistic updates.

> **Historical Note:** This document analyzes the problems with storing heat values and presents multiple architectural options. The implemented solution is **Option 1: Pure Calculation**, which is now the current system. The analysis and alternative approaches are preserved for reference.

---

## Problem Statement (Historical Context)

The current heat system suffers from **data consistency issues** caused by maintaining multiple representations of the same value:

1. **Stored heat** (`task.heat` in database) - becomes stale between fetches
2. **Cached heat** (`task.heat` in TanStack Query) - mirrors stored staleness
3. **Fresh calculated heat** (`_freshHeat` on client) - accurate but not used by mutations
4. **Optimistic heat** (calculated in `onMutate`) - uses stale baseline
5. **Server recalculated heat** - trusts stale persisted value before context math

This leads to:
- Context-aware adjustments clamping at ±5/±10 when larger jumps are justified
- Visual inconsistencies between optimistic and server updates
- First click after idle period always uses stale baseline
- Race conditions during rapid interactions

**Core Issue:** Heat has two components:
- **Calculated base:** Derived from importance, due date, etc. (decays over time)
- **Manual adjustments:** User heat/cool actions (stored as `heatAdjustment`)

The calculated base becomes stale when cached, but we need it for context-aware positioning.

---

## Design Goals

1. **Single source of truth** - one authoritative way to determine heat
2. **No staleness** - heat values are always current
3. **Efficient data transfer** - minimal payload over network
4. **Server authority** - server is the ultimate source of truth
5. **Client accuracy** - client-side data should match server without constant refetching
6. **Predictable optimistic updates** - client can accurately predict server response
7. **Context-aware adjustments work reliably** - no unexpected clamping

---

## Architecture Options

### Option 1: Pure Calculation (Recommended)

**Principle:** Heat is NEVER stored, only calculated on demand from stored adjustments.

#### Schema Changes
```typescript
// REMOVE: task.heat (cached value that becomes stale)
// KEEP: task.heatAdjustment (manual adjustment delta)
// KEEP: task.heatAdjustmentDate (when last adjusted)
// KEEP: All base properties (importance, dueDate, etc.)
```

#### Calculation Formula
```typescript
function calculateHeat(task: Task, now: Date): number {
  const baseHeat = calculateBaseHeat(task, now); // From importance, due date, etc.
  const adjustment = task.heatAdjustment ?? 0;
  const decay = calculateAdjustmentDecay(task.heatAdjustmentDate, now);

  return clamp(
    baseHeat + adjustment - decay,
    HEAT_CONFIG.MIN_FINAL_SCORE,
    HEAT_CONFIG.MAX_FINAL_SCORE
  );
}
```

#### Data Flow

**1. Initial Page Load**
```
Client:
1. Fetch tasks from server (without heat field)
2. Calculate fresh heat for all tasks on render
3. Sort and display
```

**2. User Clicks Heat**
```
Client:
1. Calculate fresh heat for current task
2. Send mutation: { taskId, visibleTaskIds: [sorted array of IDs] }
   - No heat values sent! Just IDs for context
3. Optimistic update: Calculate new adjustment, recalculate heat

Server:
1. Fetch current task + neighbor tasks by IDs
2. Calculate fresh heat for ALL tasks (current + neighbors)
3. Run context-aware math on fresh values
4. Calculate new adjustment delta
5. Store updated adjustment: task.heatAdjustment += delta
6. Return updated task (without heat - client will calculate)

Client:
1. Receive updated task with new heatAdjustment
2. Recalculate heat on next render
3. Re-sort list
```

**3. Automatic Refetches**
```
Client:
1. Fetch tasks (still no heat field)
2. Calculate fresh heat for all
3. Display matches what user sees - no "jump" because calculation is deterministic
```

#### Benefits

✅ **No staleness** - Heat is always calculated fresh from current time
✅ **Single source of truth** - The calculation function itself
✅ **Client/server consistency** - Both use identical calculation
✅ **Minimal data transfer** - Only send task IDs for context (not heat values)
✅ **Accurate optimistic updates** - Client calculates exactly what server will
✅ **Context-aware math always works** - Fresh heats for all context tasks
✅ **No race conditions** - No cached values to become inconsistent

#### Challenges

⚠️ **Performance** - Calculating heat for many tasks repeatedly
- Mitigation: Calculation is fast (math operations only)
- Mitigation: Use `useMemo` on client to cache within render cycle
- Mitigation: Database operations are more expensive than calculation

⚠️ **Testing complexity** - Need to ensure calculation is deterministic
- Mitigation: Pure function, easy to unit test
- Mitigation: Freezing `now` makes tests deterministic

#### Implementation Steps

1. **Add `calculateHeat` utility** - Shared between client and server
   ```typescript
   // lib/scoring/calculate-heat.ts
   export function calculateHeat(task: TaskBase, now: Date): number {
     // Pure calculation from task properties + adjustment
   }
   ```

2. **Update client rendering** - Already using `_freshHeat`, keep as-is

3. **Update mutations** - Send only IDs, not heat values
   ```typescript
   touchTaskMutation.mutate({
     taskId: task.id,
     visibleTaskIds: allVisibleTasks.map(t => t.id) // Just IDs!
   });
   ```

4. **Update server endpoints** - Recalculate all heats fresh
   ```typescript
   // Fetch tasks by IDs
   const tasks = await taskRepository.findManyByIds([taskId, ...neighborIds]);

   // Calculate fresh heat for ALL
   const tasksWithHeat = tasks.map(t => ({
     ...t,
     heat: calculateHeat(t, now) // Fresh calculation
   }));

   // Run context-aware math
   const delta = calculateHeatBoost(
     { id: task.id, heat: tasksWithHeat.find(t => t.id === taskId).heat },
     tasksWithHeat.map(t => ({ id: t.id, heat: t.heat }))
   );
   ```

5. **Remove `task.heat` from schema** - Run migration
   ```sql
   ALTER TABLE tasks DROP COLUMN heat;
   ```

6. **Update optimistic updates** - Calculate fresh
   ```typescript
   onMutate: async ({ taskId, visibleTaskIds }) => {
     queryClient.setQueriesData<Task[]>({ queryKey: ["tasks"] }, (oldTasks) => {
       const tasksWithFreshHeat = oldTasks.map(t => ({
         ...t,
         heat: calculateHeat(t, now) // Fresh!
       }));

       // Run context math on fresh values
       const delta = calculateHeatBoost(
         tasksWithFreshHeat.find(t => t.id === taskId),
         tasksWithFreshHeat.filter(t => visibleTaskIds.includes(t.id))
       );

       // Update adjustment
       return oldTasks.map(t =>
         t.id === taskId
           ? { ...t, heatAdjustment: (t.heatAdjustment ?? 0) + delta }
           : t
       );
     });
   }
   ```

---

### Option 2: Server Returns Full Sorted List

**Principle:** Server does ALL calculations and returns complete sorted list. Client just renders.

#### Data Flow
```
Client: Send mutation: { taskId, action: "heat" }
Server:
  1. Calculate fresh heat for ALL tasks
  2. Apply adjustment to target task
  3. Sort complete list
  4. Return ENTIRE sorted task list
Client: Replace entire list with server response
```

#### Benefits
✅ Server is absolute authority
✅ No client/server mismatches possible
✅ Simpler client logic

#### Challenges
❌ Large payload - sending all tasks on every mutation
❌ Inefficient - wasteful data transfer
❌ Harder to do optimistic updates (need to predict server sort)
❌ Bad UX on slow connections (wait for full list)

**Verdict:** Not recommended due to inefficiency and UX concerns.

---

### Option 3: Store Heat with Version Control

**Principle:** Store calculated heat but include version/timestamp. Reject stale requests.

#### Schema Changes
```typescript
interface Task {
  heat: number;
  heatVersion: number; // Increments on each heat calculation
  heatCalculatedAt: Date; // Timestamp of last calculation
}
```

#### Data Flow
```
Client: Send mutation: { taskId, expectedVersion: task.heatVersion }
Server:
  1. Check if current heatVersion matches expectedVersion
  2. If mismatch: reject request, force client refetch
  3. If match: proceed with mutation
```

#### Benefits
✅ Prevents acting on stale data
✅ Explicit staleness detection

#### Challenges
❌ Still stores heat (adds version complexity instead of removing storage)
❌ Frequent rejections during rapid interactions
❌ Adds latency (reject → refetch → retry)
❌ More complex mutation handling

**Verdict:** Adds complexity without solving root cause (stored heat).

---

### Option 4: Aggressive Background Updates

**Principle:** Keep stored heat but update it constantly via background job.

#### Implementation
```typescript
// Background job runs every 1 minute
async function updateAllTaskHeats() {
  const tasks = await taskRepository.findAll();
  const now = new Date();

  for (const task of tasks) {
    const freshHeat = calculateHeat(task, now);
    if (Math.abs(freshHeat - task.heat) > 0.001) {
      await taskRepository.updateHeat(task.id, freshHeat);
    }
  }
}
```

#### Benefits
✅ Keeps stored heat relatively fresh
✅ Minimal code changes

#### Challenges
❌ Still stores heat (adds background job instead of removing storage)
❌ Can still be stale between updates (up to 1 minute)
❌ Adds server load
❌ Database write amplification
❌ Doesn't solve the root problem

**Verdict:** Band-aid solution that adds operational complexity.

---

### Option 5: Client Sends Fresh Heat Values

**Principle:** Client calculates fresh heat and sends it with every request. Server trusts client.

#### Data Flow
```
Client: Send mutation: {
  taskId,
  currentHeat: calculateHeat(task, now),
  visibleTasks: tasks.map(t => ({ id: t.id, heat: calculateHeat(t, now) }))
}
Server: Trust client values, run context math, return updated adjustment
```

#### Benefits
✅ Server has fresh context immediately
✅ No server-side recalculation needed
✅ Reduces server compute

#### Challenges
❌ Larger payload (sending heat for all visible tasks)
❌ Trust boundary - client could send malicious values
❌ Clock skew issues (client/server time difference)
❌ Duplicate calculation (client calculates, server validates)

**Verdict:** Workable but less clean than Option 1. Unnecessary data transfer.

---

## Recommendation: Option 1 (Pure Calculation)

**Option 1** is the cleanest architectural solution because it:

1. **Eliminates the root cause** - Removes stored heat entirely, no staleness possible
2. **Minimizes data transfer** - Only sends task IDs for context (not heat values)
3. **Guarantees consistency** - Server and client use identical deterministic calculation
4. **Simplifies testing** - Pure functions are easy to test
5. **Enables accurate optimistic updates** - Client can predict server response exactly
6. **Performs well** - Heat calculation is fast math, cheaper than database round-trips

### Migration Path

**Phase 1: Prove the concept (no schema changes)**
1. Update server endpoints to recalculate heat before context math
2. Update optimistic updates to calculate fresh heat
3. Test that context-aware positioning works correctly
4. Keep `task.heat` field but stop trusting it

**Phase 2: Remove stored heat (schema migration)**
1. Deploy schema migration removing `task.heat` column
2. Update all queries to exclude heat field
3. Ensure all code calculates heat on demand

**Phase 3: Optimize**
1. Add server-side memoization for repeated calculations
2. Optimize calculation performance if needed
3. Consider caching within request lifecycle

---

## Performance Analysis

### Current System
- **Database reads:** Fetch tasks with heat field
- **Database writes:** Update heat on every mutation/fetch
- **Calculations:** Client calculates `_freshHeat`, server sometimes recalculates

### Proposed System (Option 1)
- **Database reads:** Fetch tasks without heat field (smaller payload)
- **Database writes:** Update only heatAdjustment (on user action only)
- **Calculations:** Always calculate heat (client and server)

**Key insight:** We're already calculating fresh heat on every client render. The only change is making the server do the same (which it partially does already) and removing the write-back of the cached value.

### Calculation Cost
```typescript
function calculateHeat(task: Task, now: Date): number {
  // ~10 mathematical operations
  // No I/O, no async, pure CPU
  // Estimated: <0.1ms per task
  // For 100 tasks: <10ms total
}
```

Modern JavaScript engines optimize this heavily. The calculation is cheaper than:
- Database query latency (10-100ms)
- Network round trip (50-500ms)
- React render cycle (5-50ms)

**Verdict:** Performance impact is negligible compared to existing operations.

---

## Comparison Matrix

| Approach | Consistency | Efficiency | Simplicity | Optimistic Updates | Migration Effort |
|----------|-------------|------------|------------|-------------------|------------------|
| **Option 1: Pure Calculation** | ✅ Perfect | ✅ High | ✅ High | ✅ Accurate | Medium |
| Option 2: Full List Response | ✅ Perfect | ❌ Low | ✅ High | ⚠️ Difficult | Low |
| Option 3: Version Control | ⚠️ Good | ⚠️ Medium | ❌ Low | ⚠️ Rejected requests | High |
| Option 4: Background Updates | ⚠️ Eventually | ⚠️ Medium | ⚠️ Medium | ❌ Still stale | Medium |
| Option 5: Client-Sent Heat | ✅ Good | ⚠️ Medium | ⚠️ Medium | ✅ Accurate | Low |
| Current System | ❌ Poor | ⚠️ Medium | ❌ Complex | ❌ Inaccurate | N/A |

---

## Implementation Status

**✅ IMPLEMENTED: Option 1 - Pure Calculation with Stored Adjustments**

This approach is now the current system:
- ✅ Heat is calculated on demand, never stored
- ✅ Only `heatAdjustment` is persisted in database
- ✅ Client and server use identical calculation logic
- ✅ Optimistic updates are predictable and accurate
- ✅ No time skew: server calculates from task IDs, not client values
- ⏳ Phase 2: Remove `task.heat` column (pending migration)

Implementation:
- Code: [lib/scoring/heat-v3.ts](../lib/scoring/heat-v3.ts)
- API: [app/api/tasks/\[id\]/heat/route.ts](../app/api/tasks/[id]/heat/route.ts)
- Mutations: [lib/queries/use-task-mutations.ts](../lib/queries/use-task-mutations.ts)

---

## Resolved Questions

1. **Should we keep `task.heat` as a database index for sorting?**
   - ✅ No index needed - heat is calculated, not fetched from DB
   - Current: Fetch all tasks, calculate heat client-side, sort in memory
   - Performance is acceptable for typical task counts (< 5k tasks)

2. **How to handle edge cases?**
   - ✅ Calculation handles null/undefined gracefully with default values
   - ✅ Tested with various edge cases (missing dates, extreme values)

3. **Should server validate client-sent task IDs?**
   - ✅ Yes - server validates IDs exist and belong to user
   - ✅ Security: Prevents unauthorized access to other users' tasks

4. **How to handle clock skew between client and server?**
   - ✅ Server always uses server time for calculations
   - ✅ Client sends only task IDs (not heat values) to avoid time skew
   - ✅ Optimistic updates use client time, server response is authoritative

---

## Future Improvements (Phase 2)

1. **Remove `task.heat` column** - Clean up deprecated stored heat field
2. **Remove `heatCalculatedAt`** - No longer needed since heat is never stored
3. **Add performance monitoring** - Track calculation costs in production
4. **Consider memoization** - Cache calculations within request lifecycle if needed

---

## Conclusion

The current heat system's bugs stem from maintaining multiple representations of a calculated value. **Option 1 (Pure Calculation)** eliminates this by treating heat as a pure function of task properties and stored adjustments, never caching the result.

This is a cleaner architecture that:
- Guarantees consistency (no staleness)
- Minimizes data transfer (IDs only)
- Simplifies maintenance (single source of truth)
- Enables accurate optimistic updates (deterministic calculation)

The migration is straightforward and the performance impact is negligible. This approach addresses all identified bugs and prevents similar issues in the future.
