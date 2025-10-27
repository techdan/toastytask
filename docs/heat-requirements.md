# Heat Model Requirements

## Overview

The Heat Model (v2) is a dynamic scoring system that automatically surfaces "hot" (active, urgent) tasks and cools/archives "cold" (inactive, stale) items with minimal manual upkeep. Unlike the deterministic Importance v1 score, Heat evolves over time based on user interactions, due date proximity, and natural decay.

## Objectives

- **Reduce manual due-date churn**: Tasks naturally rise and fall without constant date adjustments
- **Auto-bubble important work**: High-activity and urgent tasks automatically surface
- **Intelligent cooling**: Long-neglected tasks fade into lower-priority buckets
- **User-guided prioritization**: Touch/Snooze give users fine control over task temperature

## Core Concepts

### Touch vs. Snooze

- **Touch**: Explicitly makes a task hotter; bumps position. No date change required. Increments `touch_count`, sets `last_touched_at`, applies immediate heat boost.
- **Snooze**: Cools/hides a task until a future date; the opposite of touch. Sets `next_surface_at` and applies temporary heat reduction (cooling).

While `now < next_surface_at`, task won't auto-escalate; normal decay still applies.

## Heat Calculation Formula

### Formula Components

Heat is calculated as a weighted sum of multiple factors, clamped to [0, 1]:

```
heat = clamp(
  0.40 * base +
  0.25 * recency +
  0.15 * activity +
  0.15 * due_proximity +
  bucket_bias +
  star_boost,
  0, 1
)
```

### Component Definitions

#### 1. Base Score (40% weight)
- Maps importance_v1 (2-12 range) → 0.0-1.0 linearly
- Provides foundation from priority, due date, and star
- Formula: `(importance_v1 - 2) / 10`

#### 2. Recency Score (25% weight)
- Exponential decay based on time since last touch
- Formula: `exp(-hours_since_touch / H)`
- Half-life (H) defaults vary by bucket:
  - **Todo**: 48 hours (2 days)
  - **Watch**: 168 hours (7 days)
  - **Later**: 720 hours (30 days)
- Fresh touches keep tasks hot; untouched tasks naturally cool

#### 3. Activity Score (15% weight)
- Logarithmic scaling of touch count
- Formula: `log(1 + touch_count) / log(1 + T)` where T=20
- Rewards frequent interaction without unbounded growth
- Heavily-touched tasks maintain elevated heat

#### 4. Due Proximity Score (15% weight)
- Sigmoid function of days until due date
- Tasks with no due date: score = 0
- Formula: `1 / (1 + exp(days_to_due))`
- Approaching deadlines increase heat smoothly
- **Past due does not block cooling**: Long-past-due tasks can still cool and de-escalate

#### 5. Bucket Bias (fixed adjustment)
- **Todo**: +0.15 (biases toward higher heat)
- **Watch**: 0 (neutral)
- **Later**: -0.15 (biases toward lower heat)
- Reflects urgency expectations per bucket

#### 6. Star Boost (fixed adjustment)
- **Starred**: +0.10
- **Unstarred**: 0
- Additional bump for user-flagged important items

### Initial Parameters (Tunable in Settings)

All parameters are configurable per-user in Settings:
- Recency half-lives (H): Todo=48h, Watch=7d, Later=30d
- Activity threshold (T): 20 touches
- Component weights: base=0.40, recency=0.25, activity=0.15, due_proximity=0.15
- Bucket bias values: Todo=+0.15, Watch=0, Later=-0.15
- Star boost: +0.10

## Touch Interaction

### Behavior
- Single click/shortcut increments `touch_count`
- Sets `last_touched_at` to current timestamp
- Applies immediate heat boost (recalculates heat with fresh timestamp)
- Does **not** change due date or bucket (unless automation thresholds trigger)

### UI Requirements
- Touch button/icon on each task row
- Keyboard shortcut: `t`
- Optimistic UI update (instant visual feedback)
- Async server persistence

