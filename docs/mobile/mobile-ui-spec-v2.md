# Mobile UI Specification v2

> Updated specification based on analysis of current web responsive implementation (December 2024)
> This document supersedes mobile-ui-spec.md

This specification documents the mobile UI design as implemented in the web app's responsive mobile view. The native mobile app should mirror this design for consistency across platforms.

## Table of Contents

1. [Key Design Changes from v1](#1-key-design-changes-from-v1)
2. [Navigation Structure](#2-navigation-structure)
3. [Mobile Header](#3-mobile-header)
4. [Task List](#4-task-list)
5. [Task List Item](#5-task-list-item)
6. [Heat/Importance Badge](#6-heatimportance-badge)
7. [Priority Styling](#7-priority-styling)
8. [Star Levels](#8-star-levels)
9. [Due Date Display](#9-due-date-display)
10. [Task Detail Screen](#10-task-detail-screen)
11. [Quick Add (FAB)](#11-quick-add-fab)
12. [Projects Drawer](#12-projects-drawer)
13. [Settings Screen](#13-settings-screen)
14. [Gestures and Interactions](#14-gestures-and-interactions)
15. [Design Tokens](#15-design-tokens)
16. [Migration Guide](#16-migration-guide)

---

## 1. Key Design Changes from v1

### Removed: Tab-Based Navigation
- **v1:** Bottom tab bar with "Todo", "Watch", "Later" tabs (bucket-based)
- **v2:** No bottom tabs. Single unified task list with filtering

### Removed: Bucket Concept
- **v1:** Tasks categorized into buckets (todo/watch/later)
- **v2:** Tasks in single list, sorted by heat/importance/date. Use project filtering instead.

### Added: Mobile Header with Drawer
- **v1:** Tab bar navigation
- **v2:** Sticky header with hamburger menu, search, and options

### Added: Projects Drawer
- **v1:** No project navigation on mobile
- **v2:** Slide-out drawer showing all projects with task counts

### Changed: Task Filtering
- **v1:** Filter by bucket tab
- **v2:** Filter by project (via drawer) or "Focused" tasks

### Changed: Sorting
- **v1:** Heat-based sorting within each bucket
- **v2:** Multiple sort modes: Importance, Heat, Created, Modified (user selectable)

---

## 2. Navigation Structure

### Overview
```
┌─────────────────────────────────────────────────────────────────┐
│ [☰] ─────────── Toasty Task ─────────── [🔍] [⋮]                │  ← Sticky Header
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│                        Task List                                │  ← Scrollable
│                   (sorted & filtered)                           │
│                                                                 │
│                                                                 │
│                                                                 │
│                                                                 │
│                                                                 │
│                                                                 │
│                                                         [+]     │  ← FAB
└─────────────────────────────────────────────────────────────────┘
```

### Navigation Elements

| Element | Location | Action |
|---------|----------|--------|
| Hamburger Menu (☰) | Header left | Opens Projects Drawer |
| Search (🔍) | Header right | Activates inline search |
| Options (⋮) | Header right | Opens sort/filter menu |
| FAB (+) | Bottom right | Opens Quick Add modal |

### No Bottom Tab Bar
The mobile app uses header-based navigation with a projects drawer, NOT a bottom tab bar.

---

## 3. Mobile Header

### Layout
```
┌─────────────────────────────────────────────────────────────────┐
│ [☰]           🔥 Toasty Task                    [🔍] [⋮]        │
│  ^                  ^                             ^    ^        │
│ Menu             Logo/Title                   Search  Options   │
└─────────────────────────────────────────────────────────────────┘
```

### Specifications
- **Height:** 56px (h-14)
- **Position:** Sticky top, z-index 30
- **Background:** Theme background with subtle shadow
- **Shadow:** `shadow-sm`

### Search Mode (Active)
When search is activated, the header transforms:
```
┌─────────────────────────────────────────────────────────────────┐
│ [←]    [Search tasks and notes...              ] [→]            │
│  ^                    ^                           ^              │
│ Cancel             Search Input                Submit            │
└─────────────────────────────────────────────────────────────────┘
```

- Search bar slides in from right (200ms animation)
- Logo/title fades out
- Cancel button (←) closes search
- Submit button (→) executes search

### Options Menu
Dropdown menu showing:
- **Sort by:** Importance / Heat / Created / Modified
- **Direction:** Ascending / Descending
- **Density:** Comfortable / Compact
- **Show completed:** Toggle

---

## 4. Task List

### Single Unified List
- NO tabs or buckets
- All tasks in one scrollable list
- Filtered by selected project (or "All" / "Focused")
- Sorted by user preference (default: Importance descending)

### Empty States

**No tasks:**
```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│                     No tasks yet                                │
│                                                                 │
│              Tap + to add your first task                       │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**No matching tasks (filtered):**
```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│              No tasks in this project                           │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Completed Tasks Section
- Completed tasks shown at bottom (optional)
- Collapsed by default
- Only shows tasks completed in last 7 days
- Header: "Completed (X)" with expand/collapse

---

## 5. Task List Item

### Layout
```
┌─────────────────────────────────────────────────────────────────┐
│ ▌ [☐] [42] Task title here                          [📝] [★]   │
│ ^  ^    ^                                             ^    ^    │
│ │  │    └── Heat Badge                           Notes  Star    │
│ │  └─────── Checkbox                                            │
│ └────────── Color Strip (4px, matches badge color)              │
│                                                                 │
│        Due Jan 5 • High • Work • Weekly                         │
│                    ^                                            │
│              Metadata row (comfortable mode only)               │
└─────────────────────────────────────────────────────────────────┘
```

### Components (Left to Right)

1. **Color Strip**
   - Width: 4px
   - Color: Matches importance level color
   - Full height of row
   - Visual urgency indicator

2. **Checkbox**
   - Size: 20×20px
   - Border: 2px, rounded
   - Unchecked: gray border only
   - Checked: green fill (#10b981) with white checkmark

3. **Heat/Importance Badge**
   - Size: 20×24px
   - Shows numeric value
   - Color indicates urgency level
   - Tap to toggle between heat/importance display

4. **Title**
   - Font: 16px
   - Styled by priority (see Section 7)
   - Green + bold if new/untouched
   - Strikethrough + italic if completed
   - Tap row to open detail screen

5. **Notes Indicator**
   - Icon: 14px sticky-note
   - Only shown if task has notes
   - Muted gray color

6. **Star Button**
   - Size: 32×32px touch target
   - Icon: 20px star
   - Tap cycles through 4 levels
   - Color indicates level (see Section 8)

### Metadata Row (Comfortable Mode)
- Font: 11px
- Color: muted-foreground
- Format: `{Due} • {Priority} • {Project} • {Recurrence}`
- Separator: " • " (bullet)
- Hidden in compact mode

### Density Modes

| Mode | Padding | Metadata | Spacing |
|------|---------|----------|---------|
| Comfortable | 12px vertical | Shown | gap-2 |
| Compact | 4px vertical | Hidden | gap-1.5 |

### Row States

| State | Background | Text Style |
|-------|------------|------------|
| Normal | transparent | default |
| Focused | green-500/5 | default |
| Focused + Snoozed | green-500/2 | default |
| Completed | transparent | strikethrough, italic, muted |

---

## 6. Heat/Importance Badge

### Appearance
- Shape: Rounded rectangle (border-radius: 4px)
- Size: 20×24px (heat) or 20×20px (importance)
- Font: 10px bold, white text
- Background: Color based on value range

### Importance Mode (2-14 scale)

| Range | Color | Hex |
|-------|-------|-----|
| 2-3 | Green | #4ADE80 |
| 4-5 | Light Green | #86EFAC |
| 6-7 | Yellow | #FACC15 |
| 8-9 | Orange | #FB923C |
| 10-11 | Red | #F87171 |
| 12-14 | Dark Red | #DC2626 |

### Heat Mode (0-145 scale)

| Range | Color | Hex | Label |
|-------|-------|-----|-------|
| 0-20 | Blue | #60A5FA | Cool |
| 21-40 | Light Blue | #93C5FD | Warm |
| 41-70 | Yellow | #FACC15 | Medium |
| 71-100 | Orange | #FB923C | Hot |
| 101-145 | Red | #F87171 | Very Hot |

### Toggle Behavior
- Tap badge to switch between Heat and Importance display
- Preference persisted in settings
- Both values always calculated, just display differs

### Completed Task Badge
- Background: muted (#e5e7eb light / #404040 dark)
- Text: muted-foreground
- No color indication

---

## 7. Priority Styling

Priority affects **title text styling only** (not shown as a separate badge).

### Priority Levels

| Priority | Weight | Light Mode | Dark Mode |
|----------|--------|------------|-----------|
| top | Bold (700) | #990000 | #DD5555 |
| high | Bold (700) | #344C63 | #7A9EC6 |
| medium | Regular (400) | default | default |
| low | Light (300) | muted | muted |

### Special States (Override Priority)

| State | Style |
|-------|-------|
| New/Untouched | Bold, green (#4ADE80) |
| Completed | Strikethrough, italic, muted |
| Focused | Normal + green background tint |

---

## 8. Star Levels

### Star States (0-3)

| Level | Name | Color | Icon |
|-------|------|-------|------|
| 0 | None | #9ca3af (gray) | Outline only, 30% opacity |
| 1 | Blue | #60A5FA | Filled |
| 2 | Yellow | #FACC15 | Filled |
| 3 | Orange | #FB923C | Filled |

### Behavior
- Tap cycles: 0 → 1 → 2 → 3 → 0
- Visual: Star icon (Lucide `Star`)
- Size: 20-24px icon, 32×32px touch target
- Animation: Scale pulse on change

### Scoring Contribution
Stars add to base importance:
- None (0): +0 pts
- Blue (1): +1 pt
- Yellow (2): +2 pts
- Orange (3): +3 pts

---

## 9. Due Date Display

### Formatting Rules

| Condition | Display | Style |
|-----------|---------|-------|
| No date | — (dash) | muted |
| Overdue | "Jan 5" | White on red pill |
| Today | "Today" | Bold |
| Tomorrow | "Tomorrow" | Bold |
| This week | "Wed" (day name) | Normal |
| This year | "Jan 15" | Normal |
| Next year | "Jan 15 '26" | Normal |
| Completed | Date formatted | Normal |

### Overdue Pill
```css
.overdue-pill {
  background-color: #ef4444;
  color: white;
  padding: 2px 8px;
  border-radius: 9999px;
  font-weight: 500;
  font-size: 11px;
}
```

---

## 10. Task Detail Screen

### Presentation
- **Mobile:** Fullscreen overlay (not modal)
- **Desktop:** Centered modal dialog

### Header Layout
```
┌─────────────────────────────────────────────────────────────────┐
│ [←]    [42] [★] [🔥] [❄️]            Created: Dec 28            │
│  ^      ^    ^   ^    ^              Modified: Dec 29           │
│ Back  Badge Star Heat Cool                                      │
└─────────────────────────────────────────────────────────────────┘
```

### Header Components
1. **Back Button (←):** Returns to list
2. **Badge:** Heat/Importance (tappable to toggle)
3. **Star:** Current level, tap to cycle
4. **Heat (🔥):** Flame icon, increases heat
5. **Cool (❄️):** Snowflake icon, decreases heat
6. **Timestamps:** Small text, created/modified dates

### Body Layout
```
┌─────────────────────────────────────────────────────────────────┐
│ [☐] Task title input                                            │
├─────────────────────────────────────────────────────────────────┤
│ Due date        [📅 Today                              ]        │
│ Priority        [High                                  ]        │
│ Project         [● Work                                ]        │
│ Recurrence      [Weekly on Mon                         ]        │
├─────────────────────────────────────────────────────────────────┤
│ Notes                                                           │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ Multiline text area...                                      │ │
│ │                                                             │ │
│ │                                                             │ │
│ └─────────────────────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────────────────────┤
│                    [🗑️ Delete Task]                              │
└─────────────────────────────────────────────────────────────────┘
```

### Field Editors
- **Due Date:** Native date picker
- **Priority:** Bottom sheet (Top, High, Medium, Low)
- **Project:** Bottom sheet with project list + color dots
- **Recurrence:** Bottom sheet (None, Daily, Weekly, Monthly, Yearly, Custom)

### Notes Section
- Multiline text input
- Minimum height: 150px
- Auto-saves on blur
- Placeholder: "Add notes..."

### Delete Action
- Red text button at bottom
- Opens confirmation dialog before delete

---

## 11. Quick Add (FAB)

### FAB Position
```css
.fab {
  position: fixed;
  bottom: calc(20px + env(safe-area-inset-bottom));
  right: 16px;
  width: 56px;
  height: 56px;
  border-radius: 28px;
  background: #f24c05; /* Brand orange */
  z-index: 40;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}
```

### FAB Icon
- Plus (+) icon
- Color: white
- Size: 24px

### Quick Add Modal
```
┌─────────────────────────────────────────────────────────────────┐
│ Add Task                                              [✕]       │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│ ┌─────────────────────────────────────────────────────┐ [→]     │
│ │ Add a new task...                                   │         │
│ └─────────────────────────────────────────────────────┘         │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Behavior
- Modal appears centered on screen
- Input auto-focuses with keyboard
- Submit: Enter key or arrow button
- Uses user's default priority/due date from settings
- Creates task in currently selected project (or none)
- Closes modal on success

---

## 12. Projects Drawer

### Drawer Layout
```
┌─────────────────────────────────────────────────────────────────┐
│ Projects                                              [✕]       │
├─────────────────────────────────────────────────────────────────┤
│ All Tasks                                              (42)     │
│ ─────────────────────────────────────────────────────────────── │
│ Focused                                                 (5)     │
│ ─────────────────────────────────────────────────────────────── │
│ ● Work                                                 (12)     │
│ ● Personal                                              (8)     │
│ ● Shopping                                              (3)     │
│ ─────────────────────────────────────────────────────────────── │
│ No Project                                             (14)     │
├─────────────────────────────────────────────────────────────────┤
│ [+ New Project]                                                 │
│ [⚙️ Settings]                                                    │
└─────────────────────────────────────────────────────────────────┘
```

### Drawer Behavior
- Slides in from left edge
- Width: 80% of screen (max 320px)
- Overlay dims background
- Tap outside or swipe left to close

### Project Row
- Color dot (10px circle)
- Project name
- Task count (uncompleted only)
- Tap to filter task list

### Special Filters
- **All Tasks:** Shows all uncompleted tasks
- **Focused:** Shows only focused tasks (eye icon active)

---

## 13. Settings Screen

### Access
- Via Projects Drawer → Settings link
- Or via Options Menu (⋮) → Settings

### Settings Layout
```
┌─────────────────────────────────────────────────────────────────┐
│ [←] Settings                                                    │
├─────────────────────────────────────────────────────────────────┤
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ DEFAULTS                                                    │ │
│ │ Default Priority         [Medium ▼]                         │ │
│ │ Default Due Date         [None ▼]                           │ │
│ │ Default Project          [None ▼]                           │ │
│ └─────────────────────────────────────────────────────────────┘ │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ DISPLAY                                                     │ │
│ │ Theme                    [System ▼]                         │ │
│ │ Density                  [Comfortable ▼]                    │ │
│ │ Default Sort             [Importance ▼]                     │ │
│ │ Badge Display            [Importance ▼]                     │ │
│ └─────────────────────────────────────────────────────────────┘ │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ ACCOUNT                                                     │ │
│ │ Email                    user@example.com                   │ │
│ │ Sign Out                 [→]                                │ │
│ └─────────────────────────────────────────────────────────────┘ │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ SYNC                                                        │ │
│ │ Last Sync                Just now                           │ │
│ │ Pending Changes          0                                  │ │
│ │ Status                   Online ✓                           │ │
│ │ [Sync Now]                                                  │ │
│ └─────────────────────────────────────────────────────────────┘ │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ ABOUT                                                       │ │
│ │ Version                  1.0.0                              │ │
│ └─────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

---

## 14. Gestures and Interactions

### Swipe Gestures (Task List Items)

| Direction | Threshold | Action | Visual Feedback |
|-----------|-----------|--------|-----------------|
| Right | >60% width | Heat task | Orange bg, flame icon |
| Left | >60% width | Cool task | Blue bg, snowflake icon |

### Swipe Implementation
```
During swipe:
┌─────────────────────────────────────────────────────────────────┐
│ 🔥 Heat                    │ ▌ Task title...                    │
│ ←─────── revealed bg ──────│──── task content slides ──────→    │
│                      threshold line (60%)                       │
└─────────────────────────────────────────────────────────────────┘
```

- Background reveals during swipe
- Threshold line appears at 60% mark
- Haptic feedback (10ms vibration) when threshold crossed
- Action triggers on release if past threshold
- Colors:
  - Heat: orange-500/15 background
  - Cool: sky-500/15 background

### Tap Actions

| Element | Action |
|---------|--------|
| Task row | Open detail screen |
| Checkbox | Toggle completion |
| Star | Cycle star level (0→1→2→3→0) |
| Badge | Toggle heat/importance display |
| Notes icon | Open detail screen (scrolled to notes) |

### Pull to Refresh
- Standard pull-to-refresh gesture on task list
- Triggers sync with server
- Shows refresh indicator while syncing

### Long Press
- No long-press actions currently
- Reserved for future multi-select functionality

---

## 15. Design Tokens

### Colors

```typescript
const colors = {
  // Brand
  brand: '#f24c05',
  brandLight: '#fca67a',

  // Heat/Importance Scale
  heatBlue: '#60A5FA',      // Cool (0-20)
  heatLightBlue: '#93C5FD', // Warm (21-40)
  heatYellow: '#FACC15',    // Medium (41-70)
  heatOrange: '#FB923C',    // Hot (71-100)
  heatRed: '#F87171',       // Very Hot (101-145)
  heatDarkRed: '#DC2626',   // Max

  // Importance Scale
  impGreen: '#4ADE80',      // Low (2-3)
  impLightGreen: '#86EFAC', // Low-Med (4-5)
  impYellow: '#FACC15',     // Medium (6-7)
  impOrange: '#FB923C',     // Med-High (8-9)
  impRed: '#F87171',        // High (10-11)
  impDarkRed: '#DC2626',    // Very High (12-14)

  // Stars
  starNone: '#9ca3af',
  starBlue: '#60A5FA',
  starYellow: '#FACC15',
  starOrange: '#FB923C',

  // Priority Text (Light Mode)
  priorityTop: '#990000',
  priorityHigh: '#344C63',

  // Priority Text (Dark Mode)
  priorityTopDark: '#DD5555',
  priorityHighDark: '#7A9EC6',

  // Semantic
  success: '#10b981',
  error: '#dc2626',
  warning: '#f59e0b',
  info: '#3b82f6',

  // New Task
  newTask: '#4ADE80',

  // Focus
  focus: '#22c55e',
  focusBg: 'rgba(34, 197, 94, 0.05)',

  // Backgrounds
  backgroundLight: '#ffffff',
  backgroundDark: '#0a0a0a',
  cardLight: '#ffffff',
  cardDark: '#171717',

  // Text
  textPrimary: '#0a0a0a',
  textPrimaryDark: '#fafafa',
  textMuted: '#737373',
  textMutedDark: '#a3a3a3',

  // Borders
  border: '#e5e5e5',
  borderDark: '#262626',

  // Overdue
  overdueBg: '#ef4444',
  overdueText: '#ffffff',
};
```

### Typography

```typescript
const typography = {
  // Task Title
  titleSize: 16,
  titleLineHeight: 22,
  titleWeight: '500',

  // Meta/Secondary
  metaSize: 11,
  metaLineHeight: 14,

  // Badge
  badgeSize: 10,
  badgeWeight: '700',

  // Labels
  labelSize: 14,
  labelWeight: '600',

  // Body
  bodySize: 16,
  bodyLineHeight: 24,

  // Caption
  captionSize: 12,
  captionLineHeight: 16,

  // Header
  headerSize: 18,
  headerWeight: '600',
};
```

### Spacing

```typescript
const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
};
```

### Border Radius

```typescript
const borderRadius = {
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
  full: 9999,
};
```

### Shadows

```typescript
const shadows = {
  sm: '0 1px 2px rgba(0, 0, 0, 0.05)',
  md: '0 4px 6px rgba(0, 0, 0, 0.1)',
  lg: '0 10px 15px rgba(0, 0, 0, 0.1)',
  fab: '0 4px 12px rgba(0, 0, 0, 0.15)',
};
```

---

## 16. Migration Guide

### Changes Required for Mobile App

#### Remove Tab Navigation
- Delete `(tabs)/_layout.tsx` tab configuration
- Replace with single `index.tsx` task list screen
- Add mobile header component
- Add projects drawer component

#### Remove Bucket Concept
- Remove `bucket` field from task queries
- Remove `watch.tsx` and `later.tsx` screens
- Implement project-based filtering instead

#### Add Mobile Header
- Create `MobileHeader` component with:
  - Hamburger menu button
  - Logo/title
  - Search button + inline search
  - Options menu

#### Add Projects Drawer
- Create `ProjectsDrawer` component
- Implement slide-from-left animation
- Show project list with task counts
- Add "Focused" filter option

#### Update Task List
- Single scrollable list (no tabs)
- Add sort mode selector (Importance/Heat/Created/Modified)
- Add density toggle
- Implement pull-to-refresh

#### Update Quick Add
- Keep FAB design
- Remove bucket assignment
- Add project selector (optional)

#### Update Settings
- Add Theme selector
- Add Density selector
- Add Default Sort selector
- Add Badge Display (Heat/Importance) selector

### File Structure Changes

```
apps/mobile/
├── app/
│   ├── _layout.tsx           # Root layout with auth guard
│   ├── (auth)/
│   │   ├── _layout.tsx
│   │   ├── sign-in.tsx
│   │   └── sign-up.tsx
│   ├── index.tsx             # Main task list (replaces tabs)
│   ├── task/[id].tsx         # Task detail screen
│   └── settings.tsx          # Settings screen
├── components/
│   ├── navigation/
│   │   ├── MobileHeader.tsx      # NEW: Header with search
│   │   ├── ProjectsDrawer.tsx    # NEW: Slide-out drawer
│   │   └── OptionsMenu.tsx       # NEW: Sort/filter menu
│   ├── task/
│   │   ├── TaskList.tsx          # Updated: single list
│   │   ├── TaskListItem.tsx      # Renamed from SwipeableTaskRow
│   │   ├── HeatBadge.tsx         # Keep
│   │   ├── StarButton.tsx        # Keep
│   │   └── DueDateDisplay.tsx    # Keep
│   ├── detail/
│   │   ├── TaskDetailScreen.tsx  # Keep, update layout
│   │   └── ...
│   ├── add/
│   │   ├── QuickAddFAB.tsx       # Keep
│   │   └── QuickAddModal.tsx     # Update: remove bucket
│   └── settings/
│       └── ...                   # Update for new options
└── constants/
    └── ...                       # Update color tokens
```

---

## Appendix: Comparison Summary

| Feature | v1 (Old Spec) | v2 (Web Design) |
|---------|---------------|-----------------|
| Navigation | Bottom tabs | Header + Drawer |
| Task Organization | Buckets (todo/watch/later) | Projects + Focused |
| Primary Sort | Heat within bucket | User-selected (Imp/Heat/Date) |
| Project Filter | Not on mobile | Via drawer |
| Search | Not specified | Header inline search |
| FAB | Present | Present (same) |
| Swipe Gestures | Heat/Cool | Heat/Cool (same) |
| Task Detail | Modal | Fullscreen |
| Settings | Basic | Extended options |

---

*Last updated: December 2024*
*Based on web app commit: Phase 4 UI Implementation*
