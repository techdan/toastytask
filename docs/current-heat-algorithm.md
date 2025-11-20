# Current Heat Algorithm

**Date:** 2025-11-20 (Updated to reflect hybrid architecture)
**Status:** ✅ Implemented (Current System)
**Version:** Point-Based (0-145 scale)

This document describes the current heat system architecture, which uses a **hybrid calculate-and-cache approach**. Heat values are stored in the database for fast sorting performance and recalculated fresh on the client for display accuracy.

---

## Current Architecture: HYBRID APPROACH

The heat system uses a **two-stage hybrid pattern** that balances database sorting performance with display accuracy:

### Stage 1: Cached Database Values (Performance)

**Purpose:** Enable fast database-level sorting for initial page load and large task lists

**Implementation:**
- Server calculates heat when mutations occur
- Writes calculated value to `heat` column in database
- Database uses `heatSortIdx` index for fast ORDER BY operations
- Enables efficient "top N" queries without calculating all tasks

**Code:**
```typescript
// Server updates heat in database
await taskRepository.updateHeat(taskId, calculatedHeat, userId);

// Database sorts using indexed column
SELECT * FROM tasks
WHERE user_id = ? AND deleted_at IS NULL
ORDER BY heat DESC
LIMIT 50;
```

**Files:**
- Schema: [lib/db/schema.ts](../lib/db/schema.ts) - `heat` column (line 62)
- Repository: [lib/db/repositories/task-repository.ts](../lib/db/repositories/task-repository.ts) - `updateHeat()` method
- Index: `heatSortIdx` on `(heat, completedAt)` for efficient queries

### Stage 2: Fresh Client Calculations (Accuracy)

**Purpose:** Ensure displayed heat values reflect current time, timezone, and due date status

**Implementation:**
- Client fetches tasks with stored `heat` values from database
- Immediately recalculates fresh heat on every render
- Uses fresh values for display badges, tooltips, and client-side operations
- Fresh calculations ensure timezone accuracy and current due date status

**Code:**
```typescript
// Client calculates fresh heat on render
const tasksWithFresh = tasks.map((task) => ({
  ...task,
  _freshHeat: calculateHeat(task, new Date(), freshImportance),
}));

// Use fresh value for display
<HeatBadge heat={task._freshHeat} />
```

**Files:**
- Calculation: [lib/scoring/heat-v3.ts](../lib/scoring/heat-v3.ts) - `calculateHeat()` function
- Types: [types/index.ts](../types/index.ts) - `TaskWithFreshValues` type
- Usage: [lib/queries/use-task-mutations.ts](../lib/queries/use-task-mutations.ts)

### Why Hybrid Instead of Pure Calculation?

**Performance at scale:**
- Database can sort 1000+ tasks efficiently using indexed `heat` column
- Pure calculation would require fetching ALL tasks and sorting in-memory on every query
- Hybrid enables fast initial page load (DB sorts) with accurate display (client recalculates)
- Critical for queries like "show me my top 50 hottest tasks" (can use LIMIT with index)

**Real-world benefit:**
```typescript
// WITH hybrid (current system):
// Database sorts 1000 tasks using index → returns top 50 → O(log n) with index
// Client recalculates heat for 50 tasks → fast

// WITHOUT hybrid (pure calculation):
// Database fetches all 1000 tasks → client calculates heat for all 1000 → sorts → takes top 50
// Much slower for large task lists
```

**Decision rationale:**
- See [docs/Archive/heat-cleanup-plan.md](Archive/heat-cleanup-plan.md) for full analysis
- Hybrid approach chosen after evaluating pure calculation, full list responses, version control, etc.
- Production testing showed hybrid provides best balance of performance and accuracy

---

## Heat Calculation Formula

### Point-Based Scoring (0-145 range)

Heat is calculated using a point-based system with three components:

```typescript
function calculateHeat(
  task: TaskBase,
  now: Date,
  importance: number
): number {
  const basePoints = calculateBasePoints(task, now, importance);
  const adjustment = task.heatAdjustment ?? 0;

  return clamp(
    basePoints + adjustment,
    HEAT_CONFIG.MIN_FINAL_SCORE,    // 0
    HEAT_CONFIG.MAX_FINAL_SCORE     // 145
  );
}
```

### Component 1: Base Points (0-100)

**Importance contribution** (0-100 points):
- Maps importance (2-14 scale) to heat contribution
- Formula: `(importance - minImportance) / importanceRange × 100`
- Example: Importance 14 → 100 points, Importance 2 → 0 points

**Time decay** (applied to base):
- Tasks lose heat over time based on bucket half-life
- Formula: `basePoints × (0.5 ^ (hoursSinceTouch / halfLife))`
- Half-lives:
  - TODO bucket: 48 hours (decays quickly)
  - WATCH bucket: 168 hours (7 days)
  - LATER bucket: 720 hours (30 days)

**New task boost:**
- Tasks created within last 24 hours get bonus heat
- Formula: `newTaskBoost × (0.5 ^ (age / newTaskHalfLife))`
- Default: 70-point boost, 24-hour half-life

### Component 2: Manual Adjustments (-45 to +45 points)

**User heat/cool actions:**
- Stored as `heatAdjustment` in database (persistent)
- Context-aware positioning determines adjustment magnitude
- Heating: Move task up 1-3 positions = add ~5-15 points
- Cooling: Move task down 1-3 positions = subtract ~5-15 points

**Adjustment calculation:**
```typescript
function calculateHeatBoost(
  currentTask: { id: number; heat: number },
  visibleTasks: Array<{ id: number; heat: number }>,
  direction: 'up' | 'down'
): number {
  const currentIndex = visibleTasks.findIndex(t => t.id === currentTask.id);
  const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;

  if (targetIndex < 0 || targetIndex >= visibleTasks.length) {
    return direction === 'up' ? 10 : -10; // Default adjustment
  }

  const targetHeat = visibleTasks[targetIndex].heat;
  const heatDelta = targetHeat - currentTask.heat;

  // Move to just above/below target task
  return direction === 'up'
    ? heatDelta + 1  // Move above target
    : heatDelta - 1; // Move below target
}
```

**Clamping:**
- Single adjustment clamped to ±45 points
- Total heat clamped to 0-145 range

### Component 3: Final Clamping (0-145)

**Range enforcement:**
```typescript
const HEAT_CONFIG = {
  MIN_FINAL_SCORE: 0,
  MAX_FINAL_SCORE: 145,
};

return Math.max(
  HEAT_CONFIG.MIN_FINAL_SCORE,
  Math.min(HEAT_CONFIG.MAX_FINAL_SCORE, basePoints + adjustment)
);
```

---

## Data Flow

### Initial Page Load

```
1. Client requests tasks
2. Database query with ORDER BY heat (uses heatSortIdx index)
3. Server returns tasks with stored heat values
4. Client immediately recalculates fresh heat:
   - _freshHeat = calculateHeat(task, now, freshImportance)
5. Client uses fresh values for display
6. If stored heat is stale (|stored - fresh| > threshold):
   - Background update to database (non-blocking)
```

**Code path:**
- API: [app/api/tasks/route.ts](../app/api/tasks/route.ts) - GET handler
- Client: [lib/queries/use-tasks.ts](../lib/queries/use-tasks.ts) - TanStack Query hook

### User Updates Task (Priority, Due Date, Star)

```
1. Client sends mutation request
2. Server updates base properties (priority, dueAt, starLevel)
3. Server recalculates fresh heat:
   - freshImportance = calculateImportanceV1(updatedTask, now)
   - freshHeat = calculateHeat(updatedTask, now, freshImportance)
4. Server writes fresh heat to database:
   - await taskRepository.updateHeat(taskId, freshHeat, userId)
5. Server returns updated task with new heat value
6. Client refetches and recalculates fresh values
```

