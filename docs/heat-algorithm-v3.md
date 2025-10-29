# Heat Algorithm V3 - Simplified Model

**Last Updated:** 2025-10-29
**Status:** Proposed

## Summary

Radical simplification of the heat algorithm by removing over-complicated components that extract signal from noise. Heat/cool are simple manual adjustments for relative task positioning with context-aware increments and drag & drop support.

## Design Principles

1. **Base importance works** - Priority + due date + star provide the primary signal
2. **Heat/cool are manual overrides** - Context-aware adjustments for relative positioning
3. **Remove noise** - Activity, due proximity, and creation date add complexity without clear value
4. **Negative heat allowed** - Cool can deboost even high importance tasks
5. **Star has power** - 3 levels provide permanent non-decaying boosts
6. **Asymmetric decay** - Cool decays faster than heat (temporary deferral vs persistent preference)
7. **Multiple positioning methods** - Heat/cool buttons AND drag & drop

## Formula

### Heat Score Components

```typescript
WEIGHT_BASE = 0.50        // 50% - Priority + due + star
WEIGHT_ADJUSTMENT = 0.45  // 45% - Manual heat adjustment (also serves as min/max cap)
WEIGHT_RECENCY = 0.05     // 5% - Time since last interaction

heat = clamp(
  0.50 * (baseImportance / 14) +
  heatAdjustment +                 // Direct contribution, no normalization needed
  0.05 * exp(-daysSinceLastTouch / 7),
  0, 1
)
```

**Key Change from V2:** Track heat adjustment DIRECTLY instead of counting clicks
- OLD: `heatTouchCount` (-20 to +20) → convert to percentage
- NEW: `heatAdjustment` (-0.45 to +0.45) → direct heat contribution
- Why: No arbitrary constants, perfect for context-aware and drag & drop

**Removed Components:**
- ❌ Activity touches (noisy signal - may be importance adjustment down)
- ❌ Due proximity (redundant with base importance)
- ❌ Creation recency (adds complexity, limited value)
- ❌ Decay-on-touch mechanism (over-complicated)

## Configuration Constants

All heat algorithm constants centralized in `lib/scoring/heat-config.ts`:

```typescript
export const HEAT_CONFIG = {
  // Component weights (must sum to 1.0)
  WEIGHT_BASE: 0.50,
  WEIGHT_ADJUSTMENT: 0.45,  // Also serves as min/max cap
  WEIGHT_RECENCY: 0.05,

  // Heat adjustment bounds
  MIN_HEAT_ADJUSTMENT: -0.45,
  MAX_HEAT_ADJUSTMENT: 0.45,

  // Decay rates (in days)
  HEAT_HALF_LIFE_DAYS: 7,   // Heat decays slowly (persistent preference)
  COOL_HALF_LIFE_DAYS: 3,   // Cool decays quickly (temporary deferral)

  // Context-aware increment caps
  MAX_BOOST_PER_CLICK: 0.05,  // Max heat increase per click (5%)
  MAX_DROP_PER_CLICK: 0.05,   // Max heat decrease per click (5%)
  COOL_SKIP_POSITIONS: 3,     // Number of positions to skip when cooling

  // Base importance scale
  BASE_IMPORTANCE_MAX: 14,  // Max base importance (priority 5 + star 3 + due 6)

  // New task handling
  NEW_TASK_SORT_OVERRIDE_HOURS: 48,
} as const
```

**Benefits:**
- Single source of truth for all constants
- Easy to tune heat "power" (change WEIGHT_ADJUSTMENT)
- No scattered magic numbers throughout codebase

## Base Importance (UNCHANGED from V1, except star)

### Current Importance V1 Formula

