# Focus Attention Boost (V1) — Functional Specification

**Status:** Proposed (brainstorm → V1 spec)
**Primary view:** All Tasks (unified list)

## Problem Statement

In the current experience, the top of the All Tasks list is strongly influenced by scoring signals like heat and due dates. This creates friction when a task is "top of mind" for the next 1–2 weeks but does **not** have a real due date:

- Setting a due date is extra cognitive load and often inaccurate for "soft" deadlines.
- Keeping a task "sticky" by leaving it overdue pollutes the due-date signal and mixes true deadlines with attention reminders.
- Priority and stars are intrinsic/long-term; using them as a temporary "keep this visible" mechanism distorts their meaning.

We want a low-friction way to mark tasks as "focus" so they stay near the top until explicitly unfocused.

## Goals

- Add a **focus toggle** that boosts a task's position in the unified list until turned off.
- Keep **priority** and **stars** intrinsic (do not mutate them for focus).
- Keep **due dates** reserved for real deadlines (do not require focus tasks to have due dates).
- Keep all tasks in the **same unified list**; focused tasks should be subtly highlighted.
- Add a **snooze** interaction so a focused task can "quiet down today" but resurface tomorrow.
- Add a Focus filter/view in the left project pane for quick review of focused items.

## Non-Goals (V1)

- No cap/limit on the number of focused tasks (may add later if clutter emerges).
- No multi-level focus (Warm/Hot/Spotlight). V1 is strictly **2-state**.
- No snooze duration presets (tomorrow only for V1; 3-day/week options may come later).
- No mobile-specific UX (desktop first; mobile long-press menu in later phase).

## Solution Summary (V1)

Add a new "Focus" toggle per task that:

1. Applies a **floor + multiplier boost** to the task's score when focused.
2. Uses a simple boolean toggle—no decay, no timestamps, no maintenance.
3. Provides a "Snooze until tomorrow" action that temporarily **removes the boost** while keeping the task visible (and visually de-emphasized).
4. Lets users toggle focus off when the task is no longer top-of-mind.
5. Adds a "Focus" entry in the left project pane (below "No project tasks") that filters the list to focused tasks.

## Data Model (Proposed)

Add columns to the task model:

- `isFocused: boolean` (default: false)
  - When true, the task is considered focused and receives the score boost.
- `focusSnoozeUntil: timestamp | null`
  - When set and in the future, focus boost is temporarily suppressed.

Notes:
- The focused state is 2-state: `isFocused = false` (off) vs `true` (on).
- No timestamps or decay calculations needed—focus persists until explicitly toggled off.

## Scoring Model (Floor + Multiplier)

### Constants

- `FOCUS_FLOOR = 30` — minimum effective score before multiplier
- `FOCUS_MULTIPLIER = 2` — multiplier applied after floor

### Formula

```
if (isFocused && !isSnoozed) {
  focusedScore = max(existingScore, FOCUS_FLOOR) * FOCUS_MULTIPLIER
} else {
  focusedScore = existingScore
}
```

Where:
- `existingScore` is the current unified scoring output (importance + heat + due/other terms)
- `isSnoozed = focusSnoozeUntil != null && now < focusSnoozeUntil`

### Why Floor + Multiplier?

A pure multiplier (e.g., 2x) doesn't help low-scoring tasks enough. A task with base score 8 would only reach 16—still far from the top band (typically 50+).

The floor ensures even low-priority, cold tasks reach at least `30 * 2 = 60` when focused, landing them solidly in the top band. Meanwhile, the multiplier preserves relative ordering among focused tasks based on their intrinsic importance.

### Score Examples

| Task type | Base score | Focused score |
|-----------|------------|---------------|
| Low priority, no due, cold | 8 | 60 (floor kicks in) |
| Medium priority, some heat | 25 | 60 (floor kicks in) |
| Medium-high priority | 35 | 70 (natural score used) |
| High priority | 55 | 110 (dominates) |
| Urgent, due soon | 70 | 140 (still on top) |

This lands most focused tasks in the 60–80 range, comfortably in the top band alongside naturally urgent items, while still letting truly urgent focused tasks rise above.

## UI/UX Spec (V1)

### Focus Button

- Add a "Focus" button next to heat/cool controls (and as a standalone control in non-heat views).
- Behavior:
  - If not focused: toggle focus on.
  - If focused: toggle focus off.
- Visuals:
  - Focused tasks render with a subtle background tint.
  - If snoozed, reduce the tint/opacity to convey "quieted" state.

### Focus View (Project Pane Filter)

- Add a "Focus" entry in the left project pane, below "No project tasks" and above regular projects.
- Display a count of focused tasks next to the label (e.g., "Focus (12)"), consistent with project task counts.
- Behavior:
  - Clicking "Focus" filters the list to tasks where `isFocused = true`.
  - Snoozed focused tasks remain visible in this view but stay visually de-emphasized (boost = 0 until wake).
  - Sorting stays consistent with All Tasks (same scoring calculation), so the view is a lens, not a different ordering system.
  - Projects remain a hard filter—Focus view shows focused tasks across all projects.

### Snooze (Hover-Only)

