# Toodle Implementation Plan

## Database Architecture Strategy

### DAL Abstraction Layer
- Build a repository pattern that abstracts database operations
- Interface-based design allowing easy swap from SQLite � PostgreSQL
- Use Drizzle ORM for both SQLite (initial) and PostgreSQL (future)
- Migration strategy: export from SQLite, import to PostgreSQL when ready

### Initial: SQLite (Local Development)
- File-based: `./data/toodle.db`
- Zero configuration, perfect for MVP
- Drizzle SQLite adapter: `better-sqlite3`

### Future: PostgreSQL
- Swap adapter to `drizzle-orm/postgres-js`
- Schema remains identical (Drizzle handles dialect differences)
- Add connection pooling and environment-based config

---

## Phase 0: Project Foundation & DAL Setup
**Goal**: Establish architecture, database layer, and basic infrastructure

### 0.1 Database & ORM Setup
- [ ] Install Drizzle ORM dependencies (drizzle-orm, better-sqlite3, drizzle-kit)
- [ ] Create `lib/db/` directory structure
  - [ ] `schema.ts` - Drizzle schema definitions
  - [ ] `client.ts` - Database client with adapter abstraction
  - [ ] `repositories/` - Repository pattern classes
  - [ ] `migrations/` - Generated migration files
- [ ] Configure `drizzle.config.ts` for SQLite
- [ ] Create initial schema (tasks, projects, settings tables)
- [ ] Set up migration workflow (`drizzle-kit generate`, `drizzle-kit migrate`)
- [ ] Create database seeding script (optional sample data)

### 0.2 Repository Pattern
- [ ] Create `ITaskRepository` interface defining CRUD operations
- [ ] Implement `SQLiteTaskRepository` class
- [ ] Create `IProjectRepository` interface
- [ ] Implement `SQLiteProjectRepository` class
- [ ] Create `ISettingsRepository` interface
- [ ] Implement `SQLiteSettingsRepository` class
- [ ] Add dependency injection setup (repository factory/provider)

### 0.3 Type Definitions
- [ ] Create `types/` directory for shared TypeScript types
- [ ] Define `Task`, `Project`, `Settings` types matching schema
- [ ] Define enums: `Bucket`, `Priority`, `RepeatType`
- [ ] Export all types from central index

### 0.4 Development Tooling
- [ ] Configure ESLint/Prettier for consistent code style
- [ ] Set up Drizzle Studio for database inspection (`npm run db:studio`)
- [ ] Create npm scripts: `db:generate`, `db:migrate`, `db:push`, `db:studio`
- [ ] Add `.env.local` for database path configuration

---

## Phase 1: Basic Todo App (Importance v1 Only)
**Goal**: Core CRUD functionality with Toodledo-compatible importance scoring

### 1.1 Data Model (Simplified)
- [ ] Tasks table: id, title, priority, star, due_at, completed_at, created_at, updated_at
- [ ] Projects table: id, name, color_hex, created_at
- [ ] Add project_id foreign key to tasks
- [ ] Generate and run initial migration

### 1.2 Core UI Components (shadcn/ui)
- [ ] Install shadcn/ui components: Button, Input, Checkbox, Select, Tabs, Dialog
- [ ] Create `TaskRow` component (checkbox, title, priority select, star button, due date)
- [ ] Create `TaskList` component (renders array of TaskRow)
- [ ] Create `QuickAdd` component (simple text input + submit)
- [ ] Create `PrioritySelect` component (Low/Med/High/Top dropdown)

### 1.3 Importance v1 Calculation
- [ ] Create `lib/scoring/importance-v1.ts`
- [ ] Implement priority weighting (Low=2, Med=3, High=4, Top=5)
- [ ] Implement due date weighting (None=0, Future=3, Today=5, Past=6)
- [ ] Implement star bonus (+1)
- [ ] Calculate final score (2-12 range)
- [ ] Add tests for edge cases

### 1.4 Main Task View
- [ ] Create `app/tasks/page.tsx` (main task list page)
- [ ] Fetch tasks from repository on page load
- [ ] Sort by importance_v1 (desc), then due proximity
- [ ] Display task list with computed importance badges
- [ ] Implement task completion toggle (checkbox)
- [ ] Add visual importance indicators (color-coded badges)