### Effect on Heat
- Immediately maximizes recency component (exp(-0/H) = 1.0)
- Increments activity score slightly
- Visible bump in task position within sorted list

## Snooze Interaction

### Behavior
- Sets `next_surface_at` to future datetime
- Applies cooling effect (temporary heat reduction)
- Quick preset options align with bucket defaults:
  - **Todo**: +1 day (default)
  - **Watch**: +1 week (default)
  - **Later**: +1 month (default)
- Custom date picker available

### UI Requirements
- Snooze button/icon with dropdown menu
- Quick options: +1d, +3d, +1w, +1m (configurable in Settings)
- Keyboard shortcut: `s`
- Visual indicator: snoozed tasks show next surface date in tooltip

### Effect on Heat
- Reduces recency component (treats as if last touched long ago)
- Does **not** reset touch count or activity
- Tasks hidden from normal views until `next_surface_at` passes
- Normal decay continues during snooze period
- Won't auto-escalate while snoozed

### Snooze Default Settings
Default snooze durations per bucket (configurable in Settings):
- Todo → +1 day
- Watch → +1 week
- Later → +1 month

Adjusting these settings updates the quick-action button options immediately.

## Heat Decay Algorithms

### Natural Decay (Recency Component)
- Exponential decay: `exp(-hours_since_touch / H)`
- Half-life varies by bucket (faster decay in Todo, slower in Later)
- Continuous function: heat decreases smoothly over time
- No discrete "decay events" - calculated on-demand

### Bucket-Specific Half-Lives
| Bucket | Half-Life | Rationale |
|--------|-----------|-----------|
| Todo   | 48 hours  | Fast decay - tasks should stay fresh or move down |
| Watch  | 7 days    | Medium decay - weekly review cadence |
| Later  | 30 days   | Slow decay - long-term planning |

### Decay Behavior
- Untouched tasks gradually cool and sink in sorted order
- Very cold tasks (heat ≤ thresholds) trigger bucket de-escalation
- Decay continues even while snoozed
- Past-due status does **not** prevent cooling

## New Task Heat Behavior

### Initial Heat Boost
New tasks receive a temporary heat boost to ensure visibility near top of list.

**Settings**:
- `new_task_heat_boost`: Default 0.70 (configurable 0.0-1.0)
- `new_task_heat_half_life_hours`: Default 24 hours (configurable)

### Boost Decay
- Boost decays exponentially with its own half-life
- After 24 hours (default), boost contribution halved
- After 48 hours, boost mostly gone
- Task then relies on base importance and other factors

### Use Case
- Quick Add creates task with defaults (Due: Today, Bucket: Todo, Priority: Medium)
- Initial heat boost places near top of list
- User sees new task immediately
- Natural decay over 1-2 days unless touched or important

## Heat Visualization

### HeatChip Component
- Visual representation of heat value (0-1)
- Cold-to-hot gradient color scheme:
  - **Cold** (0.0-0.3): Blue tones
  - **Warm** (0.3-0.6): Purple tones
  - **Hot** (0.6-1.0): Red tones
- Appears at leading edge of each task row

### Tooltip
- Displays exact heat value (e.g., "Heat: 0.73")
- Shows next surface date if snoozed (e.g., "Resurfaces: Jan 15")
- Hints at contributing factors (optional enhancement)

### Global Color Palette
- Same color tokens apply across all buckets and views
- Configurable in Settings for theming (Phase 6)
- Consistent visual language throughout app

## Data Model

### New Task Fields

```typescript
{
  // Heat-related fields
  heat: number,                    // 0.0-1.0, dynamically calculated
  heat_calculated_at: Date | null, // Timestamp of last calculation (lazy refresh)
  touch_count: number,             // Cumulative touch interactions
  last_touched_at: Date | null,    // Timestamp of most recent touch
  next_surface_at: Date | null,    // Snooze until date (null if not snoozed)
}
```

### Database Migration

