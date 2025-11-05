# Importance Algorithm Analysis

**Date:** 2025-11-05
**Status:** Current Implementation Analysis
**Version:** V1 (Point-Based, 2-14 scale)

This document provides a detailed analysis of the current importance algorithm implementation, documenting how importance is calculated, stored, cached, and displayed throughout the system.

---

## Overview

The importance algorithm is a **cached calculation system** that assigns a numeric score (2-14) to tasks based on three factors:
- **Priority** (low/medium/high/top): 2-5 points
- **Due Date** (none/future/today/overdue): 0-6 points
- **Star Level** (0-3): 0-3 points

**Current Architecture:** Importance is **calculated and stored** in the database, then recalculated selectively to handle time-based staleness.

---

## Calculation Formula

**Location:** [lib/scoring/importance-v1.ts](../lib/scoring/importance-v1.ts)

```typescript
importance = priority_weight + due_weight + star_level
Range: 2-14 points
```

### Components

#### Priority Weights (Lines 42-47)
```typescript
- low:    2 points
- medium: 3 points
- high:   4 points
- top:    5 points
```

#### Due Date Weights (Lines 48-53)
```typescript
- none (no due date):  0 points
- future (≥1 day):     3 points
- today:               5 points
- overdue (past):      6 points
```

#### Star Points (Lines 54-59)
```typescript
- Level 0 (none):      0 points
- Level 1 (blue):      +1 point
- Level 2 (yellow):    +2 points
- Level 3 (orange):    +3 points
```

### Key Functions

- `calculateImportanceV1(task)` (line 131) - Main calculation
- `calculateImportanceV1WithFactors(task)` (line 148) - Returns detailed breakdown
- `getImportanceColor(score)` (line 173) - Maps score to color
- `getImportanceLabel(score)` (line 185) - Maps score to label

---

## Database Schema

