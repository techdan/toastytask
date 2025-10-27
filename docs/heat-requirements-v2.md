# Heat Model Requirements v2 (MVP)

## Document Changes (v2 Updates)

**Key UX Improvements:**
1. **Manual Refresh** - Task positions stable until user clicks refresh (Shift+R)
   - Exception: Snooze auto-drops task position immediately
2. **Bold Green Styling** - New tasks shown in bold green text (not badge), fades after any touch
3. **Visible Snooze** - Snoozed tasks remain visible, heat up as resurface date approaches
4. **Split Touch Tracking** - Heat icon (🔥) vs general edits tracked separately
5. **Heat Icon Power** - 20 heat clicks pushes task to top (30% weight)
6. **Due Proximity Explicit** - Impending due dates get 15% weight boost
7. **New Task Sort Override** - Untouched tasks always appear at top (manual sort override)
8. **Heat Breakdown Tooltip** - Hover on heat badge shows component breakdown

**Rationale:**
- Manual refresh prevents disorientation during multi-task editing
- Split tracking gives heat icon explicit override power
- Due proximity ensures deadlines don't get buried
- New task override guarantees visibility without relying on formula alone
- Heat breakdown provides transparency and learning

## Overview

The Heat Model (v2) is a dynamic scoring system that runs **parallel to Importance v1**, allowing users to toggle between two sorting modes:
- **Importance Sort**: Traditional deterministic scoring (2-12) based on priority, due date, and star
- **Heat Sort**: Dynamic scoring (0-1) that responds to user interaction and naturally cools over time

This dual-system approach provides a safety net: Importance v1 ensures deadline-critical tasks stay visible, while Heat enables natural task lifecycle management without constant manual maintenance.

## Core Problem Being Solved

Users struggle with task list maintenance:
- Manual due date management becomes overwhelming
- "Someday" tasks accumulate into unmanageable graveyards
- High-priority past-due items cluster at the top
- Weekly/monthly review becomes a chore
- Important tasks fall through the cracks without constant attention

Heat solves this by making task position **interaction-driven**: touch tasks to keep them warm, let unused tasks naturally cool and sink.

## MVP Architecture: Single Unified List

### No Buckets (For Now)
- All tasks live in one list, sorted by either Importance or Heat
- No automatic bucket movement (Todo/Watch/Later deferred to Phase 4)
- Simpler mental model: one place to look, one decision to make (warm or cool)

### Cold Storage: Separate Knowledge System
- Tasks with heat ≤ 0.05 for 90+ days automatically move to Cold Storage
- Cold Storage is a **separate section/page** (not mixed with active tasks)
- Functions as knowledge management system:
  - Sorted by `last_touched_at` (recent items easier to find)
  - Searchable and browsable
  - Can be "rewarmed" to return to active list
  - Future enhancements: tags, rich notes, archival organization

## Heat Calculation Formula (MVP)

### Simplified Formula

Heat is calculated as a weighted sum, clamped to [0, 1]:

```typescript
heat = clamp(
  0.20 * base_importance +      // Foundation from priority/star
  0.25 * recency +               // Exponential decay from last touch (any touch)
  0.30 * heat_touches +          // NEW: explicit heat icon clicks (powerful override)
  0.15 * due_proximity +         // NEW: sigmoid function of days to due date
  0.05 * activity +              // Logarithmic scaling of other touches (edits)
  0.05 * creation_recency,       // Minimal weight (relies on sort override)
  0, 1
)
```

**Note on New Tasks:** Untouched tasks (both counters = 0) use a **manual sort override** to always appear at top of list, regardless of calculated heat. This guarantees visibility without relying solely on the creation_recency component.

### Component Definitions

