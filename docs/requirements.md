**Purpose**
- Build a personal task manager inspired by Toodledo’s tasks that automatically surfaces “hot” work and cools/archives “cold” items with minimal upkeep.

**Scope (MVP)**
- Single-user local app (auth later).
- Core task CRUD, Todo/Watch/Later buckets, sorting.
- Toodledo-compatible importance v1 plus a new heat model.
- Modern UI with Tailwind CSS and shadcn/ui; no copying of Toodledo code/assets.

**Out of Scope (Now)**
- Accounts/sync, collaboration, integrations, notifications, native apps.

**Core Concepts**
- Buckets: `Todo` (daily), `Watch` (weekly), `Later` (monthly/long tail).
- Importance v1: deterministic score compatible with Toodledo.
- Heat v2: dynamic score that rises with interaction/urgency and decays with time.
- Touch vs. Snooze:
  - Touch: explicitly makes a task hotter; bumps position. No date change required.
  - Snooze: cools/hides a task until a future date; the opposite of touch.

**MVP Functional Requirements**
- Task CRUD: title (required), priority (Low/Med/High/Top), star, due date (optional), repeat, project, bucket, completed, archived.
- Sorting: default by Heat desc; fallback by Importance v1 desc (12→2, highest first); then due proximity; then last touched desc.
  - Completed tasks automatically move to bottom of list within their view.
  - Importance display order: 12 (highest) → 2 (lowest) for visual hierarchy.
- Views
  - Tabs: Todo, Watch, Later, Resurfacing, Completed, Archived.
  - Filters: project, due state (none/future/today/past due), priority, starred.
  - Presets: Hot Today, Weekly Review, Someday Browser.
- Touch
  - Single click/shortcut increments `touch_count`, sets `last_touched_at`, applies heat boost.
  - Does not change due date or bucket unless automation thresholds trigger.
- Snooze / Next Surface
  - Quick options: +1d, +3d, +1w, +1m; sets `next_surface_at` and applies cooling (temporary heat reduction).
  - Default presets align with bucket snooze settings and update automatically when the user changes those defaults.
- Recurrence
  - Simple repeats: daily/weekly/monthly; completion advances due date.
- Keyboard Shortcuts
  - Quick add (simple input), inline edit, star, change priority, touch (`t`), snooze (`s`).
- Safety
  - Soft delete/archive with undo; move log visible per task.

**Notes (Per-Line, Versioned)**
- Notes Toggle in Task Row
  - Notes icon expands a read-only panel directly under the task. Panel background uses a muted yellow sticky-note tint.
  - Expanded state shows current note text (aggregated from lines) in read-only mode with preserved line breaks.
  - Clicking inside the panel swaps to an editable textarea that treats the notes as a single text blob; submitting transforms lines back into per-line records.
  - Clicking outside the textarea (blur) auto-saves, updates NoteRow versions, and returns to read-only view.
  - Reference layout and styling inspiration: `docs/Toodledo Sample UI.png` illustrates the stacked notes under each importance group.
- Notes Panel
  - Each visual line is its own record; Enter creates a new line; Shift+Enter inserts newline within the same line.
  - Inline actions per line: edit, reorder (drag/keyboard), delete, copy.
  - Show “last edited” timestamp per line; hovering reveals full history.
- Versioning
  - Editing a line creates a new version row; previous versions remain immutable and viewable.
  - Per-line history drawer with timestamps and diff view; restore creates a new version (no destructive edits).
- Search
  - Global search includes current note line text; history is searchable via advanced filter.
- Keyboard
  - `n` toggles Notes panel; `Enter` new line; `Ctrl+K` search within notes.

**Data Model (MVP)**
- Task
  - id, title
  - bucket: enum[Todo|Watch|Later]
  - priority: enum[Low|Med|High|Top], star: bool
  - due_at: datetime|null, repeat: enum[none|daily|weekly|monthly]
  - completed_at: datetime|null, archived_at: datetime|null
  - importance_v1: int (derived), heat: float, touch_count: int
  - last_touched_at: datetime|null, next_surface_at: datetime|null
  - created_at, updated_at
  - project_id: uuid|null
- Project
  - id, name, color_hex|null, archived_at|null, created_at, updated_at
- Settings (user-configurable)
  - Review cadences, decay rates, automation thresholds, focus behavior.
  - Default new-task values: bucket (default Todo), due date (default Today), priority (default Medium).
  - New-task heat behavior: `new_task_heat_boost` (default 0.70) and `new_task_heat_half_life_hours` (default 24).
  - Default snooze durations: Todo → +1 day, Watch → +1 week, Later → +1 month.
  - Global color palette tokens for importance/heat group backgrounds.