### 1.5 CRUD Operations
- [ ] Quick Add: create task with title only (defaults: Medium priority, no due date)
- [ ] Inline Edit: click title to edit in place
- [ ] Update: change priority, star, due date inline
- [ ] Delete: soft delete to trash (set deleted_at timestamp)
- [ ] Complete: toggle completed_at timestamp

### 1.6 Projects (Basic)
- [ ] Create simple project selector dropdown in header
- [ ] Create project badge component (colored chip)
- [ ] Filter tasks by selected project
- [ ] Add "All Projects" and "No Project" filter options

### 1.7 Basic Settings
- [ ] Create settings table with single row for user preferences
- [ ] Default new-task values: priority (Medium), due date (Today)
- [ ] Settings drawer UI (shadcn/ui Sheet component)
- [ ] Save/load settings from repository

**Phase 1 Acceptance**:
- Create, read, update, delete tasks with importance v1 scoring
- Tasks sorted by importance (12 � 2)
- Quick add creates task at top with default settings
- Project filtering works across all tasks

---

## Phase 2: Buckets & Basic Automation
**Goal**: Add Todo/Watch/Later buckets with manual bucket management

### 2.1 Bucket Data Model
- [ ] Add `bucket` enum column to tasks (Todo|Watch|Later)
- [ ] Set default bucket in settings (Todo)
- [ ] Generate and run migration for bucket column

### 2.2 Bucket Tabs UI
- [ ] Create tabbed interface (shadcn/ui Tabs)
- [ ] Todo tab: shows bucket='Todo' tasks
- [ ] Watch tab: shows bucket='Watch' tasks
- [ ] Later tab: shows bucket='Later' tasks
- [ ] Badge count on each tab

### 2.3 Manual Bucket Movement
- [ ] Add bucket selector dropdown to task row
- [ ] Update task bucket via repository
- [ ] Move tasks between buckets manually
- [ ] Show toast notification on bucket change

### 2.4 Completed & Archived Views
- [ ] Completed tab: filter `completed_at IS NOT NULL`
- [ ] Add archive functionality (set `archived_at`)
- [ ] Archived tab: filter `archived_at IS NOT NULL`
- [ ] Hide completed/archived from main bucket views

**Phase 2 Acceptance**:
- Tasks organized into Todo/Watch/Later buckets
- Manual bucket reassignment works
- Completed and archived tasks hidden from active views

---

## Phase 3: Heat Model & Touch/Snooze
**Goal**: Implement dynamic heat scoring and user interaction mechanics

### 3.1 Heat Data Model
- [ ] Add columns: `heat`, `touch_count`, `last_touched_at`, `next_surface_at`
- [ ] Generate and run migration
- [ ] Add heat computation settings to settings table

### 3.2 Heat Calculation Engine
- [ ] Create `lib/scoring/heat-v2.ts`
- [ ] Implement base score (map importance 2-12 � 0.0-1.0)
- [ ] Implement recency decay (exp decay based on hours since touch)
- [ ] Implement activity score (log of touch_count)
- [ ] Implement due proximity (sigmoid function)
- [ ] Implement bucket bias (Todo +0.15, Watch 0, Later -0.15)
- [ ] Implement star boost (+0.10)
- [ ] Combine with weights: 0.40*base + 0.25*recency + 0.15*activity + 0.15*due_prox + bias + star
- [ ] Clamp to [0, 1] range
- [ ] Add comprehensive tests

### 3.3 Heat Visualization
- [ ] Create `HeatChip` component with gradient (blue � purple � red)
- [ ] Map heat 0.0 � blue (cold), 0.5 � purple (warm), 1.0 � red (hot)
- [ ] Add tooltip showing heat value and next surface date
- [ ] Display heat chip as leading element in TaskRow

### 3.4 Touch Interaction
- [ ] Add Touch button to task row (keyboard shortcut: `t`)
- [ ] On touch: increment `touch_count`, set `last_touched_at = now()`
- [ ] Recalculate heat immediately
- [ ] Re-sort list to show heat boost
- [ ] Add visual feedback (brief highlight animation)

### 3.5 Snooze Interaction
- [ ] Add Snooze button with dropdown (keyboard shortcut: `s`)
- [ ] Snooze presets from settings: +1d (Todo), +1w (Watch), +1m (Later)
- [ ] On snooze: set `next_surface_at`, apply temporary heat reduction
- [ ] Hide snoozed tasks until `next_surface_at` passes
- [ ] Custom snooze date picker option