```typescript
baseImportance = priorityWeight + dueWeight + starLevel

// Priority weights (UNCHANGED)
low (0):    2 pts
medium (1): 3 pts
high (2):   4 pts
top (3):    5 pts

// Due date weights (UNCHANGED)
none:     0 pts
future:   3 pts  (>= 1 day away)
today:    5 pts
overdue:  6 pts

// Star levels (CHANGED from boolean)
none (0):   +0 pts
blue (1):   +1 pt
yellow (2): +2 pts
orange (3): +3 pts

// Total range: 2-14
// Min: low (2) + none (0) + none (0) = 2
// Max: top (5) + overdue (6) + orange (3) = 14
```

### Enhanced Star System

Star provides a **permanent non-decaying boost** to base importance:

| Level | Visual | Points | Use Case |
|-------|--------|--------|----------|
| 0 | ⭐ (gray) | +0 | Default |
| 1 | ⭐ (blue) | +1 | Mildly important |
| 2 | ⭐ (yellow) | +2 | Important |
| 3 | ⭐ (orange) | +3 | Very important |

**UI Behavior:** Clicking the star cycles through 4 states:
```
None (gray) → Blue → Yellow → Orange → None
```

**CSS Implementation:**
```css
.star-button[data-level="0"] { filter: grayscale(100%) opacity(30%); }
.star-button[data-level="1"] { filter: hue-rotate(200deg); } /* Blue */
.star-button[data-level="2"] { /* Default yellow */ }
.star-button[data-level="3"] { filter: hue-rotate(-20deg) saturate(1.3); } /* Orange */
```

## Context-Aware Heat/Cool

### Heat: Move Up 1 Position

**Goal:** Reduce friction - move task above the next highest task with single click

```typescript
function calculateHeatBoost(currentTask, visibleTasks) {
  const tasksAbove = visibleTasks
    .filter(t => t.heat > currentTask.heat)
    .sort((a, b) => a.heat - b.heat)

  if (tasksAbove.length === 0) {
    return 0.01  // At top, small absolute boost
  }

  const nextTask = tasksAbove[0]
  const gap = nextTask.heat - currentTask.heat
  const boost = gap + 0.01  // Just above next task

  return Math.min(boost, HEAT_CONFIG.MAX_BOOST_PER_CLICK)  // Cap at 5%
}

// Update task
heatAdjustment = Math.min(
  heatAdjustment + boost,
  HEAT_CONFIG.MAX_HEAT_ADJUSTMENT
)
```

**Behavior:**
- Single click moves task up 1 position (or +1% if at top)
- Bottom to top: ~9 clicks (vs 20 in simple increment model)
- Cap prevents mega-jumps in sparse distributions

### Cool: Move Down 3 Positions

**Goal:** Decisive cooling - skip 2 tasks to prevent ping-pong cycling

```typescript
function calculateCoolDrop(currentTask, visibleTasks) {
  const tasksBelow = visibleTasks
    .filter(t => t.heat < currentTask.heat)
    .sort((a, b) => b.heat - a.heat)

  if (tasksBelow.length === 0) {
    return -0.01  // At bottom, small absolute drop
  }

  // Skip 2 tasks (land at 3rd position below)
  const targetIndex = Math.min(2, tasksBelow.length - 1)
  const targetTask = tasksBelow[targetIndex]

  const gap = currentTask.heat - targetTask.heat
  const drop = -(gap + 0.01)  // Just below target

  return Math.max(drop, -HEAT_CONFIG.MAX_DROP_PER_CLICK)  // Cap at -5%
}

// Update task (always negative)
heatAdjustment = Math.max(
  heatAdjustment + drop,
  HEAT_CONFIG.MIN_HEAT_ADJUSTMENT
)
```

**Behavior:**
- Single click moves task down 3 positions (or -1% if at bottom)
- Skipping 2 tasks prevents one-up-one-down cycling
- Cooled tasks naturally bubble back up due to fast decay

**Sign Convention:**
- Heat adjustment: Always positive value added
- Cool adjustment: Always negative value added
- Display: Heat shows +X%, Cool shows -X%

## Asymmetric Decay

**Key Insight:** Heat and cool have different semantics

### Decay Formula

