# Bug: Task Disappearing on Rapid Check/Uncheck

**Date:** 2025-11-12
**Severity:** High
**Status:** Fixed ✅

## Summary

When rapidly checking and then unchecking a task (or vice versa), the task would briefly disappear from the active list and then reappear, or sometimes end up in the wrong completion state (marked as completed when it should be active, or vice versa).

## Symptoms

1. **Primary Issue:** Task disappears briefly when checkbox is toggled rapidly
2. **Incorrect State:** Task ends up completed when user intended it to be uncompleted
3. **Flickering UI:** Task visibility flickers during rapid interactions
4. **Duplicate Requests:** Two GET requests fired after mutations instead of one

### User Experience

```
User Action: Check task → Immediately uncheck task
Expected: Task stays visible and uncompleted
Actual: Task marked as completed and moved to completed list
```

### Network Logs

```
POST /api/tasks/99/complete 200 in 6503ms
DELETE /api/tasks/99/complete 200 in 4658ms
GET /api/tasks?includeCompleted=true 200 in 1321ms
GET /api/tasks?includeCompleted=true 200 in 908ms
```

**Key observation:** DELETE completed BEFORE POST despite starting second!

## Root Causes

### 1. Out-of-Order Server Response Race Condition

The primary issue was that server responses could complete in a different order than they were initiated:

```
Timeline:
t=0ms    User clicks checkbox (complete)
t=50ms   User clicks checkbox again (uncomplete)
t=100ms  POST /complete starts (takes 6503ms)
t=150ms  DELETE /uncomplete starts (takes 4658ms)
t=4808ms DELETE completes → server shows uncompleted ✓
t=6603ms POST completes → server shows completed ✗ (WRONG!)
```

The server processes both requests and the **last one to complete** wins, regardless of user intent.

### 2. Automatic Query Invalidation Matching Too Broadly

The invalidation was matching ALL queries starting with `["tasks"]`:
- Main query: `["tasks", { projectId: undefined, includeCompleted: true }]`
- Background prefetch queries: `["tasks", { projectId: 1, ... }]`, `["tasks", { projectId: 2, ... }]`, etc.

This caused multiple refetches, creating race conditions between different query results.

### 3. Premature Cleanup Effect Execution

The cleanup effect that syncs optimistic state with server data was running on every cache update, even during pending mutations, causing UI state overrides to be removed prematurely.

### 4. Checkbox Click Triggering Row Touch

Clicking the checkbox also triggered the row's `onClick` handler, causing an unnecessary `/touch` API call that added more race conditions.

## Attempted Fixes (That Didn't Work)

### Attempt 1: flushSync for Synchronous State Updates

**What we tried:** Wrapped state update calls in `flushSync()` to force synchronous execution before mutations.

```typescript
flushSync(() => {
  addOptimisticActive(id);
  removeLingeringCompleted(id);
});
```

**Why it didn't work:** This only synchronized React state updates on the client. It didn't solve the server-side race condition where responses complete out of order.

### Attempt 2: Debounced Query Invalidation

**What we tried:** Removed automatic `invalidateQueries` from mutation hooks and added 100ms debounced invalidation in page handlers.

```typescript
const scheduleInvalidation = useCallback(() => {
  invalidationTimeout.current = setTimeout(() => {
    queryClient.invalidateQueries({ queryKey: ["tasks"] });
  }, 100);
}, []);
```

**Why it helped (partially):** Reduced overlapping refetches but didn't prevent the server from being in the wrong state after both mutations completed.

### Attempt 3: Pending Mutation Tracking

**What we tried:** Added `pendingCompletionMutations` ref to track in-flight mutations and prevent cleanup during pending state.

```typescript
const pendingCompletionMutations = useRef(new Set<number>());
```

**Why it helped (partially):** Prevented premature cleanup but didn't address the fundamental issue of server state being wrong.

### Attempt 4: Bidirectional completedAt Overrides

**What we tried:** Added logic to force `completedAt` values in both directions based on optimistic state.

**Why it didn't work:** Still vulnerable to the final server state being incorrect when the slower mutation completed after the faster one.

## The Solution

The fix required a multi-faceted approach:

### 1. Intent Tracking with Timestamps

Track the user's **latest intent** for each task with a timestamp:

```typescript
// app/tasks/page.tsx
const latestCompletionIntent = useRef(new Map<number, {
  shouldBeCompleted: boolean;
  timestamp: number
}>());
```

When a mutation starts, record the intent:

```typescript
const handleCompleteTask = async (id: number) => {
  const timestamp = Date.now();
  latestCompletionIntent.current.set(id, {
    shouldBeCompleted: true,
    timestamp
  });
  // ... mutation
};
```

### 2. Stale Response Detection

In the mutation's `onSuccess`, check if this response is still the latest:

```typescript
onSuccess: (task) => {
  const latest = latestCompletionIntent.current.get(id);
  if (latest && latest.timestamp > timestamp) {
    // Ignore this stale response
    return;
  }

  // Apply cache update only if this is the latest intent
  queryClient.setQueriesData<Task[]>({ queryKey: ["tasks"] }, ...);
}
```

**Key insight:** By comparing timestamps, we know that if a newer mutation started after this one, we should ignore this response even if it arrives later.

### 3. Automatic Server Correction

When query invalidation reveals the server is out of sync with intent, automatically send a corrective mutation:

```typescript
// In cleanup effect
latestCompletionIntent.current.forEach((intent, taskId) => {
  const serverCompleted = completedIdSet.has(taskId);

  if (serverCompleted !== intent.shouldBeCompleted) {
    // Queue correction
    if (intent.shouldBeCompleted) {
      handleCompleteTask(taskId); // Send corrective complete
    } else {
      handleUncompleteTask(taskId); // Send corrective uncomplete
    }
  }
});
```

This ensures eventual consistency: even if the server ends up in the wrong state, we detect and correct it.

### 4. Exact Query Invalidation

Changed from broad matching to exact query matching:

```typescript
// Before (matches all ["tasks"] queries)
queryClient.invalidateQueries({ queryKey: ["tasks"] });

// After (matches only the exact query)
queryClient.invalidateQueries({
  queryKey: ["tasks", { projectId: undefined, includeCompleted: true }],
  exact: true
});
```

This prevents multiple refetches from background prefetch queries.

### 5. Event Isolation

Added `stopPropagation` to prevent checkbox clicks from triggering row clicks:

```typescript
// components/tasks/task-row.tsx
<Checkbox
  onClick={(e) => e.stopPropagation()}
  onCheckedChange={handleCheckboxChange}
/>
```

This eliminates unnecessary `/touch` API calls during checkbox interactions.

### 6. Moved Cache Updates from Hooks to Handlers

Removed automatic cache updates from mutation hooks:

```typescript
// lib/queries/use-task-mutations.ts
// Before: onSuccess in mutation hook updated cache
// After: No onSuccess - cache updates handled in page-level handlers
```

This allows page-level handlers to check for staleness before applying updates.

## Files Modified

### Primary Changes

1. **app/tasks/page.tsx**
   - Added `latestCompletionIntent` ref for intent tracking
   - Added `correctionsNeeded` state for queuing corrections
   - Modified `handleCompleteTask`/`handleUncompleteTask` to record intent and check staleness
   - Added correction processing effect
   - Updated cleanup effect to queue corrections
   - Changed invalidation to exact query match

2. **components/tasks/task-row.tsx**
   - Added `onClick={(e) => e.stopPropagation()}` to Checkbox

3. **lib/queries/use-task-mutations.ts**
   - Removed `onSuccess` handlers from `useCompleteTask` and `useUncompleteTask`
   - Cache updates now handled by page-level handlers

## Key Learnings

### 1. Server Response Order ≠ Request Order

**Never assume** server responses will arrive in the same order requests were sent. Network latency, server processing time, and database operations can cause responses to arrive out of order.

**Solution:** Always track request timestamps and ignore stale responses.

### 2. Optimistic Updates Need Intent Tracking

Optimistic updates are great for perceived performance, but when mutations can happen rapidly, you need to track **user intent** separately from **current server state**.

**Pattern:**
```
User Intent (client) → Optimistic State → Server Request → Server Response
                                             ↓
                                  Check: Is this still the latest intent?
                                             ↓
                                  Yes: Apply | No: Ignore
```

### 3. Eventual Consistency with Auto-Correction

In distributed systems (client-server), achieving immediate consistency is hard. Instead:
1. Apply optimistic updates for instant feedback
2. Detect inconsistencies after server sync
3. Automatically correct them

This provides both good UX and guaranteed correctness.

### 4. Query Invalidation Scope Matters

Be careful with query key matching:
- **Broad match** `{ queryKey: ["tasks"] }` → Matches all tasks queries
- **Exact match** `{ queryKey: ["tasks", {...}], exact: true }` → Matches only this specific query

Use exact matching when you have multiple related queries to avoid cascading refetches.

### 5. Event Bubbling in Complex UIs

In nested interactive elements (checkbox inside clickable row), always:
- Use `stopPropagation()` on inner elements
- Prevent default where needed
- Test rapid interactions to expose race conditions

## Testing Checklist

When fixing similar race condition bugs:

- [ ] Test rapid clicks (double-click, triple-click)
- [ ] Test with network throttling (slow 3G)
- [ ] Check terminal for duplicate API calls
- [ ] Verify only one refetch after mutations settle
- [ ] Test check → uncheck sequence
- [ ] Test uncheck → check sequence
- [ ] Verify task ends up in correct state
- [ ] Verify no UI flickering
- [ ] Check for orphaned optimistic state
- [ ] Test with multiple tasks simultaneously

## Prevention

To prevent similar bugs in the future:

1. **Always track intent with timestamps** when rapid mutations are possible
2. **Detect stale responses** before applying cache updates
3. **Implement auto-correction** for eventual consistency
4. **Use exact query matching** when multiple related queries exist
5. **Isolate nested interactive elements** with stopPropagation
6. **Test rapid interactions** during development

## References

- **Issue tracking:** Used `bd` commands during development
- **Related patterns:** Optimistic updates, eventual consistency, client-server sync
- **React Query docs:** [Optimistic Updates](https://tanstack.com/query/latest/docs/react/guides/optimistic-updates)
- **Similar bugs:** See `docs/debug-heat-jumping-issue.md` for related race condition patterns

## Timeline

- **Initial report:** Task disappearing on rapid check/uncheck
- **Investigation:** Identified server response ordering as root cause
- **Attempted fixes:** flushSync, debouncing, pending tracking (partial success)
- **Final solution:** Intent tracking + stale detection + auto-correction
- **Resolution:** Bug fixed with comprehensive client-server sync strategy
