## Heat sorting context mismatch

**Date:** 2025-11-17 (Updated: 2025-11-18)
**Issue:** toodle-t3r9
**Status:** OPEN - Investigation Ongoing

### Summary
Heat/cool clicks in production occasionally placed a task above/below the wrong neighbors even though the badges still showed the correct heat values. The server endpoints rely on the `visibleTaskIds` array to determine the nearby context when calculating the target heat, but the client had been sending the 21 tasks whose `_freshHeat` (or `_freshImportance`) was numerically closest to the clicked row. When local ordering drifted—e.g., due to manual adjustments or stale `taskOrder` entries—the visually adjacent rows could have very different scores and fall outside that numeric window. As a result, the API never considered them, so tasks jumped relative to a different set of neighbors than the user expected.

### Resolution
`components/tasks/task-list.tsx` now builds the context list from the actual rendered order instead of score proximity. We take the active (non-completed) rows in their on-screen sequence, locate the clicked task, and send a ±20 sliding window of IDs (clamped to bounds, falling back to the entire active list if the row cannot be found). This guarantees that every heat/cool mutation includes the rows the user just saw above and below the target, eliminating the mismatch while still keeping the payload bounded.

### Testing / Verification
* Manually inspect large lists in both Heat and Importance sort modes.
* Trigger heat/cool actions near the top, middle, and bottom of the list and confirm that the row repositions relative to its visible neighbors with no unexpected jumps.
* Observe network requests to ensure the payload contains the contiguous IDs and that the window shrinks automatically when fewer than 40 tasks are active.

### Follow-ups
If we ever see this behavior again, consider:
1. Increasing the window size or sending all active IDs for small accounts.
2. Adding telemetry on the server to log when a clicked row’s immediate neighbors were missing from the payload.
3. Re-evaluating `taskOrder` stability to ensure local ordering doesn’t drift excessively between refreshes.

_2025-11-16 update:_ Added client-side instrumentation (`[heat-debug]` logs in `app/tasks/page.tsx`) to capture target heat values, visible context IDs, and before/after task order snapshots whenever heat/cool mutations run. Check the browser console in production to trace future anomalies without redeploying.

_2025-11-17 update:_ Pulled a snapshot of production data into a staging database and pointed the dev environment at it. All heat/cool operations behaved correctly in dev (context-aware deltas of ±1 relative to neighbors, correct resorting), while production still exhibited the incorrect ±5 jumps and mis-ordering. This confirms the bug is not data-driven; something about the production environment (build, runtime config, downstream services, or caching) is behaving differently even on the same dataset.

_2025-11-17 telemetry update:_ Added richer client + server instrumentation to capture the full context every time a heat/cool mutation fires.

**Client telemetry**
- `components/tasks/task-list.tsx` logs `[heat-context] window` entries that now include comma-delimited snapshots (`contextIdsText`, `previewBeforeText`, `previewAfterText`, head/tail samples) so the exact payload can be copied out of DevTools without screenshotting.
- `app/tasks/page.tsx` propagates the API `requestId` through `[heat-debug] runHeatMutation` / `runCoolMutation` and `reorderTaskListWithTargetHeat`. Each log now includes the server-provided ID plus ordered previews before/after reordering, making it possible to correlate the UI state with Vercel logs.

**Server telemetry**
- `app/api/tasks/[id]/heat/route.ts` and `/cool` emit `[heat-api-debug]` / `[cool-api-debug]` logs for each request. Every log line contains:
  - `request`: raw `visibleTaskIds`, their comma-delimited string, and the index of the clicked ID within that array.
  - `context`: the deduped neighbor set with recalculated heats, a preview of the ordered window centered on the clicked row, and any IDs that were in the payload but missing from the DB lookup.
  - `result`: the computed boost/drop, baseline heat, adjustment deltas, and timestamps.
  - `error`: requestId + user/task identifiers if the mutation throws.
- The JSON response now includes `requestId`, so the browser logs and server telemetry share a stable key.

**How to use the telemetry**
1. Trigger heat/cool in production and capture the `[heat-context]` + `[heat-debug]` logs that show the `requestId`.
2. In Vercel logs, search for the same `requestId` to see the request/context/result triplet. The new `orderedVisiblePreview` payload mirrors what the UI saw, so you can confirm whether the server is acting on the correct neighbors.
3. Compare the server's `targetHeat` with client-side `reorderTaskListWithTargetHeat` logs. If both match but the row still moves incorrectly, focus on cache invalidation or stale data overwriting the optimistic order. If the server chose different neighbors (e.g., missing IDs appear in `missingNeighborIds`), inspect Supabase replication lag or API caching.

### Current hypotheses / next steps

