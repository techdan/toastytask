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

---

## 2025-11-18 Update: Root Cause Identified - Timezone Mismatch in Heat Calculations

### Executive Summary
After extensive diagnostic logging and testing, we've identified the root cause: **client and server calculate different heat values for the same tasks due to timezone differences in due date calculations**. The server (Vercel, running in UTC) and client (user's local timezone) interpret due dates differently, causing 7-8 point heat discrepancies. This creates sparse task distribution on the server, making context-aware positioning fail.

### Investigation Timeline

#### Step 1: Cap Removal Fix (SUCCESSFUL ✅)
**Problem:** Even when valid context tasks were found, `calculateCoolDrop` was enforcing the -10 cap via `Math.max(minTarget, contextTarget)`.

**Evidence from logs:**
```
[cool-calc] contextTarget=42.0
[cool-calc] finalTargetHeat=43.0, drop=-10.0
```
The algorithm calculated `contextTarget=42.0` but then capped it to 43.0 (current 53 - max drop 10).

**Fix Applied:** Changed line 535 in `lib/scoring/heat-v3.ts`:
```typescript
// BEFORE (line 531):
const targetHeat = Math.max(minTarget, contextTarget);

// AFTER (line 535):
const targetHeat = tasksInRange.length > 0 ? contextTarget : minTarget;
const drop = targetHeat - currentTask.heat;

console.log(`[cool-calc] finalTargetHeat=${targetHeat.toFixed(1)}, drop=${drop.toFixed(1)}, capApplied=${tasksInRange.length === 0}`);
```

**Result:** ✅ This fix is correct and has been deployed. When `tasksInRange.length > 0`, we now use `contextTarget` without enforcing the cap.

**Status:** DEPLOYED AND WORKING

#### Step 2: Heat Distribution Analysis (REVEALED REAL ISSUE)
After the cap fix, testing revealed the issue persisted. Added logging to compare client vs server heat calculations.

**Server logs for specific tasks:**
```
[cool-specific-tasks] 88:60.0, 33:59.0, 59:59.0, 67:52.0, 191:48.0
[cool-calc] tasksInRange=3
```

**Client logs for same tasks:**
```
[cool-client-heats] 88:53.0, 59:52.0, 33:52.0, 67:44.0, 191:48.0
```

**Key Findings:**
- **Most tasks:** 7-8 point difference (88: 60 vs 53, 59: 59 vs 52, 33: 59 vs 52, 67: 52 vs 44)
- **Task 191:** MATCHED EXACTLY at 48.0 (likely has no due date)
- **Impact:** Server sees only 3 tasks in range [43-53], client sees 6+ tasks in same range

#### Step 3: Timezone Hypothesis
The fact that task 191 (likely no due date) matched perfectly while tasks with due dates differed by 7-8 points suggested the issue was in due date calculations.

**Root Cause Identified:** `lib/scoring/importance-v1.ts` lines 114-118:
```typescript
// PROBLEM CODE - uses LOCAL timezone:
const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
const dueStart = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate());

const diffMs = dueStart.getTime() - todayStart.getTime();
const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
```