**Code path:**
- API: [app/api/tasks/[id]/route.ts](../app/api/tasks/[id]/route.ts) - PATCH handler (lines 51-64)
- Repository: [lib/db/repositories/task-repository.ts](../lib/db/repositories/task-repository.ts) - `updateHeat()`

### User Clicks Heat/Cool Button

```
1. Client calculates fresh heat for current task and visible neighbors
2. Client sends mutation:
   - { taskId, visibleTaskIds: [sorted array of IDs] }
3. Server fetches tasks by IDs
4. Server calculates fresh heat for ALL tasks (current + neighbors)
5. Server runs context-aware positioning logic on fresh values
6. Server calculates adjustment delta:
   - delta = targetHeat - currentHeat + epsilon
7. Server updates heatAdjustment:
   - newAdjustment = currentAdjustment + clamp(delta, -45, +45)
8. Server recalculates final heat with new adjustment
9. Server writes updated heatAdjustment and heat to database
10. Server returns updated task
11. Client refetches and recalculates fresh values
```

**Code path:**
- Client: [lib/queries/use-task-mutations.ts](../lib/queries/use-task-mutations.ts) - `useHeatTaskMutation()`
- API: [app/api/tasks/[id]/heat/route.ts](../app/api/tasks/[id]/heat/route.ts) - POST handler
- Calculation: [lib/scoring/heat-v3.ts](../lib/scoring/heat-v3.ts) - `calculateHeatBoost()`

### Automatic Background Refresh

```
1. TanStack Query refetches tasks periodically (staleTime: 5 minutes)
2. Database returns tasks with stored heat values
3. Client recalculates fresh heat for all tasks
4. Client identifies stale tasks: |stored - fresh| > 0.0001
5. For stale tasks:
   - Background API call updates database heat (non-blocking)
   - User sees fresh values immediately (no wait)
6. Next refetch will have updated stored values
```

**Code path:**
- API: [app/api/tasks/route.ts](../app/api/tasks/route.ts) - Staleness check (lines 56-63)
- Utility: [lib/scoring/heat-v3.ts](../lib/scoring/heat-v3.ts) - `isHeatStale()` function

---

## Tradeoffs and Considerations

### Accepted Tradeoffs

✅ **Fast database sorting** - 1000+ tasks sort efficiently using index
✅ **Accurate display** - Fresh calculations reflect current time/timezone
✅ **Scales well** - Database handles sorting, client handles accuracy
✅ **Simple maintenance** - Clear separation: DB for ORDER BY, client for display

⚠️ **Staleness between mutations** - Stored values become stale over time
- **Mitigation:** Client immediately recalculates fresh values on render
- **Impact:** User always sees accurate values; staleness only affects database queries
- **Acceptable:** Fresh calculation is fast; staleness doesn't hurt UX

⚠️ **Data duplication** - Same value stored and calculated
- **Mitigation:** Clear usage pattern (stored for DB sorting, calculated for display)
- **Impact:** Additional storage (4 bytes per task for `heat` column)
- **Acceptable:** Storage cost is negligible compared to performance benefit

⚠️ **Two sources of truth** - Stored vs calculated
- **Mitigation:** Fresh calculation is always authoritative for display
- **Impact:** Developers must understand hybrid pattern
- **Acceptable:** Well-documented in code and this doc

### Benefits Over Pure Calculation

| Aspect | Hybrid (Current) | Pure Calculation |
|--------|-----------------|------------------|
| **Initial page load** | Fast (DB sorts) | Slower (fetch all, sort in-memory) |
| **Display accuracy** | Perfect (fresh calc) | Perfect (fresh calc) |
| **Database queries** | Efficient with LIMIT | Must fetch all tasks |
| **Task count scaling** | O(log n) with index | O(n) always |
| **Memory usage** | Low (fetch top N) | High (fetch all for sorting) |
| **Staleness** | Stored values stale | No stored values |

**Conclusion:** Hybrid provides better performance for typical use cases (100-1000 tasks per user) while maintaining display accuracy through fresh calculations.

### When to Reconsider Pure Calculation