- Notes
  - NoteRow: id, task_id, ordinal, active_version_id, created_at, updated_at
  - NoteRowVersion: id, note_row_id, text, created_at
  - Stored in PostgreSQL with Drizzle schema definitions and migrations (see Non-Functional for tooling).

**Importance v1 (Compatibility Mode)**
- Priority weight: Low=2, Med=3, High=4, Top=5.
- Due weight: None=0, Future=3, Today=5, Past Due=6.
- Star: +1.
- Importance = PriorityWeight + DueWeight + Star.
- Display 2–12 range consistent with Toodledo semantics.

**Super Importance v2 (Heat Model)**
- Objective: Reduce manual due-date churn and auto-bubble tasks.
- Formula (initial parameters; tunable in Settings):
  - base = map importance_v1 (2–12) → 0.0–1.0
  - recency = exp(−hours_since_touch / H), H defaults: Todo=48h, Watch=7d, Later=30d
  - activity = log(1 + touch_count)/log(1 + T), T=20
  - due_proximity = sigmoid(days_to_due); none=0
  - bucket_bias = Todo=+0.15, Watch=0, Later=−0.15
  - star_boost = +0.10 if starred
  - heat = clamp(0.40*base + 0.25*recency + 0.15*activity + 0.15*due_proximity + bucket_bias + star_boost, 0, 1)
- Clarifications based on decisions
  - Touch increases heat immediately; Snooze explicitly cools and sets `next_surface_at`.
  - Focus list is dynamic (see below) rather than a fixed cap.
  - No hard limits on auto moves (escalations/de-escalations) per day.
  - Past due does not block cooling: long-past-due tasks can cool and de-escalate.
- Visualization: heat chip with cold-to-hot gradient (blue > purple > red) and tooltip showing next surface date.
- Global palette: same color tokens apply across all buckets and views.

**Bucket Automation**
- Review Cadences (default)
  - Todo: always visible.
  - Watch: surface at least weekly if untouched (temporary "Resurfacing" state).
  - Later: surface at least monthly into Watch if untouched.
  - Cadence intervals are configurable in Settings; automation reads the latest values.
- Threshold Moves (evaluated daily and on app open)
  - Escalate: heat ≥ 0.75 → move up one bucket.
  - De-escalate: heat ≤ 0.25 in Todo → Watch; ≤ 0.15 in Watch → Later.
  - Retirement: Later with heat ≤ 0.05 for 90 days → Archive (searchable).
- Snooze Interaction
  - While `now < next_surface_at`, task won’t auto-escalate; normal decay applies.
- Auditability
  - Every move logged on the task with reason (threshold/cadence/snooze/touch); undo last move per task.

**Focus**
- Dynamic list derived from heat distribution:
  - Select top tasks above the 80th percentile heat with a min of 3 and adaptive max based on elbow in the curve.
  - User can pin/unpin from Focus; pinning applies a small heat floor.

**Views & UX**
- Layout:
  - Left Navigation: Project list with task counts per project
    - Shows all active projects with badge showing number of tasks
    - Includes "All Projects" and "No Project" options
    - Color-coded project indicators
    - Quick project creation from nav
    - Collapsible section for archived projects
  - Main Content: Tabs and task list
- Tabs: Todo, Watch, Later, Resurfacing, Focus, Archived.
- Presets:
  - Hot Today: Focus + high-heat Todo; bulk touch/snooze.
  - Weekly Review: Watch resurfacing this week; bulk escalate/de-escalate.
  - Someday Browser: Later sorted by heat desc then created desc.
- Task Row (Dense Layout)
  - Reference design: `docs/Toodledo Sample UI.png` for compact, information-dense layout
  - Leading heat chip; checkbox; star; title (inline editable); due date display; priority display; action buttons (touch, snooze, delete)
  - Priority Display Intelligence:
    - Default state: Priority displayed as text (e.g., "Low", "Medium", "High", "Top")
    - Click behavior: Text converts to dropdown selector on click
    - Selection behavior: Choosing a priority from dropdown updates the task and reverts to text display
    - Keyboard accessible: Tab focuses priority, Enter/Space opens dropdown
  - Due Date Display Intelligence:
    - Past due: Red background with date (e.g., "Jan 15" in red)
    - Today: Bold "Today" text
    - Tomorrow: Bold "Tomorrow" text
    - Future: Regular date format (e.g., "Jan 20")
    - No due date: Light gray "No Due Date" text
    - Clicking due date opens calendar picker inline
  - Priority display: Reverse order in dropdown (Top → High → Medium → Low) for quick access to high priorities
  - Compact spacing: Reduced padding and margins for higher information density
  - All interactions client-side with optimistic updates; async server persistence