### 3.6 Heat-Based Sorting
- [ ] Update default sort: Heat (desc) � Importance (desc) � Due proximity � Last touched
- [ ] Recalculate heat on every task load
- [ ] Add background job to recalculate heat periodically (every hour)

### 3.7 Settings for Heat Tuning
- [ ] Decay half-life settings per bucket (Todo: 48h, Watch: 7d, Later: 30d)
- [ ] Activity normalization constant (default T=20)
- [ ] Weight sliders for base/recency/activity/due_prox
- [ ] New-task heat boost (default 0.70)
- [ ] New-task heat half-life (default 24h)

**Phase 3 Acceptance**:
- Tasks display real-time heat scores with color gradient
- Touch immediately boosts heat and re-sorts task
- Snooze cools task and hides until future date
- Heat decays over time based on bucket cadence

---

## Phase 4: Bucket Automation & Resurfacing
**Goal**: Automatic bucket escalation/de-escalation based on heat thresholds

### 4.1 Automation Settings
- [ ] Add escalation threshold setting (default: heat e 0.75)
- [ ] Add de-escalation thresholds (Todo�Watch: d0.25, Watch�Later: d0.15)
- [ ] Add retirement threshold (Later: d0.05 for 90 days)
- [ ] Add review cadences (Watch: 7d, Later: 30d)

### 4.2 Automation Engine
- [ ] Create `lib/automation/bucket-automation.ts`
- [ ] Evaluate escalation rules: heat e 0.75 � move up one bucket
- [ ] Evaluate de-escalation rules per bucket
- [ ] Evaluate retirement: Later + heat d 0.05 for 90d � archive
- [ ] Respect snooze: skip auto-escalation if `now < next_surface_at`
- [ ] Create move log entry for each automated move

### 4.3 Move Logging & Audit
- [ ] Create `task_moves` table: id, task_id, from_bucket, to_bucket, reason, moved_at
- [ ] Log every bucket change (manual or automated)
- [ ] Add undo functionality (last move only)
- [ ] Display move history in task detail view

### 4.4 Resurfacing Tab
- [ ] Create Resurfacing view: Watch tasks untouched for 7d+ or Later tasks ready to surface
- [ ] Visual indicator for "resurfacing" state
- [ ] Bulk actions: escalate, snooze, archive

### 4.5 Automation Scheduler
- [ ] Create cron job or background task (runs daily + on app open)
- [ ] Evaluate all tasks against automation rules
- [ ] Apply bucket moves and log reasons
- [ ] Trigger UI refresh after automation runs

**Phase 4 Acceptance**:
- High-heat tasks automatically escalate to higher buckets
- Low-heat tasks de-escalate to lower buckets
- Resurfacing tab shows Watch/Later tasks needing review
- All moves logged with reason and undo option

---

## Phase 5: Focus & Dynamic Lists
**Goal**: Intelligent focus list based on heat distribution

### 5.1 Focus Calculation
- [ ] Create `lib/focus/focus-calculator.ts`
- [ ] Calculate 80th percentile of heat across all tasks
- [ ] Select tasks above percentile (min 3, adaptive max via elbow method)
- [ ] Allow manual pin/unpin from focus
- [ ] Pinning applies heat floor to keep task in focus

### 5.2 Focus Tab
- [ ] Create Focus view tab
- [ ] Display top heat-ranked tasks
- [ ] Show pin/unpin button per task
- [ ] Update focus list reactively when heat changes

### 5.3 View Presets
- [ ] **Hot Today**: Focus + high-heat Todo tasks (heat e 0.60)
- [ ] **Weekly Review**: Watch + resurfacing tasks
- [ ] **Someday Browser**: Later sorted by heat desc, then created desc
- [ ] Preset selector in header
- [ ] Bulk actions per preset (touch all, snooze all, etc.)

**Phase 5 Acceptance**:
- Focus tab dynamically shows top ~3-10 tasks above heat threshold
- Pinning keeps task in focus despite cooling
- Presets provide quick filtered views for different workflows

---

## Phase 6: Advanced Notes System
**Goal**: Per-line versioned notes with sticky-note UI

### 6.1 Notes Data Model
- [ ] Create `note_rows` table: id, task_id, ordinal, active_version_id
- [ ] Create `note_row_versions` table: id, note_row_id, text, created_at
- [ ] Generate and run migration