Consider migrating to pure calculation if:
- ✅ Task counts regularly exceed 5000+ items (in-memory sorting becomes viable)
- ✅ Performance profiling shows calculation overhead is negligible at scale
- ✅ Staleness becomes a user-visible problem (unlikely with fresh client calculations)
- ✅ Database migration to system that doesn't support efficient indexes

For now, hybrid is the right balance for production usage patterns.

---

## Implementation Details

### Database Schema

```typescript
// lib/db/schema.ts
export const tasks = pgTable("tasks", {
  // ... other fields

  // Heat model fields
  heat: real("heat").notNull().default(0.5),
  heatCalculatedAt: timestamp("heat_calculated_at", {
    mode: "date",
    withTimezone: true
  }),
  heatAdjustment: real("heat_adjustment").notNull().default(0),
  lastHeatTouchedAt: timestamp("last_heat_touched_at", {
    mode: "date",
    withTimezone: true
  }),
  lastTouchedAt: timestamp("last_touched_at", {
    mode: "date",
    withTimezone: true
  }),
  touchCount: integer("touch_count").notNull().default(0),

  // Importance field (also cached for performance)
  importanceV1: integer("importance_v1").notNull().default(0),
}, (table) => ({
  // Index for sorting by heat
  heatSortIdx: index("tasks_heat_sort_idx")
    .on(table.heat, table.completedAt),
}));
```

**Column purposes:**
- `heat`: Cached value for database ORDER BY (performance)
- `heatCalculatedAt`: Timestamp when heat was last calculated (staleness detection)
- `heatAdjustment`: User's manual adjustments (-45 to +45 points)
- `lastHeatTouchedAt`: When user last clicked heat/cool (decay calculation)
- `lastTouchedAt`: When task was last modified (activity tracking)
- `touchCount`: Number of times task was touched (unused in v3)
- `importanceV1`: Cached importance for heat calculation (performance)

### TypeScript Types

```typescript
// types/index.ts

/**
 * TaskWithFreshValues - Extended task with fresh calculated values
 *
 * HYBRID ARCHITECTURE:
 * - task.heat & task.importanceV1 are cached in DB for sorting
 * - _freshHeat & _freshImportance are calculated on render for display
 *
 * Usage:
 * - DB queries use task.heat for ORDER BY
 * - UI components use _freshHeat for display
 * - Always prefer fresh values for user-facing operations
 */
export type TaskWithFreshValues = Task & {
  _freshImportance: number; // Fresh importance (2-14 scale)
  _freshHeat: number;       // Fresh heat (0-145 scale)
};
```

### Calculation Functions

```typescript
// lib/scoring/heat-v3.ts

/**
 * Calculate heat for a task
 *
 * HYBRID USAGE:
 * - Server calls this when mutations occur, writes result to DB
 * - Client calls this on every render, uses result for display
 *
 * @param task - Task with heatAdjustment and timing fields
 * @param now - Current timestamp (injected for testability)
 * @param importance - Pre-calculated importance (2-14 scale)
 * @returns Heat value (0-145 scale)
 */
export function calculateHeat(
  task: Pick<Task, "heatAdjustment" | "lastTouchedAt" | "lastHeatTouchedAt">,
  now: Date,
  importance: number
): number {
  // Calculate base points from importance (0-100)
  const basePoints = calculateBasePoints(importance, task, now);

  // Add manual adjustment (-45 to +45)
  const adjustment = task.heatAdjustment ?? 0;

  // Clamp to valid range (0-145)
  return clamp(
    basePoints + adjustment,
    HEAT_CONFIG.MIN_FINAL_SCORE,
    HEAT_CONFIG.MAX_FINAL_SCORE
  );
}

/**
 * Check if stored heat is stale and needs update
 *
 * Used by server to identify tasks needing background refresh
 *
 * @param heatCalculatedAt - When heat was last calculated
 * @param now - Current timestamp
 * @returns True if heat should be recalculated
 */
export function isHeatStale(
  heatCalculatedAt: Date | null | undefined,
  now: Date
): boolean {
  if (!heatCalculatedAt) return true;

  const age = now.getTime() - heatCalculatedAt.getTime();
  const staleThreshold = 24 * 60 * 60 * 1000; // 24 hours

  return age > staleThreshold;
}
```

