# Focus Feature - Implementation Plan

**Spec:** [focus-attention-boost-v1-spec.md](focus-attention-boost-v1-spec.md)
**Target:** Junior developer implementation guide

---

## Overview

Add a "Focus" toggle to tasks that boosts their score to keep them near the top of the task list until explicitly unfocused. Includes snooze functionality to temporarily suppress the boost until the next morning.

**Core formula:**
```
if (isFocused && !isSnoozed) {
  focusedScore = max(existingScore, 30) * 2
} else {
  focusedScore = existingScore
}
```

---

## Important Architecture Notes

### Focus Only Affects Heat Mode

The app has two sort modes: **Importance** (2-14 scale) and **Heat** (0-145 scale).

- **Importance** is intrinsic: priority + due date + stars. Focus should NOT modify importance.
- **Heat** is dynamic: importance + recency + manual adjustments. Focus boost applies here.

Focus boost is applied inside `calculateHeat()` only. When the user is in Importance sort mode, focused tasks won't be boosted to the top (they'll sort by their natural importance). This is intentional—importance reflects intrinsic priority, not temporary attention.

### Tooltip Breakdown

The `HeatBadge` component shows a detailed breakdown tooltip when hovering over the score. We need to:
1. Add focus fields to the `HeatV3Breakdown` type
2. Display focus boost info in the `HeatBreakdownTooltip` component

### Icon Choices

| Feature | Icon | Color | Notes |
|---------|------|-------|-------|
| **Focus toggle** | `Eye` / `EyeOff` | Green | "Keeping an eye on" = focused attention |
| **Focus (sidebar)** | `Eye` | Green | Consistent with task row |
| **Snooze** | `Moon` | Muted | Sleep/quiet metaphor |
| **View options menu** | `SlidersHorizontal` | Default | Generic display settings (replaces `Eye`/`EyeOff`) |

The view options menu icon changes from `Eye`/`EyeOff` to `SlidersHorizontal` to avoid confusion with the new Focus feature.

---

## Phase 1: Database Schema

### Step 1.1: Add columns to task schema

**File:** `lib/db/schema.ts`

Add two new columns to the `tasks` table (after the existing `deletedAt` column, around line 105):

```typescript
// Focus model
isFocused: boolean("is_focused").notNull().default(false),
focusSnoozeUntil: timestamp("focus_snooze_until", { mode: "date", withTimezone: true }),
```

### Step 1.2: Add index for focus queries

In the same file, add an index to the table definition (in the index section):

```typescript
isFocusedIdx: index("tasks_is_focused_idx").on(table.isFocused),
```

### Step 1.3: Push schema to database

Run:
```bash
npm run db:push
```

### Step 1.4: Verify in Drizzle Studio

Run `npm run db:studio` and confirm:
- `is_focused` column exists (boolean, default false)
- `focus_snooze_until` column exists (nullable timestamp)
- Index `tasks_is_focused_idx` is created

---

## Phase 2: Scoring Integration

### Step 2.1: Add focus constants to heat config

**File:** `lib/scoring/heat-config.ts`

Add these constants to the `HEAT_CONFIG` object:

```typescript
// Focus boost configuration
FOCUS_FLOOR: 30,
FOCUS_MULTIPLIER: 2,
SNOOZE_WAKE_HOUR: 4,  // 4:00 AM local time
```

### Step 2.2: Add snooze helper function

**File:** `lib/scoring/heat-v3.ts`

Add this helper function near the top of the file (after imports):

```typescript
/**
 * Check if a focused task is currently snoozed
 */
function isFocusSnoozed(focusSnoozeUntil: Date | null | undefined, now: Date): boolean {
  if (!focusSnoozeUntil) return false;
  const snoozeDate = focusSnoozeUntil instanceof Date
    ? focusSnoozeUntil
    : new Date(focusSnoozeUntil);
  return now < snoozeDate;
}
```

### Step 2.3: Integrate focus boost into heat calculation

**File:** `lib/scoring/heat-v3.ts`

Find the `calculateHeat` function. Before the final `return` statement (which clamps the score), add the focus boost logic:

```typescript
// Calculate base heat (existing code)
let finalHeat = importancePoints + recencyPoints + adjustmentPoints;

// Apply focus boost if active and not snoozed
if (task.isFocused && !isFocusSnoozed(task.focusSnoozeUntil, now)) {
  const effectiveScore = Math.max(finalHeat, HEAT_CONFIG.FOCUS_FLOOR);
  finalHeat = effectiveScore * HEAT_CONFIG.FOCUS_MULTIPLIER;
}

return clamp(finalHeat, HEAT_CONFIG.MIN_FINAL_SCORE, HEAT_CONFIG.MAX_FINAL_SCORE);
```

### Step 2.4: Update the breakdown type and function

**File:** `lib/scoring/heat-v3.ts`

First, update the `HeatV3Breakdown` interface to include focus fields:

```typescript
export interface HeatV3Breakdown {
  // ... existing fields

  // Focus boost (new)
  isFocused: boolean;
  isFocusSnoozed: boolean;
  focusBoostApplied: boolean;
  preBoostHeat: number;      // Heat before focus boost
  focusBoostAmount: number;  // How much the focus boost added
}
```

Then update `calculateHeatWithBreakdown` to populate these fields:

```typescript
// After calculating finalHeat but before focus boost:
const preBoostHeat = finalHeat;

// Apply focus boost
let focusBoostAmount = 0;
const focusSnoozed = isFocusSnoozed(task.focusSnoozeUntil, now);
if (task.isFocused && !focusSnoozed) {
  const effectiveScore = Math.max(finalHeat, HEAT_CONFIG.FOCUS_FLOOR);
  const boostedHeat = effectiveScore * HEAT_CONFIG.FOCUS_MULTIPLIER;
  focusBoostAmount = boostedHeat - preBoostHeat;
  finalHeat = boostedHeat;
}

return {
  // ... existing fields
  isFocused: task.isFocused ?? false,
  isFocusSnoozed: focusSnoozed,
  focusBoostApplied: (task.isFocused ?? false) && !focusSnoozed,
  preBoostHeat,
  focusBoostAmount,
};
```

### Step 2.5: Update the heat badge tooltip

**File:** `components/tasks/heat-badge.tsx`

In the `HeatBreakdownTooltip` component, add a section to show focus boost info (after the Recency section, before the footer):

```tsx
{/* Focus Boost */}
{breakdown.isFocused && (
  <div>
    <div className="flex justify-between items-center gap-4">
      <span className="text-muted-foreground">Focus Boost:</span>
      <span className="font-mono tabular-nums">
        {breakdown.focusBoostApplied
          ? `+${Math.round(breakdown.focusBoostAmount)} pts`
          : "(snoozed)"}
      </span>
    </div>
    <div className="text-muted-foreground/80 text-[10px] ml-2 space-y-0.5">
      {breakdown.focusBoostApplied ? (
        <>
          <div>Base: {Math.round(breakdown.preBoostHeat)} pts</div>
          <div>Formula: max({Math.round(breakdown.preBoostHeat)}, 30) × 2</div>
        </>
      ) : (
        <div>Snoozed until tomorrow 4 AM</div>
      )}
    </div>
  </div>
)}
```

---

## Phase 3: API Endpoints

### Step 3.1: Create focus toggle endpoint

**New file:** `app/api/tasks/[id]/focus/route.ts`

```typescript
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { tasks } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { calculateHeat } from "@/lib/scoring/heat-v3";
import { calculateImportanceV1 } from "@/lib/scoring/importance-v1";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const taskId = parseInt(id, 10);
  if (isNaN(taskId)) {
    return NextResponse.json({ error: "Invalid task ID" }, { status: 400 });
  }

  // Get current task
  const [task] = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.id, taskId), eq(tasks.userId, userId)));

  if (!task) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  // Parse optional body to allow explicit enable/disable
  let enable: boolean | undefined;
  try {
    const body = await request.json();
    enable = body.enable;
  } catch {
    // No body or invalid JSON - will toggle
  }

  // Toggle focus state (or set explicitly if provided)
  const newIsFocused = typeof enable === "boolean" ? enable : !task.isFocused;

  // Update task - always clear snooze when toggling focus
  const now = new Date();
  const [updatedTask] = await db
    .update(tasks)
    .set({
      isFocused: newIsFocused,
      focusSnoozeUntil: null,
      updatedAt: now,
    })
    .where(and(eq(tasks.id, taskId), eq(tasks.userId, userId)))
    .returning();

  // Recalculate heat since focus affects scoring
  const freshImportance = calculateImportanceV1(updatedTask);
  const newHeat = calculateHeat(updatedTask, now, freshImportance);

  await db
    .update(tasks)
    .set({ heat: newHeat })
    .where(eq(tasks.id, taskId));

  return NextResponse.json({
    task: { ...updatedTask, heat: newHeat },
    isFocused: newIsFocused,
  });
}
```