**Location:** [lib/db/schema.ts:73](../lib/db/schema.ts#L73)

```typescript
importanceV1: integer("importance_v1").notNull().default(0)
```

**Index:** `activeImportanceIdx` (line 106) - Optimizes sorting by importance

**Storage Strategy:**
- ✅ Stored in database for performance
- ❌ Can become stale when time passes (due date changes)
- ⚠️ Requires selective recalculation to maintain accuracy

---

## Server-Side Implementation

### Task Creation: POST /api/tasks

**Location:** [app/api/tasks/route.ts:134](../app/api/tasks/route.ts#L134)

```typescript
// Calculate importance BEFORE saving
taskData.importanceV1 = calculateImportanceV1(taskData);
await db.insert(tasks).values(taskData);
```

**Flow:**
1. Receive task data from client
2. Calculate importance from priority + dueAt + starLevel
3. Store calculated value in database
4. Return task with stored importance

---

### Task Fetching: GET /api/tasks

**Location:** [app/api/tasks/route.ts:38-39](../app/api/tasks/route.ts#L38)

```typescript
// Recalculate importance for EVERY task on fetch
const freshImportance = calculateImportanceV1(task);
```

**Why Recalculate?** Due dates are time-sensitive:
- A task due "today" at 11:59 PM becomes "overdue" at 12:00 AM
- Stored importance (5 pts for "today") is now stale (should be 6 pts for "overdue")
- Recalculating ensures accurate sorting and display

**Flow:**
1. Fetch all tasks from database (includes stored `importanceV1`)
2. **Ignore stored value** - recalculate fresh for each task
3. Update task object with fresh importance
4. Sort by importance (descending), then due date, then creation date
5. Return sorted tasks with fresh importance

**Performance Trade-off:**
- ✅ Accuracy: Always returns correct importance
- ⚠️ Computation: Recalculates for all tasks on every fetch
- ✅ Simple: Calculation is fast (3 lookups + addition)

---

### Task Updates: PATCH /api/tasks/[id]

**Location:** [app/api/tasks/\[id\]/route.ts:46-54](../app/api/tasks/[id]/route.ts#L46)

```typescript
// Recalculate ONLY if relevant fields changed
if (priority !== undefined || starLevel !== undefined || dueAt !== undefined) {
  const updatedTask = { ...existingTask[0], ...updateData };
  updateData.importanceV1 = calculateImportanceV1(updatedTask);
}
```

**Conditional Recalculation:**
- Changes to `priority`, `starLevel`, or `dueAt` → Recalculate importance
- Changes to other fields (title, notes, etc.) → Keep existing importance
- Also triggers heat recalculation (lines 58-61) since heat depends on importance

**Flow:**
1. Fetch existing task
2. Check which fields are being updated
3. If importance-affecting fields changed → recalculate
4. Update database with new importance
5. Recalculate heat if importance changed
6. Return updated task

---

### Star Toggle: POST /api/tasks/[id]/star

**Location:** [app/api/tasks/\[id\]/star/route.ts:61-70](../app/api/tasks/[id]/star/route.ts#L61)

```typescript
// Calculate new importance when star level changes
const newImportance = calculateImportanceV1({
  ...task,
  starLevel: newStarLevel
});

await db.update(tasks)
  .set({ starLevel: newStarLevel, importanceV1: newImportance })
  .where(eq(tasks.id, taskId));
```

**Star-Importance-Heat Cascade:**
1. User clicks star → star level changes
2. Star affects importance → recalculate importance
3. Importance affects heat → recalculate heat (lines 72-81)
4. Update database with all three values

---

### Heat/Cool Actions: POST /api/tasks/[id]/heat & /cool

**Location:** [app/api/tasks/\[id\]/heat/route.ts:98-101](../app/api/tasks/[id]/heat/route.ts#L98)

```typescript
// CRITICAL: Recalculate importance FRESH (don't trust DB)
currentTask.importanceV1 = calculateImportanceV1(currentTask);
neighborTasks.forEach(t => {
  t.importanceV1 = calculateImportanceV1(t);
});
```

**Why Critical?** Context-aware positioning needs accurate importance for all tasks:
- Importance is a PRIMARY component of heat (0-95 of 145 points)
- Time skew can make stored importance stale
- Heat calculations need fresh values to determine correct positioning

**Flow:**
1. Fetch current task + neighbor tasks (for context)
2. **Recalculate importance for ALL tasks** (don't trust stored values)
3. Calculate heat for all tasks using fresh importance
4. Run context-aware positioning logic
5. Calculate heat adjustment delta
6. Store updated heat adjustment (importance unchanged)

---

## Client-Side Implementation

### Display: HeatBadge Component

**Location:** [components/tasks/heat-badge.tsx:40-125](../components/tasks/heat-badge.tsx#L40)

**Visual Representation:**
```typescript
// Badge shows numeric value (2-14)
{task.importanceV1}

// Colored background based on score
backgroundColor = getImportanceColorFromConfig(task.importanceV1)
```

**Tooltip Breakdown:**
```
Priority: High (4 pts)
Due: Today (5 pts)
Star: Yellow (2 pts)
─────────────────
Total: 11 pts (82%)
```

**Color Mapping:**
- 2-3 pts: Blue (Low)
- 4-5 pts: Green (Medium-Low)
- 6-8 pts: Yellow (Medium)
- 9-11 pts: Orange (Medium-High)
- 12-14 pts: Red (High)

---

### Mutations: TanStack Query

**Location:** [lib/queries/use-task-mutations.ts](../lib/queries/use-task-mutations.ts)

#### Create Task (Line 159)

```typescript
// Optimistic update: calculate importance client-side
optimisticTask.importanceV1 = calculateImportanceV1(optimisticTask);
```

**Purpose:** Instant UI feedback without waiting for server

**Flow:**
1. User creates task
2. Client immediately calculates importance
3. Display task in list with optimistic importance
4. Server response arrives → replace optimistic with authoritative value

---

#### Update Task (Lines 238-245)

```typescript
// Recalculate if importance-affecting fields changed
if (
  variables.updates.priority !== undefined ||
  variables.updates.starLevel !== undefined ||
  variables.updates.dueAt !== undefined
) {
  updatedTask.importanceV1 = calculateImportanceV1(updatedTask);
}
```

**Conditional Logic:**
- Changes to priority/star/due → Recalculate optimistically
- Changes to other fields → Keep existing importance
- Server response always replaces optimistic value (line 280 comment: "CRITICAL")

---

#### Complete Task (Lines 396-400)

```typescript
// For recurring tasks, recalculate when due date advances
if (recurRule) {
  newTask.importanceV1 = calculateImportanceV1(newTask);
}
```

**Recurring Task Handling:**
- Task completion advances due date to next recurrence
- New due date changes importance (future/today/overdue)
- Must recalculate to reflect new importance

---

#### Heat/Cool Actions (Lines 580-594)

```typescript
// CRITICAL FIX: Recalculate importanceV1 fresh (don't trust cached value)
// Importance is time-dependent (due date: today → overdue as time passes)
// and can become stale between refetches
currentTask.importanceV1 = calculateImportanceV1(currentTask);
neighborTasks.forEach(t => {
  t.importanceV1 = calculateImportanceV1(t);
});
```

**Why Critical Fix?**
- Cached importance in TanStack Query can be stale
- Time passes → "due today" becomes "overdue" → importance changes
- Heat calculation depends on accurate importance
- Must recalculate fresh before heat operations

**This is the smoking gun for staleness issues.**

---

## Data Flow Diagrams

### Creation Flow

```
User Input (priority, due, star)
         ↓
Client: calculateImportanceV1() [optimistic]
         ↓
   TanStack Query Cache
         ↓
Server: POST /api/tasks
         ↓
calculateImportanceV1() [authoritative]
         ↓
Database: INSERT tasks (importanceV1 = X)
         ↓
Server Response (task with importanceV1)
         ↓
Client: Replace optimistic with server value
         ↓
   HeatBadge displays importance
```

---

### Display Flow (Every Page Load)

```
Client: GET /api/tasks
         ↓
Server: SELECT * FROM tasks
         ↓
For each task:
  calculateImportanceV1() [FRESH]
  (ignore stored task.importanceV1)
         ↓
Sort by fresh importance
         ↓
Server Response (tasks with fresh importance)
         ↓
TanStack Query Cache (stores fresh values)
         ↓
TaskList renders sorted tasks
         ↓
HeatBadge displays importance
```

---

### Update Flow

```
User changes priority/star/due
         ↓
Client: calculateImportanceV1() [optimistic]
         ↓
TanStack Query Cache (optimistic update)
         ↓
Server: PATCH /api/tasks/[id]
         ↓
IF (priority/star/due changed):
  calculateImportanceV1() [authoritative]
  Database: UPDATE importanceV1
         ↓
Server Response (task with new importanceV1)
         ↓
Client: Replace optimistic with server value
         ↓
HeatBadge re-renders with new importance
```

---

### Staleness Detection Flow

```
12:00 AM - Task due date changes (today → overdue)
         ↓
Database: importanceV1 = 9 (stale: was "today" = 5 pts)
         ↓
TanStack Query Cache: importanceV1 = 9 (stale)
         ↓
User clicks Heat button
         ↓
Client: useCoolTask mutation
         ↓
Lines 580-594: CRITICAL FIX
  calculateImportanceV1(task)
  → importanceV1 = 10 (fresh: "overdue" = 6 pts)
         ↓
Server: POST /api/tasks/[id]/heat
         ↓
Lines 98-101: Recalculate fresh
  currentTask.importanceV1 = calculateImportanceV1(currentTask)
  → importanceV1 = 10 (matches client)
         ↓
Context-aware heat calculation uses correct importance
         ↓
Next GET /api/tasks will return fresh importance = 10
```

---

## Staleness Issues

### Problem: Time-Based Staleness

**Scenario:** Task due at 11:59 PM today
- **11:50 PM:** GET /api/tasks
  - Calculates importance = 9 (due "today" = 5 pts + priority 2 + star 2)
  - Stores in cache
- **12:01 AM:** User opens app (no refetch yet)
  - Cache shows importance = 9 (STALE: should be 10 for "overdue" = 6 pts)
  - User clicks heat → triggers CRITICAL FIX recalculation
  - Client recalculates: importance = 10 ✅
  - Server recalculates: importance = 10 ✅
  - Heat calculation uses correct value

**Mitigation:**
- ✅ Server GET always recalculates fresh
- ✅ Heat/cool operations recalculate fresh (CRITICAL FIX)
- ⚠️ Cached values can be stale between refetches
- ⚠️ Must remember to recalculate in new features

---

### Problem: Stored Value Redundancy

**The database stores importance, but we don't trust it:**

```typescript
// Database has importanceV1 = 9
const task = await db.select().from(tasks).where(eq(tasks.id, taskId));

// Immediately recalculate (ignore stored value)
const freshImportance = calculateImportanceV1(task);
task.importanceV1 = freshImportance;
```

**Why store it if we recalculate?**
- Historical reason: Performance (avoid recalculation)
- Current reality: We recalculate liberally due to staleness
- **The stored value is rarely trusted**

**Where we trust stored value:**
- ✅ Task updates when importance-affecting fields didn't change
- ❌ GET requests (always recalculate)
- ❌ Heat/cool operations (always recalculate)
- ❌ Initial render (uses value from GET, which recalculated)

---

### Problem: Conditional Recalculation Complexity

**PATCH /api/tasks/[id] has conditional logic:**

```typescript
if (priority !== undefined || starLevel !== undefined || dueAt !== undefined) {
  updateData.importanceV1 = calculateImportanceV1(updatedTask);
}
// else: keep existing importanceV1 (trust stored value)
```

**Issues:**
1. **Maintenance burden:** Must remember to add new fields to condition
2. **Time-based staleness:** Stored value can be stale even if fields didn't change
3. **Inconsistency:** Some code paths trust stored value, others don't

**Example Bug:**
- Task has stored importance = 9 (due "today")
- User updates title (not importance-affecting)
- Condition fails → keep stored importance = 9
- But it's midnight → should be 10 (overdue)
- Next GET will return 10, creating visual inconsistency

---

## Performance Analysis

### Current System Costs

**Database Writes:**
- CREATE task → Write importance
- UPDATE task (priority/star/due) → Write importance
- UPDATE task (other fields) → No write
- Star toggle → Write importance
- Heat/cool → No write (importance unchanged)

**Calculations:**
- GET /api/tasks → Calculate for ALL tasks
- CREATE task → Calculate once (optimistic + server)
- UPDATE task → Calculate once if fields changed
- Star toggle → Calculate once
- Heat/cool → Calculate for current + all neighbors

**Query Cache:**
- Stores task objects with `importanceV1` field
- Cache invalidated after mutations
- Cache can become stale due to time passage

---

### Calculation Cost

```typescript
function calculateImportanceV1(task: Task): number {
  const priorityWeight = PRIORITY_WEIGHTS[task.priority]; // O(1) lookup
  const dueWeight = getDueWeight(task.dueAt, now);        // O(1) date comparison
  const starPoints = task.starLevel;                      // O(1) access
  return priorityWeight + dueWeight + starPoints;         // O(1) addition
}
```

**Estimated cost:** <0.05ms per task
**For 100 tasks:** ~5ms total

**Comparison:**
- Database query: 10-100ms
- Network round trip: 50-500ms
- React render: 5-50ms

**Verdict:** Calculation is negligible compared to other operations.

---

## Integration with Heat System

### Importance as Heat Component

**Location:** [lib/scoring/heat-v3.ts](../lib/scoring/heat-v3.ts)

**Heat Formula:**
```typescript
heat = importance_points + recency_points + heat_adjustment - adjustment_decay
```

**Importance Contribution:**
```typescript
importance_points = ((importance - 2) / 12) * 95
Range: 0-95 points (out of 145 total)
```

**Why Important:**
- Importance is the **primary** component of heat (65% of max points)
- Stale importance → stale heat → incorrect sorting/positioning
- Heat system depends on accurate importance calculations

---

### Cascade: Changes Affect Both

**When user changes priority/star/due:**
1. Importance changes (different score)
2. Importance is stored in DB
3. Heat is recalculated (uses new importance)
4. Heat adjustment is updated in DB

**Code Example:** [app/api/tasks/\[id\]/star/route.ts:61-81](../app/api/tasks/[id]/star/route.ts#L61)

```typescript
// Star toggle triggers both importance and heat updates
const newImportance = calculateImportanceV1({ ...task, starLevel: newStarLevel });
const newHeat = calculateHeatScore({ ...task, importanceV1: newImportance });

await db.update(tasks)
  .set({
    starLevel: newStarLevel,
    importanceV1: newImportance, // Store calculated importance
    heat: newHeat,               // Store calculated heat
  })
  .where(eq(tasks.id, taskId));
```

---

## Comparison with Heat System

| Aspect | Importance | Heat |
|--------|-----------|------|
| **Storage** | ✅ Stored in DB (`importanceV1`) | ❌ Not stored (only adjustment + timestamps) |
| **Range** | 2-14 points | 0-145 points |
| **Components** | 3 (priority, due, star) | 3 (importance, recency, adjustment) |
| **Time Dependency** | Medium (due date changes daily) | High (recency decays continuously) |
| **User Adjustment** | Indirect (change priority/star/due) | Direct (heat/cool buttons) |
| **Staleness Risk** | ⚠️ Becomes stale when date changes | ✅ Always calculated fresh |
| **Recalculation Strategy** | Selective (on GET + heat ops) | Always (never stored) |
| **Database Field** | `importanceV1` (stored) | `heat` (deprecated, unused) |
| **Calculation Cost** | Low (3 lookups + add) | Medium (exponential, normalization) |
| **Architecture** | **Cached calculation** | **Pure calculation** |

**Key Difference:**
- **Importance:** Calculate → Store → Selectively recalculate when stale
- **Heat:** Calculate → Never store → Always calculate fresh from base properties

---

## Problems with Current Architecture

### 1. Redundant Storage

**Issue:** Database stores importance, but we recalculate frequently
- GET /api/tasks: Recalculate for all tasks (ignore stored value)
- Heat/cool ops: Recalculate for current + neighbors (ignore stored value)
- Only trust stored value in limited cases (non-importance field updates)

**Cost:** Wasted storage + index maintenance for rarely-trusted value

---

### 2. Staleness Windows

**Issue:** Cached importance can be stale between refetches

**Example Timeline:**
- **T0 (11:00 PM):** GET /api/tasks → importance = 9 (due "today")
- **T1 (12:01 AM):** Date changes, cache still shows 9 (should be 10 for "overdue")
- **T2 (12:05 AM):** User clicks heat → CRITICAL FIX recalculates to 10
- **T3 (12:10 AM):** Next GET /api/tasks → returns 10

**Window:** T1-T2 shows stale value (5 minutes in this example)

**Mitigation:** Aggressive refetching, CRITICAL FIX recalculation
**Problem:** Must remember to add CRITICAL FIX to all new code paths

---

### 3. Conditional Recalculation Complexity

**Issue:** Different code paths have different recalculation strategies

**Inconsistency:**
- GET /api/tasks: **Always recalculate** (line 38)
- PATCH /api/tasks: **Conditionally recalculate** (line 46-54)
- Heat/cool: **Always recalculate** (line 98-101)
- Client heat/cool: **Always recalculate + CRITICAL FIX comment** (line 580-594)

**Maintenance Risk:**
1. New developers may not understand when to recalculate
2. Easy to forget recalculation in new features
3. CRITICAL FIX comments indicate architectural issue

---

### 4. Client/Server Time Skew

**Issue:** Client and server may calculate different importance if time differs

**Example:**
- Client clock: 11:59 PM (due "today" = 5 pts)
- Server clock: 12:01 AM (due "overdue" = 6 pts)
- Optimistic update shows 9, server returns 10

**Current Mitigation:** Server is authoritative, replaces optimistic value
**Better Solution:** Don't cache time-sensitive values

---

### 5. Testing Complexity

**Issue:** Tests must mock time to ensure deterministic importance

**Example:**
```typescript
// Test written at 2 PM
const task = { priority: "high", dueAt: new Date("2025-11-05T23:59:59Z") };
const importance = calculateImportanceV1(task); // 9 (due "today")

// Same test run at 1 AM next day
const importance = calculateImportanceV1(task); // 10 (due "overdue")
// Test fails: expected 9, got 10
```

**Required:** Mock `new Date()` in all importance tests

---

## Why Pure Calculation Would Be Better

### Learning from Heat System

The heat system migrated from **stored + cached** to **pure calculation** and solved similar issues:
- ✅ No staleness (always fresh)
- ✅ No storage redundancy (never stored)
- ✅ Simpler code (no conditional recalculation)
- ✅ Predictable optimistic updates (deterministic)
- ✅ Better testing (pure functions)

**Same benefits would apply to importance.**

---

### What Would Change

**Remove:**
- ❌ Database field: `importanceV1`
- ❌ Database index: `activeImportanceIdx`
- ❌ Conditional recalculation logic
- ❌ CRITICAL FIX comments
- ❌ Stored value trust decisions

**Keep:**
- ✅ Calculation function: `calculateImportanceV1()`
- ✅ Base properties: `priority`, `dueAt`, `starLevel`
- ✅ Client/server consistency: Same calculation everywhere

**Add:**
- ➕ Calculate on every render (client)
- ➕ Calculate on every query (server)
- ➕ No storage, no staleness, no complexity

---

### Expected Benefits

1. **Eliminates staleness** - Always calculates from fresh time
2. **Reduces storage** - Remove `importanceV1` field + index
3. **Simplifies code** - No conditional recalculation logic
4. **Improves consistency** - Client and server always match
5. **Easier testing** - Pure function with deterministic results
6. **Better architecture** - Single source of truth (the calculation itself)

---

### Expected Challenges

1. **Performance concern** - Calculating importance more frequently
   - Mitigation: Calculation is fast (<0.05ms per task)
   - Mitigation: Already calculating on every GET request
   - Mitigation: Can use `useMemo` on client to cache within render

2. **Migration complexity** - Removing database field requires careful migration
   - Mitigation: Can keep field temporarily, stop writing to it
   - Mitigation: Deploy code changes first, migrate schema later

3. **Sorting without index** - Can't use DB index to sort by importance
   - Mitigation: Already sorting in-memory after fetching all tasks
   - Mitigation: Task counts are small enough for in-memory sort (<5000 tasks)

---

## Conclusion

The current importance algorithm architecture is a **hybrid approach:**
- Stores calculated values for performance
- Recalculates aggressively for accuracy
- Results in complexity, staleness windows, and maintenance burden

The heat system's **pure calculation approach** offers a cleaner alternative:
- Never store, always calculate
- No staleness possible
- Simpler code, easier maintenance
- Guaranteed client/server consistency

**Next steps:** See [docs/current-importance-algorithm.md](./current-importance-algorithm.md) for migration path to pure calculation architecture.