### Client-Side Usage

```typescript
// lib/queries/use-tasks.ts

export function useTasks() {
  return useQuery({
    queryKey: ["tasks"],
    queryFn: async () => {
      const response = await fetch("/api/tasks");
      const { tasks } = await response.json();

      // Calculate fresh values immediately after fetch
      const now = new Date();
      return tasks.map((task: Task): TaskWithFreshValues => {
        const freshImportance = calculateImportanceV1(task, now);
        const freshHeat = calculateHeat(task, now, freshImportance);

        return {
          ...task,
          _freshImportance: freshImportance,
          _freshHeat: freshHeat,
        };
      });
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}
```

### Server-Side Usage

```typescript
// app/api/tasks/[id]/route.ts (PATCH handler)

const task = await taskRepository.update(taskId, updates, userId);

// Recalculate heat using fresh importance
const now = new Date();
let freshImportance: number | undefined;
if (
  updates.priority !== undefined ||
  updates.starLevel !== undefined ||
  updates.dueAt !== undefined
) {
  freshImportance = calculateImportanceV1(task, now);
}

const recalculatedHeat = calculateHeat(task, now, freshImportance);
await taskRepository.updateHeat(taskId, recalculatedHeat, userId);

const finalTask = await taskRepository.findById(taskId, userId);
return NextResponse.json({ task: finalTask ?? task });
```

---

## Testing Guidelines

### Unit Tests: Calculation Functions

Test heat calculation with frozen time:

```typescript
import { calculateHeat } from "@/lib/scoring/heat-v3";

describe("calculateHeat", () => {
  const now = new Date("2025-01-15T12:00:00Z");

  test("calculates heat from importance + adjustment", () => {
    const task = {
      heatAdjustment: 10,
      lastTouchedAt: null,
      lastHeatTouchedAt: null,
    };
    const importance = 14; // Max importance

    const heat = calculateHeat(task, now, importance);

    // Expect: 100 (max base points) + 10 (adjustment) = 110
    expect(heat).toBe(110);
  });

  test("clamps heat to valid range", () => {
    const task = {
      heatAdjustment: 100, // Excessive adjustment
      lastTouchedAt: null,
      lastHeatTouchedAt: null,
    };
    const importance = 14; // Max importance

    const heat = calculateHeat(task, now, importance);

    // Expect: Clamped to max (145)
    expect(heat).toBe(145);
  });

  test("applies time decay to base points", () => {
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const task = {
      heatAdjustment: 0,
      lastTouchedAt: oneDayAgo,
      lastHeatTouchedAt: oneDayAgo,
    };
    const importance = 14;

    const heat = calculateHeat(task, now, importance);

    // Expect: Base points reduced by ~50% due to 24h decay (48h half-life)
    expect(heat).toBeLessThan(100);
    expect(heat).toBeGreaterThan(60);
  });
});
```

### Integration Tests: API Endpoints

Test hybrid pattern in API handlers:

```typescript
describe("PATCH /api/tasks/[id]", () => {
  test("updates stored heat when base properties change", async () => {
    const task = await createTestTask({
      priority: "medium",
      dueAt: null,
      starLevel: 0,
    });

    // Update priority
    const response = await fetch(`/api/tasks/${task.id}`, {
      method: "PATCH",
      body: JSON.stringify({ priority: "high" }),
    });

    const { task: updated } = await response.json();

    // Verify stored heat was recalculated
    expect(updated.heat).toBeGreaterThan(task.heat);
    expect(updated.heatCalculatedAt).not.toBe(task.heatCalculatedAt);
  });
});
```

### Client Tests: Fresh Calculation

Test client-side fresh value calculation:

```typescript
import { render, screen } from "@testing-library/react";
import TaskList from "@/components/task-list";

describe("TaskList", () => {
  test("displays fresh heat values, not stored values", () => {
    const tasks = [
      {
        id: 1,
        title: "Test Task",
        heat: 50, // Stored (stale) value
        heatCalculatedAt: new Date("2025-01-01"), // Old
        priority: "high",
        dueAt: new Date(), // Due today
        starLevel: 3,
        heatAdjustment: 0,
      },
    ];

    render(<TaskList tasks={tasks} />);

    // Client should calculate fresh heat based on current time
    // Expected: High priority + due today + orange star = high importance = high heat
    const heatBadge = screen.getByTestId("heat-badge");
    expect(heatBadge).toHaveTextContent(/^([8-9][0-9]|1[0-4][0-9])$/); // 80-145 range
    // NOT the stored value of 50
  });
});
```

---

## Best Practices

### For Developers

**Always use fresh values for display:**
```typescript
// ✅ CORRECT: Use fresh calculated value
<HeatBadge heat={task._freshHeat} />

// ❌ WRONG: Use stored value (may be stale)
<HeatBadge heat={task.heat} />
```

**Use stored values only for database queries:**
```typescript
// ✅ CORRECT: Use stored value for ORDER BY
const tasks = await db.query.tasks.findMany({
  orderBy: (tasks, { desc }) => [desc(tasks.heat)],
});

// ❌ WRONG: Calculate heat in SQL (not possible)
// Cannot do: ORDER BY calculateHeat(...)
```

**Always recalculate heat after mutations:**
```typescript
// ✅ CORRECT: Recalculate and update stored value
const freshImportance = calculateImportanceV1(task, now);
const freshHeat = calculateHeat(task, now, freshImportance);
await taskRepository.updateHeat(taskId, freshHeat, userId);

// ❌ WRONG: Trust old stored value
// Server must always calculate fresh heat after base property changes
```

**Inject `now` for testability:**
```typescript
// ✅ CORRECT: Accept now as parameter
export function calculateHeat(task: Task, now: Date, importance: number) {
  // Use injected now for all time calculations
}

// ❌ WRONG: Use current time inside function
export function calculateHeat(task: Task, importance: number) {
  const now = new Date(); // Makes tests non-deterministic
}
```

### For Database Queries

**Use index for large result sets:**
```sql
-- ✅ CORRECT: Use heat index for sorting
SELECT * FROM tasks
WHERE user_id = ? AND deleted_at IS NULL
ORDER BY heat DESC
LIMIT 50;
-- Uses heatSortIdx index

-- ⚠️ AVOID: Fetching all tasks for client-side sorting
SELECT * FROM tasks WHERE user_id = ?;
-- Client must fetch and sort thousands of tasks
```

**Refresh stale heat in background:**
```typescript
// ✅ CORRECT: Non-blocking background update
if (isHeatStale(task.heatCalculatedAt, now)) {
  // Don't await - update in background
  taskRepository.updateHeat(taskId, freshHeat, userId).catch(console.error);
}
return task; // Return immediately with fresh calculated value
```

### For UI Components

**Calculate fresh values in data layer, not UI:**
```typescript
// ✅ CORRECT: Calculate in query hook
export function useTasks() {
  return useQuery({
    queryKey: ["tasks"],
    queryFn: async () => {
      const tasks = await fetchTasks();
      return tasks.map(addFreshValues); // Add _freshHeat here
    },
  });
}

// ❌ WRONG: Calculate in component
function TaskItem({ task }) {
  const freshHeat = calculateHeat(task, new Date(), ...); // Recalculates on every render
  return <div>{freshHeat}</div>;
}
```

**Use useMemo for expensive calculations:**
```typescript
// ✅ CORRECT: Memoize if needed
const sortedTasks = useMemo(() => {
  return tasks.sort((a, b) => b._freshHeat - a._freshHeat);
}, [tasks]);

// ⚠️ CONSIDER: For small lists, memoization may not be needed
// Profile before optimizing
```

---

## Maintenance Notes

### Monitoring Staleness

Track how often stored heat diverges from fresh calculations:

```typescript
// Add to API handler
const freshnessMetrics = tasks.map((task) => {
  const freshHeat = calculateHeat(task, now, freshImportance);
  const storedHeat = task.heat;
  const divergence = Math.abs(freshHeat - storedHeat);
  return { taskId: task.id, divergence };
});

// Log max divergence
const maxDivergence = Math.max(...freshnessMetrics.map((m) => m.divergence));
if (maxDivergence > 10) {
  console.warn(`Max heat divergence: ${maxDivergence} points`);
}
```

### Background Refresh Job (Optional)

Recalculate stale heat values daily:

```typescript
// Run at 00:05 after due dates roll over
async function refreshStaleHeat() {
  const staleThreshold = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const staleTasks = await db.query.tasks.findMany({
    where: (tasks, { lt, or, isNull }) =>
      or(
        lt(tasks.heatCalculatedAt, staleThreshold),
        isNull(tasks.heatCalculatedAt)
      ),
  });

  const now = new Date();
  for (const task of staleTasks) {
    const freshImportance = calculateImportanceV1(task, now);
    const freshHeat = calculateHeat(task, now, freshImportance);
    await taskRepository.updateHeat(task.id, freshHeat, task.userId);
  }

  console.log(`Refreshed heat for ${staleTasks.length} tasks`);
}
```

### Schema Evolution

If migrating to pure calculation in the future:

1. **Phase 1:** Stop writing to `heat` column (but keep reading)
2. **Phase 2:** Verify client-side sorting performs well at scale
3. **Phase 3:** Drop `heat` column and `heatSortIdx` index
4. **Phase 4:** Update all queries to calculate heat in-memory

**Rollback plan:** Keep `heat` column for 30 days after Phase 1 before dropping.

---

## Historical Analysis: Pure Calculation Evaluation

**Note:** The sections below document the analysis that led to choosing the hybrid approach. They are preserved for reference but do NOT represent the current system.

---

### Problem Statement (Historical Context)

When this architecture was being designed, the system had **data consistency issues** caused by maintaining multiple representations of heat:

1. **Stored heat** (`task.heat` in database) - became stale between fetches
2. **Cached heat** (`task.heat` in TanStack Query) - mirrored stored staleness
3. **Fresh calculated heat** (`_freshHeat` on client) - accurate but not used by mutations
4. **Optimistic heat** (calculated in `onMutate`) - used stale baseline
5. **Server recalculated heat** - trusted stale persisted value before context math

This led to:
- Context-aware adjustments clamping at ±5/±10 when larger jumps were justified
- Visual inconsistencies between optimistic and server updates
- First click after idle period always used stale baseline
- Race conditions during rapid interactions

**Core Issue:** Heat has two components:
- **Calculated base:** Derived from importance, due date, etc. (decays over time)
- **Manual adjustments:** User heat/cool actions (stored as `heatAdjustment`)

The calculated base became stale when cached, but we needed it for context-aware positioning.

---

### Architecture Options Evaluated

Multiple approaches were considered to solve the staleness problem:

#### Option 1: Pure Calculation

**Principle:** Heat is NEVER stored, only calculated on demand from stored adjustments.

**Benefits:**
- ✅ No staleness - Heat always calculated fresh from current time
- ✅ Single source of truth - The calculation function itself
- ✅ Client/server consistency - Both use identical calculation
- ✅ Minimal data transfer - Only send task IDs for context
- ✅ Accurate optimistic updates - Client calculates exactly what server will

**Challenges:**
- ⚠️ Performance - Must calculate heat for ALL tasks to sort
- ⚠️ Cannot use database LIMIT efficiently - Must fetch all to sort
- ⚠️ Scales poorly beyond 5000+ tasks

**Verdict:** Good for small task lists, poor for large-scale production use.

#### Option 2: Server Returns Full Sorted List

**Principle:** Server does ALL calculations and returns complete sorted list.

**Benefits:**
- ✅ Server is absolute authority