```typescript
function applyDecay(adjustment: number, daysSinceLastTouch: number): number {
  if (adjustment > 0) {
    // Heat: 7-day half-life (persistent preference)
    return adjustment * Math.exp(-daysSinceLastTouch * Math.LN2 / 7)
  } else {
    // Cool: 3-day half-life (temporary deferral)
    return adjustment * Math.exp(-daysSinceLastTouch * Math.LN2 / 3)
  }
}
```

### Decay Examples

**Heat (+45% adjustment):**
| Days | Remaining | % Retained |
|------|-----------|------------|
| 0    | +45%      | 100%       |
| 3    | +36%      | 80%        |
| 7    | +23%      | 50%        |
| 14   | +11%      | 25%        |

**Cool (-45% adjustment):**
| Days | Remaining | % Retained |
|------|-----------|------------|
| 0    | -45%      | 100%       |
| 3    | -23%      | 50% ← Bubbles up! |
| 7    | -6%       | 13% ← Nearly back! |
| 14   | -1%       | 2%         |

**Semantics:**
- **Heat** = "This is important to me" → Sticky, persistent preference
- **Cool** = "Not right now, ask me again soon" → Temporary deferral
- Cooled tasks naturally resurface for reconsideration

## Drag & Drop Positioning

**Secondary method** for absolute positioning (complements heat/cool buttons)

```typescript
function onDragEnd(draggedTask, newIndex, sortedTasks) {
  const taskAbove = sortedTasks[newIndex - 1]
  const taskBelow = sortedTasks[newIndex + 1]

  // Calculate target heat (midpoint between neighbors)
  let targetHeat
  if (taskAbove && taskBelow) {
    targetHeat = (taskAbove.heat + taskBelow.heat) / 2
  } else if (taskAbove) {
    targetHeat = taskAbove.heat - 0.01
  } else if (taskBelow) {
    targetHeat = taskBelow.heat + 0.01
  } else {
    targetHeat = 0.50 * (draggedTask.baseImportance / 14)
  }

  // Calculate required adjustment
  const baseHeat = 0.50 * (draggedTask.baseImportance / 14)
  const recencyHeat = 0.05 * Math.exp(-draggedTask.daysSinceLastTouch / 7)
  const requiredAdjustment = targetHeat - baseHeat - recencyHeat

  // Clamp and update
  const newAdjustment = Math.max(-0.45, Math.min(0.45, requiredAdjustment))

  updateTask({ heatAdjustment: newAdjustment })
}
```

**Edge Cases:**
- If target unreachable (base importance too high/low), cap at ±0.45
- Show ghost preview during drag
- Visual feedback on drop

**Two Complementary Methods:**
- **Heat/Cool buttons**: Quick, keyboard-friendly (H/C or ↑/↓)
- **Drag & Drop**: Visual, absolute positioning

## UI Design

### Task Row Layout

```
☐ [85%] 🔥 ❄️ ⭐ Task name
        ↑  ↑  ↑  ↑
     badge │  │  star (CSS colored)
       heat │  cool
```

**Badge (NO CHANGE):**
- Shows total heat percentage: `[85%]`
- Current gradient color (red/orange/yellow/etc)
- Keep existing implementation

### Action Buttons (Single Icons with Glow States)

**Heat Button:**
```tsx
<button onClick={handleHeat} className="heat-button" data-level={level}>
  🔥
</button>
```

**CSS Glow States:**
```css
/* Level based on absolute value of adjustment */
.heat-button[data-level="0"] { /* no glow */ }
.heat-button[data-level="1"] {
  box-shadow: 0 0 8px rgba(255,100,0,0.3);
}
.heat-button[data-level="2"] {
  box-shadow: 0 0 12px rgba(255,100,0,0.5);
}
.heat-button[data-level="3"] {
  box-shadow: 0 0 16px rgba(255,100,0,0.7);
  animation: pulse-fire 2s ease-in-out infinite;
}
```

**Cool Button:**
```tsx
<button onClick={handleCool} className="cool-button" data-level={level}>
  ❄️
</button>
```

