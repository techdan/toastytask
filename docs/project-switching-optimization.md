# Project Switching Performance Analysis

**Status:** Analysis complete, implementation pending
**Last Updated:** 2025-12-26

---

## Problem Statement

Switching between projects (especially "All Projects" ↔ "Focus") has noticeable lag (1-2 seconds in dev mode). The goal is to make project/focus switching feel instantaneous.

---

## Current Architecture

### Data Flow When `selectedProjectId` Changes

```
selectedProjectId changes
    ↓
1. allFetchedTasks (useMemo)     → filters by project           → O(n)
    ↓
2. taskById (useMemo)            → builds Map                   → O(n)
    ↓
3. activeTasks (useMemo)         → enriches each task           → O(n) × EXPENSIVE
   ├─ calculateImportanceV1()    → date math, conditionals
   └─ calculateHeat()            → more date calculations
    ↓
4. sortedActiveIds (useMemo)     → sorts                        → O(n log n)
    ↓
5. useEffect                     → setTaskOrder()               → triggers re-render
    ↓
6. orderedActiveTasks (useMemo)  → reorders                     → O(n)
    ↓
7. displayedTasks (useMemo)      → concatenates                 → O(n)
    ↓
8. TaskList renders              → maps over tasks
    ↓
9. N × TaskRow                   → 484 lines each, no memo
```

### Key Files

| File | Role |
|------|------|
| `app/tasks/page.tsx` | Main page, filtering, state management |
| `components/tasks/task-list.tsx` | Renders task table/list |
| `components/tasks/task-row.tsx` | Individual task row (484 lines) |
| `lib/scoring/heat-v3.ts` | Heat calculation |
| `lib/scoring/importance-v1.ts` | Importance calculation |

---

## Identified Bottlenecks

### 1. Heat/Importance Recalculation on Every Filter (HIGH IMPACT)

**Location:** `page.tsx:632-634`

```typescript
allFetchedTasks.forEach((task) => {
  const freshImportance = calculateImportanceV1(task, now);
  const freshHeat = calculateHeat(task, now, freshImportance);
  // ...
});
```

Every project switch recalculates heat and importance for ALL tasks in the filtered set. These functions involve:
- Date parsing and comparison
- Time decay calculations
- Multiple conditionals

**Cost:** O(n) expensive operations on every filter change.

### 2. TaskRow Not Memoized (HIGH IMPACT)

**Location:** `task-row.tsx`

- 484 lines per component
- Contains multiple sub-components (PrioritySelect, RecurrenceSelect, DueDateDisplay, etc.)
- No `React.memo()` wrapper
- All rows re-render even when their data hasn't changed

**Cost:** Full re-render of every visible task row on any state change.

### 3. useEffect Triggers setState (MEDIUM IMPACT)

**Location:** `page.tsx:689`

```typescript
useEffect(() => {
  // ...
  setTaskOrder(sortedActiveIds);  // Causes extra render cycle
  // ...
}, [activeTasks, selectedProjectId, sortMode, sortDirection, sortedActiveIds]);
```

This pattern causes an additional render cycle after the initial filter.

### 4. Cascading useMemo Chain (MEDIUM IMPACT)

Six sequential `useMemo` hooks that all recompute when project changes:
1. `allFetchedTasks`
2. `taskById`
3. `activeTasks/completedTasks`
4. `sortedActiveIds`
5. `orderedActiveTasks`
6. `displayedTasks`

---

## Optimization Options

### Option 1: Memoize TaskRow with `React.memo()`

**What it does:** Prevents TaskRow from re-rendering if its props haven't changed.

**Implementation:**
```typescript
import { memo } from "react";

export const TaskRow = memo(function TaskRow({
  task,
  // ...props
}: TaskRowProps) {
  // ...existing implementation
});
```

**Tradeoffs:**
| Pro | Con |
|-----|-----|
| Simple change (wrap component) | Only helps if props are stable |
| Reduces render work for unchanged tasks | Callbacks need `useCallback` to be stable |
| Low risk | Task object reference changes on every filter (breaks memo without further work) |

