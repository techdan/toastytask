        authoritativeContextTasks = data
          .filter(t => visibleTaskIds.includes(t.id) && !t.completedAt)
          .map(t => ({ id: t.id, heat: calculateHeat(t, now) }));
        break;
      }
    }
  }

  // Calculate optimistic update ONCE
  const optimisticUpdate = { /* pre-calculated update */ };

  // Apply SAME update to ALL queries
  queryClient.setQueriesData<Task[]>({ queryKey: ["tasks"] }, (oldTasks) => {
    return oldTasks.map((task) =>
      task.id === taskId ? { ...task, ...optimisticUpdate } : task
    );
  });
}
```

**Result:** ✅ Client-side context now correct! Shows +1 to move above next task.

**Remaining Issue:** ❌ Server still calculates +5 instead of +1, causing jump on response.

**New Problem:** Client and server are now using different context or calculation logic.

### Fix #4: Recalculate importanceV1 Fresh on Both Client and Server ❌ MADE IT WORSE

**Theory:** The database has stale `importanceV1` values (8 instead of 9 for tasks 43 and 45). Both client and server need to recalculate fresh from task properties (priority, star, due date) instead of trusting cached/DB values.

**Root Cause Discovered:**
- Client cache: `importanceV1 = 9` (from GET which calculates fresh)
- Client recalculates: `importanceV1 = 9` (correct)
- Database: `importanceV1 = 8` (STALE!)
- Server uses DB value to calculate heat
- Result: Different heat values for context tasks, different boost calculation

**Implementation:**

*Client side* (lib/queries/use-task-mutations.ts):
```typescript
authoritativeContextTasks = data
  .filter((t: Task) => visibleTaskIds.includes(t.id) && !t.completedAt)
  .map((t: Task) => {
    // CRITICAL FIX: Recalculate importanceV1 fresh (don't trust cached value)
    const freshImportance = calculateImportanceV1(t);
    return {
      id: t.id,
      heat: calculateHeat({ ...t, importanceV1: freshImportance }, now)
    };
  });