**CSS Glow States:**
```css
.cool-button[data-level="0"] { /* no glow */ }
.cool-button[data-level="1"] {
  box-shadow: 0 0 8px rgba(100,150,255,0.3);
}
.cool-button[data-level="2"] {
  box-shadow: 0 0 12px rgba(100,150,255,0.5);
}
.cool-button[data-level="3"] {
  box-shadow: 0 0 16px rgba(100,150,255,0.7);
  animation: pulse-ice 2s ease-in-out infinite;
}
```

**Glow Level Calculation:**
```typescript
function getAdjustmentLevel(adjustment: number): 0 | 1 | 2 | 3 {
  const abs = Math.abs(adjustment)
  if (abs >= 0.30) return 3  // Strong glow + pulse
  if (abs >= 0.15) return 2  // Medium glow
  if (abs >= 0.05) return 1  // Light glow
  return 0                    // No glow
}
```

### Tooltips

**Heat View Tooltip:**
```
┌─────────────────────────────────────┐
│ Heat Breakdown (85%)                │
├─────────────────────────────────────┤
│ Base Importance    42%  (8/14)     │
│   Priority (High):      4 pts      │
│   Due (Today):          5 pts      │
│   Star (Yellow):        2 pts      │
│                                     │
│ Heat Adjustment   +38%              │
│   [████████░░]                      │
│   Heated 3 days ago                 │
│   Decayed from +42%                 │
│                                     │
│ Recency             5%              │
│   Last touched 3 days ago           │
├─────────────────────────────────────┤
│ Total Heat:        85%              │
└─────────────────────────────────────┘
```

**Importance View Tooltip:**
```
┌─────────────────────────────────────┐
│ Importance Breakdown (8/14)        │
├─────────────────────────────────────┤
│ Priority (High):       4 pts       │
│   Level 2 weight                    │
│                                     │
│ Due Date (Today):      5 pts       │
│   Due today weight                  │
│                                     │
│ Star (Yellow):         2 pts  ⭐   │
│   Level 2                           │
├─────────────────────────────────────┤
│ Total Importance:     11/14 (79%)  │
└─────────────────────────────────────┘
```

**Key Points:**
- Base shows both % contribution AND raw score: `42% (8/14)`
- Importance breakdown uses CURRENT algorithm weights
- No "clicked X times" (not tracking clicks)
- Show timestamp: "Heated 3 days ago"
- Show decay info: "Decayed from +42%"
- Heat always positive, cool always negative in display

## Use Case Validation

### Use Case 1: Cool a Done-For-Day Task

**Scenario:** Top priority task due today, finished for today, should drop below active tasks.

**Before:**
- Task: priority=top(3), due=today, star=yellow(2)
- Base importance: 5 + 5 + 2 = 12
- Base heat: 50% * (12/14) = 42.9%
- Adjustment: 0%
- Total heat: 42.9%

**Action:** Click cool once

**Context-aware calculation:**
- 3rd task below is at 28% heat
- Gap: 42.9% - 28% = 14.9%
- Drop: -(14.9% + 0.01%) = -14.91%
- Capped at: -5% (MAX_DROP_PER_CLICK)

**After:**
- Adjustment: -5%
- Total heat: 42.9% - 5% = 37.9%
- Result: Drops below several tasks ✓

**Action:** Click cool 2 more times (total 3 clicks)

**After:**
- Adjustment: ~-15%
- Total heat: 42.9% - 15% = 27.9%
- Result: Drops below 28% target task ✓

### Use Case 2: Heat a Low Priority Task to Top

**Scenario:** Low priority task, no due date, want to work on it today.

**Before:**
- Task: priority=low(0), due=none, star=none(0)
- Base importance: 2 + 0 + 0 = 2
- Base heat: 50% * (2/14) = 7.1%
- Adjustment: 0%
- Total heat: 7.1%

**Top task:**
- Total heat: 50%

**Action:** Click heat repeatedly