### 6.2 Notes Repository
- [ ] Create `INotesRepository` interface
- [ ] Implement CRUD for note rows and versions
- [ ] Implement versioning: each edit creates new version row
- [ ] Active version pointer updates on edit

### 6.3 Notes UI (Read-Only)
- [ ] Add notes icon to task row (toggle button)
- [ ] Expand panel below task row (sticky-note yellow tint)
- [ ] Display aggregated note text (join lines with `\n`)
- [ ] Show "last edited" timestamp

### 6.4 Notes UI (Edit Mode)
- [ ] Click inside panel � swap to textarea
- [ ] Treat as single text blob (split on `\n` for line storage)
- [ ] Blur auto-saves � creates new versions for changed lines
- [ ] Return to read-only view after save

### 6.5 Per-Line Actions
- [ ] Edit line: opens inline editor, creates new version
- [ ] Reorder lines: drag handles or keyboard shortcuts
- [ ] Delete line: soft delete (archive version)
- [ ] Copy line to clipboard

### 6.6 Version History
- [ ] History drawer per line (shadcn/ui Sheet)
- [ ] Show all versions with timestamps
- [ ] Diff view between versions
- [ ] Restore version � creates new version (no destructive edits)

### 6.7 Notes Search
- [ ] Global search includes current note text
- [ ] Advanced filter for searching version history
- [ ] Keyboard shortcut: `Ctrl+K` search within notes

**Phase 6 Acceptance**:
- Notes toggle expands sticky-note panel under task
- Editing creates new versions, preserves history
- Per-line actions (edit, reorder, delete) work
- Version history viewable with diff and restore

---

## Phase 7: Visual Grouping & Theming
**Goal**: Importance/Heat grouping with color-coded sections

### 7.1 Grouping Data Model
- [ ] Add grouping preference to settings (Ungrouped | GroupByImportance | GroupByHeat)
- [ ] Persist per-view preference

### 7.2 Importance Grouping (12 Levels)
- [ ] Create 12 color tokens for importance (blue � amber � red)
- [ ] Define CSS variables: `--imp-1-bg` through `--imp-12-bg`
- [ ] Group tasks by exact importance score (1-12)
- [ ] Sticky section headers: "Importance Level: N"
- [ ] Color-code headers and left accent bars
- [ ] Display task count per section
- [ ] Collapsible sections

### 7.3 Heat Grouping (12 Bands)
- [ ] Define heat band thresholds (0.00-0.08, 0.08-0.16, etc.)
- [ ] Map heat [0, 1] � band [1, 12]
- [ ] Mirror color tokens from importance (blue � amber � red)
- [ ] Section headers: "Heat Level: N"
- [ ] Sort by heat within each band

### 7.4 Grouping Controls
- [ ] Toggle button: Ungrouped / Group by Importance / Group by Heat
- [ ] Persist choice per view in settings
- [ ] Smooth transitions between grouping modes

### 7.5 Theme Customization
- [ ] Settings drawer: color palette editor
- [ ] Live preview of grouping headers with new colors
- [ ] Reset to default palette button

**Phase 7 Acceptance**:
- Group by Importance shows 12 sections (12 � 1) with correct colors
- Group by Heat shows 12 bands with gradient colors
- Grouping persists per view
- Theming updates reflected immediately

---

## Phase 8: Recurrence & Advanced Features
**Goal**: Task repetition, keyboard shortcuts, and bulk actions

### 8.1 Recurrence
- [ ] Add `repeat` column: none | daily | weekly | monthly
- [ ] On completion: advance `due_at` by repeat interval
- [ ] Create new task instance for recurring tasks
- [ ] Mark original as template (archived but repeating)

### 8.2 Keyboard Shortcuts
- [ ] Global quick add: `Ctrl+N` or `/`
- [ ] Star task: `*`
- [ ] Touch: `t`
- [ ] Snooze: `s`
- [ ] Toggle notes: `n`
- [ ] Complete: `Space` or `Enter`
- [ ] Change priority: `1-4` keys
- [ ] Search notes: `Ctrl+K`
- [ ] Create keyboard shortcut legend (help modal)

### 8.3 Bulk Actions
- [ ] Multi-select tasks (checkbox or Shift+click)
- [ ] Bulk touch, snooze, archive, delete
- [ ] Bulk bucket move
- [ ] Bulk project reassignment