**Challenges:**
- ❌ Large payload - sending all tasks on every mutation
- ❌ Inefficient - wasteful data transfer
- ❌ Harder to do optimistic updates

**Verdict:** Not recommended due to inefficiency and UX concerns.

#### Option 3: Store Heat with Version Control

**Principle:** Store calculated heat but include version/timestamp. Reject stale requests.

**Benefits:**
- ✅ Prevents acting on stale data

**Challenges:**
- ❌ Still stores heat (adds version complexity)
- ❌ Frequent rejections during rapid interactions
- ❌ Adds latency (reject → refetch → retry)

**Verdict:** Adds complexity without solving root cause.

#### Option 4: Aggressive Background Updates

**Principle:** Keep stored heat but update it constantly via background job.

**Benefits:**
- ✅ Keeps stored heat relatively fresh

**Challenges:**
- ❌ Still stores heat (adds background job)
- ❌ Can still be stale between updates
- ❌ Adds server load and database write amplification

**Verdict:** Band-aid solution that adds operational complexity.

#### Option 5: Client Sends Fresh Heat Values

**Principle:** Client calculates fresh heat and sends it with every request.

**Benefits:**
- ✅ Server has fresh context immediately

**Challenges:**
- ❌ Larger payload (sending heat for all visible tasks)
- ❌ Trust boundary - client could send malicious values
- ❌ Clock skew issues (client/server time difference)

**Verdict:** Workable but less clean than hybrid. Unnecessary data transfer.

---

### Why Hybrid Was Chosen

After evaluating all options, the hybrid approach was chosen because:

**Performance at production scale:**
- Real-world task lists often contain 100-1000 tasks per user
- Database sorting with index (hybrid) is O(log n)
- Pure calculation requires O(n) fetch + O(n log n) sort
- For "show me top 50 tasks" query, hybrid is significantly faster

**Acceptable tradeoffs:**
- Staleness of stored values is not user-visible (client immediately recalculates)
- Storage cost is negligible (4 bytes per task)
- Two sources of truth is manageable with clear documentation

**Real-world testing:**
- Production usage showed hybrid provides excellent UX
- Initial page load is fast (database sorts)
- Display is accurate (client recalculates)
- No user-reported staleness issues

**Future flexibility:**
- Hybrid can migrate to pure calculation if needed
- Database column can be dropped in future without breaking client
- Keeps architecture options open as scale increases

---

## Conclusion

The current heat system uses a **hybrid calculate-and-cache pattern** that provides:

✅ **Fast initial page load** - Database sorts using indexed `heat` column
✅ **Accurate display** - Client recalculates fresh values for current time/timezone
✅ **Scales to 1000+ tasks** - Database sorting is efficient with index support
✅ **Simple to maintain** - Clear separation: DB for sorting, client for display

### Accepted Tradeoffs

⚠️ **Staleness** - Stored values are stale between mutations (acceptable because client immediately recalculates)
⚠️ **Data duplication** - Same calculation stored and computed (acceptable for performance)
⚠️ **Two sources of truth** - Stored vs calculated (mitigated by clear usage: DB for ORDER BY, client for display)

### When to Reconsider

Consider migrating to pure calculation if:
- Task counts regularly exceed 5000+ items
- In-memory sorting performance improves significantly
- Staleness becomes a user-visible problem
- Performance profiling shows calculation overhead is negligible

For typical usage patterns (100-1000 tasks per user), the hybrid approach is the optimal balance of performance and accuracy.

---

## See Also

- [docs/Archive/heat-cleanup-plan.md](Archive/heat-cleanup-plan.md) - Full analysis of hybrid vs pure calculation decision
- [docs/current-importance-algorithm.md](current-importance-algorithm.md) - Importance system (also uses hybrid pattern)
- [lib/scoring/heat-v3.ts](../lib/scoring/heat-v3.ts) - Heat calculation implementation
- [lib/scoring/importance-v1.ts](../lib/scoring/importance-v1.ts) - Importance calculation implementation
- [types/index.ts](../types/index.ts) - `TaskWithFreshValues` type definition