- Quick Add (MVP)
  - Single text field. Creates a task with configurable defaults (Due: Today, Bucket: Todo, Priority: Medium) and applies the new-task heat boost so it appears near the top.
  - After creation, users adjust details via inline edit or inspector.
  - Natural-language parsing (due dates, priority, project, repeat) is deferred to Phase 2.
- Settings Drawer
  - Accessible from the header; lets users change default new-task bucket/due/priority, new-task heat boost and decay, and snooze durations per bucket.
  - Includes palette controls to adjust the global importance/heat colors with live previews of grouping headers.
- Project Management
  - Left navigation shows project list with task counts; clicking filters to that project
  - Project CRUD: Create, rename, recolor, archive/restore projects
  - Tasks display an inline project badge (color-coded) when assigned; clicking badge opens a quick project reassignment popover
  - Drag-and-drop task to project in left nav for quick reassignment

**Import/Export**
- JSON export/import (full fidelity). CSV import (title, due, priority, star, project, bucket).
- Notes export includes NoteRow order and current text; optional toggle to include full version history. JSON export also includes Project definitions (name, color, archived flag).

**Non-Functional**
- Performance:
  - Snappy up to 1k–5k tasks; list virtualization as needed.
  - Optimistic UI updates: All user interactions (check, star, priority change, etc.) update UI immediately with async server persistence.
  - Client-side sorting and filtering to eliminate server round-trip lag.
  - Target: <50ms UI response time for all interactions; <100ms for server persistence.
- Accessibility: keyboard-first; ARIA roles on lists/controls.
- Persistence: local PostgreSQL database (via Drizzle ORM) for MVP; schema managed through Drizzle migrations and ready for future sync.
- Privacy: offline by default; no third-party telemetry.

**Architecture: Calculated vs. Stored Fields**
- Challenge: Some fields (importance, heat) are derived from other data and become stale when underlying data changes (e.g., due date passes).
- Strategy varies by complexity and staleness tolerance:
  - **Importance v1**: Recalculate on Read
    - Always recalculate before returning to client (GET endpoints)
    - Still store in DB for future optimizations (indexes, DB-side sorting)
    - Simple formula (O(1) per task) = negligible overhead for 1k-5k tasks
    - Guarantees freshness: due date passing overnight = correct importance next day
    - Implementation: [lib/scoring/importance-v1.ts](lib/scoring/importance-v1.ts)
  - **Heat v2**: Lazy Refresh Pattern (Phase 3)
    - Store `heat` and `heat_calculated_at` timestamp
    - On read: if stale (now - heat_calculated_at > threshold), recalculate
    - Thresholds vary by bucket (Todo: 1h, Watch: 6h, Later: 24h)
    - Complex formula (exponential decay, activity scoring) = acceptable cost when amortized
    - Allows DB-side sorting by slightly-stale heat (acceptable trade-off)
    - Bulk refresh endpoint for manual/scheduled updates
    - Implementation: [lib/scoring/heat-v2.ts](lib/scoring/heat-v2.ts) (future)
- Rationale:
  - Performance: Avoid recalculating complex formulas on every read
  - Accuracy: Ensure time-sensitive values (due dates) don't cause stale displays
  - Scalability: Pattern supports future optimizations (background jobs, DB triggers)
- Related Issues:
  - Importance staleness bug fix: toodle-54
  - Heat lazy refresh implementation: toodle-56 (depends on toodle-40)

**UI Rebuild Approach (No Copying)**
- Reference Strategy
  - Use screenshots/screen recordings of public pages for flow reference only; never reuse HTML/CSS/JS or assets.
- Tailwind/shadcn
  - Define Tailwind theme tokens; use shadcn/ui primitives (Button, Input, Select, Dialog, DropdownMenu, Tabs, Tooltip, Toast, DataTable/DataList).
- Validation
  - Recreate key flows in Storybook; verify responsive + keyboard support.

**Prioritized Roadmap**
- MVP (Week 1–2)
  - CRUD, buckets, importance v1, heat model, dynamic Focus, Touch/Snooze, daily automation, basic presets.