### Step 3.2: Create snooze endpoint

**New file:** `app/api/tasks/[id]/snooze/route.ts`

```typescript
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { tasks } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { calculateHeat } from "@/lib/scoring/heat-v3";
import { calculateImportanceV1 } from "@/lib/scoring/importance-v1";
import { HEAT_CONFIG } from "@/lib/scoring/heat-config";

/**
 * Calculate the next wake time (4:00 AM local time tomorrow)
 */
function getNextWakeTime(now: Date): Date {
  const wake = new Date(now);
  wake.setDate(wake.getDate() + 1);
  wake.setHours(HEAT_CONFIG.SNOOZE_WAKE_HOUR, 0, 0, 0);
  return wake;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const taskId = parseInt(id, 10);
  if (isNaN(taskId)) {
    return NextResponse.json({ error: "Invalid task ID" }, { status: 400 });
  }

  // Get current task
  const [task] = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.id, taskId), eq(tasks.userId, userId)));

  if (!task) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  // Can only snooze focused tasks
  if (!task.isFocused) {
    return NextResponse.json(
      { error: "Can only snooze focused tasks" },
      { status: 400 }
    );
  }

  // Calculate snooze until time
  const now = new Date();
  const snoozeUntil = getNextWakeTime(now);

  // Update task
  const [updatedTask] = await db
    .update(tasks)
    .set({
      focusSnoozeUntil: snoozeUntil,
      updatedAt: now,
    })
    .where(and(eq(tasks.id, taskId), eq(tasks.userId, userId)))
    .returning();

  // Recalculate heat since snooze affects scoring
  const freshImportance = calculateImportanceV1(updatedTask);
  const newHeat = calculateHeat(updatedTask, now, freshImportance);

  await db
    .update(tasks)
    .set({ heat: newHeat })
    .where(eq(tasks.id, taskId));

  return NextResponse.json({
    task: { ...updatedTask, heat: newHeat },
    snoozeUntil,
  });
}
```

---

## Phase 4: Client Mutations

### Step 4.1: Add focus mutation

**File:** `lib/queries/use-task-mutations.ts`

Add these functions (follow the pattern of existing `useHeatTask` and `useCoolTask`):

```typescript
/**
 * Toggle or set focus state on a task
 */
async function focusTask(id: number, enable?: boolean): Promise<Task> {
  const response = await fetch(`/api/tasks/${id}/focus`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ enable }),
  });

  if (!response.ok) {
    throw new Error("Failed to toggle focus");
  }

  const data = await response.json();
  return data.task;
}

export function useFocusTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ taskId, enable }: { taskId: number; enable?: boolean }) =>
      focusTask(taskId, enable),
    onSuccess: (task) => {
      queryClient.invalidateQueries({ queryKey: PRIMARY_TASKS_QUERY_KEY });
      toast.success(task.isFocused ? "Task focused" : "Task unfocused");
    },
    onError: () => {
      toast.error("Failed to toggle focus");
    },
  });
}
```

### Step 4.2: Add snooze mutation

```typescript
/**
 * Snooze a focused task until tomorrow morning
 */
async function snoozeTask(id: number): Promise<Task> {
  const response = await fetch(`/api/tasks/${id}/snooze`, {
    method: "POST",
  });

  if (!response.ok) {
    throw new Error("Failed to snooze task");
  }

  const data = await response.json();
  return data.task;
}

export function useSnoozeTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (taskId: number) => snoozeTask(taskId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PRIMARY_TASKS_QUERY_KEY });
      toast.success("Task snoozed until tomorrow");
    },
    onError: () => {
      toast.error("Failed to snooze task");
    },
  });
}
```