Add columns to `tasks` table:
- `heat` (REAL, default 0.5)
- `heat_calculated_at` (TIMESTAMP, nullable)
- `touch_count` (INTEGER, default 0)
- `last_touched_at` (TIMESTAMP, nullable)
- `next_surface_at` (TIMESTAMP, nullable)

## Settings Schema

### Heat Configuration

User-configurable settings for tuning heat model:

```typescript
{
  // Recency half-lives (hours)
  recency_half_life_todo: number,    // default 48
  recency_half_life_watch: number,   // default 168 (7 days)
  recency_half_life_later: number,   // default 720 (30 days)

  // Activity scaling
  activity_threshold: number,         // default 20 touches

  // Component weights
  heat_weight_base: number,          // default 0.40
  heat_weight_recency: number,       // default 0.25
  heat_weight_activity: number,      // default 0.15
  heat_weight_due_proximity: number, // default 0.15

  // Fixed adjustments
  bucket_bias_todo: number,          // default +0.15
  bucket_bias_watch: number,         // default 0
  bucket_bias_later: number,         // default -0.15
  star_boost: number,                // default +0.10

  // New task behavior
  new_task_heat_boost: number,       // default 0.70
  new_task_heat_half_life_hours: number, // default 24

  // Default snooze durations (days)
  default_snooze_todo: number,       // default 1 day
  default_snooze_watch: number,      // default 7 days
  default_snooze_later: number,      // default 30 days
}
```

## Bucket Automation (Heat Thresholds)

### Threshold-Based Movement

Heat drives automatic bucket escalation and de-escalation:

#### Escalation Rules
- **heat ≥ 0.75** → Move up one bucket
  - Watch → Todo
  - Later → Watch
- Evaluated daily and on app open
- No hard limit on escalations per day

#### De-escalation Rules
- **heat ≤ 0.25** in Todo → Watch
- **heat ≤ 0.15** in Watch → Later
- Evaluated daily and on app open
- No hard limit on de-escalations per day

#### Retirement Rule
- **Later** with **heat ≤ 0.05** for **90 days** → Archive
- Archived tasks remain searchable
- Reversible via restore operation

### Snooze Interaction with Automation
- While `now < next_surface_at`, task won't auto-escalate
- Normal decay still applies during snooze
- Once snooze expires, normal automation resumes

### Move Logging
- Every automatic move logged to `task_moves` table
- Captures: timestamp, reason (threshold/cadence/snooze/touch), old/new bucket
- Undo available (reverses last move per task)

### Automation Settings
Threshold values configurable in Settings:
- Escalation threshold (default 0.75)
- De-escalation thresholds (default 0.25 Todo, 0.15 Watch)
- Retirement threshold and duration (default 0.05 for 90 days)

## Focus (Heat-Based Dynamic List)

### Calculation
Dynamic list derived from heat distribution across all tasks:
- Select top tasks above **80th percentile** heat
- Minimum: 3 tasks (always show at least 3)
- Maximum: Adaptive based on elbow in heat distribution curve
- Recalculated whenever task list changes or heat updates

### User Control
- Users can **pin** tasks to Focus manually
- Pinning applies a small heat floor (prevents falling out of Focus due to minor decay)
- Users can **unpin** to return to automatic calculation

### Focus Tab UI
- Dedicated tab showing Focus list
- Visual indicator for pinned vs. auto-selected tasks
- Real-time updates as heat changes

### View Presets Using Focus
- **Hot Today**: Focus + high-heat Todo items
- Bulk touch/snooze operations available
- Preset filters configurable in Settings

## Heat Grouping (Visual Organization)

### 12-Band Heat Grouping

Lists support **"Group by Heat"** mode that maps continuous heat (0-1) into 12 discrete bands for visual clarity.

#### Band Thresholds (Tunable in Settings)