- Snooze appears on hover for focused tasks (to avoid constant UI clutter).
- Action: "Snooze until tomorrow"
  - Sets `focusSnoozeUntil` to 4:00 AM local time on the next calendar day.
  - Example: snooze at 3pm Tuesday → wakes at 4am Wednesday; snooze at 11pm Tuesday → wakes at 4am Wednesday.
- While snoozed:
  - Task remains visible in All Tasks (and in Focus view).
  - Task is visually de-emphasized.
  - Scoring removes the boost entirely (task falls back to base score).

## Interaction Details (V1)

### Focus On (from Off → On)

On click:

- `isFocused = true`
- `focusSnoozeUntil = null` (clear any prior snooze)

### Focus Off (from On → Off)

On click while already focused:

- `isFocused = false`
- `focusSnoozeUntil = null`

### Snooze

On snooze action (hover menu):

- `focusSnoozeUntil = nextDay at 4:00 AM local time`
- `isFocused` remains true

When snooze expires (automatically, on next score calculation):

- `focusSnoozeUntil` can remain in the past (no cleanup needed) or be cleared
- Boost resumes automatically since `now >= focusSnoozeUntil`

## Future Enhancements (Post-V1)

- Focus cap (10–15 max) with eviction policy + Undo.
- Multi-state focus (Hot/Spotlight) with different boost levels.
- Focus view refinements: show/hide snoozed, quick "unsnooze".
- Snooze presets (tomorrow, 3 days, next week) and "quiet hours" behavior.
- Mobile UX: long-press action menu including focus toggle, snooze, heat/cool.
- Analytics/telemetry: how often focus is used, number of focused tasks over time.

## Other Approaches Considered (Trade-offs)

### 1) Exponential decay with "boost into the band" (original V1 proposal)

**Idea:** Focus stores a `focusSetAt` timestamp and computes an exponentially decaying boost with a 2-week half-life. At focus time, compute an initial boost magnitude that lands the task in the "focus band" (top 10–15) based on the current list state.

Formula: `attentionBoost(now) = focusBoostInitial * exp(-LN2 * ageDays / 14)`

- Pros: self-cleaning—tasks naturally fade without manual unfocusing; "refresh" gesture re-boosts without thinking about dates; adaptive initial boost based on list composition.
- Cons: adds cognitive overhead ("how much has this decayed?"); requires periodic refresh maintenance; more complex data model (`focusSetAt`, `focusBoostInitial`); silent abandonment if you forget to refresh; decay math is overkill for a simple "keep this visible" need.

We chose the fixed toggle approach instead because the primary action should be "unfocus when done" (which aligns with task completion) rather than periodic "refresh" maintenance. The Focus view provides an easy audit mechanism to catch forgotten focused tasks.

### 2) Pure multiplicative boost (no floor)

**Idea:** `focusedScore = existingScore * 2` (or similar multiplier).

- Pros: simple; preserves relative ordering among focused tasks.
- Cons: doesn't help low-scoring tasks enough—a task with base score 8 only reaches 16, nowhere near the top band (typically 50+).

We chose floor + multiplier to guarantee even low-priority focused tasks reach the top band.

### 3) Mutate priority/stars/heat to force a task to the top

**Idea:** "Top" button maxes heat, increases priority, adds stars, etc., until it beats the current top score.

- Pros: no new concepts; uses existing knobs.
- Cons: permanently distorts intrinsic signals; hard to undo; can create "arms race" tasks that no longer reflect real priority.

### 4) Focus as a "heat floor"

**Idea:** Focus is implemented as a minimum heat value rather than a separate scoring term.

- Pros: can reuse existing heat visuals/decay semantics.
- Cons: conflates attention with "heat" meaning; harder to tune without impacting existing heat behavior; heat is interaction-driven, focus is intent-driven.

### 5) Pinned section / Spotlight section above the list

**Idea:** a separate pinned region above scored tasks.

- Pros: transparent; deterministic; no scoring games.
- Cons: creates a second region and slightly breaks "one unified list" goal.

### 6) Focus list toggle as a primary mode ("special project")

**Idea:** Focused tasks live in a Focus list you toggle into; snooze removes from Focus until tomorrow.

- Pros: clear separation; snooze model is very natural; avoids complex "beat score" math.
- Cons: split attention/mode switch; less "ambient reminder" in All Tasks unless Focus is the default view.

V1 chooses a hybrid: All Tasks remains primary, plus a Focus filter entry as a secondary lens.

### 7) Manual override ordering (client-side "move to top")

**Idea:** store manual ordering ranks and sort override-first.

- Pros: predictable; no scoring changes.
- Cons: introduces a second ordering system that can fight the scoring model; can accumulate hidden ordering state.

### 8) `reviewAt` / nudge scheduling instead of continuous boosting

**Idea:** tasks "resurface" at review times rather than being continuously boosted.

- Pros: great for soft reminders; avoids constant high ranking.
- Cons: doesn't provide a persistent "top of mind" band without additional mechanics.

### 9) Due date as a proxy for attention (current workaround)

**Idea:** set near-term due dates (or leave tasks overdue) to keep them high.

- Pros: already exists; effective.
- Cons: increases friction; corrupts due-date meaning; creates overdue noise.