### Step 4.3: Export the new hooks

Add to the exports at the bottom of the file:

```typescript
export { useFocusTask, useSnoozeTask };
```

---

## Phase 5: Task Row UI

### Step 5.1: Add props to TaskRow

**File:** `components/tasks/task-row.tsx`

Add to the `TaskRowProps` interface:

```typescript
onFocus: (taskId: number, enable?: boolean) => void;
onSnooze: (taskId: number) => void;
```

### Step 5.2: Add snooze check helper

Inside the TaskRow component, add:

```typescript
const isFocusSnoozed = task.focusSnoozeUntil && new Date() < new Date(task.focusSnoozeUntil);
```

### Step 5.3: Add focus button

Find the heat/cool buttons section (look for `<Flame` and `<Snowflake` icons). Add a focus button nearby:

```tsx
{/* Focus Button */}
<button
  className={cn(
    "flex h-6 w-6 shrink-0 items-center justify-center rounded transition-colors",
    isCompleted
      ? "opacity-50 cursor-not-allowed"
      : task.isFocused
        ? "text-green-500 hover:text-green-400 cursor-pointer"
        : "text-green-500/30 hover:text-green-500/60 cursor-pointer"
  )}
  onClick={(e) => {
    e.stopPropagation();
    if (!isCompleted) {
      onFocus(task.id);
    }
  }}
  disabled={isCompleted}
  aria-label={task.isFocused ? "Unfocus task" : "Focus task"}
  title={task.isFocused ? "Remove from focus" : "Add to focus"}
>
  {task.isFocused ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
</button>
```

Add the import at the top:
```typescript
import { Eye, EyeOff } from "lucide-react";
```

### Step 5.4: Add snooze button (hover only)

Add near the focus button, only visible when task is focused:

```tsx
{/* Snooze Button - only for focused tasks */}
{task.isFocused && !isCompleted && (
  <button
    className={cn(
      "flex h-6 w-6 shrink-0 items-center justify-center rounded transition-colors opacity-0 group-hover:opacity-100",
      isFocusSnoozed
        ? "text-muted-foreground/60 cursor-not-allowed"
        : "text-muted-foreground/40 hover:text-muted-foreground cursor-pointer"
    )}
    onClick={(e) => {
      e.stopPropagation();
      if (!isFocusSnoozed) {
        onSnooze(task.id);
      }
    }}
    disabled={!!isFocusSnoozed}
    aria-label="Snooze until tomorrow"
    title={isFocusSnoozed ? "Already snoozed" : "Snooze until tomorrow"}
  >
    <Moon className="h-4 w-4" />
  </button>
)}
```

Add the import:
```typescript
import { Moon } from "lucide-react";
```

### Step 5.5: Apply focus tint to row

Find the `<tr>` element for the task row. Add conditional classes:

```tsx
<tr
  className={cn(
    "group bg-card transition-colors hover:bg-accent/30",
    task.isFocused && !isFocusSnoozed && "bg-green-500/5",
    task.isFocused && isFocusSnoozed && "bg-green-500/[0.02] opacity-70",
    // ... existing classes
  )}
>
```

---

## Phase 6: Sidebar Focus Filter

### Step 6.1: Update sidebar props

**File:** `components/projects/projects-sidebar.tsx`

Add to the component props:

```typescript
focusedTaskCount: number;
```

### Step 6.2: Update project selection type

The `selectedProjectId` should accept `"focus"` as a special value. Find where the type is defined and update:

```typescript
type ProjectFilter = number | null | "all" | "focus";
```

### Step 6.3: Add Focus entry to sidebar

Find where "No Project" entry is rendered (look for `onSelectProject(null)`). Add the Focus entry after it:

```tsx
{/* Focus Filter */}
<button
  onClick={() => onSelectProject("focus")}
  className={cn(
    "mb-4 flex w-full items-center justify-between rounded pl-3 pr-2 py-2 text-sm transition-colors hover:bg-accent cursor-pointer",
    selectedProjectId === "focus" && "bg-accent font-medium"
  )}
>
  <div className="flex items-center gap-2">
    <Eye className="h-4 w-4 text-green-500" />
    <span>Focus</span>
  </div>
  <div className="flex items-center gap-1">
    {focusedTaskCount > 0 && (
      <span className="rounded bg-muted px-1.5 py-0.5 text-xs">
        {focusedTaskCount}
      </span>
    )}
    <div className="w-4" />
  </div>
</button>
```

Add the import:
```typescript
import { Eye } from "lucide-react";
```

---

## Phase 7: Main Page Integration

### Step 7.1: Calculate focused task count

**File:** `app/tasks/page.tsx`

Add a memo for the count:

```typescript
const focusedTaskCount = useMemo(
  () => tasks.filter((t) => t.isFocused && !t.completedAt && !t.deletedAt).length,
  [tasks]
);
```

### Step 7.2: Pass count to sidebar

Find where `ProjectsSidebar` is rendered and add the prop:

```tsx
<ProjectsSidebar
  // ... existing props
  focusedTaskCount={focusedTaskCount}
/>
```

### Step 7.3: Add focus filtering

Find the task filtering logic (where `selectedProjectId` is checked). Add focus filter handling:

```typescript
// In the filtered tasks memo
let filteredTasks = tasks;

// Handle focus filter
if (selectedProjectId === "focus") {
  filteredTasks = filteredTasks.filter((t) => t.isFocused);
} else if (selectedProjectId === "all") {
  // Show all (no project filter)
} else if (selectedProjectId === null) {
  // Show tasks with no project
  filteredTasks = filteredTasks.filter((t) => !t.projectId);
} else {
  // Filter by specific project
  filteredTasks = filteredTasks.filter((t) => t.projectId === selectedProjectId);
}
```

### Step 7.4: Wire up focus/snooze handlers

In the page component, add the mutation hooks:

```typescript
const { mutate: focusTask } = useFocusTask();
const { mutate: snoozeTask } = useSnoozeTask();
```

Create handlers:

```typescript
const handleFocus = useCallback((taskId: number, enable?: boolean) => {
  focusTask({ taskId, enable });
}, [focusTask]);

const handleSnooze = useCallback((taskId: number) => {
  snoozeTask(taskId);
}, [snoozeTask]);
```

Pass to TaskRow:

```tsx
<TaskRow
  // ... existing props
  onFocus={handleFocus}
  onSnooze={handleSnooze}
/>
```

---

## Phase 8: Update View Options Menu Icon

The view options menu currently uses `Eye`/`EyeOff` icons, which would conflict with the new Focus feature. Change to `SlidersHorizontal` for a generic "display settings" icon.

### Step 8.1: Update task list header

**File:** `components/tasks/task-list-header.tsx`

Change the import:
```typescript
// Before
import { Eye, EyeOff, ChevronDown, ArrowDown, ArrowUp, RefreshCcw } from "lucide-react";

// After
import { SlidersHorizontal, ChevronDown, ArrowDown, ArrowUp, RefreshCcw } from "lucide-react";
```

Replace the Eye/EyeOff usage in the dropdown trigger (around line 196-200):
```tsx
// Before
{showCompleted ? (
  <Eye className="h-3.5 w-3.5" />
) : (
  <EyeOff className="h-3.5 w-3.5" />
)}

// After
<SlidersHorizontal className="h-3.5 w-3.5" />
```

### Step 8.2: Update mobile options menu

**File:** `components/tasks/mobile-options-menu.tsx`

Change the import:
```typescript
// Before
import { Eye, EyeOff, ... } from "lucide-react";

// After
import { SlidersHorizontal, ... } from "lucide-react";
```

Replace the Eye/EyeOff usage (around line 140-144):
```tsx
// Before
{showCompleted ? (
  <EyeOff className="h-4 w-4 text-muted-foreground" />
) : (
  <Eye className="h-4 w-4 text-muted-foreground" />
)}

// After
<SlidersHorizontal className="h-4 w-4 text-muted-foreground" />
```

---

## Phase 9: Testing Checklist