#### 1. Base Importance (20% weight)
- Maps importance_v1 (2-12 range) → 0.0-1.0 linearly
- Formula: `(importance_v1 - 2) / 10`
- Provides foundation from priority and star
- **Note:** Due date now in separate component (see #4 below)

#### 2. Recency Score (25% weight)
- Exponential decay based on time since **any touch** (heat or other)
- Formula: `exp(-hours_since_touch / H)`
- **Default half-life (H): 168 hours (7 days)**
- Configurable as constant: `HEAT_DECAY_HALF_LIFE_HOURS = 168`
- Future: User-configurable in Settings

**Decay behavior:**
- Fresh touch (any type) → recency = 1.0
- After 7 days untouched → recency = 0.5
- After 14 days untouched → recency = 0.25
- After 21 days untouched → recency = 0.125

#### 3. Heat Touches (30% weight) - NEW
**The "Override" Component** - gives user explicit control to push tasks to top

- Linear scaling of heat icon clicks only (🔥)
- Formula: `min(heat_touch_count / 20, 1.0) * exp(-hours_since_last_heat_touch / 168)`
- Caps at **20 clicks** for maximum power
- Decays with 7-day half-life (same as general recency)

**Heat touch behavior:**
- 5 clicks (fresh) → 25% of scale → 7.5% total heat boost
- 10 clicks (fresh) → 50% of scale → 15% total heat boost
- 15 clicks (fresh) → 75% of scale → 22.5% total heat boost
- 20 clicks (fresh) → 100% of scale → 30% total heat boost
- After 7 days: heat contribution halved (decay)
- After 14 days: heat contribution quartered

**Power analysis:**
- 20 heat clicks + fresh recency (25%) = **0.55 base heat**
- Most tasks hover around 0.30-0.45 heat
- 0.55+ puts task in top tier
- Combined with any due date or importance → 0.70-0.80 (near top guaranteed)

**What counts as heat touch:**
- Only clicking 🔥 flame icon increments `heat_touch_count`
- Updates `last_heat_touched_at` timestamp
- Also updates `last_touched_at` (contributes to recency)

#### 4. Due Proximity (15% weight) - NEW
**Ensures impending deadlines bubble up**

- Sigmoid function of days until due date
- Formula: `1 / (1 + exp(days_to_due))` if due_date exists, else `0`
- Smooth curve: minimal effect far out, dramatic effect as date approaches

**Due proximity behavior:**
| Days to Due | Proximity Score | Heat Contribution (15% weight) |
|-------------|----------------|-------------------------------|
| 7+ days | ~0.00 | ~0% (minimal) |
| 3 days | 0.047 | 0.7% |
| 1 day | 0.269 | 4.0% |
| Today (0) | 0.500 | 7.5% |
| 1 day overdue | 0.731 | 11.0% |
| 3 days overdue | 0.953 | 14.3% |
| 7+ days overdue | ~1.00 | ~15% (max) |

**Key insight:** Past-due tasks get **increasing** heat to stay visible, not penalized for being late.

#### 5. Activity Score (5% weight)
- Logarithmic scaling of **other touches** (not heat icon)
- Formula: `log(1 + other_touch_count) / log(1 + T)` where T=20
- Caps at 20 touches

**What counts as "other touch":**
- Editing title, notes, project
- Changing priority, due date, star status
- Any field edit except checking off task
- Does NOT include clicking 🔥 heat icon

**Activity behavior:**
- 1 edit → 0.228 → 1.1% total heat
- 5 edits → 0.588 → 2.9% total heat
- 10 edits → 0.788 → 3.9% total heat
- 20 edits → 1.000 → 5.0% total heat

**Rationale:** General edits show engagement but shouldn't overpower explicit heat touches or due dates.

#### 6. Creation Recency (5% weight)
- Minimal weight since new tasks use sort override
- Formula: `exp(-days_since_created / 60) * max(0, 1 - (heat_touch_count + other_touch_count))`
- Drops to zero after **any touch**

**Creation recency behavior:**
- New task (0 touches) → 1.0 → 5% total heat
- After 1 touch (any type) → 0 → 0% (relies on sort override)

**Rationale:**
- New tasks appear at top via manual sort override (not formula)
- This component provides slight boost if untouched for extended period
- But primary mechanism is sort override

### Constants (Easily Adjustable)

```typescript
// Core decay settings
const HEAT_DECAY_HALF_LIFE_HOURS = 168;       // 7 days for general recency
const HEAT_TOUCH_DECAY_HALF_LIFE_HOURS = 168; // 7 days for heat touch power
const HEAT_TOUCH_CAP = 20;                     // 20 heat clicks = maximum power
const ACTIVITY_CAP = 20;                       // 20 other touches = maximum
const CREATION_DECAY_DAYS = 60;                // Creation boost diminishes over 60 days

// Component weights
const WEIGHT_BASE = 0.20;            // Base importance (priority + star)
const WEIGHT_RECENCY = 0.25;         // Time since any touch
const WEIGHT_HEAT_TOUCHES = 0.30;    // Heat icon clicks (powerful override)
const WEIGHT_DUE_PROXIMITY = 0.15;   // Due date urgency
const WEIGHT_ACTIVITY = 0.05;        // Other touches (edits)
const WEIGHT_CREATION = 0.05;        // Creation recency (minimal, uses sort override)

// Cold storage thresholds
const COLD_STORAGE_HEAT_THRESHOLD = 0.05;
const COLD_STORAGE_DAYS_THRESHOLD = 90;

// Snooze/resurface settings
const SNOOZE_PROXIMITY_BOOST_MAX = 0.30;  // Maximum heat boost on resurface date
const SNOOZE_PROXIMITY_WINDOW_DAYS = 7;   // Days before resurface when boost starts

// Staleness refresh threshold (single list)
const HEAT_STALENESS_HOURS = 6;  // Recalculate if older than 6 hours
```

### New Task Behavior

New tasks use a **manual sort override** to guarantee top placement:

**Sort Override Logic:**
```typescript
// Untouched tasks always sort to top, regardless of calculated heat
if (task.heat_touch_count === 0 && task.other_touch_count === 0) {
  // This is a NEW task - force to top of list
  return SORT_FIRST;
}
```

**Visual Styling:**
- Task title displayed in **BOLD GREEN** text until first touch
- After any touch (heat or other), styling returns to normal
- Task enters normal heat-sorted list

**Behavior:**
- All new tasks appear at top of list
- Sorted among themselves by calculated heat (creation_recency component)
- After any touch, task drops into heat-sorted list based on its score
- Ensures user sees and processes new tasks (sets due date, priority, or acknowledges)

**Rationale:**
- Foolproof: new tasks cannot be buried
- Simple: no reliance on formula tuning
- Predictable: user knows exactly where to find new tasks

## Dual Scoring System: Importance + Heat

### Parallel Calculation
- Both Importance v1 and Heat v2 calculated for every task
- Stored in database: `importance` (2-12) and `heat` (0.0-1.0)
- User chooses which to display and sort by

### Toggle Control
**Sort/Display Mode Toggle** (per view, persisted):
- **Importance Mode**: Sort by importance descending, display importance badge
- **Heat Mode**: Sort by heat descending, display heat badge

**UI Location:**
- Toggle button in task list header/toolbar
- Icon: 🔥 Heat | ⚡ Importance
- Keyboard shortcut: `Shift+S` (toggle sort mode)

### Badge Display

**Importance Badge** (when in Importance mode):
- Numeric value: 2-12
- Color-coded:
  - 2-4: Gray (low)
  - 5-7: Blue (medium)
  - 8-10: Orange (high)
  - 11-12: Red (urgent)
- Tooltip: "Importance: 10"

**Heat Badge** (when in Heat mode):
- Shows heat level with color gradient
- Displays cooling stage:
  - **Hot** (0.70-1.0): Red - "Hot"
  - **Warm** (0.50-0.70): Orange - "Warm"
  - **Cooling** (0.30-0.50): Yellow - "Cooling"
  - **Cool** (0.15-0.30): Blue - "Cool"
  - **Cold** (0.05-0.15): Light Blue - "Cold"
  - **Freezing** (<0.05): Gray - "Freezing"

**Heat Badge Tooltip/Modal:**
Hover (or click on mobile) shows detailed breakdown:

```
┌─────────────────────────────────────────┐
│ Heat Breakdown: 0.73 (Hot)              │
├─────────────────────────────────────────┤
│ Base Importance:    0.14  (20% weight)  │
│   Priority: High, Star: Yes             │
│                                         │
│ Recency:            0.25  (25% weight)  │
│   Last touched: 2 days ago              │
│                                         │
│ Heat Touches:       0.21  (30% weight)  │
│   14 clicks, last: 3 days ago           │
│                                         │
│ Due Proximity:      0.11  (15% weight)  │
│   Due in 1 day (Jan 15)                 │
│                                         │
│ Activity:           0.02  (5% weight)   │
│   8 edits                               │
│                                         │
│ Creation:           0.00  (5% weight)   │
│   Created 30 days ago                   │
├─────────────────────────────────────────┤
│ Next Check-in: Resurfaces in 3 days     │
└─────────────────────────────────────────┘
```

**Tooltip shows:**
- Each component's contribution (0.00-1.00 scale)
- Weight percentage for context
- Human-readable explanation (e.g., "14 clicks, last 3 days ago")
- Resurface calculator at bottom
- Educational: helps user understand what drives heat

**New Task Styling** (appears in both modes):
- Task title rendered in **BOLD GREEN** when both counters = 0
- Condition: `heat_touch_count === 0 && other_touch_count === 0`
- Returns to normal styling after any touch
- No separate badge needed - styling is the indicator
- Green color: `text-green-600` (light mode), `text-green-400` (dark mode)
- Font weight: `font-bold`

## Core Interactions

### 1. Warm (Touch) Interaction

**Icon:** 🔥 Flame icon on each task row

**Behavior:**
- Single click increments `heat_touch_count` (dedicated counter)
- Sets `last_heat_touched_at` to current timestamp
- Also updates `last_touched_at` (contributes to recency)
- Recalculates heat immediately (boosts heat_touches and recency components)
- Badge updates to reflect new heat
- **Note**: Task position does NOT automatically change - user must click refresh to re-sort

**Keyboard Shortcut:** `T` (when task focused)

**Optimistic UI:**
- Heat/importance badge updates instantly
- Green bold styling removed if first touch (new task → touched)
- Async server persistence
- Task stays in current position until manual refresh

**Heat Impact:**
- Each click adds ~5% to heat (at 20% of scale × 30% weight)
- 10 clicks = ~15% total boost
- 20 clicks = ~30% total boost (maximum)
- Decays with 7-day half-life

### 2. Cool (Snooze) Interaction

**Icon:** ❄️ Snowflake icon on each task row

**Behavior:**
1. Click opens **date picker popover**
2. User selects "resurface date" (when task should return to top)
3. System applies cooling and sets resurface date:
   - Sets `next_surface_at` to selected date
   - Applies initial cooling (drops heat significantly)
   - Task remains visible in list (not hidden)
4. **Exception to manual refresh:** Task **immediately drops** to new position
   - Automatic re-sort on snooze only
   - Provides instant feedback that snooze worked
5. As resurface date approaches, task gradually heats up (visible after refresh)
6. On resurface date, task reaches peak heat (~0.80+) and appears at/near top (after refresh)

**Date Picker Options:**
- Quick presets: +1 day, +3 days, +1 week, +2 weeks, +1 month
- Custom date selector
- Shows preview: "Task will heat up and resurface at top on [date]"

**Keyboard Shortcut:** `S` (when task focused)

**Heat Calculation with Snooze:**
When `next_surface_at` is set, heat formula includes proximity boost:
```typescript
// Standard heat calculation
let heat = calculateBaseHeat(task);

// If snoozed, add proximity boost as resurface date approaches
if (task.next_surface_at) {
  const hours_until_resurface = (task.next_surface_at - now) / 3600000;
  const days_until_resurface = hours_until_resurface / 24;

  // Apply proximity boost that increases as date approaches
  // At 7+ days away: no boost (task stays cool)
  // At 3 days away: moderate boost
  // At 1 day away: significant boost
  // On resurface date: maximum boost (0.30)
  if (days_until_resurface <= 7) {
    const proximity_boost = 0.30 * (1 - days_until_resurface / 7);
    heat = Math.min(1.0, heat + proximity_boost);
  }

  // On or past resurface date, clear next_surface_at and apply final boost
  if (hours_until_resurface <= 0) {
    task.next_surface_at = null;
    task.last_touched_at = now;  // Fresh touch on resurface
    heat = Math.min(1.0, heat + 0.30);
  }
}

return clamp(heat, 0, 1);
```

**Visual Indicator for Snoozed Tasks:**
- Small clock/calendar icon next to task title: 🕐
- Tooltip: "Resurfaces in 3 days (Jan 15)"
- Icon disappears when resurface date passes

### 3. Resurface Calculator Display

**Location:** Heat badge tooltip, task detail view

**Calculation:**
Based on current heat and decay rate, estimate when task will naturally reach top of list (heat ~0.80):
```typescript
// If cooling: estimate when heat will drop to specific level
// If warming: estimate time to reach top
const current_heat = task.heat;
const target_heat = 0.80;  // "Top of list" threshold

if (current_heat >= target_heat) {
  // Already hot, estimate when it will cool to medium
  const hours_to_cool = H * log(current_heat / 0.50);
  return `Will cool to medium in ${formatDuration(hours_to_cool)}`;
} else {
  // Cooling, estimate when it hits cold storage
  const hours_to_cold = H * log(current_heat / COLD_STORAGE_HEAT_THRESHOLD);
  return `Will reach cold storage in ${formatDuration(hours_to_cold)}`;
}
```

**Display Examples:**
- "Resurfaces in 3 days" (if snoozed)
- "Will cool to medium in 5 days"
- "Reaches cold storage in 23 days"
- "Won't resurface without touch" (heat too low, no snooze)

## Cold Storage System

### Automatic Retirement

Tasks move to Cold Storage when:
- `heat ≤ 0.05` continuously for 90+ days
- User manually archives task

### Cold Storage UI

**Separate Section/Page:**
- Not mixed with active task list
- Accessed via sidebar link: "Cold Storage" or "Archive"
- Distinct visual treatment (grayed, different layout)

**Features:**
- **Default Sort**: `last_touched_at` descending (recent items first)
- **Alternative Sorts**: Created date, alphabetical, project
- **Search**: Full-text search across title and notes
- **Filter**: By project, date range, original priority
- **Batch Operations**: Select multiple to rewarm or permanently delete

**Task Display:**
- Shows original task data (title, notes, metadata)
- Displays "Retired on [date]"
- Last touched: "Touched 3 months ago"
- Rewarm button: Returns to active list with fresh heat boost

### Rewarm from Cold Storage

**Action:** Click "Rewarm" button on cold storage task

**Behavior:**
1. Task moves back to active list
2. Heat recalculated with fresh touch:
   - `touch_count` incremented
   - `last_touched_at` set to now
   - Creation recency no longer applies (old task)
   - Heat likely in 0.4-0.6 range (warm, but not top)
3. Task appears in middle of active list
4. User can immediately warm again to boost higher

## Sorting Behavior

### Manual Refresh Requirement

**Critical UX Pattern:**
- Task positions do **NOT** automatically update when heat/importance values change
- Prevents disorientation when editing tasks (e.g., removing due date doesn't make task disappear mid-edit)
- User maintains visual stability while working on multiple tasks

**Refresh Control:**
- **Icon**: 🔄 Refresh icon in header toolbar (next to column visibility toggle)
- **Action**: Click to re-sort list based on current heat/importance values
- **Keyboard Shortcut**: `Shift+R`
- **Visual Feedback**: Brief spinner animation during re-sort
- **Behavior**:
  - Recalculates stale heat values
  - Re-sorts list based on current sort mode (importance or heat)
  - Animates tasks to new positions

**When to Refresh:**
- After touching/cooling several tasks
- After editing due dates or priorities
- Periodically to see natural heat decay effects
- After changing sort mode (importance ⟷ heat)

### Sort Modes

#### Importance Mode
**Sort Order:**
1. Importance (descending) - 12 → 2
2. Due date proximity (ascending) - soonest first
3. Star (starred first)
4. Created date (newest first)

#### Heat Mode
**Sort Order:**
1. Heat (descending) - 1.0 → 0.0
2. Importance (descending) - fallback for ties
3. Last touched (descending) - most recent first
4. Created date (newest first)

### Special Sections

**Snoozed Tasks:**
- Remain visible in main list (not hidden)
- Show clock icon 🕐 to indicate snooze status
- Heat gradually increases as resurface date approaches
- On resurface date, receive heat boost to appear at top (after refresh)

**Completed Tasks:**
- Move to bottom of current view
- Sorted by completion date (recent first)
- Heat calculation stops (frozen at completion value)
- Collapsible section

**Cold Storage:**
- Completely separate page/section
- Sorted by `last_touched_at` (recent first)
- Not visible in main task list

## Data Model

### New Task Fields

```typescript
{
  // Existing fields
  id: string,
  title: string,
  importance: number,              // 2-12 (Importance v1)
  priority: number,                // 0=None, 1=Low, 2=Med, 3=High, 4=Top
  due_date: Date | null,
  star: boolean,
  completed: boolean,
  created_at: Date,

  // New heat fields
  heat: number,                    // 0.0-1.0, dynamically calculated
  heat_calculated_at: Date | null, // Timestamp of last calculation (lazy refresh)

  // Split touch tracking
  heat_touch_count: number,        // Only 🔥 icon clicks (0 = NEW)
  other_touch_count: number,       // All other edits (title, priority, etc.)
  last_heat_touched_at: Date | null, // Most recent heat touch (for heat decay)
  last_touched_at: Date | null,    // Most recent touch of any type (for recency)

  next_surface_at: Date | null,    // Snooze until date (null if not snoozed)
  cold_storage_at: Date | null,    // Timestamp when moved to cold storage
}
```

**Touch Counter Behavior:**

| Action | heat_touch_count | other_touch_count | last_heat_touched_at | last_touched_at |
|--------|-----------------|-------------------|---------------------|----------------|
| Click 🔥 heat icon | ✓ increment | - | ✓ update | ✓ update |
| Edit title | - | ✓ increment | - | ✓ update |
| Change priority | - | ✓ increment | - | ✓ update |
| Change due date | - | ✓ increment | - | ✓ update |
| Add/edit note | - | ✓ increment | - | ✓ update |
| Star/unstar | - | ✓ increment | - | ✓ update |
| Change project | - | ✓ increment | - | ✓ update |
| Complete task | - | - | - | ✓ update |

**On Completion:**
- Counters **preserved** (not reset) for history
- Heat recalculated but frozen (no further changes until uncompleted)
- Task moves to completed section at bottom

### Database Migration

```sql
-- Add heat columns to tasks table
ALTER TABLE tasks ADD COLUMN heat REAL DEFAULT 0.5;
ALTER TABLE tasks ADD COLUMN heat_calculated_at TIMESTAMP;

-- Split touch tracking
ALTER TABLE tasks ADD COLUMN heat_touch_count INTEGER DEFAULT 0;
ALTER TABLE tasks ADD COLUMN other_touch_count INTEGER DEFAULT 0;
ALTER TABLE tasks ADD COLUMN last_heat_touched_at TIMESTAMP;
ALTER TABLE tasks ADD COLUMN last_touched_at TIMESTAMP;

-- Snooze and cold storage
ALTER TABLE tasks ADD COLUMN next_surface_at TIMESTAMP;
ALTER TABLE tasks ADD COLUMN cold_storage_at TIMESTAMP;

-- Index for heat sorting
CREATE INDEX idx_tasks_heat ON tasks(heat DESC) WHERE completed = FALSE AND cold_storage_at IS NULL;

-- Index for cold storage queries
CREATE INDEX idx_tasks_cold_storage ON tasks(cold_storage_at, last_touched_at DESC) WHERE cold_storage_at IS NOT NULL;

-- Index for resurfacing queries
CREATE INDEX idx_tasks_resurfacing ON tasks(next_surface_at) WHERE next_surface_at IS NOT NULL;

-- Index for new task queries (both counters = 0)
CREATE INDEX idx_tasks_new ON tasks(heat_touch_count, other_touch_count) WHERE completed = FALSE AND heat_touch_count = 0 AND other_touch_count = 0;
```

### Settings Schema

```typescript
{
  // User preferences
  default_sort_mode: 'importance' | 'heat',  // Per-user default

  // Heat configuration (Phase 2: user-configurable)
  heat_decay_half_life_hours: number,        // Default 168 (7 days)
  heat_touch_decay_half_life_hours: number,  // Default 168 (7 days)
  heat_touch_cap: number,                    // Default 20 clicks
  activity_cap: number,                      // Default 20 edits

  heat_weight_base: number,                  // Default 0.20
  heat_weight_recency: number,               // Default 0.25
  heat_weight_heat_touches: number,          // Default 0.30
  heat_weight_due_proximity: number,         // Default 0.15
  heat_weight_activity: number,              // Default 0.05
  heat_weight_creation: number,              // Default 0.05

  // Cold storage thresholds
  cold_storage_heat_threshold: number,       // Default 0.05
  cold_storage_days_threshold: number,       // Default 90
}
```

## UI Components

### Task List Header (MVP)

```
┌─────────────────────────────────────────────────────────────┐
│ [Sort: Heat ▼] [🔄 Refresh] [👁️ Show Completed]          │
└─────────────────────────────────────────────────────────────┘

Components:
- [Sort: Heat ▼]: Sort mode dropdown (Importance ⟷ Heat)
- [🔄 Refresh]: Manual refresh button - re-sorts list (Shift+R)
- [👁️ Show Completed]: Toggle to show/hide completed tasks
```

### Task Row (MVP)

```
┌─────────────────────────────────────────────────────────────┐
│ [🔥] [❄️]  [Badge] 🕐? Task Title (bold green if new) [Due] │
│                    Task notes preview...                    │
└─────────────────────────────────────────────────────────────┘

Components:
- 🔥 Warm/Touch icon (clickable, keyboard: T)
- ❄️ Cool/Snooze icon (opens date picker, keyboard: S)
- [Badge]: Shows Importance (2-12) or Heat (color-coded) based on mode
- 🕐: Clock icon if snoozed (shows resurface date in tooltip)
- Task Title: BOLD GREEN if touch_count = 0, normal otherwise
- [Due]: Due date display
```

### Badge Component

**Props:**
- `mode: 'importance' | 'heat'`
- `value: number` (importance 2-12 or heat 0-1)
- `task: Task` (for heat breakdown calculation)

**Rendering:**
- Importance mode: Numeric badge with color
- Heat mode: Color gradient badge with stage label

**Tooltip/Modal (Heat Mode Only):**
- Hover shows detailed heat breakdown
- Click on mobile shows modal
- Displays each component's contribution:
  - Base Importance: value + context (priority, star)
  - Recency: value + last touched time
  - Heat Touches: value + click count + last heat touch time
  - Due Proximity: value + due date + days until/overdue
  - Activity: value + edit count
  - Creation: value + created date
- Shows weight percentages
- Includes resurface calculator at bottom
- Educational: helps user understand and optimize heat

### Task Title Component

**Props:**
- `title: string`
- `heatTouchCount: number`
- `otherTouchCount: number`

**Styling:**
- If `heatTouchCount === 0 && otherTouchCount === 0`: `className="font-bold text-green-600 dark:text-green-400"`
- Else: Normal styling
- Smooth CSS transition when first touched (fade from green to normal over 200ms)

### Date Picker Popover (Cool Interaction)

```
┌─────────────────────────────┐
│ Resurface this task on:     │
├─────────────────────────────┤
│ Quick:                      │
│  [Tomorrow] [+3d] [+1w]     │
│  [+2w] [+1m]                │
├─────────────────────────────┤
│ Custom:                     │
│  [Date Picker]              │
├─────────────────────────────┤
│ ℹ️ Task will appear at top   │
│   of list on selected date  │
│                             │
│      [Cancel]  [Snooze]     │
└─────────────────────────────┘
```

### Sort Mode Toggle

**Location:** Task list header/toolbar

**Design:**
```
┌──────────────────────────┐
│  Sort by: [Heat ▼]       │
│    • Heat                │
│    • Importance          │
└──────────────────────────┘
```

Or icon toggle:
```
[🔥 Heat] ⟷ [⚡ Importance]
```

**Behavior:**
- Click to toggle between modes
- Keyboard: `Shift+S`
- Persists per-user in settings
- Automatically triggers refresh (re-sort) when mode changes
- Badge display updates across all tasks

### Cold Storage Page

```
┌─────────────────────────────────────────────────────────┐
│ Cold Storage                                            │
│ ────────────────────────────────────────────────────────│
│ Sort: [Last Touched ▼]  [Search: ___________]  [Filter]│
├─────────────────────────────────────────────────────────┤
│ 📦 Task Title                  Touched 2 days ago       │
│    Retired 3 months ago        [Rewarm] [Delete]        │
├─────────────────────────────────────────────────────────┤
│ 📦 Another Old Task            Touched 1 week ago       │
│    Retired 6 months ago        [Rewarm] [Delete]        │
└─────────────────────────────────────────────────────────┘
```

## API Endpoints

### Heat-Specific Routes

#### Touch (Warm)
```typescript
POST /api/tasks/{id}/touch

Response: {
  data: {
    task: Task,           // Updated task with new heat
    heatDelta: number,    // Change in heat (e.g., +0.05 per click)
    heatBreakdown: {      // For tooltip display
      base: number,
      recency: number,
      heatTouches: number,
      dueProximity: number,
      activity: number,
      creation: number
    }
  }
}
```

#### Snooze (Cool)
```typescript
POST /api/tasks/{id}/snooze
Body: {
  nextSurfaceAt: Date  // When task should resurface
}

Response: {
  data: {
    task: Task,           // Updated task with next_surface_at set and cooling applied
    heatDelta: number,    // Change in heat (typically negative, e.g., -0.40)
    resurfaceDate: Date,  // Confirmed resurface date
    daysUntilResurface: number  // Days until task heats back up
  }
}
```

#### Get Active Tasks
```typescript
GET /api/tasks
Query: {
  sortMode: 'importance' | 'heat',
  includeCompleted: boolean
}

Response: {
  data: {
    tasks: Task[],        // Sorted by selected mode (includes snoozed tasks)
    metadata: {
      totalActive: number,
      snoozedCount: number,  // Count of tasks with next_surface_at set
      coldStorageCount: number
    }
  }
}
```

#### Get Cold Storage
```typescript
GET /api/tasks/cold-storage
Query: {
  sortBy: 'last_touched' | 'created' | 'title',
  search?: string,
  limit?: number,
  offset?: number
}

Response: {
  data: {
    tasks: Task[],
    total: number,
    page: number
  }
}
```

#### Rewarm from Cold Storage
```typescript
POST /api/tasks/{id}/rewarm

Response: {
  data: {
    task: Task,           // Task with fresh heat, removed from cold storage
    newHeat: number       // Heat after rewarm touch
  }
}
```

#### Bulk Heat Refresh
```typescript
POST /api/heat/refresh
Body: {
  taskIds?: string[]    // Optional: specific tasks, or all if omitted
}

Response: {
  data: {
    updatedCount: number,
    staleTasks: number    // How many were stale and recalculated
  }
}
```

## Architecture: Lazy Refresh Pattern

### Challenge
Heat is time-dependent (recency decay) and becomes stale as hours pass.

### Strategy: Lazy Refresh with Single Threshold

**Staleness Threshold:** 6 hours (constant: `HEAT_STALENESS_HOURS = 6`)

**On Read:**
1. Check `now - heat_calculated_at > 6 hours`
2. If stale: recalculate heat, update `heat_calculated_at`
3. If fresh: use cached `heat` value

**Trade-offs:**
- ✅ Avoids recalculating on every read
- ✅ Heat stays reasonably fresh (6-hour window)
- ✅ Acceptable for single-list sorting
- ⚠️ List order may be slightly stale between refreshes

### Background Refresh Job

**Frequency:** Every 6 hours (cron job)

**Actions:**
1. Identify all active tasks with stale heat
2. Batch recalculate heat for all stale tasks
3. Identify tasks eligible for cold storage (heat ≤ 0.05 for 90+ days)
4. Move eligible tasks to cold storage

**Endpoint:** `POST /api/heat/refresh` (scheduled via cron)

## Implementation Phases

### Phase 3.1: Core Heat Model (MVP)
**Goal:** Basic heat calculation and dual-sort working

1. **toodle-39**: Heat Data Model
   - Add columns: `heat`, `heat_calculated_at`, `touch_count`, `last_touched_at`, `next_surface_at`, `cold_storage_at`
   - Database migration
   - Update TypeScript types

2. **toodle-40**: Heat Calculation Engine
   - Implement `calculateHeat()` with 4 components
   - Add creation recency factor
   - Constants for easy tuning
   - Lazy refresh logic

3. **toodle-41**: Badge & Styling Components
   - Dual-mode badge (importance vs heat)
   - Color gradients for heat stages
   - Bold green styling for untouched tasks (touch_count = 0)
   - Clock icon for snoozed tasks
   - Tooltip with resurface calculator

4. **Manual Refresh & Sort Toggle**
   - Refresh button in header (🔄 icon)
   - Keyboard shortcut: Shift+R
   - Sort mode toggle (Importance ⟷ Heat)
   - Persist user preference
   - Auto-refresh on mode change only

### Phase 3.2: User Interactions (MVP)
**Goal:** Touch and Cool interactions working

5. **toodle-42**: Warm (Touch) UI
   - Flame icon on each task row
   - Keyboard shortcut `T`
   - Optimistic UI update (badge updates, no re-sort)
   - Remove bold green styling on first touch
   - API: `POST /api/tasks/{id}/touch`

6. **toodle-43**: Cool (Snooze) UI
   - Snowflake icon on each task row
   - Date picker popover with preview
   - Quick presets (+1d, +3d, +1w, +2w, +1m)
   - Keyboard shortcut `S`
   - API: `POST /api/tasks/{id}/snooze`
   - Proximity-based heat boost as date approaches
   - Clock icon 🕐 indicator for snoozed tasks
   - Tasks remain visible (not hidden)

7. **Resurface Calculator**
   - Tooltip enhancement for heat badge
   - Calculate time to resurface/cool/freeze
   - Display in human-readable format

### Phase 3.3: Cold Storage (MVP)
**Goal:** Separate knowledge management area

8. **Cold Storage UI**
   - Separate page/section
   - List view sorted by `last_touched_at`
   - Search functionality
   - Rewarm button
   - API: `GET /api/tasks/cold-storage`

9. **Automatic Retirement**
   - Background job: identify tasks heat ≤ 0.05 for 90+ days
   - Move to cold storage
   - Set `cold_storage_at` timestamp

10. **Rewarm Functionality**
    - API: `POST /api/tasks/{id}/rewarm`
    - Move back to active list with fresh touch

### Phase 3.4: Polish (MVP)
**Goal:** Production-ready

11. **Performance Optimization**
    - Database indexes for heat sorting
    - Bulk heat refresh endpoint
    - Background cron job (6-hour refresh)

12. **Testing**
    - Unit tests: heat formula, decay calculations
    - Integration tests: touch/cool/rewarm APIs
    - E2E tests: sort toggle, date picker, cold storage flow

13. **Settings UI** (Optional for MVP, can defer)
    - Configure decay half-life
    - Adjust component weights
    - Cold storage thresholds

## Testing & Validation

### Unit Tests

**Heat Calculation:**
- New task (both counters = 0) uses sort override to appear at top
- Heat touch increments heat_touch_count and maximizes heat_touches component
- Other edits increment other_touch_count and boost activity component
- Heat decays exponentially over time (7-day half-life)
- Due proximity increases as due date approaches (sigmoid curve)
- 20 heat clicks = maximum heat_touches power (30% weight)
- Creation recency drops to zero after any touch

**Snooze Calculation:**
- Setting next_surface_at applies initial cooling
- Proximity boost increases as resurface date approaches
- On resurface date, task receives heat boost
- Task remains visible throughout snooze period

**Cold Storage Logic:**
- Tasks with heat ≤ 0.05 for 90+ days marked for retirement
- Rewarm restores task with fresh heat

### Integration Tests

**API Endpoints:**
- `POST /api/tasks/{id}/touch` increments heat_touch_count and returns heat breakdown
- `POST /api/tasks/{id}/snooze` sets next_surface_at, cools task, auto-drops position
- `GET /api/tasks?sortMode=heat` returns correctly sorted list with new tasks at top
- `GET /api/tasks/cold-storage` returns retired tasks sorted by last_touched_at
- `POST /api/tasks/{id}/rewarm` moves task back to active list with preserved counters
- Field edits increment other_touch_count

**Lazy Refresh:**
- Stale heat (>6 hours old) triggers recalculation on read
- Fresh heat uses cached value
- Bulk refresh updates all stale tasks

### Acceptance Criteria (MVP)

✅ **Dual Sort Mode:**
- Toggle between Importance and Heat sorting works
- Badge updates to show correct metric
- Changing mode automatically triggers refresh

✅ **Manual Refresh:**
- Refresh button (Shift+R) re-sorts list
- Task positions stable until manual refresh
- Prevents disorientation during multi-task editing

✅ **Touch Interaction:**
- Clicking flame icon increments heat_touch_count
- Badge updates instantly with new heat value
- Heat breakdown tooltip shows component details
- Bold green styling removed after first touch
- Task position stays stable (requires manual refresh)
- 20 heat clicks pushes task to top tier

✅ **Cool Interaction:**
- Clicking snowflake opens date picker
- Selecting date sets next_surface_at and cools task
- **Exception:** Task immediately drops to new position (auto-sort)
- Task remains visible with clock icon 🕐
- Task gradually heats up as resurface date approaches
- On resurface date, task has high heat (~0.80+)

✅ **New Task Behavior:**
- New tasks (both counters = 0) always appear at top via sort override
- Task title in BOLD GREEN until any touch
- Both heat touches and edits remove green styling
- Sort override guarantees visibility

✅ **Due Date Handling:**
- Tasks with impending due dates receive proximity boost (15% weight)
- Past-due tasks stay hot (not penalized)
- Sigmoid curve provides smooth urgency increase

✅ **Heat Breakdown:**
- Hover on heat badge shows component breakdown
- Displays contribution from each of 6 components
- Shows human-readable context (click counts, dates)
- Includes resurface calculator
- Educational and transparent

✅ **Cold Storage:**
- Tasks with heat ≤ 0.05 for 90+ days auto-retire
- Cold Storage page accessible and searchable
- Rewarm returns task to active list with preserved touch history
- Touch counters never reset (preserved through completion/rewarm)
- Sorted by last_touched_at (recent first)

✅ **Resurface Calculator:**
- Tooltip shows accurate time until resurface/cool/freeze
- Updates dynamically as heat changes

✅ **Importance Safety Net:**
- High-importance tasks visible in both sort modes
- Deadline-critical tasks don't disappear
- User can switch modes if heat sorting feels off

## Future Enhancements (Post-MVP)

### Phase 4: Bucket Automation (Deferred)
- Reintroduce Todo/Watch/Later buckets as optional organizational layer
- Automatic bucket movement based on heat thresholds
- Bucket-specific decay rates

### Phase 5: Advanced Features
- Touch pattern recognition (weekly/monthly rhythms)
- Heat trajectory indicators (heating up vs cooling down)
- Project heat inheritance (touching one task warms related tasks)
- Cooling alerts (notifications before cold storage)

### Phase 6: Knowledge Management
- Enhanced cold storage with tags, categories
- Rich notes and attachments in cold storage
- Advanced search (full-text, filters, facets)
- Export/import for backup and portability

### Phase 7: Settings & Customization
- User-configurable decay half-life
- Adjustable component weights
- Custom heat thresholds
- Personalized cooling stages

## Summary: MVP Feature Checklist

### Core Mechanics
- [x] Single unified task list (no buckets)
- [x] Parallel Importance v1 and Heat v2 calculation
- [x] Heat formula with 6 components (base, recency, heat_touches, due_proximity, activity, creation)
- [x] Split touch tracking (heat_touch_count vs other_touch_count)
- [x] Heat touches powerful override (30% weight, 20 clicks = max)
- [x] Due proximity explicit (15% weight, sigmoid curve)
- [x] 7-day decay half-life (constant, easily adjustable)
- [x] New task sort override (untouched tasks always at top)

### UI Components
- [x] Sort mode toggle (Importance ⟷ Heat)
- [x] Manual refresh button (🔄) with Shift+R shortcut
  - Exception: Snooze auto-drops position immediately
- [x] Dual-mode badge (shows Importance or Heat)
- [x] Heat breakdown tooltip/modal on hover
  - Shows 6 component contributions
  - Human-readable context
  - Resurface calculator
- [x] Bold green task title for untouched tasks (both counters = 0)
- [x] Flame icon (🔥) for heat touch interaction
- [x] Snowflake icon (❄️) for cool/snooze interaction
- [x] Clock icon (🕐) for snoozed tasks
- [x] Date picker for snooze (quick presets + custom)
- [x] Show/Hide Completed toggle (not "column visibility")

### Cold Storage
- [x] Separate page/section for retired tasks
- [x] Automatic retirement (heat ≤ 0.05 for 90+ days)
- [x] Sorted by last_touched_at (recent first)
- [x] Rewarm functionality (preserves touch history)
- [x] Touch counters never reset (preserved through completion/rewarm)
- [x] Search and filter

### Data & Performance
- [x] Database schema with split touch counters
  - heat_touch_count, other_touch_count
  - last_heat_touched_at, last_touched_at
- [x] Lazy refresh pattern (6-hour staleness threshold)
- [x] Background refresh job
- [x] Database indexes for performance (including new task index)

### APIs
- [x] Touch endpoint (returns heat breakdown)
- [x] Snooze endpoint (auto-drops position)
- [x] Cold storage endpoints
- [x] Rewarm endpoint (preserves counters)
- [x] Bulk refresh endpoint
- [x] Field edit endpoints increment other_touch_count

**No bulk operations, no focus tab, no heat grouping, no automation (for MVP).**