- MVP+ (Week 3)
  - Bulk actions, undo history, import/export.
- Phase 2
  - Notes system (per-line, versioned) with sticky-note UI and history
  - Project CRUD with left navigation and task counts
  - Knowledge archive search, analytics (touch history & heat over time), settings to tune model/cadences, natural-language quick add and repeat rules (e.g., "every Fri").
- Phase 3
  - Auth, sync, notifications/PWA, integrations.

**Acceptance Criteria (Samples)**
- Touch raises heat immediately and moves the task up within its bucket; Snooze lowers heat and hides until `next_surface_at`.
- A past-due task untouched for weeks cools and can de-escalate buckets despite being overdue.
- Dynamic Focus shows tasks above the heat percentile threshold; pinning keeps a task in Focus even if slightly cooled.
- Weekly automation moves items per thresholds; all moves are logged and undoable within the session.
 - Notes: editing a line creates a new NoteRowVersion and updates NoteRow.active_version_id; history shows prior versions with timestamps; restoring creates another version without deleting history.
- Changing default settings updates behavior immediately: e.g., adjusting the new-task heat boost changes where the next task lands, and updating snooze durations updates shortcut options.
- Project filter limits list results to the selected project (with a "No Project" option) across all views; grouping and ordering rules still apply within the filtered set.
- Notes icon toggles a sticky-note style preview; entering edit mode shows a textarea and blurring saves changes back into line-based storage and returns to read-only state.

**Configuration Defaults**
- Snooze durations default to Todo +1 day, Watch +1 week, Later +1 month; users can adjust each in Settings.
- New-task defaults (bucket Todo, due Today, priority Medium, project None) and the new-task heat boost/decay are configurable in Settings.
- Global importance/heat color tokens live in Settings so advanced users can theme the palette while keeping band semantics consistent.
- Natural-language quick add is deferred to Phase 2 (see roadmap).

**Visual Grouping & Color Mapping**
- Importance Grouping (12 levels)
  - Lists support "Group by Importance" which renders a sticky section header for each exact importance level 1–12: "Importance Level: N".
  - Each level has its own color token for background/tint and border. Suggested Tailwind-based palette (light tints for headers):
    - 1 → blue-50, 2 → blue-100, 3 → blue-200, 4 → blue-300, 5 → blue-400
    - 6 → amber-100, 7 → amber-200, 8 → amber-300
    - 9 → red-200, 10 → red-300, 11 → red-400, 12 → red-500
  - Define CSS vars for theming: `--imp-1-bg`..`--imp-12-bg`, `--imp-1-border`..`--imp-12-border`; section header and left accent bar use these tokens.
  - Sorting remains by importance within each section; counts shown per header; sections collapsible.
- Heat Grouping (12 bands)
  - Lists support "Group by Heat" which maps continuous `heat` (0–1) into 12 bands for visual grouping similar to importance.
  - Default band thresholds (tunable in Settings):
    - 1: [0.00–0.08), 2: [0.08–0.16), 3: [0.16–0.24), 4: [0.24–0.32), 5: [0.32–0.40)
    - 6: [0.40–0.48), 7: [0.48–0.56), 8: [0.56–0.64)
    - 9: [0.64–0.72), 10: [0.72–0.80), 11: [0.80–0.90), 12: [0.90–1.00]
  - Band colors mirror importance levels for easy scanning:
    - Bands 1–5 use blue tints (blue-50 → blue-400), 6–8 use amber (amber-100 → amber-300), 9–12 use red (red-200 → red-500).
  - Section headers read "Heat Level: N" with the same tinting and counts; items are sorted by heat within each section.
- Grouping Controls
  - Toggle between Ungrouped, Group by Importance, Group by Heat. Persist choice per view.
  - Group headers are sticky with a color bar, show counts, and support collapse/expand; collapsed sections display count only.
  - `docs/Toodledo Sample UI.png` serves as a visual reference for the banded layout and color-coding expectations (our design should modernize the look while keeping similar grouping clarity).
  - See also `docs/mockups/importance-view-mockup.md` for a modern Tailwind/shadcn mockup specification.

**Acceptance Additions (Grouping)**
- Selecting Group by Importance shows 12 sections (1–12) with correct colors and item counts; order is 12→1.
- Selecting Group by Heat shows 12 sections using configured thresholds; colors follow blue (cool) → amber (warm) → red (hot); order is 12→1.