### Database
- [ ] `is_focused` column exists and defaults to false
- [ ] `focus_snooze_until` column exists and is nullable
- [ ] Index on `is_focused` is created

### Scoring
- [ ] Unfocused task: score unchanged
- [ ] Focused task (low score 8): boosted to 60 (max(8,30)*2)
- [ ] Focused task (high score 50): boosted to 100 (50*2)
- [ ] Snoozed focused task: score unchanged (snooze suppresses boost)
- [ ] Snooze expires at 4 AM: boost resumes
- [ ] **Importance mode**: focused tasks sort by natural importance (no boost)
- [ ] **Heat mode**: focused tasks sort by boosted heat score

### Tooltip
- [ ] Heat tooltip shows "Focus Boost" section when task is focused
- [ ] Focus boost shows "+X pts" when active
- [ ] Focus boost shows "(snoozed)" when snoozed
- [ ] Breakdown shows formula: "max(base, 30) × 2"

### API
- [ ] POST `/api/tasks/:id/focus` toggles focus state
- [ ] POST `/api/tasks/:id/focus` with `{ enable: true }` sets focus on
- [ ] POST `/api/tasks/:id/focus` with `{ enable: false }` sets focus off
- [ ] Toggling focus clears any existing snooze
- [ ] POST `/api/tasks/:id/snooze` sets snooze to 4 AM next day
- [ ] POST `/api/tasks/:id/snooze` fails for non-focused tasks

### UI - Task Row
- [ ] Focus button visible for all tasks
- [ ] Focus button has active state when task is focused
- [ ] Focus button is disabled for completed tasks
- [ ] Clicking focus button toggles focus state
- [ ] Snooze button only appears on hover for focused tasks
- [ ] Snooze button is disabled when already snoozed
- [ ] Focused rows have subtle amber tint
- [ ] Snoozed focused rows have muted tint and reduced opacity

### UI - Sidebar
- [ ] "Focus" entry appears below "No Project"
- [ ] Focus count badge shows number of focused tasks
- [ ] Clicking "Focus" filters to only focused tasks
- [ ] Snoozed tasks still appear in Focus view (but de-emphasized)

### Integration
- [ ] Focus toggle updates score immediately
- [ ] Snooze updates score immediately
- [ ] List re-sorts after focus/snooze actions
- [ ] Toast notifications appear for focus/snooze actions

---

## Troubleshooting

### Score not updating after focus toggle
- Ensure `calculateHeat` is being called with the updated task
- Check that `isFocused` field is being passed to the scoring function
- Verify the heat value is being saved back to the database

### Snooze not working
- Check browser timezone vs server timezone
- Verify `focusSnoozeUntil` is being compared correctly (Date objects)
- Ensure the snooze time calculation includes the +1 day

### Focus button not appearing
- Check that `onFocus` prop is passed to TaskRow
- Verify the import for `Target` icon is correct
- Check for CSS conflicts hiding the button

### Sidebar count not updating
- Ensure `focusedTaskCount` memo has `tasks` as a dependency
- Check that the prop is passed to `ProjectsSidebar`
- Verify the filter excludes completed/deleted tasks

---

## Files Changed Summary

| File | Change Type |
|------|-------------|
| `lib/db/schema.ts` | Modified - add columns + index |
| `lib/scoring/heat-config.ts` | Modified - add focus constants |
| `lib/scoring/heat-v3.ts` | Modified - add focus boost + breakdown fields |
| `components/tasks/heat-badge.tsx` | Modified - add focus section to tooltip |
| `app/api/tasks/[id]/focus/route.ts` | **New file** |
| `app/api/tasks/[id]/snooze/route.ts` | **New file** |
| `lib/queries/use-task-mutations.ts` | Modified - add hooks |
| `components/tasks/task-row.tsx` | Modified - add Eye/EyeOff buttons, green styling |
| `components/projects/projects-sidebar.tsx` | Modified - add Focus entry with Eye icon |
| `app/tasks/page.tsx` | Modified - add filtering/handlers |
| `components/tasks/task-list-header.tsx` | Modified - change Eye/EyeOff to SlidersHorizontal |
| `components/tasks/mobile-options-menu.tsx` | Modified - change Eye/EyeOff to SlidersHorizontal |
