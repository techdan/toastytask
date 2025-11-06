# Plan: Optimistic Client-Side Caching for Heat/Cool Updates

**Date:** 2025-11-05
**Status:** 📋 Proposed Implementation
**Goal:** Add client-side optimistic updates to heat/cool mutations for instant, seamless UX

---

## Executive Summary

Implement optimistic client-side caching for heat/cool updates, matching the successful architecture already used by the importance system. This will eliminate the 200-500ms latency users currently experience when heating/cooling tasks, making the UI feel instant and responsive.

**Key Insight:** Heat uses the same pure calculation architecture as importance. We can apply the same optimistic update pattern while maintaining server authority.

---

## Current State Analysis

### What's Working (Importance System)

- ✅ Pure calculation architecture - never stored, always fresh
- ✅ Client calculates on every render using `calculateImportanceV1(task, now)`
- ✅ Optimistic updates recalculate fresh values immediately
- ✅ Server response replaces optimistic data with authoritative values
- ✅ Zero staleness issues, instant UX
- ✅ Implemented in [use-task-mutations.ts:208-289](../lib/queries/use-task-mutations.ts#L208-L289)

### What's Missing (Heat/Cool System)

- ❌ No optimistic updates in [use-task-mutations.ts:504-576](../lib/queries/use-task-mutations.ts#L504-L576)
- ❌ Mutations trigger full refetch (`invalidateQueries`)
- ❌ User waits 200-500ms for server response + refetch
- ❌ Task position updates feel sluggish
- ❌ Empty `onMutate` blocks with comment "No optimistic updates - server is source of truth"

### Why Heat is Different from Importance

Heat is more complex than importance but still uses pure calculation:

| Aspect | Importance | Heat |
|--------|-----------|------|
| **Storage** | None (pure calculation) | Only `heatAdjustment` stored |
| **Inputs** | priority, dueAt, starLevel | importance + recency + adjustment |
| **User Actions** | Indirect (edit task) | Direct (heat/cool buttons) |
| **Context Awareness** | No | Yes (move up 1, down 3) |
| **Decay** | No | Yes (asymmetric 7d/3d) |
| **Calculation** | Simple addition | Multi-step with context |

**Conclusion:** Heat requires more sophisticated optimistic logic but follows the same pure calculation pattern.

---

## Architecture Design

### Key Principles

1. **Server Authority** - Server calculates authoritative values, client predicts
2. **Pure Calculation** - Heat is NEVER stored, only `heatAdjustment` is persisted
3. **Optimistic First** - Client updates immediately, server confirms
4. **Graceful Correction** - Server response overwrites optimistic if predictions differ
5. **Context Awareness** - Client mirrors server's context-aware logic
6. **Shared Functions** - Client and server use identical calculation functions

### Data Flow

```
User clicks Heat Button
    ↓
┌─────────────────────────────────────────────────────────────┐
│ 1. CLIENT OPTIMISTIC UPDATE (immediate, <10ms)              │
│────────────────────────────────────────────────────────────│
│ - Get nearby tasks (10 above + 10 below = ~20 tasks)        │
│ - Calculate fresh importance ONLY for current + nearby      │
│ - Calculate fresh heat ONLY for current + nearby            │
│ - Run calculateHeatBoost() to get delta (e.g., +7 pts)      │
│ - Calculate target heat: current + boost (e.g., 50 + 7)     │
│ - Run resolveAdjustmentForTargetHeat() to get adjustment    │
│ - Update task.heatAdjustment optimistically                 │
│ - Update lastHeatTouchedAt = now                            │
│ - Update lastTouchedAt = now                                │
│ - UI updates INSTANTLY ⚡ (only ONE task updated)            │
└─────────────────────────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────────────────────────┐
│ 2. SERVER REQUEST (background, ~50-100ms)                   │
│────────────────────────────────────────────────────────────│
│ - Send: { taskId, nearbyTaskIds: [~20 IDs] }               │
│ - Server fetches ONLY nearby tasks (not all)                │
│ - Server calculates fresh importance + heat for nearby      │
│ - Server runs context-aware positioning                     │
│ - Server calculates authoritative adjustment                │
│ - Server persists adjustment to DB                          │
└─────────────────────────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────────────────────────┐
│ 3. SERVER RESPONSE (authoritative)                          │
│────────────────────────────────────────────────────────────│
│ - Replace optimistic task with server response              │
│ - Client recalculates heat for updated task on next render  │
│ - Re-sort if position changed (rare)                        │
│ - Usually matches optimistic, sometimes differs by 1-2 pts  │
└─────────────────────────────────────────────────────────────┘
```

**Key Optimization:** Only process ~20 nearby tasks instead of all tasks (10x faster with large lists!)

---

## Implementation Plan

### Phase 1: Add Optimistic Heat Updates ⭐

**File:** [lib/queries/use-task-mutations.ts](../lib/queries/use-task-mutations.ts)
**Target:** `useTouchTask()` hook (lines 504-538)

**Implementation:**

```typescript
export function useTouchTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ taskId, nearbyTaskIds }: { taskId: number; nearbyTaskIds?: number[] }) =>
      heatTask(taskId, nearbyTaskIds),
    onMutate: async ({ taskId, nearbyTaskIds }) => {
      // Cancel outgoing refetches to avoid race conditions
      await queryClient.cancelQueries({ queryKey: ["tasks"] });

      // Snapshot for rollback
      const previousTasks = queryClient.getQueriesData({ queryKey: ["tasks"] });

      // Optimistic update
      queryClient.setQueriesData<Task[]>({ queryKey: ["tasks"] }, (oldTasks) => {
        if (!oldTasks || !Array.isArray(oldTasks)) return oldTasks;
        if (!nearbyTaskIds || nearbyTaskIds.length === 0) return oldTasks;

        const now = new Date();

        // Step 1: Find current task
        const currentTask = oldTasks.find((t) => t.id === taskId);
        if (!currentTask) return oldTasks;

        // Step 2: Calculate fresh importance + heat ONLY for current task
        const currentImportance = calculateImportanceV1(currentTask, now);
        const currentHeat = calculateHeat(currentTask, now, currentImportance);

        // Step 3: Build context from nearby tasks ONLY (not all tasks)
        const contextTasks = oldTasks
          .filter((t) => nearbyTaskIds.includes(t.id) && t.id !== taskId)
          .map((t) => {
            const importance = calculateImportanceV1(t, now);
            return { id: t.id, heat: calculateHeat(t, now, importance) };
          });

        // Step 4: Calculate boost delta (how much to move)
        // Returns: +7 (means "move up 7 heat points")
        const boostDelta = calculateHeatBoost(
          { heat: currentHeat, id: currentTask.id },
          contextTasks
        );

        // Step 5: Calculate target heat
        // Example: current 50 + boost 7 = target 57
        const targetHeat = Math.min(
          Math.max(
            currentHeat + boostDelta,
            HEAT_CONFIG.MIN_FINAL_SCORE
          ),
          HEAT_CONFIG.MAX_FINAL_SCORE
        );

        // Step 6: Resolve what adjustment is needed to reach target heat
        // Example: To reach 57, with base 45, need adjustment +12
        const { newAdjustment } = resolveAdjustmentForTargetHeat(
          targetHeat,
          {
            importanceV1: currentImportance,
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
    },
    onError: (error, _variables, context) => {
      // Rollback on error
      if (context?.previousTasks) {
        context.previousTasks.forEach(([queryKey, data]) => {
          queryClient.setQueryData(queryKey, data);
        });
      }
      toast.error("Failed to heat task", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    },
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
    },
  });
}
```

**Key Points:**
- ✅ Calculate fresh importance + heat ONLY for current task + nearby context (~20 tasks)
- ✅ Three-step calculation: boost delta → target heat → adjustment needed
- ✅ Use same context logic as server (`calculateHeatBoost`)
- ✅ Use same adjustment calculation (`resolveAdjustmentForTargetHeat`)
- ✅ Update timestamps (`lastHeatTouchedAt`, `lastTouchedAt`)
- ✅ Only update ONE task (not all tasks)
- ✅ Server response replaces optimistic update (server authority)
- ✅ Rollback on errors (network failure, server error)

---

### Phase 2: Add Optimistic Cool Updates

**File:** [lib/queries/use-task-mutations.ts](../lib/queries/use-task-mutations.ts)
**Target:** `useCoolTask()` hook (lines 541-576)

**Implementation:**

```typescript
export function useCoolTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ taskId, visibleTaskIds }: { taskId: number; visibleTaskIds?: number[] }) =>
      coolTask(taskId, visibleTaskIds),
    onMutate: async ({ taskId, visibleTaskIds }) => {
      // [Same structure as useTouchTask through Step 2]

      // Step 3: Calculate drop (move down 3 positions)
      const dropDelta = calculateCoolDrop(
        { heat: currentTask._freshHeat, id: currentTask.id },
        contextTasks
      );

      const targetHeat = Math.min(
        Math.max(
          currentTask._freshHeat + dropDelta, // dropDelta is negative
          HEAT_CONFIG.MIN_FINAL_SCORE
        ),
        HEAT_CONFIG.MAX_FINAL_SCORE
      );

      // Step 4 & 5: [Identical to useTouchTask]
      const { newAdjustment } = resolveAdjustmentForTargetHeat(
        targetHeat,
        {
          importanceV1: currentTask._freshImportance,
          heatAdjustment: currentTask.heatAdjustment ?? 0,
          lastTouchedAt: currentTask.lastTouchedAt,
          lastHeatTouchedAt: currentTask.lastHeatTouchedAt,
        },
        now,
        currentTask._freshImportance
      );

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

      return { previousTasks };
    },
    onError: (error, _variables, context) => {
      // [Identical to useTouchTask]
    },
    onSuccess: (response) => {
      // [Identical to useTouchTask, but use "cooled" message]
      toast.success("Task cooled", {
        description: `Heat adjustment: ${response.adjustmentDelta >= 0 ? "+" : ""}${response.adjustmentDelta.toFixed(0)} pts`,
      });
    },
  });
}
```

---

### Phase 3: Update Components to Pass Nearby Task IDs

**File:** Components that render heat/cool buttons (likely `components/tasks/task-list.tsx` or `task-row.tsx`)

**Changes:**

```typescript
// In TaskList component - Helper to get nearby task IDs
const getNearbyTaskIds = useCallback((taskId: number, count: number = 10) => {
  const currentIndex = sortedTasks.findIndex((t) => t.id === taskId);
  if (currentIndex === -1) return [];

  const start = Math.max(0, currentIndex - count);
  const end = Math.min(sortedTasks.length, currentIndex + count + 1);

  return sortedTasks.slice(start, end).map((t) => t.id);
}, [sortedTasks]);

// Heat handler
const handleHeat = useCallback((taskId: number) => {
  const nearbyTaskIds = getNearbyTaskIds(taskId, 10); // 10 above + 10 below
  touchTaskMutation.mutate({ taskId, nearbyTaskIds });
}, [getNearbyTaskIds, touchTaskMutation]);

// Cool handler
const handleCool = useCallback((taskId: number) => {
  const nearbyTaskIds = getNearbyTaskIds(taskId, 10); // 10 above + 10 below
  coolTaskMutation.mutate({ taskId, nearbyTaskIds });
}, [getNearbyTaskIds, coolTaskMutation]);

// Pass handlers to TaskRow
<TaskRow
  task={task}
  onHeat={handleHeat}
  onCool={handleCool}
/>
```

**Performance Impact:**
- **Old approach:** Send 1000 task IDs → server fetches 1000 → calculates 1000 → sorts 1000
- **New approach:** Send 20 task IDs → server fetches 20 → calculates 20 → no sort needed
- **Result:** 10x faster with large task lists!

---

### Phase 4: Testing & Validation

**Test Cases:**

1. **Single Heat Click**
   - [ ] Task moves up instantly (optimistic)
   - [ ] Server confirms position
   - [ ] No visible "jump" when server responds
   - [ ] Heat adjustment displayed correctly

2. **Rapid Heat Clicks**
   - [ ] Each click moves task up
   - [ ] No race conditions
   - [ ] Server catches up correctly
   - [ ] Final position matches expected

3. **Heat with Context (Dense List)**
   - [ ] Task moves above next highest task
   - [ ] Respects MAX_BOOST_PER_CLICK cap (5 pts)
   - [ ] Matches server calculation
   - [ ] Context-aware positioning works

4. **Cool with Context**
   - [ ] Task moves down 3 positions
   - [ ] Respects MAX_DROP_PER_CLICK cap (10 pts)
   - [ ] Matches server calculation
   - [ ] Skips 3 positions correctly

5. **Network Failure**
   - [ ] Optimistic update shows immediately
   - [ ] Rollback occurs on error
   - [ ] User sees error toast
   - [ ] Task returns to original position

6. **Server Correction**
   - [ ] If server calculates different adjustment, server wins
   - [ ] Task smoothly adjusts to authoritative position
   - [ ] No jarring UI flicker
   - [ ] User sees final position

7. **Edge Cases**
   - [ ] Heat/cool at max/min heat boundaries
   - [ ] Heat/cool with no visible tasks (empty context)
   - [ ] Heat/cool on newly created task
   - [ ] Heat/cool immediately after page load

---

## Performance Considerations

### Optimization 1: Only Send Nearby Tasks (10x Improvement!)

**Problem:** Sending all visible task IDs (could be 1000s) causes:
- Large payload size
- Server fetches all tasks from DB
- Server calculates heat for all tasks
- Server sorts all tasks
- Total time: 200-500ms

**Solution:** Only send nearby tasks (10 above + 10 below = ~20 tasks)

```typescript
const getNearbyTaskIds = (taskId: number, count: number = 10) => {
  const currentIndex = sortedTasks.findIndex(t => t.id === taskId);
  const start = Math.max(0, currentIndex - count);
  const end = Math.min(sortedTasks.length, currentIndex + count + 1);
  return sortedTasks.slice(start, end).map(t => t.id);
};
```

**Performance Comparison (1000 tasks):**

| Metric | Old (All Tasks) | New (Nearby Only) | Improvement |
|--------|-----------------|-------------------|-------------|
| Payload size | 1000 IDs (~12KB) | 20 IDs (~0.3KB) | 40x smaller |
| DB fetches | 1000 tasks | 20 tasks | 50x faster |
| Heat calculations | 1000 tasks | 20 tasks | 50x faster |
| Sort operations | O(n log n) | None | Eliminated |
| **Total time** | **500ms** | **50ms** | **10x faster** |

---

### Optimization 2: Memoize Helper Functions

```typescript
const getNearbyTaskIds = useCallback((taskId: number, count: number = 10) => {
  // ... implementation
}, [sortedTasks]);

const handleHeat = useCallback((taskId: number) => {
  const nearbyTaskIds = getNearbyTaskIds(taskId, 10);
  touchTaskMutation.mutate({ taskId, nearbyTaskIds });
}, [getNearbyTaskIds, touchTaskMutation]);
```

**Benefit:** Avoid recreating functions on every render

---

### Optimization 3: Debounce Rapid Clicks (Optional)

```typescript
// Prevent double-clicks within 100ms
const [isHeating, setIsHeating] = useState(false);

const handleHeat = async (taskId: number) => {
  if (isHeating) return;
  setIsHeating(true);
  await touchTaskMutation.mutateAsync({ taskId, visibleTaskIds });
  setTimeout(() => setIsHeating(false), 100);
};
```

**Benefit:** Prevent accidental double-clicks, reduce server load

---

## Migration Strategy

| Step | Action | Risk Level | Rollback Plan |
|------|--------|------------|---------------|
| 1 | Implement Phase 1 (Heat optimistic) | Low | Remove `onMutate` logic, keep old invalidate approach |
| 2 | Test with real data (staging) | Low | Rollback to previous version |
| 3 | Deploy to production (monitor) | Medium | Feature flag to disable optimistic updates |
| 4 | Implement Phase 2 (Cool optimistic) | Low | Same as Step 1 |
| 5 | Update components (Phase 3) | Low | Pass empty array for `visibleTaskIds` |
| 6 | Clean up old code | Low | N/A (no functional changes) |

**Total Timeline:** 2-3 days

---

## Benefits

1. **Instant UX** ⚡
   - Task moves immediately, no waiting for server
   - Perceived latency: <10ms (vs 200-500ms currently)

2. **Consistent Architecture** 🏗️
   - Matches importance system pattern
   - Same pure calculation approach
   - Easy to understand and maintain

3. **Server Authority** 🔒
   - Server response is always final
   - Client predictions can be corrected
   - No data loss on network failures

4. **Predictable Behavior** 🎯
   - Client mirrors server logic exactly
   - Uses identical calculation functions
   - Deterministic results

5. **Graceful Degradation** 🛡️
   - Rollback on errors
   - Clear error messages
   - No broken UI states

6. **No Staleness** ✅
   - Always calculating fresh values
   - No cached heat values
   - Time-sensitive calculations handled correctly

---

## Risks & Mitigation

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| **Client/server calculation mismatch** | High | Low | Use identical functions (`calculateHeatBoost`, `resolveAdjustmentForTargetHeat`) |
| **Race conditions on rapid clicks** | Medium | Medium | `cancelQueries` in `onMutate`, server response overwrites |
| **Complex context calculations slow** | Low | Low | Memoize visible IDs, limit to top 30 tasks |
| **Network failure leaves stale data** | Medium | Low | Rollback in `onError`, show clear error toast |
| **Optimistic update differs from server** | Low | Medium | Server response overwrites (expected behavior) |
| **User confusion from corrections** | Low | Low | Corrections should be rare and subtle |

---

## Success Criteria

**Phase 1 (Heat) Success:**
- [ ] Heat button feels instant (<50ms perceived latency)
- [ ] Task moves to correct position immediately
- [ ] Server response confirms without visible change
- [ ] No race conditions or flickering
- [ ] Error handling works correctly

**Phase 2 (Cool) Success:**
- [ ] Cool button feels instant (<50ms perceived latency)
- [ ] Task moves down 3 positions immediately
- [ ] Context-aware positioning works
- [ ] Server response confirms without visible change

**Phase 3 (Integration) Success:**
- [ ] All components pass visible task IDs correctly
- [ ] Context calculations are accurate
- [ ] No performance regression (<100ms for 100 tasks)

**Overall Success:**
- [ ] User experience is indistinguishable from instant
- [ ] Server authority maintained
- [ ] No bugs reported in first week
- [ ] Positive user feedback

---

## Implementation Checklist

### Phase 1: Heat Optimistic Updates

- [ ] Import required functions (`calculateImportanceV1`, `calculateHeat`, `calculateHeatBoost`, `resolveAdjustmentForTargetHeat`, `HEAT_CONFIG`)
- [ ] Update `useTouchTask()` hook in [use-task-mutations.ts](../lib/queries/use-task-mutations.ts)
- [ ] Add `onMutate` handler with optimistic logic
- [ ] Calculate fresh importance + heat for all tasks
- [ ] Build context from visible task IDs
- [ ] Calculate boost using `calculateHeatBoost()`
- [ ] Resolve new adjustment using `resolveAdjustmentForTargetHeat()`
- [ ] Update task optimistically
- [ ] Add rollback logic in `onError`
- [ ] Update `onSuccess` to replace with server response
- [ ] Test single heat click
- [ ] Test rapid heat clicks
- [ ] Test network failure rollback

### Phase 2: Cool Optimistic Updates

- [ ] Update `useCoolTask()` hook in [use-task-mutations.ts](../lib/queries/use-task-mutations.ts)
- [ ] Add `onMutate` handler with optimistic logic (reuse Phase 1 structure)
- [ ] Use `calculateCoolDrop()` instead of `calculateHeatBoost()`
- [ ] Verify negative drop delta is handled correctly
- [ ] Add rollback logic in `onError`
- [ ] Update `onSuccess` to replace with server response
- [ ] Test single cool click
- [ ] Test cool down 3 positions
- [ ] Test network failure rollback

### Phase 3: Component Integration

- [ ] Find components that render heat/cool buttons (TaskList, TaskRow, etc.)
- [ ] Add `getNearbyTaskIds()` helper function to TaskList
- [ ] Memoize `getNearbyTaskIds` with `useCallback`
- [ ] Create `handleHeat` that calls `getNearbyTaskIds` and passes to mutation
- [ ] Create `handleCool` that calls `getNearbyTaskIds` and passes to mutation
- [ ] Pass handlers to TaskRow components
- [ ] Test context is passed correctly (verify ~20 IDs sent)
- [ ] Test with empty task list (edge case)
- [ ] Test with 1 task (edge case)
- [ ] Test with 100+ tasks (verify performance improvement)
- [ ] Test with 1000+ tasks (ensure no performance regression)

### Phase 4: Server-Side Optimization

- [ ] Update heat endpoint to require `nearbyTaskIds` parameter
- [ ] Remove fallback that fetches all tasks
- [ ] Update cool endpoint to require `nearbyTaskIds` parameter
- [ ] Add validation: return error if `nearbyTaskIds` is empty
- [ ] Test server only fetches nearby tasks (verify DB query)
- [ ] Measure server-side performance improvement

### Phase 5: Testing & Validation

- [ ] All test cases from "Testing & Validation" section pass
- [ ] Manual testing on staging environment
- [ ] Performance profiling (aim for <100ms)
- [ ] Edge case testing (boundaries, empty lists, etc.)
- [ ] Error handling testing (network failures, server errors)
- [ ] Cross-browser testing (Chrome, Firefox, Safari)

### Phase 6: Deployment & Monitoring

- [ ] Deploy to staging
- [ ] Monitor staging for 24 hours
- [ ] Deploy to production
- [ ] Monitor production metrics (latency, error rate)
- [ ] Gather user feedback
- [ ] Document any issues and resolutions

---

## Future Enhancements (Post-Implementation)

1. **Visual Feedback During Optimistic Update**
   - Add subtle animation during optimistic phase
   - Show "updating..." indicator if server is slow

2. **Conflict Resolution UI**
   - If server correction is significant, show notification
   - Allow user to see what changed

3. **Batch Operations**
   - Allow heating/cooling multiple tasks at once
   - Optimistic update for batch operations

4. **Undo/Redo**
   - Add undo button for heat/cool actions
   - Leverage optimistic update for instant undo

---

## References

- [Current Heat Algorithm](./current-heat-algorithm.md)
- [Current Importance Algorithm](./current-importance-algorithm.md)
- [Heat Calculation Functions](../lib/scoring/heat-v3.ts)
- [Importance Calculation Functions](../lib/scoring/importance-v1.ts)
- [Task Mutations](../lib/queries/use-task-mutations.ts)
- [Server Heat Endpoint](../app/api/tasks/[id]/heat/route.ts)
- [Server Cool Endpoint](../app/api/tasks/[id]/cool/route.ts)

---

## Conclusion

This implementation plan provides a comprehensive roadmap for adding optimistic client-side caching to heat/cool updates. By following the proven pattern used by the importance system and leveraging the pure calculation architecture, we can deliver instant UX while maintaining server authority.

**Key Takeaway:** Heat and importance both use pure calculation. The main difference is that heat requires context-aware positioning, which we can replicate on the client by using the same functions the server uses (`calculateHeatBoost`, `calculateCoolDrop`, `resolveAdjustmentForTargetHeat`).

**Next Steps:** Review this plan with the team, then proceed with Phase 1 implementation.