**Effectiveness:** LOW without also stabilizing task references and callbacks.

**Effort:** LOW

---

### Option 2: Pre-compute Heat/Importance in Query Layer

**What it does:** Calculate `_freshHeat` and `_freshImportance` once when data arrives from the server, not on every filter operation.

**Implementation:**
- Move enrichment logic to `useTasksQuery` or a post-fetch transform
- Store enriched values in React Query cache
- Only recalculate on:
  - Initial fetch
  - Task mutation (update, complete, etc.)
  - Manual refresh

**Tradeoffs:**
| Pro | Con |
|-----|-----|
| Eliminates expensive calculations on project switch | Heat values become "stale" during long sessions |
| Significant performance improvement | Time-based decay won't update in real-time |
| Works well with existing architecture | Requires refactoring enrichment logic |

**Effectiveness:** HIGH - removes the biggest per-filter cost.

**Effort:** MEDIUM

**Staleness Mitigation:**
- Recalculate on window focus (already implemented for refetch)
- Accept ~1 minute staleness for heat decay (imperceptible to users)
- Always recalculate on mutations

---

### Option 3: Virtualize the Task List

**What it does:** Only render visible rows using windowing (e.g., `@tanstack/react-virtual` or `react-window`).

**Implementation:**
```typescript
import { useVirtualizer } from '@tanstack/react-virtual';

function TaskList({ tasks }) {
  const parentRef = useRef(null);

  const virtualizer = useVirtualizer({
    count: tasks.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 48, // row height
  });

  return (
    <div ref={parentRef} style={{ height: '600px', overflow: 'auto' }}>
      <div style={{ height: virtualizer.getTotalSize() }}>
        {virtualizer.getVirtualItems().map((virtualRow) => (
          <TaskRow key={tasks[virtualRow.index].id} task={tasks[virtualRow.index]} />
        ))}
      </div>
    </div>
  );
}
```

**Tradeoffs:**
| Pro | Con |
|-----|-----|
| Dramatic improvement for large lists (100+ tasks) | Significant refactor - table structure needs to change |
| DOM node count stays constant | May affect drag-and-drop behavior |
| Industry-standard solution | Adds bundle size (~10KB) |
| | Keyboard navigation may need adjustment |
| | Different scroll behavior |

**Effectiveness:** VERY HIGH for large lists, minimal for small lists.

**Effort:** HIGH

---

### Option 4: Use `startTransition` (IMPLEMENTED)

**What it does:** Marks project switch as non-urgent, allowing React to defer heavy work and keep the sidebar responsive.

**Current Implementation:**
```typescript
const [, startTransition] = useTransition();

const handleSelectProject = useCallback((projectId) => {
  startTransition(() => {
    setSelectedProjectId(projectId);
  });
  // Immediate updates (search clear, URL) happen outside transition
}, []);
```

**Tradeoffs:**
| Pro | Con |
|-----|-----|
| Already implemented | Doesn't reduce total work, just defers it |
| Sidebar updates instantly | User still sees stale list briefly |
| Zero additional complexity | May feel "laggy" if transition takes too long |
| React 18+ native feature | |

**Effectiveness:** LOW-MEDIUM - improves perceived responsiveness but doesn't reduce actual work.

**Effort:** DONE

---

### Option 5: Normalize Task Data Store

**What it does:** Store tasks in a normalized Map/object by ID instead of an array. Filter operations return ID arrays that reference the same task objects.

**Implementation:**
```typescript
// Instead of: Task[]
// Use: { byId: Record<number, Task>, allIds: number[] }

const taskStore = useMemo(() => ({
  byId: Object.fromEntries(allTasks.map(t => [t.id, t])),
  allIds: allTasks.map(t => t.id),
}), [allTasks]);

// Filtering returns stable task references
const filteredIds = useMemo(() =>
  taskStore.allIds.filter(id => {
    const task = taskStore.byId[id];
    return selectedProjectId === "focus" ? task.isFocused : true;
  }),
  [taskStore, selectedProjectId]
);
```