| Band | Heat Range      | Color Scheme     |
|------|-----------------|------------------|
| 1    | [0.00 - 0.08)  | blue-50 (coldest)|
| 2    | [0.08 - 0.16)  | blue-100         |
| 3    | [0.16 - 0.24)  | blue-200         |
| 4    | [0.24 - 0.32)  | blue-300         |
| 5    | [0.32 - 0.40)  | blue-400         |
| 6    | [0.40 - 0.48)  | amber-100        |
| 7    | [0.48 - 0.56)  | amber-200        |
| 8    | [0.56 - 0.64)  | amber-300        |
| 9    | [0.64 - 0.72)  | red-200          |
| 10   | [0.72 - 0.80)  | red-300          |
| 11   | [0.80 - 0.90)  | red-400          |
| 12   | [0.90 - 1.00]  | red-500 (hottest)|

#### Visual Design
- Section headers: "Heat Level: N" (order 12→1, hottest first)
- Color-coded background tint and left accent bar per band
- Task count badge per section
- Collapsible sections
- Sticky headers during scroll

#### Color Scheme
- **Cold** (Bands 1-5): Blue gradient (cool, inactive)
- **Warm** (Bands 6-8): Amber gradient (moderate activity)
- **Hot** (Bands 9-12): Red gradient (urgent, active)

### Grouping Controls
- Toggle: **Ungrouped** / **Group by Importance** / **Group by Heat**
- Persist choice per view (Todo, Watch, Later, etc.)
- Smooth transitions between modes

### CSS Theming
Define CSS variables for global palette:
- `--heat-1-bg` through `--heat-12-bg`
- `--heat-1-border` through `--heat-12-border`
- Configurable in Settings (Phase 6)

## Sorting Behavior

### Default Sort Order
1. **Heat** (descending) - hottest first
2. **Importance v1** (descending) - fallback for ties
3. **Due date proximity** (ascending) - closest deadlines first
4. **Last touched** (descending) - most recent first

### Completed Tasks
- Automatically move to bottom of list within their view
- Heat calculation continues (for analytics)
- Sorted separately within "Completed" section

### Snoozed Tasks
- Hidden from normal views until `next_surface_at` passes
- Appear in dedicated "Resurfacing" view when approaching surface date
- Resume normal sorting after surface date

## Architecture: Lazy Refresh Pattern

### Challenge
Heat is time-dependent and becomes stale as hours pass (due to recency decay).

### Strategy: Lazy Refresh
- Store `heat` **and** `heat_calculated_at` timestamp
- On read: if stale (`now - heat_calculated_at > threshold`), recalculate
- Staleness thresholds vary by bucket:
  - **Todo**: 1 hour
  - **Watch**: 6 hours
  - **Later**: 24 hours
- Complex formula acceptable cost when amortized
- Allows DB-side sorting by slightly-stale heat (acceptable trade-off)

### Rationale
- **Performance**: Avoid recalculating complex exponential functions on every read
- **Accuracy**: Time-sensitive decay reflected within reasonable staleness window
- **Scalability**: Supports future optimizations (background jobs, DB triggers)

### Bulk Refresh Endpoint
- Manual/scheduled endpoint: `POST /api/heat/refresh`
- Recalculates heat for all tasks (or filtered subset)
- Useful for:
  - Nightly cron job to ensure freshness
  - Settings changes (recalculate with new parameters)
  - Bulk operations (mass touch/snooze)

### Comparison with Importance v1
Importance v1 uses **Recalculate on Read** (always fresh, simple formula).
Heat v2 uses **Lazy Refresh** (complex formula, acceptable staleness).

See [docs/requirements.md](requirements.md) lines 247-271 for full architecture discussion.

## API Endpoints

### Heat-Specific Routes

#### Touch
```
POST /api/tasks/{id}/touch
Response: { data: { task, heatDelta } }
```
- Increments `touch_count`
- Sets `last_touched_at`
- Recalculates heat immediately
- Returns updated task and heat change