### 8.4 Undo System
- [ ] Track last action per session (in-memory or session storage)
- [ ] Undo last bucket move, delete, archive
- [ ] Toast notification with undo button (5-second timeout)

**Phase 8 Acceptance**:
- Recurring tasks advance due date on completion
- All keyboard shortcuts work
- Bulk actions apply to selected tasks
- Undo restores last destructive action

---

## Phase 9: Import/Export & Data Portability
**Goal**: Full data export and import for backup/migration

### 9.1 JSON Export
- [ ] Export all tasks with full fidelity (all columns)
- [ ] Export all projects (name, color, archived flag)
- [ ] Export note rows and active versions
- [ ] Optional: include full version history
- [ ] Export settings
- [ ] Generate timestamped filename: `toodle-export-YYYY-MM-DD.json`

### 9.2 JSON Import
- [ ] Parse and validate JSON structure
- [ ] Upsert tasks (match by id or create new)
- [ ] Upsert projects
- [ ] Import notes with version history
- [ ] Conflict resolution: skip, overwrite, or merge

### 9.3 CSV Import
- [ ] Simple CSV schema: title, due, priority, star, project, bucket
- [ ] Map columns to task fields
- [ ] Create tasks with default heat/importance
- [ ] Handle missing columns gracefully

### 9.4 CSV Export
- [ ] Export tasks as CSV for spreadsheet compatibility
- [ ] Columns: title, bucket, priority, star, due, project, importance, heat, completed, archived
- [ ] Optional: include notes as single text field

**Phase 9 Acceptance**:
- JSON export includes all tasks, projects, notes, settings
- JSON import restores full state
- CSV import creates tasks from simple spreadsheet
- CSV export works in Excel/Google Sheets

---

## Phase 10: PostgreSQL Migration Readiness
**Goal**: Prepare for database swap without code changes

### 10.1 Repository Abstraction Validation
- [ ] Ensure all database access goes through repositories
- [ ] No direct SQL outside repository layer
- [ ] Interface compliance check

### 10.2 PostgreSQL Adapter
- [ ] Install `drizzle-orm/postgres-js` and `postgres` packages
- [ ] Create `PostgresTaskRepository` implementing `ITaskRepository`
- [ ] Create Postgres versions of all repositories
- [ ] Update `drizzle.config.ts` for PostgreSQL dialect

### 10.3 Environment-Based Client
- [ ] Add `DATABASE_TYPE` env var (sqlite | postgres)
- [ ] Create factory function to return correct repository based on env
- [ ] Add PostgreSQL connection string to `.env.local`

### 10.4 Migration Script
- [ ] Export all data from SQLite to JSON
- [ ] Create fresh PostgreSQL database
- [ ] Run Drizzle migrations for PostgreSQL
- [ ] Import JSON data into PostgreSQL
- [ ] Validation: compare counts and sample records

### 10.5 Testing
- [ ] Run full test suite against SQLite
- [ ] Run full test suite against PostgreSQL
- [ ] Ensure identical behavior

**Phase 10 Acceptance**:
- Swap `DATABASE_TYPE=postgres` � app works identically
- Migration script successfully moves data SQLite � PostgreSQL
- All tests pass on both databases

---

## Phase 11: Polish & Performance
**Goal**: Production-ready UX and optimization

### 11.1 Performance
- [ ] Implement virtual scrolling for task lists (react-window or @tanstack/react-virtual)
- [ ] Debounce search and filter inputs
- [ ] Lazy load completed/archived tasks (pagination)
- [ ] Index database columns (due_at, bucket, heat, importance_v1)
- [ ] Memoize expensive calculations (heat, importance)

### 11.2 Accessibility
- [ ] ARIA labels on all interactive elements
- [ ] Keyboard navigation through task lists (arrow keys)
- [ ] Focus management for modals and drawers
- [ ] Screen reader announcements for state changes
- [ ] Color contrast validation (WCAG AA)

### 11.3 Responsive Design
- [ ] Mobile layout for task rows (stacked)
- [ ] Touch-friendly hit targets (44px minimum)
- [ ] Drawer navigation for small screens
- [ ] Responsive tabs (horizontal scroll or dropdown)

### 11.4 Error Handling
- [ ] Graceful fallback for failed database operations
- [ ] User-friendly error messages
- [ ] Retry logic for transient failures
- [ ] Error boundary components