```

*Server side* (app/api/tasks/[id]/heat/route.ts):
```typescript
contextTasks = neighborRecords.map((neighbor) => {
  // CRITICAL FIX: Recalculate importanceV1 fresh (don't trust DB value)
  const freshImportance = calculateImportanceV1(neighbor);
  const freshHeat = calculateHeat({ ...neighbor, importanceV1: freshImportance }, now);
  return { id: neighbor.id, heat: freshHeat };
});
```

**Result:** ❌ **MADE IT WORSE!** Jumping still occurs, and now task 14 jumps from 63→68 then back on first click too.

**Why it failed:** Unknown. Both client and server should now calculate identical importanceV1 values using the same function and same task data (priority, star, dueDate). Yet jumping persists.

**Diagnostic logs showed:**
- Client: All importance values show "✅ Fresh" (no staleness detected)
- Client calculates heat correctly for context
- Server calculates different heat for same tasks
- Mismatch remains despite both recalculating fresh

**Possible explanations:**
1. Task properties (priority, star, dueDate) are also stale in database?
2. Time boundary issue - calculateImportanceV1 uses current date, millisecond differences?
3. Client and server are somehow using different task data entirely?
4. The recalculation is happening but then being overwritten?
5. Something else is modifying importance between calculation and use?

---

## Investigation Tools Used

### 1. React Query DevTools
- Located at bottom-right of browser (Tanstack icon)
- Shows all cached queries and their data
- Reveals multiple queries with different data for same task

### 2. Console Logging
Added diagnostic logs to track:
- Task properties used for calculation (client vs server)
- Calculated heat values (client vs server)
- Cache state before optimistic updates
- Multiple queries and their data

### 3. Network Tab
- Shows server responses
- Confirms server is calculating correct values
- Client is using stale cached data

---

## Current Understanding

**The core issue is cache inconsistency**, but we don't yet know:

1. **Why do queries have different data initially?**
   - Both queries fetch on page load
   - Both should get identical data from server
   - Server recalculates importanceV1 fresh on every GET
   - Yet somehow they end up with different values

2. **Why doesn't setQueriesData sync them?**
   - setQueriesData runs callback once per matching query
   - Each callback sees that query's cached data
   - But if data is already inconsistent, how does it get that way?

3. **Is there a race condition in the queries themselves?**
   - Do the two queries fetch at slightly different times?
   - Could importance change between the two fetches (due to date boundaries)?
   - Is HMR (Hot Module Replacement) in dev mode preserving stale cache?

4. **Why does optimistic update run twice?**
   - Logs show calculateHeatBoost running twice with different values
   - First with importanceV1: 9, then immediately with importanceV1: 8
   - This suggests the cache is being updated mid-mutation

---

## Current Status (After Fix #3)

**✅ Client-side optimistic update:** Working correctly
- Uses authoritative query data
- Calculates correct context-aware positioning (+1 to move above next task)
- All queries updated consistently

**❌ Server calculation:** Mismatched with client
- Server calculates +5 instead of +1
- Causes UI to jump when server response arrives
- Suggests server is seeing different context or using different logic

### Possible Causes of Server Mismatch

1. **Client sends wrong context IDs:**
   - Client sends `visibleTaskIds` array to server
   - Server uses these IDs to build context
   - If IDs are wrong, context is wrong

2. **Server calculates heat differently for context tasks:**
   - Server fetches tasks from database
   - Server recalculates heat for each task
   - If database has stale data, heat calculations differ

3. **Server's `calculateHeatBoost` uses different logic:**
   - Both client and server import from same file
   - But server might be seeing different task order or heat values
   - Need to compare actual heat values server sees vs client sees

4. **Time skew causing different importance values:**
   - Client calculates importance with client time
   - Server calculates with server time (a few ms later)
   - If task due date is boundary case, importance could differ

### Next Investigation Steps

**Step 1: Log server's context tasks**
Add logging to see what heat values the server calculates for each context task:

```typescript
// In heat/route.ts
const contextTasks = neighborRecords.map((neighbor) => {
  const freshHeat = calculateHeat(neighbor, now);
  console.log('[SERVER CONTEXT]', { id: neighbor.id, heat: freshHeat, importanceV1: neighbor.importanceV1 });
  return { id: neighbor.id, heat: freshHeat };
});
```

**Step 2: Compare client vs server context**
Log the exact same info on client side to see if they differ:

```typescript
// In use-task-mutations.ts onMutate
authoritativeContextTasks.forEach(t => {
  console.log('[CLIENT CONTEXT]', { id: t.id, heat: t.heat });
});
```

**Step 3: Verify visibleTaskIds are correct**
Log what IDs the client is sending to the server:

```typescript
console.log('[CLIENT] Sending visibleTaskIds:', visibleTaskIds);
```

And what the server receives:

```typescript
console.log('[SERVER] Received visibleTaskIds:', visibleTaskIds);
```

---

## Next Steps to Try (If Investigation Doesn't Reveal Issue)

### Option A: Force Refetch Before Optimistic Update
```typescript
onMutate: async ({ taskId, visibleTaskIds }) => {
  // Ensure cache is fresh before optimistic update
  await queryClient.refetchQueries({ queryKey: ["tasks"] });
  await queryClient.cancelQueries({ queryKey: ["tasks"] });

  // Now proceed with optimistic update using fresh data
  // ...
}
```

**Pros:** Guarantees fresh data
**Cons:** Slower, defeats purpose of optimistic updates

### Option B: Remove Optimistic Updates Entirely
```typescript
// No onMutate
// Just show loading state
// Trust server response
```

**Pros:** Simple, no cache sync issues
**Cons:** Slower UX, less responsive feel

### Option C: Single Source Query
Modify page to use only ONE query for all purposes:
```typescript
// Remove separate sidebar query
// Use a single query and derive counts client-side
const { data: allTasks } = useTasksQuery({
  includeCompleted: true,
});
```

**Pros:** No multi-query cache issues
**Cons:** May cause re-renders, less efficient

### Option D: Debug Why Queries Have Different Data
Add more logging to understand:
- What does each query return from the server initially?
- Are there TWO separate fetch requests on page load?
- Do they return different data or does cache get corrupted later?
- Is HMR the culprit?

### Option E: Use Query Keys More Specifically
Make queries more specific so they don't both match `["tasks"]`:
```typescript
// Instead of both matching ["tasks"]
["tasks", "visible", { projectId, includeCompleted }]
["tasks", "all", { includeCompleted: true }]
```

**Pros:** Queries won't interfere with each other
**Cons:** Have to update each query specifically, more complex

---

## Environment Context

- **Dev Mode:** Running `npm run dev` (HMR active)
- **React Query Config:**
  - `staleTime: 5 * 60 * 1000` (5 minutes)
  - `refetchOnMount: false` (if fresh)
  - `refetchOnWindowFocus: true`
  - `gcTime: 30 * 60 * 1000` (30 minutes)
- **Test Method:** Full page reload (F5), then click heat

---

## Related Files

**Core Algorithm:**
- [lib/scoring/heat-v3.ts](../lib/scoring/heat-v3.ts) - Heat calculation (pure function)
- [lib/scoring/importance-v1.ts](../lib/scoring/importance-v1.ts) - Importance calculation (date-dependent)
- [docs/current-heat-algorithm.md](./current-heat-algorithm.md) - Algorithm documentation

**Client Mutations:**
- [lib/queries/use-task-mutations.ts](../lib/queries/use-task-mutations.ts) - React Query mutations with optimistic updates

**Server Endpoints:**
- [app/api/tasks/route.ts](../app/api/tasks/route.ts) - GET /api/tasks (recalculates importance)
- [app/api/tasks/[id]/heat/route.ts](../app/api/tasks/[id]/heat/route.ts) - POST /api/tasks/[id]/heat
- [app/api/tasks/[id]/cool/route.ts](../app/api/tasks/[id]/cool/route.ts) - POST /api/tasks/[id]/cool

**Page:**
- [app/tasks/page.tsx](../app/tasks/page.tsx) - Has TWO separate useTasksQuery calls

**Config:**
- [components/providers/query-provider.tsx](../components/providers/query-provider.tsx) - React Query configuration

---

## Diagnostic Logs to Add Next

1. **On page load:** Log what each query fetches from server
2. **Before mutation:** Log ALL queries and their task 45 data
3. **During setQueriesData:** Log which query is being updated
4. **After onSuccess:** Verify all queries have same data

Example:
```typescript
// In useTasksQuery
onSuccess: (data) => {
  const task45 = data.find(t => t.id === 45);
  console.log('[useTasksQuery] Fetched data:', {
    queryKey,
    task45: task45 ? { id: task45.id, importanceV1: task45.importanceV1 } : 'NOT FOUND'
  });
}
```

---

## Questions to Answer

1. Are both queries fetching from the server on page load, or is one using cached data?
2. Do both fetch requests return the same data from the server?
3. When does the cache divergence happen - on initial load or during mutations?
4. Is HMR preserving stale cache across code reloads?
5. Should we disable HMR for testing to isolate the issue?

---

## Hypothesis for Next Investigation

**Current best guess:** The issue is happening because `setQueriesData` callback runs ONCE per matching query, and each callback has access to that query's old data. If we're mutating based on old data, we're perpetuating the inconsistency rather than fixing it.

**Test this by:** Logging inside the setQueriesData callback to see if it's called twice and what data it sees each time.

**Potential fix:** Instead of using the callback's `oldTasks` parameter, fetch the latest data from Query 0 and use it for all queries:

```typescript
queryClient.setQueriesData<Task[]>({ queryKey: ["tasks"] }, () => {
  // Don't use oldTasks parameter - it's different for each query!
  // Instead, get the authoritative data from one specific query
  const authoritativeTasks = queryClient.getQueryData<Task[]>(["tasks", { includeCompleted: true }]);

  return authoritativeTasks?.map((task) =>
    task.id === response.task.id ? response.task : task
  ) ?? [];
});
```

This would ensure all queries get the SAME updated data, not each one's own version.

---

## Summary of All Fixes Attempted

1. ❌ **Fix #1:** Add onSuccess to useUpdateTask - No effect
2. ❌ **Fix #2:** Remove invalidateQueries from mutations - No effect
3. ⚠️ **Fix #3:** Use authoritative query data - Client side worked, server still wrong
4. ❌ **Fix #4:** Recalculate importanceV1 fresh on both sides - MADE IT WORSE
5. ✅ **Fix #5:** Recalculate fresh importance for CURRENT task AND use it throughout - **SOLVED IT!**

---

## Fix #5: The Actual Root Cause and Solution ✅

### Root Cause Discovery

After extensive logging, the true root cause was revealed:

**The server was recalculating fresh `importanceV1` for CONTEXT tasks, but NOT for the CURRENT task being heated/cooled!**

**What was happening:**
```typescript
// Server side (BEFORE fix)
const contextCurrentHeat = calculateHeat(existingTask, now);
// ❌ Uses existingTask.importanceV1 from database (STALE! = 8)