#### Snooze
```
POST /api/tasks/{id}/snooze
Body: { nextSurfaceAt: Date }
Response: { data: { task, heatDelta } }
```
- Sets `next_surface_at`
- Applies cooling (reduces recency component)
- Recalculates heat immediately
- Returns updated task and heat change

#### Bulk Heat Refresh
```
POST /api/heat/refresh
Body: { taskIds?: string[] } // optional filter
Response: { data: { updatedCount, tasks } }
```
- Recalculates heat for specified tasks (or all)
- Updates `heat_calculated_at` timestamps
- Returns count and updated task list

### Standard Task Routes
All task GET/PATCH routes return fresh or lazily-refreshed heat:
- `GET /api/tasks` - includes heat (refreshed if stale)
- `PATCH /api/tasks/{id}` - recalculates heat after update

## Testing & Validation

### Unit Tests
- Heat formula calculation with various inputs
- Exponential decay over time windows
- Bucket-specific half-life behavior
- Touch/snooze effects on heat
- New task boost decay over time

### Integration Tests
- Touch API increments touch_count and heat
- Snooze API sets next_surface_at and cools task
- Lazy refresh triggers on stale heat
- Bulk refresh updates all tasks
- Settings changes recalculate with new parameters

### Acceptance Criteria
✓ Touch raises heat immediately and moves task up within bucket
✓ Snooze lowers heat and hides until `next_surface_at`
✓ Past-due task untouched for weeks cools and can de-escalate despite being overdue
✓ Dynamic Focus shows tasks above heat percentile threshold
✓ Pinning keeps task in Focus even if slightly cooled
✓ Weekly automation moves items per thresholds; all moves logged and undoable
✓ Changing default settings updates behavior immediately (e.g., adjusting new-task heat boost changes where next task lands)

## Related Beads

### Phase 3: Heat Model Core (Epic: toodle-6)
Primary heat implementation tasks:

- **toodle-39** [P1]: Heat Data Model (add columns to tasks)
  - Add `heat`, `heat_calculated_at`, `touch_count`, `last_touched_at`, `next_surface_at` to schema
  - Database migration

- **toodle-40** [P1]: Heat Calculation Engine (heat-v2.ts)
  - Implement formula with all components (base, recency, activity, due_proximity, biases)
  - Exponential decay, activity scoring, bucket-specific half-lives
  - **Blocks**: toodle-56

- **toodle-41** [P1]: Heat Visualization (HeatChip component)
  - Cold-to-hot gradient (blue → purple → red)
  - Tooltip with heat value and next surface date

- **toodle-42** [P1]: Touch Interaction UI
  - Touch button/icon on task row
  - Keyboard shortcut `t`
  - Optimistic update with async persistence
  - **Blocks**: toodle-43

- **toodle-43** [P1]: Snooze Interaction UI
  - Snooze button with dropdown (quick presets)
  - Keyboard shortcut `s`
  - Custom date picker
  - **Depends on**: toodle-42

- **toodle-44** [P1]: Settings for Heat Tuning
  - UI for configuring all heat parameters
  - Live preview of heat changes
  - Default snooze durations per bucket

- **toodle-55** [P2]: Prepare heat calculation architecture with lazy refresh pattern (CLOSED)
  - Architectural planning completed

- **toodle-56** [P3]: Add heat_calculated_at and lazy refresh pattern
  - Implement staleness checks (thresholds: Todo 1h, Watch 6h, Later 24h)
  - Conditional recalculation on read
  - Bulk refresh endpoint
  - **Depends on**: toodle-40

### Phase 4: Bucket Automation (Epic: toodle-7)
Uses heat for automatic task movement:

- **toodle-45** [P1]: Automation Settings
  - Threshold configuration (escalate ≥0.75, de-escalate ≤0.25/0.15, retire ≤0.05)
  - Cadence settings (daily evaluation)

- **toodle-46** [P1]: Automation Engine (bucket-automation.ts)
  - Threshold evaluation logic
  - Bucket escalation/de-escalation
  - Retirement to archive
  - Snooze interaction (prevent escalation while snoozed)
  - **Depends on**: toodle-6

