# Bug Analysis: Heat Adjustment Value Jumping During Updates

**Date:** 2025-11-13
**Severity:** Medium
**Status:** Under Investigation 🔍

## Summary

When clicking heat/cool buttons, the heat adjustment value briefly jumps to another number before settling at the final value. This appears to be a cache synchronization issue similar to the [task-disappearing-race-condition](task-disappearing-race-condition.md) but manifesting differently.

## Symptoms

1. **Primary Issue:** Heat adjustment value flickers/jumps during update
2. **Transient State:** Task briefly shows incorrect heat value
3. **Visual Glitch:** User sees number change multiple times (e.g., +5 → +12 → +7)
4. **Correct Final State:** Eventually settles at correct value from server

### User Experience

```
User Action: Click heat button
Expected: Heat adjustment smoothly changes from +5 to +7
Actual: Heat adjustment changes +5 → +12 → +7 (flickers)
```

## Current Implementation Flow

### Phase 1: User Clicks Heat/Cool Button

**Component:** [task-row.tsx:117-127](../components/tasks/task-row.tsx#L117-L127)
```typescript
const handleTouchClick = () => {
  if (!isCompleted) {
    onHeat(task.id);  // Triggers heat mutation
  }
};
```

### Phase 2: Get Nearby Task IDs

**Component:** [task-list.tsx:44-71](../components/tasks/task-list.tsx#L44-L71)
```typescript
const getNearbyTaskIds = useCallback((taskId: number): number[] => {
  const metricKey = sortMode === "heat" ? "_freshHeat" : "_freshImportance";
  const incompleteTasks = tasks.filter((t) => !t.completedAt);
  const targetTask = incompleteTasks.find((t) => t.id === taskId);

  // Find 21 nearest tasks by heat distance
  return incompleteTasks
    .map((task) => ({
      id: task.id,
      distance: Math.abs((task[metricKey] ?? 0) - targetValue),
    }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 21)
    .map((task) => task.id);
}, [sortMode, tasks]);

const handleHeat = useCallback((taskId: number) => {
  const nearbyTaskIds = getNearbyTaskIds(taskId);
  touchTaskMutation.mutate({ taskId, visibleTaskIds: nearbyTaskIds });
}, [getNearbyTaskIds, touchTaskMutation]);
```

### Phase 3: Optimistic Update (Client)

**File:** [use-task-mutations.ts:652-756](../lib/queries/use-task-mutations.ts#L652-L756)

```typescript
// useTouchTask() - onMutate
onMutate: async ({ taskId, visibleTaskIds }) => {
  // Cancel outgoing refetches to avoid race conditions
  await queryClient.cancelQueries({ queryKey: ["tasks"] });

  // Snapshot for rollback
  const previousTasks = queryClient.getQueriesData({ queryKey: ["tasks"] });

  // Optimistic update
  queryClient.setQueriesData<Task[]>({ queryKey: ["tasks"] }, (oldTasks) => {
    if (!oldTasks || !Array.isArray(oldTasks)) return oldTasks;
    if (!visibleTaskIds || visibleTaskIds.length === 0) return oldTasks;

    const now = new Date();

    // Step 1: Find current task
    const currentTask = oldTasks.find((t) => t.id === taskId);
    if (!currentTask) return oldTasks;

    // Step 2: Calculate fresh importance + heat ONLY for current task
    const currentImportance = calculateImportanceV1(currentTask, now);
    const currentHeat = calculateHeat(currentTask, now, currentImportance);

    // Step 3: Build context from nearby tasks ONLY
    const contextTasks = oldTasks
      .filter((t) => visibleTaskIds.includes(t.id) && t.id !== taskId)
      .map((t) => {
        const importance = calculateImportanceV1(t, now);
        return { id: t.id, heat: calculateHeat(t, now, importance) };
      });

    // Step 4: Calculate boost delta (how much to move)
    const boostDelta = calculateHeatBoost(
      { heat: currentHeat, id: currentTask.id },
      contextTasks
    );

    // Step 5: Calculate target heat
    const targetHeat = Math.min(
      Math.max(
        currentHeat + boostDelta,
        HEAT_CONFIG.MIN_FINAL_SCORE
      ),
      HEAT_CONFIG.MAX_FINAL_SCORE
    );

    // Step 6: Resolve what adjustment is needed to reach target heat
    const { newAdjustment } = resolveAdjustmentForTargetHeat(
      targetHeat,
      {
        heatAdjustment: currentTask.heatAdjustment ?? 0,
        lastTouchedAt: currentTask.lastTouchedAt,
        lastHeatTouchedAt: currentTask.lastHeatTouchedAt,
      },
      now,
      currentImportance
    );

    // Step 7: Apply optimistic update (only ONE task changes)
    return oldTasks.map((t) =>
      t.id === taskId
        ? {
            ...t,
            heatAdjustment: newAdjustment,
            lastHeatTouchedAt: now,
            lastTouchedAt: now,
          }
        : t
    );
  });

  return { previousTasks };
}
```

**Key Point:** Only `heatAdjustment`, `lastHeatTouchedAt`, and `lastTouchedAt` are updated. The `heat` field itself is NOT updated in the cache because it's calculated fresh on every render.

### Phase 4: Server Processing

**File:** [app/api/tasks/[id]/heat/route.ts:27-153](../app/api/tasks/[id]/heat/route.ts#L27-L153)

Server-side processing is nearly identical to client-side:
1. Fetch task from DB
2. Apply asymmetric decay to stored adjustment
3. Calculate fresh importance + heat for current task
4. Fetch nearby tasks and calculate their fresh importance + heat
5. Calculate context-aware boost
6. Resolve new adjustment
7. Update DB with new `heatAdjustment`, `lastHeatTouchedAt`, `lastTouchedAt`
8. Return updated task

**Critical:** Server returns the **task object**, not the calculated heat value. The client must recalculate heat from the returned task.

### Phase 5: Server Response Handling

**File:** [use-task-mutations.ts:742-754](../lib/queries/use-task-mutations.ts#L742-L754)

```typescript
onSuccess: (response) => {
  // Replace optimistic update with authoritative server response
  queryClient.setQueriesData<Task[]>({ queryKey: ["tasks"] }, (oldTasks) => {
    if (!oldTasks || !Array.isArray(oldTasks)) return oldTasks;
    return oldTasks.map((task) =>
      task.id === response.task.id ? response.task : task
    );
  });

  toast.success("Task heated", {
    description: `Heat adjustment: ${response.adjustmentDelta >= 0 ? "+" : ""}${response.adjustmentDelta.toFixed(0)} pts`,
  });
}
```

**Key Point:** Uses `setQueriesData` with broad matching (all queries with `["tasks"]` key), not exact matching.

### Phase 6: UI Re-renders

**File:** [app/tasks/page.tsx:399-448](../app/tasks/page.tsx#L399-L448)

```typescript
// Calculate fresh scoring data on every render
const { activeTasks, completedTasks } = useMemo(() => {
  const now = new Date();

  allFetchedTasks.forEach((task) => {
    const freshImportance = calculateImportanceV1(task, now);
    const enrichedTask: TaskWithFreshValues = {
      ...task,
      _freshImportance: freshImportance,
      _freshHeat: calculateHeat(task, now, freshImportance),
    };
    // ...
  });

  return { activeTasks: actives, completedTasks: completeds };
}, [allFetchedTasks, showCompleted, lingeringCompletedIds, optimisticActiveIds]);
```

**Critical:** Heat is recalculated fresh on EVERY render using the current time and task data from cache.

## Root Cause Analysis

### Race Condition #1: Non-Exact Query Matching

**Problem:** The `onSuccess` handler uses broad query matching:

```typescript
queryClient.setQueriesData<Task[]>({ queryKey: ["tasks"] }, (oldTasks) => {
  // Updates ALL queries that start with ["tasks"]
});
```

This matches:
- Main query: `["tasks", { projectId: undefined, includeCompleted: true }]`
- Project queries: `["tasks", { projectId: 1, includeCompleted: true }]`
- Background prefetch queries: `["tasks", { projectId: 2, ... }]`, etc.

**Impact:** Multiple cache updates fire, potentially causing multiple re-renders with different data states.

**Reference:** Similar to issue #2 in [task-disappearing-race-condition.md:56-62](task-disappearing-race-condition.md#L56-L62)

### Race Condition #2: Time-Dependent Calculations Without Consistency

**Problem:** Heat is calculated using the current time at three different moments:

1. **Optimistic update (client):** `const now = new Date()` at ~T0
2. **Server processing:** `const now = new Date()` at ~T0+50ms
3. **UI re-render:** `const now = new Date()` at ~T0+100ms

These different timestamps can lead to:
- Different decay calculations (asymmetric decay is time-sensitive)
- Different recency bonuses
- Slight variations in calculated heat from the same `heatAdjustment`

**Timeline:**
```
T0:      Optimistic update calculates heat with heatAdjustment=+12 and time=T0
         → Displays heat = 57

T0+50ms: Server calculates heat with heatAdjustment=+7 and time=T0+50ms
         → Returns task with heatAdjustment=+7

T0+100ms: UI recalculates heat with heatAdjustment=+7 and time=T0+100ms
         → Displays heat = 53

T0+200ms: UI recalculates again (another render) with time=T0+200ms
         → Displays heat = 55 (final)
```

**Impact:** The displayed heat value can jump between renders even with the same `heatAdjustment` stored in cache.

### Race Condition #3: Context Changes Between Calculations

**Problem:** The `visibleTaskIds` passed to the server might represent a different context than what exists when the server response arrives.

**Scenario:**
```
T0:      User clicks heat on Task A
         visibleTaskIds = [1, 2, 3, 4, 5] (nearby tasks at T0)
         Optimistic: calculates boost using context from visibleTaskIds

T0+20ms: Another mutation completes (e.g., Task 2 is completed)
         Cache updates, Task 2 is removed from active list

T0+50ms: Server calculates boost using [1, 2, 3, 4, 5]
         But Task 2 is now completed (different data)

T0+100ms: Server response arrives
         Client recalculates with new context (Task 2 missing)
         Result differs from server calculation
```

**Impact:** The client's recalculation might use different nearby tasks than the server used, leading to different heat values.

### Race Condition #4: No Stale Response Detection

**Problem:** Unlike completion mutations which use intent tracking with timestamps:

```typescript
// Completion mutations have this:
const latestCompletionIntent = useRef(new Map<number, {
  shouldBeCompleted: boolean;
  timestamp: number
}>());

// Heat/cool mutations DO NOT have this protection
```

**Scenario:**
```
T0:      User clicks heat (Request 1 starts)
T0+50ms: User clicks heat again (Request 2 starts)
T0+150ms: Request 2 completes (faster) → heatAdjustment = +10
T0+200ms: Request 1 completes (slower) → heatAdjustment = +7 (STALE!)
```

**Impact:** The slower request overwrites the fresher one, just like the completion race condition bug.

**Reference:** Root Cause #1 in [task-disappearing-race-condition.md:37-53](task-disappearing-race-condition.md#L37-L53)

### Race Condition #5: Multiple Renders During Mutation

**Problem:** Between the optimistic update and server response, the component might re-render multiple times due to:
- Other mutations completing
- Query invalidations from background prefetches
- State changes (lingering completed IDs, optimistic active IDs, etc.)

Each re-render recalculates heat with a fresh `now`, potentially showing different values.

**Timeline:**
```
T0:      Optimistic update → heat = 57
T0+10ms: Re-render (unrelated state change) → heat = 56 (decay)
T0+20ms: Re-render (another mutation) → heat = 57 (no change)
T0+100ms: Server response → heat = 55 (final)
```

**Impact:** User sees flickering heat values: 57 → 56 → 57 → 55

### Race Condition #6: Broad Query Invalidation

**Problem:** The completion mutations have debounced invalidation to prevent race conditions:

```typescript
// app/tasks/page.tsx:269-285
const scheduleInvalidation = useCallback(() => {
  if (invalidationTimeout.current) {
    clearTimeout(invalidationTimeout.current);
  }

  invalidationTimeout.current = setTimeout(() => {
    if (pendingCompletionMutations.current.size === 0) {
      queryClient.invalidateQueries({
        queryKey: ["tasks", { projectId: undefined, includeCompleted: true }],
        exact: true  // EXACT MATCH
      });
    }
  }, 100); // Wait 100ms after last mutation
}, [queryClient]);
```

**Heat/cool mutations do NOT have this.** They might trigger immediate query invalidations that race with the optimistic update.

## Comparison to Completed Bug Fix

The [task-disappearing-race-condition](task-disappearing-race-condition.md) fix used:

### ✅ What Worked for Completion Mutations

1. **Intent tracking with timestamps** (lines 172-175)
   ```typescript
   const latestCompletionIntent = useRef(new Map<number, {
     shouldBeCompleted: boolean;
     timestamp: number
   }>());
   ```

2. **Stale response detection** (lines 550-557)
   ```typescript
   onSuccess: (task) => {
     const latest = latestCompletionIntent.current.get(id);
     if (latest && latest.timestamp > timestamp) {
       return; // Ignore stale response
     }
     // Apply update...
   }
   ```

3. **Exact query invalidation** (lines 279-282)
   ```typescript
   queryClient.invalidateQueries({
     queryKey: ["tasks", { projectId: undefined, includeCompleted: true }],
     exact: true  // Only invalidate this specific query
   });
   ```

4. **Automatic server correction** (lines 289-317)
   ```typescript
   useEffect(() => {
     // Check if server state matches intent
     // If not, queue corrective mutation
   }, [allFetchedTasks]);
   ```

### ❌ What's Missing for Heat/Cool Mutations

1. **No intent tracking** - Can't detect stale responses
2. **No timestamp-based detection** - Can't ignore out-of-order responses
3. **No exact query invalidation** - Matches too many queries
4. **No correction mechanism** - If server differs from client, no fix applied

## Identified Issues

| Issue | Severity | Description | Similar To |
|-------|----------|-------------|------------|
| **No stale response detection** | High | Out-of-order responses can overwrite newer mutations | Race #1 in task-disappearing bug |
| **Non-exact query matching** | Medium | Updates multiple query caches unnecessarily | Race #2 in task-disappearing bug |
| **Time-dependent calculations** | Medium | Different `now` values lead to different heat calculations | New issue |
| **Context changes** | Low | Nearby tasks context can change between calculations | New issue |
| **Multiple renders** | Low | Component re-renders multiple times during mutation | Contributing factor |
| **No invalidation control** | Low | No debounced invalidation like completion mutations | Race #6 in task-disappearing bug |

## Proposed Solutions

### Solution 1: Add Intent Tracking with Timestamps ⭐ **Recommended**

**Implementation:**

```typescript
// app/tasks/page.tsx (add near line 173)
const latestHeatIntent = useRef(new Map<number, {
  adjustment: number;
  timestamp: number
}>());
```

```typescript
// task-list.tsx - Update handlers
const handleHeat = useCallback((taskId: number) => {
  const timestamp = Date.now();
  const nearbyTaskIds = getNearbyTaskIds(taskId);

  // Record intent BEFORE mutation
  latestHeatIntent.current.set(taskId, {
    adjustment: /* calculate expected adjustment */,
    timestamp
  });

  touchTaskMutation.mutate({ taskId, visibleTaskIds: nearbyTaskIds });
}, [getNearbyTaskIds, touchTaskMutation]);
```

```typescript
// use-task-mutations.ts - Update onSuccess
onSuccess: (response, { taskId }) => {
  const latest = latestHeatIntent.current.get(taskId);
  if (latest && latest.timestamp > /* mutation timestamp */) {
    // Ignore this stale response
    return;
  }

  // Apply cache update only if this is the latest intent
  queryClient.setQueriesData<Task[]>({ queryKey: ["tasks"] }, (oldTasks) => {
    // ...
  });
}
```

**Pros:**
- Prevents stale responses from overwriting newer mutations
- Matches proven pattern from completion mutations
- Deterministic behavior

**Cons:**
- Requires passing timestamp through mutation
- More complex code

### Solution 2: Use Exact Query Matching ⭐ **Recommended**

**Implementation:**

```typescript
// use-task-mutations.ts - Update onSuccess
onSuccess: (response) => {
  queryClient.setQueriesData<Task[]>({
    queryKey: ["tasks", { projectId: undefined, includeCompleted: true }],
    exact: true  // Only update the main query, not prefetch queries
  }, (oldTasks) => {
    if (!oldTasks || !Array.isArray(oldTasks)) return oldTasks;
    return oldTasks.map((task) =>
      task.id === response.task.id ? response.task : task
    );
  });
}
```

**Pros:**
- Prevents multiple cache updates
- Reduces unnecessary re-renders
- Simple change

**Cons:**
- Prefetch queries might become stale (acceptable)

### Solution 3: Snapshot Time for Consistent Calculations

**Implementation:**

```typescript
// use-task-mutations.ts - Update onMutate
onMutate: async ({ taskId, visibleTaskIds }) => {
  const calculationTime = new Date(); // Snapshot ONCE

  // Use calculationTime consistently throughout optimistic update
  const currentImportance = calculateImportanceV1(currentTask, calculationTime);
  const currentHeat = calculateHeat(currentTask, calculationTime, currentImportance);
  // ...

  // Store calculationTime in context for potential correction
  return { previousTasks, calculationTime };
}
```

**Pros:**
- More consistent calculations
- Reduces time-based variations

**Cons:**
- Still doesn't solve out-of-order response issue
- Minor improvement only

### Solution 4: Add Debounced Invalidation (Like Completion Mutations)

**Implementation:**

```typescript
// app/tasks/page.tsx - Add tracking similar to pendingCompletionMutations
const pendingHeatMutations = useRef(new Set<number>());

const scheduleHeatInvalidation = useCallback(() => {
  // Similar to scheduleInvalidation for completions
}, [queryClient]);
```

**Pros:**
- Prevents refetch races during rapid clicks
- Matches proven pattern

**Cons:**
- Adds complexity
- Might not solve the main issue

### Solution 5: Update Heat Field Optimistically (Alternative Approach)

**Current:** Only update `heatAdjustment`, let render recalculate heat
**Alternative:** Update both `heatAdjustment` AND `heat` optimistically

**Implementation:**

```typescript
// use-task-mutations.ts - Update onMutate return
return oldTasks.map((t) =>
  t.id === taskId
    ? {
        ...t,
        heatAdjustment: newAdjustment,
        heat: targetHeat,  // NEW: Store calculated heat
        heatCalculatedAt: now,
        lastHeatTouchedAt: now,
        lastTouchedAt: now,
      }
    : t
);
```

**Pros:**
- Prevents recalculation variations
- Heat value stays constant until server response

**Cons:**
- Breaks "pure calculation" architecture
- Stored heat can become stale
- Not recommended based on current architecture

## Recommended Fix Strategy

### Phase 1: Quick Fixes (Low Risk)

1. **Add exact query matching** (Solution 2)
   - File: [use-task-mutations.ts:742-754](../lib/queries/use-task-mutations.ts#L742-L754)
   - Change: Add `exact: true` to `setQueriesData`
   - Impact: Reduces multiple cache updates

2. **Snapshot calculation time** (Solution 3)
   - File: [use-task-mutations.ts:659-727](../lib/queries/use-task-mutations.ts#L659-L727)
   - Change: Use single `now` for all calculations in onMutate
   - Impact: More consistent optimistic updates

### Phase 2: Core Fix (Medium Risk)

3. **Add intent tracking with timestamps** (Solution 1)
   - Files:
     - [app/tasks/page.tsx](../app/tasks/page.tsx) (add ref similar to line 173)
     - [task-list.tsx:68-71](../components/tasks/task-list.tsx#L68-L71) (record intent)
     - [use-task-mutations.ts:742-754](../lib/queries/use-task-mutations.ts#L742-L754) (check intent)
   - Change: Add timestamp-based stale detection
   - Impact: Prevents out-of-order responses

### Phase 3: Polish (Optional)

4. **Add debounced invalidation** (Solution 4)
   - File: [app/tasks/page.tsx](../app/tasks/page.tsx)
   - Change: Track pending heat mutations, debounce invalidation
   - Impact: Prevents refetch races

## Testing Checklist

When implementing fixes:

- [ ] Single heat click - value changes smoothly
- [ ] Rapid heat clicks (2-3 in quick succession) - no flickering
- [ ] Heat then immediately cool - final value correct
- [ ] Heat with network throttling (slow 3G) - no jumping
- [ ] Multiple tasks heated simultaneously - all correct
- [ ] Heat while other mutations in progress - no interference
- [ ] Verify terminal shows only expected API calls
- [ ] Check for duplicate cache updates in React DevTools

## Files to Modify

### Primary Changes

1. **lib/queries/use-task-mutations.ts:652-862**
   - Add intent tracking to `useTouchTask()` and `useCoolTask()`
   - Update `onSuccess` to check for stale responses
   - Add exact query matching
   - Snapshot calculation time

2. **components/tasks/task-list.tsx:44-77**
   - Record intent with timestamp in handlers
   - Pass timestamp through to mutations

3. **app/tasks/page.tsx**
   - Add `latestHeatIntent` ref (similar to line 173)
   - Add pending heat mutations tracking
   - Add debounced invalidation for heat/cool

## References

- [Task Disappearing Race Condition Fix](task-disappearing-race-condition.md)
- [Heat Optimistic Updates Plan](../heat-optimistic-updates-plan.md) (may be outdated)
- [Current Heat Algorithm](../current-heat-algorithm.md)
- React Query: [Optimistic Updates Guide](https://tanstack.com/query/latest/docs/react/guides/optimistic-updates)

## Next Steps

1. Review this analysis with team
2. Confirm which solutions to implement
3. Start with Phase 1 (quick fixes) for immediate improvement
4. Proceed to Phase 2 (core fix) for complete solution
5. Monitor production after deployment

---

**Note:** This bug is similar to but distinct from the task-disappearing bug. The root causes overlap (out-of-order responses, broad query matching) but the symptoms differ because heat is a calculated value rather than a boolean state.
