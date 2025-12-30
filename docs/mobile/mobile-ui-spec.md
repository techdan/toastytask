# Mobile UI Specification

> Phase 4 of Mobile App Implementation - Core UI Screens
> Based on analysis of current web implementation (December 2024)

This document specifies the mobile UI components and styling, derived from the actual web app implementation rather than older documentation. The mobile app should feel native while maintaining visual consistency with the web app.

## Table of Contents

1. [Task List Item](#1-task-list-item)
2. [Heat/Importance Badge](#2-heatimportance-badge)
3. [Priority Styling](#3-priority-styling)
4. [Star Levels](#4-star-levels)
5. [Due Date Display](#5-due-date-display)
6. [Project Display](#6-project-display)
7. [Task Detail Screen](#7-task-detail-screen)
8. [Quick Add](#8-quick-add)
9. [Settings Screen](#9-settings-screen)
10. [Gestures and Interactions](#10-gestures-and-interactions)
11. [Design Tokens](#11-design-tokens)

---

## 1. Task List Item

The mobile task list item should render as a card/row with the following structure:

### Layout (Left to Right)
```
┌─────────────────────────────────────────────────────────────────┐
│ [Strip] [☐] [Badge] [Title + Meta Row]              [★] [Notes] │
│         ^    ^                                       ^    ^      │
│     Checkbox Heat    Title (priority styled)        Star Indicator
│              Badge   Due • Priority • Project • Repeat          │
└─────────────────────────────────────────────────────────────────┘
```

### Components

1. **Color Strip (Left Edge)**
   - Thin vertical strip (4px) on left edge
   - Color matches the Heat/Importance badge color
   - Indicates task urgency at a glance

2. **Checkbox**
   - 20-24px circular checkbox
   - Unchecked: border only (gray)
   - Checked: filled green (#10b981) with white checkmark
   - Tap to toggle completion

3. **Heat/Importance Badge**
   - See [Section 2](#2-heatimportance-badge) for details

4. **Title**
   - Primary text, styled by priority (see [Section 3](#3-priority-styling))
   - New/untouched tasks: Bold green (#4ADE80 / #22c55e)
   - Completed tasks: Strikethrough, muted color, italic

5. **Secondary Row (Meta)**
   - Smaller text (11-12px), muted color
   - Format: `{Due} • {Priority} • {Project} • {Repeat}`
   - Only shown in "comfortable" density mode

6. **Star Button**
   - Shows current star level (see [Section 4](#4-star-levels))
   - Tap to cycle through levels: None → Blue → Yellow → Orange → None

7. **Notes Indicator**
   - Small sticky-note icon when task has notes
   - Muted gray, appears near star

### Density Modes

**Compact Mode:**
- Minimal padding (py: 4px)
- Single line: checkbox, badge, title, star
- No secondary metadata row

**Comfortable Mode:**
- Standard padding (py: 8-12px)
- Two lines: title row + metadata row
- Shows full task context

---

## 2. Heat/Importance Badge

A small colored badge showing the numeric heat or importance score.

### Badge Appearance
- Shape: Rounded rectangle (border-radius: 4px)
- Size: 20×24px (heat) or 20×20px (importance)
- Font: 10px bold, white text

### Heat Mode (0-145 scale)

| Heat Range | Color Class | Hex Color | Label |
|------------|-------------|-----------|-------|
| 0-8 | bg-blue-400 | #60A5FA | Low |
| 9-24 | bg-green-400 | #4ADE80 | Medium-Low |
| 25-48 | bg-yellow-400 | #FACC15 | Medium |
| 49-71 | bg-orange-400 | #FB923C | Medium-High |
| 72-145 | bg-red-400 | #F87171 | High |

### Importance Mode (2-14 scale)

| Importance | Color Class | Hex Color | Label |
|------------|-------------|-----------|-------|
| 2-3 | bg-blue-400 | #60A5FA | Low |
| 4-5 | bg-green-400 | #4ADE80 | Medium-Low |
| 6-8 | bg-yellow-400 | #FACC15 | Medium |
| 9-11 | bg-orange-400 | #FB923C | Medium-High |
| 12-14 | bg-red-400 | #F87171 | High |

### Badge Behavior
- Tap toggles between Heat and Importance display mode
- Shows integer value (Math.round)
- Completed tasks: muted background (#e5e7eb / #404040), muted text

---

## 3. Priority Styling

Priority affects task title text styling (not a badge).

### Priority Levels

| Priority | Font Weight | Light Mode Color | Dark Mode Color |
|----------|-------------|------------------|-----------------|
| top | Bold (700) | #990000 | #DD5555 |
| high | Bold (700) | #344C63 | #7A9EC6 |
| medium | Regular (400) | Default text | Default text |
| low | Light (300) | Muted (#6b7280) | Muted (#9ca3af) |

### Special States Override Priority
- **Untouched/New**: Bold green (#4ADE80) - overrides priority styling
- **Completed**: Strikethrough, italic, muted - overrides priority styling
- **Focused**: Subtle green background tint on entire row

---

## 4. Star Levels

Tasks can have 4 star states (0-3), each with a distinct color.

### Star Colors

| Level | Name | Color Hex | CSS |
|-------|------|-----------|-----|
| 0 | None | #9ca3af (gray) | grayscale, 30% opacity |
| 1 | Blue | #60A5FA | blue-400 |
| 2 | Yellow | #FACC15 / #eab308 | yellow-400 |
| 3 | Orange | #FB923C / #f97316 | orange-400 |

### Star Behavior
- Icon: Lucide `Star` icon (20-24px)
- Level 0: Outline only, grayed out
- Levels 1-3: Filled star with appropriate color
- Tap cycles: 0 → 1 → 2 → 3 → 0

### Star Contribution to Scoring
Stars add to base importance:
- None (0): +0 pts
- Blue (1): +1 pt
- Yellow (2): +2 pts
- Orange (3): +3 pts

---

## 5. Due Date Display

### Date States and Formatting

| Condition | Display | Styling |
|-----------|---------|---------|
| No date | "No Due Date" | Muted text (#6b7280) |
| Overdue | "Jan 5" (formatted) | White text on red pill (#ef4444) |
| Today | "Today" | Bold, default text color |
| Tomorrow | "Tomorrow" | Bold, default text color |
| Future (same year) | "Jan 15" | Default text color |
| Future (diff year) | "Jan 15 '26" | Default text color |
| Completed | Date formatted | No special styling |

### Overdue Pill Styling
```css
.overdue-date {
  background-color: #ef4444; /* red-500 */
  color: white;
  padding: 2px 8px;
  border-radius: 9999px;
  font-weight: 500;
}
```

---

## 6. Project Display

### Project Indicator
- Color dot: 10px circle with project's `colorHex`
- Text: Project name, truncated if needed
- No project: "No Project" in muted text

### Available Project Colors (Default Palette)
Projects use hex colors stored in `colorHex` field. Common defaults:
- Gray: #9ca3af (default/none)
- Various user-assigned colors

---

## 7. Task Detail Screen

Full-screen view for editing a single task.

### Header Layout
```
┌─────────────────────────────────────────────────────────────────┐
│ [←]     [Badge] [★] [🔥] [❄️]              Created: Dec 28 '24  │
│  ^        ^      ^   ^    ^                Modified: Dec 29 '24  │
│ Back    Toggle  Star Heat Cool                                   │
└─────────────────────────────────────────────────────────────────┘
```

### Header Components
1. **Back Button**: Arrow-left icon, returns to list
2. **Badge**: Tappable Heat/Importance badge (toggles mode)
3. **Star Button**: Current level color, taps cycle
4. **Heat Button**: Flame icon, orange (#f97316)
5. **Cool Button**: Snowflake icon, blue (#3b82f6)
6. **Timestamps**: Small text showing created/modified dates

### Body Layout
```
┌─────────────────────────────────────────────────────────────────┐
│ [☐] Title Input                                                 │
├─────────────────────────────────────────────────────────────────┤
│ Due date     [📅 Today]                                         │
│ Priority     [Medium]                                           │
│ Project      [● Work]                                           │
│ Recurrence   [None]                                             │
├─────────────────────────────────────────────────────────────────┤
│ Notes                                                           │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ Multiline text area for notes...                            │ │
│ │                                                             │ │
│ └─────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

### Field Rows
- Label on left (28px width), value on right
- Label: 16-18px, semibold, muted color
- Values: Tappable to edit, show current value

### Field Editors
- **Due Date**: Date picker modal
- **Priority**: Bottom sheet with options (Top, High, Medium, Low)
- **Project**: Bottom sheet with project list and color dots
- **Recurrence**: Bottom sheet with options (None, Daily, Weekly, Monthly, etc.)

### Notes Section
- Multiline text area
- Auto-saves on blur
- Minimum height: 150px

---

## 8. Quick Add

Floating action button (FAB) with modal input.

### FAB Position
```css
.fab {
  position: fixed;
  bottom: 20px + safe-area;
  right: 16px;
  width: 56px;
  height: 56px;
  border-radius: 28px;
  background: #f24c05; /* Brand orange */
  shadow: lg;
}
```

### Add Task Modal
```
┌─────────────────────────────────────────────────────────────────┐
│ Add Task                                              [✕]       │
├─────────────────────────────────────────────────────────────────┤
│ [Add a new task...                              ] [→]           │
│  ^                                                ^             │
│ Text input                                    Submit button     │
└─────────────────────────────────────────────────────────────────┘
```

### Quick Add Behavior
- Input auto-focuses when modal opens
- Submit on Enter/Done key
- Uses user's default priority and due date settings
- Creates task in current bucket (todo/watch/later)
- Clears input and closes modal on success

---

## 9. Settings Screen

Simple settings panel accessible from tab bar.

### Settings Layout
```
┌─────────────────────────────────────────────────────────────────┐
│ Settings                                                        │
├─────────────────────────────────────────────────────────────────┤
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ DEFAULT TASK VALUES                                         │ │
│ │                                                             │ │
│ │ Default Priority           [Medium ▼]                       │ │
│ │ Default Due Date           [None ▼]                         │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                 │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ ACCOUNT                                                     │ │
│ │                                                             │ │
│ │ Email                      user@example.com                 │ │
│ │ Sign Out                   [→]                              │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                 │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ SYNC                                                        │ │
│ │                                                             │ │
│ │ Last Sync                  Just now                         │ │
│ │ Pending Changes            0                                │ │
│ │ Force Sync                 [→]                              │ │
│ └─────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

### Default Priority Options
- Low, Medium, High, Top

### Default Due Date Options
- None, Today, Tomorrow, Next Week

---

## 10. Gestures and Interactions

### Swipe Gestures (Task List Items)

| Direction | Action | Visual Feedback |
|-----------|--------|-----------------|
| Swipe Right (>60%) | Heat task | Orange background, flame icon |
| Swipe Left (>60%) | Cool task | Blue background, snowflake icon |

### Swipe Implementation
- Show threshold line at 60% width
- Background reveals during swipe:
  - Right: Orange (#FB923C) tint with Flame icon
  - Left: Blue (#60A5FA) tint with Snowflake icon
- Haptic feedback on threshold cross
- Action triggers on release if past threshold

### Pull to Refresh
- Standard pull-to-refresh on task lists
- Triggers data sync with server

### Tap Actions
- Task row tap: Navigate to detail screen
- Checkbox tap: Toggle completion
- Star tap: Cycle star level
- Badge tap (detail): Toggle heat/importance mode

---

## 11. Design Tokens

### Colors

```typescript
const colors = {
  // Brand
  brand: '#f24c05',
  brandLight: '#fca67a',

  // Heat/Importance
  heatBlue: '#60A5FA',
  heatGreen: '#4ADE80',
  heatYellow: '#FACC15',
  heatOrange: '#FB923C',
  heatRed: '#F87171',

  // Stars
  starNone: '#9ca3af',
  starBlue: '#60A5FA',
  starYellow: '#FACC15',
  starOrange: '#FB923C',

  // Priority (Light Mode)
  priorityTop: '#990000',
  priorityHigh: '#344C63',

  // Priority (Dark Mode)
  priorityTopDark: '#DD5555',
  priorityHighDark: '#7A9EC6',

  // Semantic
  success: '#10b981',
  error: '#dc2626',
  warning: '#f59e0b',

  // Background
  backgroundLight: '#f9fafb',
  backgroundDark: '#1f2937',
  cardLight: '#ffffff',
  cardDark: '#374151',

  // Text
  textPrimary: '#1f2937',
  textSecondary: '#6b7280',
  textMuted: '#9ca3af',

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

  // Meta/Secondary
  metaSize: 11,
  metaLineHeight: 14,

  // Badge
  badgeSize: 10,
  badgeFontWeight: '700',

  // Labels
  labelSize: 14,
  labelWeight: '600',

  // Body
  bodySize: 16,
  bodyLineHeight: 24,
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
  full: 9999,
};
```

---

## Appendix: Component File Structure

```
apps/mobile/
├── components/
│   ├── task/
│   │   ├── TaskListItem.tsx       # Task row component
│   │   ├── HeatBadge.tsx          # Heat/Importance badge
│   │   ├── StarButton.tsx         # Cycling star button
│   │   ├── DueDatePill.tsx        # Due date display
│   │   ├── PriorityText.tsx       # Priority-styled text
│   │   └── SwipeableTask.tsx      # Swipe gesture wrapper
│   ├── detail/
│   │   ├── TaskDetailHeader.tsx   # Header with badges/controls
│   │   ├── TaskDetailForm.tsx     # Editable fields
│   │   ├── FieldPicker.tsx        # Generic bottom sheet picker
│   │   ├── DatePickerModal.tsx    # Date selection
│   │   └── NotesEditor.tsx        # Notes text area
│   ├── add/
│   │   ├── QuickAddFAB.tsx        # Floating action button
│   │   └── QuickAddModal.tsx      # Add task modal
│   └── settings/
│       ├── SettingsSection.tsx    # Section wrapper
│       └── SettingRow.tsx         # Individual setting row
├── constants/
│   ├── colors.ts                  # Color tokens
│   ├── typography.ts              # Typography tokens
│   └── spacing.ts                 # Spacing tokens
└── utils/
    ├── formatDate.ts              # Date formatting helpers
    ├── getHeatColor.ts            # Heat → color mapping
    └── getPriorityStyle.ts        # Priority → style mapping
```