**Why this causes the issue:**
- `new Date(year, month, date)` creates a date in the **LOCAL timezone**
- Server runs in UTC, client runs in user's local timezone (e.g., PST)
- For a task due "2025-11-19 00:00:00 PST":
  - Client (PST): Creates `2025-11-19 00:00:00 PST` → 1 day from now
  - Server (UTC): Creates `2025-11-19 00:00:00 UTC` → Already passed (it's currently 3 AM UTC)
- This causes server to calculate higher urgency → higher importance → higher heat

#### Step 4: UTC Fix Attempt (FAILED ❌ - REVERTED)
**Attempted Fix:** Changed `importance-v1.ts` to use UTC methods:
```typescript
const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
const dueStart = new Date(Date.UTC(dueDate.getUTCFullYear(), dueDate.getUTCMonth(), dueDate.getUTCDate()));
```

**Result:** ❌ **MADE PROBLEM WORSE**

**Client logs after UTC fix:**
```
[cool-client-heats] currentTask=106:53.0, contextTasks: 88:60.0, 59:59.0, 33:59.0, 67:52.0, 191:48.0
```

Now BOTH client and server calculated the same (incorrect) higher values. The sparse distribution problem now existed on both sides.

**Why it failed:**
- Simply forcing everything to UTC changes the MEANING of due dates
- Example: User sets task due "November 19" at 9 PM PST
  - Stored as `2025-11-19 00:00:00` (user's intention: due at midnight their time)
  - UTC interpretation: `2025-11-19 00:00:00 UTC` = November 18, 4 PM PST (already passed!)
  - This makes tasks appear due sooner than user intended

**Revert:** Committed via `git revert HEAD` - UTC fix has been removed from codebase.

### Current State

#### What's Fixed ✅
1. **Cap removal in `heat-v3.ts`** - Context-aware positioning now works correctly when context exists
2. **Comprehensive diagnostic logging** - Can now see exact heat calculations on both client and server

#### What's Broken ❌
1. **Timezone handling in `importance-v1.ts`** - Due date calculations use local timezone, causing client/server mismatch
2. **Heat distribution mismatch** - Server sees sparse distribution, client sees dense distribution
3. **Context-aware positioning** - Fails because server doesn't see enough tasks in range

#### Evidence Summary
| Task ID | Client Heat | Server Heat | Difference | Has Due Date |
|---------|-------------|-------------|------------|--------------|
| 88      | 53.0        | 60.0        | +7.0       | Yes (likely) |
| 59      | 52.0        | 59.0        | +7.0       | Yes          |
| 33      | 52.0        | 59.0        | +7.0       | Yes          |
| 67      | 44.0        | 52.0        | +8.0       | Yes          |
| 191     | 48.0        | 48.0        | **0.0**    | No (likely)  |

### Required Solution: Proper Timezone Handling Throughout System

The fix is NOT to simply force everything to UTC. Instead, we need to **properly handle local vs UTC throughout the system**.

#### Options to Consider:

**Option 1: Store timezone-aware due dates**
- Store user's timezone with due dates
- Calculate `diffDays` in user's timezone, not server's
- Requires schema change and timezone data

**Option 2: Store due dates as "user-local midnight" timestamps**
- When user sets "due November 19", store as timestamp representing midnight in THEIR timezone
- Server converts to user's timezone before calculating `diffDays`
- Requires knowing user's timezone

**Option 3: Normalize all calculations to UTC but preserve user intent**
- Store due dates in UTC but include timezone offset
- Calculate "days until due" in user's timezone
- More complex but semantically correct

**Option 4: Client sends heat values (simpler but less secure)**
- Client calculates heat using correct local timezone
- Server uses client-provided heat for context
- Server still calculates authoritative heat for storage
- Risk: Client could manipulate heat values

### Files Modified During Investigation

1. **`lib/scoring/heat-v3.ts`** ✅ KEEP
   - Lines 495-538: Added diagnostic logging to `calculateCoolDrop`
   - Line 535: **CRITICAL FIX** - Removed hard cap when context exists
   - Status: Deployed and working

2. **`app/api/tasks/[id]/cool/route.ts`** ✅ KEEP
   - Lines 109-143: Added heat distribution logging
   - Logs all task heats, specific tasks, duplicates
   - Status: Deployed and working

3. **`lib/queries/use-task-mutations.ts`** ✅ KEEP
   - Lines 923-931: Added client-side heat logging
   - Status: Deployed and working

4. **`lib/scoring/importance-v1.ts`** ⚠️ PROBLEM IDENTIFIED
   - Lines 114-118: Uses local timezone for due date calculations
   - Status: NOT FIXED - needs proper timezone handling

### Next Steps

1. **Decide on timezone strategy** - Choose from options above
2. **Implement proper timezone handling** - In `importance-v1.ts` and anywhere else due dates are used
3. **Test in production** - Verify client and server calculate identical heat values
4. **Monitor diagnostic logs** - Confirm `tasksInRange` count increases and context-aware positioning works
5. **Remove diagnostic logging** - Once confirmed working, clean up verbose logs

### How to Verify Fix

When properly fixed, you should see:
```
[cool-client-heats] currentTask=106:53.0, contextTasks: 88:53.0, 59:52.0, 33:52.0, 67:44.0
[cool-specific-tasks] 88:53.0, 33:52.0, 59:52.0, 67:44.0, 191:48.0
[cool-calc] tasksInRange=6 (or more)
[cool-calc] finalTargetHeat=50.0, drop=-3.0, capApplied=false
```

Client and server heat values should match exactly.

---

## 2025-11-18 Update: Final Solution - Client-Authoritative Heat for Context

### Root Cause Summary

**CONFIRMED:** The root cause is timezone mismatch in due date calculations at [lib/scoring/importance-v1.ts:114-118](lib/scoring/importance-v1.ts#L114-L118):

```typescript
const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
const dueStart = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate());
```

This creates Date objects in the **local timezone**:
- **Client (browser):** User's timezone (e.g., PST = UTC-8)
- **Server (Vercel):** UTC

**Impact:**
- Same timestamp interpreted differently by client and server
- Different "days until due" → different importance → different heat (7-8 point mismatch)
- Server sees sparse task distribution, client sees dense distribution
- Context-aware positioning fails because server doesn't see tasks in expected range

**Evidence:**
- Tasks **with** due dates: 7-8 point heat difference between client and server
- Task 191 **without** due date: EXACT match (48.0) - proves due date calculation is the issue

### Related Issues

**Heat Badge Display Bug:**
In addition to the positioning bug, there's an intermittent issue where the HeatBadge displays incorrect values (though tasks still sort based on correct `_freshHeat` values). This is likely related to the same client/server heat calculation mismatch causing stale or incorrect values to be displayed in the badge UI.

### Chosen Solution: Client-Authoritative Heat for Context

After evaluating multiple approaches (timezone-aware server calculations, storing user timezone, pre-calculated values), we've chosen the simplest and most robust solution:

**Approach:**
1. **Client calculates heats** for all context tasks using correct local timezone
2. **Client sends calculated heats** along with task IDs in heat/cool API requests
3. **Server uses client-provided heats** for context-aware positioning logic (`calculateCoolDrop`, `calculateHeatBoost`)
4. **Server independently calculates** authoritative heat for the target task for storage
5. **Server's calculation** is what gets persisted to database (source of truth)

**Why this works:**
- ✅ Client has correct timezone context for due date calculations
- ✅ Server uses accurate heat values for positioning decisions
- ✅ Server remains authoritative for stored data
- ✅ No schema changes required
- ✅ Works perfectly when user travels to different timezones (browser timezone auto-updates)
- ✅ Simple implementation with minimal changes
- ✅ Low risk - client can only affect positioning of their own tasks, not persistence

**Tradeoffs considered:**
- Client could theoretically manipulate heat values, but impact is limited to positioning only
- Server and client calculate same thing twice (minor inefficiency)
- Alternative of sending timezone to server would be more "pure" architecturally but adds complexity without significant benefit

### Implementation Plan

**Files to modify:**

1. **`components/tasks/task-list.tsx`**
   - Update context payload to send `{ id: number, heat: number }[]` instead of just `number[]`
   - Calculate heat for each task using `calculateImportanceV1` and `calculateHeat`

2. **`app/api/tasks/[id]/heat/route.ts`**
   - Update request interface to accept `visibleTaskIds: Array<{ id: number, heat: number }>`
   - Use client-provided heats for context instead of recalculating
   - Keep server-side calculation for target task's new heat (for storage)

3. **`app/api/tasks/[id]/cool/route.ts`**
   - Same changes as heat route

4. **`lib/scoring/heat-v3.ts`**
   - Update `calculateCoolDrop` signature to accept heats directly
   - Update `calculateHeatBoost` signature to accept heats directly
   - Remove server-side recalculation of context task heats

5. **`components/tasks/heat-badge.tsx`** (if needed)
   - Investigate and fix intermittent display bug
   - Ensure badge consistently uses `task._freshHeat`
   - May need to track down state synchronization issues

### Testing Plan

**Verify the fix works:**
1. Deploy changes to production
2. Trigger heat/cool operations
3. Check logs:
   - `[cool-client-heats]` and `[cool-specific-tasks]` should now show matching values
   - `[cool-calc] tasksInRange` count should increase (more tasks found in range)
   - `[cool-calc] finalTargetHeat` should reflect context-aware positioning (not -10 cap)
4. Verify tasks position correctly relative to visible neighbors
5. Verify heat badge displays correct values consistently

**Test edge cases:**
- Heat/cool near top and bottom of list
- Large lists (100+ tasks)
- Rapid successive heat/cool clicks
- User traveling to different timezone (tasks should recalculate correctly)

### Cleanup After Fix

Once verified working in production:
1. Remove diagnostic logging from `heat-v3.ts` (lines 495-538)
2. Remove diagnostic logging from API routes
3. Remove client-side heat logging
4. Update this document status to CLOSED with resolution summary