contextTasks = neighborRecords.map((neighbor) => {
  const freshImportance = calculateImportanceV1(neighbor);
  // ✅ Context tasks get fresh importance (= 9)
  const freshHeat = calculateHeat({ ...neighbor, importanceV1: freshImportance }, now);
  return { id: neighbor.id, heat: freshHeat };
});

// Then in resolveAdjustmentForTargetHeat...
resolveAdjustmentForTargetHeat(targetHeat, {
  importanceV1: existingTask.importanceV1,  // ❌ STALE AGAIN! = 8
  heatAdjustment: decayedAdjustment,
  // ...
}, now);
```

**Result:** Server calculated current task heat with importance=8, but context tasks with importance=9. This caused an ~8 point discrepancy, which made the boost calculation wrong.

### The Three-Part Solution

**Part 1: Recalculate fresh importance for current task**

Added to both `heat/route.ts` and `cool/route.ts`:

```typescript
// CRITICAL FIX: Recalculate fresh importance for current task
// importanceV1 can become stale in database (time-dependent calculation)
const currentTaskFreshImportance = calculateImportanceV1(existingTask);
const contextCurrentHeat = calculateHeat(
  { ...existingTask, importanceV1: currentTaskFreshImportance },
  now
);
```

**Part 2: Use fresh importance in resolveAdjustmentForTargetHeat**

Changed in both endpoints:

```typescript
resolveAdjustmentForTargetHeat(targetHeat, {
  importanceV1: currentTaskFreshImportance, // ✅ Use fresh, not stale DB value!
  heatAdjustment: decayedAdjustment,
  lastTouchedAt: existingTask.lastTouchedAt,
  lastHeatTouchedAt: existingTask.lastHeatTouchedAt,
}, now);
```

**Part 3: Update database with fresh importance**

To prevent future staleness:

```typescript
// Update task with new adjustment AND fresh importance to prevent staleness
const updatedTask = await taskRepository.update(taskId, {
  heatAdjustment: newAdjustment,
  importanceV1: currentTaskFreshImportance, // ✅ Keep DB in sync with fresh calculation
  lastHeatTouchedAt: now,
  lastTouchedAt: now,
}, userId);
```

### Files Modified

1. **[app/api/tasks/[id]/heat/route.ts](../app/api/tasks/[id]/heat/route.ts)**
   - Line 66-70: Calculate fresh importance for current task
   - Line 126: Use fresh importance in resolveAdjustmentForTargetHeat
   - Line 137: Update DB with fresh importance

2. **[app/api/tasks/[id]/cool/route.ts](../app/api/tasks/[id]/cool/route.ts)**
   - Line 70-74: Calculate fresh importance for current task
   - Line 151: Use fresh importance in resolveAdjustmentForTargetHeat
   - Line 162: Update DB with fresh importance

3. **[lib/scoring/heat-v3.ts](../lib/scoring/heat-v3.ts)**
   - Line 440: Fixed cool algorithm to only consider tasks within -10 cap range
   - This ensures cool doesn't always hit the max drop when there are closer tasks

### Why Fix #4 Failed

Fix #4 WAS correct in recalculating fresh importance for context tasks, but it MISSED recalculating for the current task itself! The diagnostic logs showed:

```
[SERVER] Task 45 heat: 55.12 (using stale importanceV1: 8)
[SERVER CONTEXT] Task 43 heat: 82.43 (using fresh importanceV1: 9)
```

The current task and context tasks were calculated with different importance values, causing the ~8 point heat discrepancy.

### Result: Complete Resolution ✅

After Fix #5:
- ✅ No more heat value jumping
- ✅ Client and server calculate identical heat values
- ✅ Cool properly drops to nearby tasks instead of always hitting -10 cap
- ✅ Database stays in sync with fresh importance calculations
- ✅ Context-aware positioning works correctly for both heat and cool

**The jumping is completely eliminated!** 🎉

---

## Key Learnings

1. **Time-dependent calculations must be kept fresh:** `importanceV1` depends on current date vs due date, so it becomes stale over time.

2. **Consistency across ALL calculation points:** It's not enough to recalculate fresh values for context tasks - you must ALSO recalculate for the current task being modified.

3. **Database synchronization:** When you discover stale values, update the database immediately to prevent the staleness from propagating.

4. **Trust but verify:** Even when you think you've fixed something (Fix #4), comprehensive logging can reveal missed edge cases.

---

**End of Debug Log - Issue RESOLVED**
# Debug: Heat Value Jumping Issue (Archived)

This document has been merged into the consolidated report at
`docs/bug_docs/bug-heat-cool-flicker.md`. Refer to that file for the full
timeline, findings, and resolution (Fast Refresh restoring stale caches during
heat/cool mutations).

All cleanup work that spun out of the original investigation now lives in
`docs/clean-heat-cool-tech-debt.md`.