**Context-aware:**
- Each click moves up 1 position or +5% (whichever is less)
- Typical gaps in distributed list: 3-5%
- Estimated clicks: 50% - 7.1% = 42.9% / 5% = **~9 clicks**

**After 9 heat clicks:**
- Adjustment: +42.9%
- Total heat: 7.1% + 42.9% = 50%
- Result: Matches top priority tasks ✓

**Comparison to old model:**
- OLD: 20 clicks required
- NEW: 9 clicks required
- **Improvement: 55% fewer clicks**

### Use Case 3: Star as Permanent Boost

**Scenario:** Medium priority task that's always important.

**Without Star:**
- Task: priority=medium(1), due=none, star=none(0)
- Base importance: 3 + 0 + 0 = 3
- Heat: 50% * (3/14) = 10.7%

**With Orange Star:**
- Task: priority=medium(1), due=none, star=orange(3)
- Base importance: 3 + 0 + 3 = 6
- Heat: 50% * (6/14) = 21.4%

**Result:** +10.7% boost that never decays ✓

**Equivalent to:** ~5 heat clicks that don't fade

### Use Case 4: Asymmetric Decay

**Scenario:** Cool a task, then forget about it for a week.

**Initial:**
- Task: priority=high(2), due=tomorrow
- Base importance: 4 + 3 + 0 = 7
- Base heat: 25%
- Cool by 20%: Adjustment = -20%
- Total heat: 5%

**After 3 days:**
- Cool decay (3-day half-life): -20% → -10%
- Total heat: 25% - 10% = 15%
- **Bubbled up from 5% to 15%** ✓

**After 7 days:**
- Cool decay: -20% → -2.6%
- Total heat: 25% - 2.6% = 22.4%
- **Nearly back to baseline!** ✓

**Result:** Cooled tasks naturally resurface for reconsideration

## Implementation Changes

### Database Schema

```sql
-- Add star level column
ALTER TABLE tasks ADD COLUMN star_level INTEGER DEFAULT 0;
-- 0 = none, 1 = blue, 2 = yellow, 3 = orange

-- Migrate existing star boolean
UPDATE tasks SET star_level = 2 WHERE star = true;
UPDATE tasks SET star_level = 0 WHERE star = false;

-- Add heat adjustment column (replaces heatTouchCount)
ALTER TABLE tasks ADD COLUMN heat_adjustment REAL DEFAULT 0;
-- Range: -0.45 to +0.45

-- Migrate existing heatTouchCount to heatAdjustment
UPDATE tasks SET heat_adjustment = (heat_touch_count / 20.0) * 0.45;

-- Drop old columns
ALTER TABLE tasks DROP COLUMN star;
ALTER TABLE tasks DROP COLUMN heat_touch_count;

-- Optional: Deprecate snooze/activity columns
-- ALTER TABLE tasks DROP COLUMN next_surface_at;
-- ALTER TABLE tasks DROP COLUMN other_touch_count;
```

### API Changes

#### Heat Endpoint
```typescript
// POST /api/tasks/:id/heat
// Request: { increment?: number }  // Optional, calculated by client if context-aware
// Response: { task, heatDelta, heatBreakdown }

const boost = increment || 0.01  // Use provided or default
heatAdjustment = Math.min(task.heatAdjustment + boost, 0.45)
```

#### Cool Endpoint
```typescript
// POST /api/tasks/:id/cool
// Request: { decrement?: number }  // Optional, calculated by client if context-aware
// Response: { task, heatDelta, heatBreakdown }

const drop = decrement || -0.01  // Use provided or default (negative)
heatAdjustment = Math.max(task.heatAdjustment + drop, -0.45)
```

#### Star Endpoint
```typescript
// POST /api/tasks/:id/star
// Cycles through star levels: 0 → 1 → 2 → 3 → 0
// Response: { task, oldLevel, newLevel }

starLevel = (task.starLevel + 1) % 4
```