1. **Environment-specific code path:** Production (Vercel) may be serving an older lambda bundle or edge cache that never received the latest heat/cool API changes. Verify the deployed build ID, redeploy if necessary, and consider purging Vercel serverless cache.
2. **Caching layer or replica lag:** Production uses Supabase (Postgres). If reads go through a replica or cached API response, the context tasks could be stale, causing the server to calculate the full ±5 delta each time. Inspect connection strings (`DATABASE_URL`, `SUPABASE_DB_URL`) and confirm we’re hitting the primary. Consider logging `contextTasks` + heat values inside `app/api/tasks/[id]/heat` and `/cool` to compare dev vs prod behavior.
3. **Runtime config differences:** Environment variables or feature flags might alter behavior (e.g., a fallback to legacy heat logic). Compare `.env.local` with Vercel Env settings, especially anything referencing heat/cool.
4. **Client payload differences:** We now send ±20 IDs based on display order. Add temporary logging to `getNearbyTaskIds` to confirm the list is sorted and contains the neighbors right before the request (especially in production where the bug still appears).
5. **Manual refresh requirement:** We’ve confirmed that `taskOrder` is not responsible; manual Refresh simply forces the natural order. The real issue is incorrect heat deltas (73→63→68/81). Focus efforts on server-side calculations rather than client ordering.

### Relevant files
- `components/tasks/task-list.tsx` – Builds `visibleTaskIds` payload (currently sends ALL active tasks).
- `app/tasks/page.tsx` – Contains `[heat-debug]` logs and task order management.
- `app/api/tasks/[id]/heat/route.ts` and `app/api/tasks/[id]/cool/route.ts` – Server endpoints that calculate context-aware boosts/drops.
- `lib/scoring/heat-v3.ts` – Core heat calculation logic (`calculateHeatBoost`, `calculateCoolDrop`).
- `components/tasks/heat-badge.tsx` – Badge display component (now uses pre-calculated `_freshHeat`).
- Vercel configuration (project settings + env vars) and Supabase connection strings – to confirm prod vs dev differences.

---

## 2025-11-18 Update: Additional Attempted Fixes (UNSUCCESSFUL)

### Hypothesis 1: Stale Context from ±20 Window
**Theory:** Client was sending only ±20 task IDs based on display order, which could be stale during rapid mutations due to React render cycle delays.

**Fix Attempt:**
- Changed `task-list.tsx` to send **ALL active task IDs** instead of ±20 window
- Updated `getAllActiveTaskIds()` to return complete list of active tasks
- Server now receives full context for every heat/cool operation

**Expected Result:** Server always has complete picture, eliminates dependency on client ordering

**Actual Result:** ❌ **FAILED** - Issue still occurs
- Example: Cooled task from 53 → initially dropped to 51 (correct, -2 delta)
- Then jumped to 43 after server response (incorrect, -10 full cap applied)
- This indicates server applied full cap instead of context-aware delta

**Code Changes:**
```typescript
// task-list.tsx - Before
const getNearbyTaskIds = useCallback((taskId: number): number[] => {
  const activeTasks = tasks.filter((t) => !t.completedAt);
  // ... ±20 window logic
}, [tasks]);

// task-list.tsx - After
const getAllActiveTaskIds = useCallback((): number[] => {
  const activeTasks = tasks.filter((t) => !t.completedAt);
  return activeTasks.map((task) => task.id);
}, [tasks]);
```

**Server Logging Added:**
- `[heat-context]` / `[cool-context]`: Logs received context size and neighbor count
- `[heat-delta]` / `[cool-delta]`: Logs current heat, calculated delta, and context task count
- Context mismatch warnings when expected neighbors aren't found in DB

### Hypothesis 2: Badge Display Race Condition
**Theory:** HeatBadge was recalculating heat from task properties while sorting used pre-calculated `_freshHeat`, causing visual mismatch during rapid mutations.

**Fix Attempt:**
- Changed `HeatBadge` to use `task._freshHeat` instead of recalculating
- Use `task._freshImportance` for tooltip breakdown
- Ensures badge displays exact same value used for sorting

**Expected Result:** Badge always shows correct heat synchronized with task position

**Actual Result:** ✅ **PARTIALLY SUCCESSFUL** - Badge issues reduced but still occur sometimes

**Code Changes:**
```typescript
// heat-badge.tsx - Before
const importance = calculateImportanceV1(task);
const breakdown = calculateHeatWithBreakdown(task, undefined, importance);
const heat = breakdown.totalHeat;

// heat-badge.tsx - After
const importance = task._freshImportance;
const heat = task._freshHeat ?? 0;
const breakdown = calculateHeatWithBreakdown(task, undefined, importance);
```

### Key Observations

1. **Optimistic Update Works Correctly**
   - Initial drop from 53→51 shows client-side calculation is correct
   - Client correctly calculates context-aware -2 delta

2. **Server Response Incorrect**
   - Server returns 43 (53 - 10 = 43), applying full cap
   - Server logs should show if context was received correctly
   - Either: (a) server didn't receive context, or (b) server ignored context