- **toodle-47** [P1]: Move Logging & Audit (task_moves table)
  - Log all automatic moves with reason
  - Undo functionality

- **toodle-48** [P1]: Resurfacing Tab UI
  - Show tasks approaching next_surface_at
  - Preview before resurfacing

- **toodle-49** [P1]: Automation Scheduler (cron/background job)
  - Daily evaluation of thresholds
  - Background heat refresh

### Phase 5: Focus & Dynamic Lists (Epic: toodle-8)
Uses heat for intelligent task prioritization:

- **toodle-50** [P1]: Focus Tab UI
  - Display dynamic Focus list
  - Pin/unpin controls
  - Visual indicator for pinned items

- **toodle-51** [P1]: View Presets (Hot Today, Weekly Review, Someday Browser)
  - Hot Today: Focus + high-heat Todo
  - Bulk touch/snooze from presets

- **toodle-94** [P2]: Focus calculation engine (dynamic 80th percentile)
  - Calculate 80th percentile heat across all tasks
  - Min 3, adaptive max based on elbow in distribution
  - Pinning applies heat floor

### Phase 6: Visual Grouping (Epic: toodle-9)
Heat-based visual organization:

- **toodle-91** [P3]: Heat grouping UI (12 bands with colors)
  - Map continuous heat to 12 bands
  - Section headers with color-coding
  - Collapsible sections

- **toodle-98** [P3]: Visual grouping controls and section headers
  - Toggle Ungrouped / Group by Importance / Group by Heat
  - Sticky headers with counts
  - Persist choice per view

## Implementation Phases

### Phase 3.1: Core Heat Model
1. Data model and migration (toodle-39)
2. Heat calculation engine (toodle-40)
3. Heat visualization chip (toodle-41)

### Phase 3.2: User Interactions
4. Touch UI and API (toodle-42)
5. Snooze UI and API (toodle-43)
6. Settings for tuning (toodle-44)

### Phase 3.3: Performance Optimization
7. Lazy refresh pattern (toodle-56)
8. Bulk refresh endpoint
9. Staleness thresholds tuning

### Phase 4: Automation
10. Threshold-based automation (toodle-46)
11. Move logging (toodle-47)
12. Resurfacing UI (toodle-48)
13. Background scheduler (toodle-49)

### Phase 5: Focus
14. Focus calculation (toodle-94)
15. Focus tab UI (toodle-50)
16. View presets (toodle-51)

### Phase 6: Grouping
17. Heat grouping UI (toodle-91)
18. Grouping controls (toodle-98)

## Future Enhancements

### Analytics & Insights
- Heat history chart per task (line graph over time)
- Touch frequency heatmap (calendar view)
- Bucket transition timeline
- Heat distribution histogram across all tasks

### Advanced Decay Models
- Custom decay curves (linear, sigmoid, step function)
- Context-aware decay (faster on weekdays, slower on weekends)
- Project-specific decay rates

### Machine Learning
- Learn user patterns to adjust heat parameters
- Predict which tasks user will touch next
- Suggest optimal snooze durations based on historical behavior

### Collaboration Features (Phase 3: Sync)
- Team heat: aggregate across users working on shared tasks
- Heat transfer: when task reassigned, inherit some heat
- Competitive focus: show team's hottest tasks

## References

- Main requirements: [docs/requirements.md](requirements.md)
  - Heat Model (lines 136-152)
  - Touch vs. Snooze (lines 23-25)
  - Architecture (lines 247-271)
  - Heat Grouping (lines 398-416)
- Importance v1 scoring: [lib/scoring/importance-v1.ts](../lib/scoring/importance-v1.ts)
- Database schema: [lib/db/schema.ts](../lib/db/schema.ts)
- Related epics: Phase 3 (toodle-6), Phase 4 (toodle-7), Phase 5 (toodle-8), Phase 6 (toodle-9)