**Tradeoffs:**
| Pro | Con |
|-----|-----|
| Task object references stay stable | Requires significant refactor |
| Enables effective `React.memo()` | Different mental model |
| Standard Redux/Zustand pattern | More indirection |

**Effectiveness:** HIGH when combined with Option 1 (memo).

**Effort:** HIGH

---

### Option 6: Eliminate useEffect → setState Cycle

**What it does:** Derive `taskOrder` directly instead of storing in state and syncing via useEffect.

**Current Problem:**
```typescript
// This causes an extra render cycle
useEffect(() => {
  setTaskOrder(sortedActiveIds);
}, [sortedActiveIds]);
```

**Tradeoffs:**
| Pro | Con |
|-----|-----|
| Removes one render cycle | `taskOrder` is stateful for manual reordering |
| Simpler mental model | Complex to refactor without breaking features |

**Effectiveness:** LOW-MEDIUM

**Effort:** MEDIUM-HIGH (risk of breaking manual ordering)

---

## Recommended Implementation Order

### Phase 1: Quick Wins (1-2 hours)
1. ✅ **startTransition** - Already implemented
2. ✅ **Option 2: Pre-compute heat/importance** - Implemented 2025-12-26

### Phase 2: If Still Slow (2-4 hours)
3. ✅ **Option 1: Memo TaskRow** - Implemented 2025-12-26 (works now that task refs are stable)

### Phase 3: For Large Task Counts (4-8 hours)
4. **Option 3: Virtualization** - Only if users have 100+ active tasks

---

## Implementation Details (2025-12-26)

### Changes Made

**1. Enrich-on-Fetch in `useTasksQuery`** ([lib/queries/use-tasks-query.ts](../lib/queries/use-tasks-query.ts))

Tasks are now enriched with `_freshHeat` and `_freshImportance` immediately when data arrives from the server:

```typescript
const enrichedData = useMemo(() => {
  if (!query.data) return undefined;
  return enrichTasksWithFreshValues(query.data);
}, [query.data]);  // Only runs when server data changes
```

This means:
- Project switching no longer triggers heat/importance recalculation
- Enrichment only happens on: fetch, mutation, window focus
- Time-based staleness is acceptable (5min max, decay half-life is 3-7 days)

**2. Simplified page.tsx filtering** ([app/tasks/page.tsx](../app/tasks/page.tsx#L611-L660))

The useMemo that splits active/completed tasks no longer calls `calculateImportanceV1` or `calculateHeat` - it just uses the pre-enriched values.

**3. Memoized TaskRow** ([components/tasks/task-row.tsx](../components/tasks/task-row.tsx#L60))

TaskRow is now wrapped in `React.memo()` to prevent re-renders when props haven't changed. This works effectively because task object references are now stable during project switching.

### Why This Doesn't Cause Staleness

| Event | What Happens |
|-------|--------------|
| Page load | Fresh fetch → enrichment runs |
| Window focus | `refetchOnWindowFocus: true` → re-enrichment |
| Any mutation | Optimistic update recalculates heat in mutation hooks |
| Project switch | Uses cached enriched data - **no recalculation** |
| 5+ min idle | Next interaction triggers refetch if stale |

The heat decay half-life is 3-7 days, so 5-minute staleness causes <0.1% drift - imperceptible to users

---

## Benchmarking

To measure improvements, add performance marks:

```typescript
const handleSelectProject = useCallback((projectId) => {
  performance.mark('project-switch-start');

  startTransition(() => {
    setSelectedProjectId(projectId);
  });

  // In useEffect watching selectedProjectId:
  requestAnimationFrame(() => {
    performance.mark('project-switch-end');
    performance.measure('project-switch', 'project-switch-start', 'project-switch-end');
    console.log(performance.getEntriesByName('project-switch'));
  });
}, []);
```

**Target:** < 100ms for project switch in production build.

---

## Notes

- Dev mode is significantly slower than production due to React strict mode and lack of optimizations
- Test performance improvements in production build: `npm run build && npm start`
- The current `startTransition` implementation provides acceptable UX for most users
- Consider user feedback before investing in deeper optimizations