3. **Production-Only Issue Persists**
   - Same code works in dev but fails in production
   - Suggests environment-specific issue (Vercel, Supabase, caching, or network)

4. **Badge Issues Persist (Sometimes)**
   - Even with `_freshHeat`, badges occasionally show wrong values
   - May indicate deeper cache/state synchronization issue

### Next Steps for Investigation

1. **Check Server Logs in Production**
   - Look for `[cool-context]` and `[cool-delta]` logs
   - Verify: Did server receive all active task IDs?
   - Verify: What was `contextTaskCount` in the logs?
   - If contextTaskCount = 0, context didn't reach server
   - If contextTaskCount > 0, server calculation is wrong

2. **Verify Network Payload**
   - Inspect actual request body in production
   - Confirm `visibleTaskIds` array contains all active tasks
   - Check if request is being cached/modified in flight

3. **Possible Root Causes Still to Investigate**
   - **Vercel Edge Caching:** API responses might be cached
   - **Database Replica Lag:** Supabase read replica might be stale
   - **Request Middleware:** Something modifying request before it reaches handler
   - **Build Mismatch:** Production deployed old code despite rebuild
   - **Race Condition in Server:** Multiple concurrent requests interfering

4. **Test Server Calculation Directly**
   - Add test endpoint that accepts task ID and context, returns calculated delta
   - Call directly from production to verify calculation logic works
   - Isolate whether issue is in receiving context vs calculating from context

### Attempted Solutions Summary

| Fix | Target Issue | Result | Notes |
|-----|-------------|--------|-------|
| Send all active IDs | Stale context from ±20 window | ❌ Failed | Server still applies full cap |
| Use `_freshHeat` in badge | Badge/sort mismatch | ⚠️ Partial | Still occasional issues |
| Add server logging | Debug visibility | ✅ Complete | Ready for production testing |

### Critical Questions Remaining

1. **Is the server receiving the full context?** Check logs for `contextTaskCount`
2. **If yes, why is it applying full -10 cap?** Review `calculateCoolDrop` logic
3. **If no, where is the context being lost?** Network, middleware, or request parsing
4. **Why only in production?** Environment differences need deep inspection

---

## 2025-11-18 Update: Enhanced Diagnostic Logging Deployed

### Changes Made
Added comprehensive diagnostic logging to `calculateCoolDrop` function in `lib/scoring/heat-v3.ts` to track exactly why context-aware calculation fails and falls back to -10 cap.

### New Log Output (Production)
When a cool action is triggered, the following logs will now appear:

```
[cool-context] taskId=X, receivedContextSize=Y, neighborCount=Z
[cool-calc] taskId=X, currentHeat=A, minTarget=B
[cool-calc] totalContextTasks=C, tasksBelowOrEqual=D, tasksInRange=E
[cool-calc] sampleTasksBelow (top 5): [heat1, heat2, heat3, heat4, heat5]
[cool-calc] sampleTasksInRange (top 5): [heat1, heat2, ...]
[cool-calc] targetIndex=N, contextTarget=T
[cool-calc] finalTargetHeat=F, drop=G
[cool-delta] taskId=X, currentHeat=A, dropDelta=G, contextTaskCount=C
```

OR if no tasks in range:

```
[cool-calc] NO TASKS IN RANGE - falling back to max drop cap
[cool-calc] using minTarget=B (no tasks in range)
```

### What to Look For

**Scenario 1: No context received**
- `contextTaskCount=0` → Client didn't send context or server didn't fetch it
- **Action**: Check network payload, database query, or client-side context building

**Scenario 2: Context received but no tasks below current**
- `tasksBelowOrEqual=0` → Current task is the coldest in the entire list
- **Action**: Expected behavior - should apply -10 cap (or less if near min)

**Scenario 3: Tasks below but none in range (MOST LIKELY)**
- `tasksBelowOrEqual > 0` but `tasksInRange=0`
- `sampleTasksBelow` shows values all < (currentHeat - 10)
- **Root Cause**: Heat gap - all tasks below are more than 10 points away
- **Action**: This is the smoking gun! Means the context-aware algorithm can't find suitable targets within the -10 cap. Consider:
  - Increasing MAX_DROP_PER_CLICK beyond 10
  - Using a percentage-based drop instead of absolute
  - Falling back to a smaller drop (e.g., -3) instead of full -10 when no context in range

**Scenario 4: Client vs server heat calculation mismatch**
- Client logs show different heat values than server logs for same task IDs
- **Root Cause**: Client's cached task properties differ from database
- **Action**: Check for stale cache, pending mutations, or database replication lag

### Next Steps After Reviewing Logs

1. **Trigger the issue in production** - Heat a task a few times, then cool it
2. **Capture ALL logs** - Copy the full sequence of `[cool-*]` logs from Vercel
3. **Share the diagnostic output** - This will definitively show which scenario is occurring
4. **Implement the fix** based on the scenario identified