#### Drag & Drop Endpoint
```typescript
// POST /api/tasks/:id/position
// Request: { targetHeat: number }
// Response: { task, newAdjustment }

// Calculate required adjustment to reach targetHeat
const baseHeat = 0.50 * (task.baseImportance / 14)
const recencyHeat = 0.05 * Math.exp(-daysSinceLastTouch / 7)
const requiredAdjustment = targetHeat - baseHeat - recencyHeat
heatAdjustment = clamp(requiredAdjustment, -0.45, 0.45)
```

## Migration Strategy

### Phase 1: Schema Updates
1. Add `star_level` column (integer, default 0)
2. Add `heat_adjustment` column (real, default 0)
3. Migrate `star` boolean → `star_level`:
   - `star = true` → `star_level = 2` (yellow)
   - `star = false` → `star_level = 0` (none)
4. Migrate `heat_touch_count` → `heat_adjustment`:
   - `heat_adjustment = (heat_touch_count / 20.0) * 0.45`
5. Drop `star` column
6. Drop `heat_touch_count` column

### Phase 2: Algorithm Update
1. Create `lib/scoring/heat-config.ts` with constants
2. Update `lib/scoring/importance-v1.ts` to use `starLevel`
3. Create `lib/scoring/heat-v3.ts` with new formula
4. Update heat calculation to use direct adjustment
5. Implement asymmetric decay

### Phase 3: API Update
1. Update `/api/tasks/:id/heat` endpoint for context-aware
2. Create `/api/tasks/:id/cool` endpoint (replace snooze)
3. Create `/api/tasks/:id/star` endpoint for cycling
4. Create `/api/tasks/:id/position` endpoint for drag & drop

### Phase 4: UI Update
1. Update star button with CSS color states
2. Update heat/cool buttons with CSS glow states
3. Implement context-aware increment calculation
4. Implement drag & drop
5. Update tooltips (remove click count, add decay info)
6. Remove snooze UI components

### Phase 5: Testing
1. Verify use cases work as expected
2. Test context-aware positioning
3. Test drag & drop
4. Validate asymmetric decay
5. Confirm star cycling and colors
6. Test caps (±0.45, ±0.05 per click)

## Power Analysis

### Click Reduction

**Old Model (Fixed Increment):**
- Bottom (5%) to top (50%): 20 clicks
- Each click: +2.25%

**New Model (Context-Aware):**
- Bottom to top: ~9 clicks
- Each click: variable (up to 5% cap)
- **55% fewer clicks**

### Heat Power with Caps

**Maximum boost per click:** 5%
- Bottom to top: 45% / 5% = 9 clicks
- Typical (distributed tasks): 5-7 clicks

**Maximum drop per click:** 5%
- Top to bottom: similar to boost
- Skip 3 positions makes it faster for typical cases

**Why caps matter:**
- Prevents mega-jumps in sparse distributions
- Preserves meaningful interaction (each click feels important)
- Makes decay work naturally (old clicks fade)

## Open Questions

1. **Context-aware caps**: Is 5% per click the right balance?
2. **Cool skip count**: Is skipping 3 positions optimal, or should it be 2 or 4?
3. **Asymmetric decay ratio**: Is 7-day heat / 3-day cool the right ratio?
4. **New task window**: Is 48 hours the right duration for new task sort override?
5. **Drag & drop**: Should it update `lastHeatTouchedAt` or be considered passive?

## Future Enhancements

### Possible Additions (Not V3)
- **Snooze feature**: Separate from cool, with explicit resurface date (not tied to heat)
- **Heat presets**: Quick buttons for "+10%", "+20%", etc.
- **Bulk operations**: Heat/cool multiple tasks at once
- **Heat history**: Track adjustment changes over time
- **Keyboard shortcuts**: H (heat), C (cool), Shift+H (heat ×5)
- **Auto-cool on complete**: Option to cool task when checked off
- **Cold storage**: Automatic archival of long-neglected tasks
- **Heat bands**: Group tasks by heat ranges for visual organization