### 11.5 Loading States
- [ ] Skeleton loaders for task lists
- [ ] Optimistic UI updates (instant feedback before DB write)
- [ ] Loading spinners for async operations

**Phase 11 Acceptance**:
- App handles 5k+ tasks without lag
- Keyboard-only navigation works throughout
- Mobile layout usable on phone screens
- No crashes on error conditions

---

## Phase 12: Future Enhancements (Post-MVP)

### 12.1 Natural Language Quick Add
- [ ] Parse "buy milk tomorrow high @groceries" � task with due, priority, project
- [ ] Chrono library for date parsing
- [ ] Priority keywords: low, med, high, top, !, !!, !!!
- [ ] Project tags: @project-name

### 12.2 Analytics & Insights
- [ ] Heat over time chart per task
- [ ] Touch history timeline
- [ ] Bucket movement flow diagram (Sankey chart)
- [ ] Completion rate by project
- [ ] Productivity heatmap (calendar view)

### 12.3 Knowledge Archive Search
- [ ] Full-text search across archived tasks and notes
- [ ] Tag system for categorization
- [ ] Link tasks together (dependencies/related)

### 12.4 Authentication & Sync
- [ ] User accounts (NextAuth.js)
- [ ] Multi-device sync (PostgreSQL + real-time subscriptions)
- [ ] Conflict resolution for concurrent edits

### 12.5 Notifications & PWA
- [ ] Browser notifications for due tasks
- [ ] Progressive Web App (installable)
- [ ] Offline support with service worker
- [ ] Background sync

### 12.6 Integrations
- [ ] Google Calendar sync for due dates
- [ ] Email to task (send email � creates task)
- [ ] Slack/Discord bot for quick add
- [ ] API for third-party integrations

---

## Technical Debt & Maintenance

### Ongoing
- [ ] Keep dependencies updated (monthly)
- [ ] Monitor bundle size (stay under 200KB initial JS)
- [ ] Write unit tests for critical paths (scoring, automation)
- [ ] Integration tests for CRUD operations
- [ ] E2E tests for key user flows (Playwright)
- [ ] Performance profiling (React DevTools, Lighthouse)
- [ ] Security audit (dependency scanning, SQL injection prevention)

---

## Success Metrics

### Phase 1-3 (MVP)
- [ ] CRUD operations complete in <100ms
- [ ] Importance and heat calculations accurate to spec
- [ ] UI responsive on 60fps interactions

### Phase 4-6 (Advanced Features)
- [ ] Automation runs without user intervention
- [ ] Focus list dynamically adapts to user behavior
- [ ] Notes system supports 100+ lines per task

### Phase 7-9 (Production Ready)
- [ ] Visual grouping renders 1000+ tasks smoothly
- [ ] Import/export preserves 100% data fidelity
- [ ] Keyboard shortcuts reduce mouse usage by 80%

### Phase 10-11 (Scale)
- [ ] PostgreSQL handles 10k+ tasks without degradation
- [ ] Page load time <2s on slow 3G
- [ ] Accessibility audit scores 95+ (Lighthouse)

---

## Implementation Notes

### Development Order Rationale
1. **DAL First**: Repository pattern enables easy database swap
2. **Importance Before Heat**: Simpler model validates sorting/display logic
3. **Manual Before Automated**: User-driven bucket moves before automation
4. **Core Before Polish**: Functional MVP before advanced features

### Testing Strategy
- Unit tests: scoring functions, automation rules
- Integration tests: repository operations, data integrity
- E2E tests: critical user flows (create task � complete � archive)
- Snapshot tests: UI components for regression detection

### Migration Path (SQLite � PostgreSQL)
1. Validate repository abstraction (no leaky SQL)
2. Export SQLite data to JSON
3. Create PostgreSQL database
4. Run Drizzle migrations (schema identical)
5. Import JSON data
6. Update `DATABASE_TYPE` env var
7. Verify functionality

---

## Questions for User

1. **Database timing**: When do you anticipate switching to PostgreSQL? (affects prioritization of Phase 10)
2. **Deployment target**: Local-only or plan to deploy (Vercel/Netlify)? (affects auth/sync roadmap)
3. **Design preferences**: Any specific color palette or should we use Tailwind defaults + shadcn theme?
4. **Feature priority**: Any phases you want to tackle out of order?

---

**Last Updated**: 2025-10-09
**Status**: Ready for Phase 0 kickoff
