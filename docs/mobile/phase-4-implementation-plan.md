# Phase 4: Core UI Screens - Implementation Plan

> Mobile App Implementation - Phase 4
> Epic: toodle-odn7

## Overview

Phase 4 builds the core mobile UI components and screens. The existing placeholder screens will be upgraded with production-quality implementations that match the web app's visual language while feeling native on mobile.

## Prerequisites (Completed in Phases 0-3)

- [x] Monorepo structure with shared packages
- [x] Expo scaffold with navigation
- [x] Sync infrastructure with background sync
- [x] Local SQLite database with offline-first mutations
- [x] Optimistic updates for task operations

## Implementation Tasks

### 4.1 Design System & Constants

**Goal:** Establish shared design tokens matching web app styles.

**Files to create:**
```
apps/mobile/constants/
├── colors.ts          # All color tokens from mobile-ui-spec.md
├── typography.ts      # Font sizes, weights, line heights
├── spacing.ts         # Consistent spacing scale
└── theme.ts           # Combined theme export + dark mode support
```

**Tasks:**
- [ ] Create `colors.ts` with heat colors, priority colors, star colors, semantic colors
- [ ] Create `typography.ts` with text styles for titles, meta, badges, labels
- [ ] Create `spacing.ts` with xs/sm/md/lg/xl scale
- [ ] Create `theme.ts` that exports light/dark themes using React Native's useColorScheme
- [ ] Add theme context provider to app layout

**Colors to implement (from spec):**
```typescript
// Heat/Importance thresholds
heatBlue: '#60A5FA',     // 0-8 heat, 2-3 importance
heatGreen: '#4ADE80',    // 9-24 heat, 4-5 importance
heatYellow: '#FACC15',   // 25-48 heat, 6-8 importance
heatOrange: '#FB923C',   // 49-71 heat, 9-11 importance
heatRed: '#F87171',      // 72-145 heat, 12-14 importance

// Star levels
starNone: '#9ca3af',
starBlue: '#60A5FA',
starYellow: '#FACC15',
starOrange: '#FB923C',

// Priority (light/dark)
priorityTop: '#990000' / '#DD5555',
priorityHigh: '#344C63' / '#7A9EC6',
```

---

### 4.2 Core Utility Components

**Goal:** Build reusable primitives used across screens.

**Files to create:**
```
apps/mobile/components/ui/
├── HeatBadge.tsx       # Heat/Importance colored badge
├── StarButton.tsx      # Tappable cycling star
├── DueDateDisplay.tsx  # Smart date formatting with overdue pill
├── PriorityText.tsx    # Text component with priority styling
├── Checkbox.tsx        # Custom checkbox with completion animation
└── ColorDot.tsx        # Small colored circle for projects
```

**Tasks:**

#### 4.2.1 HeatBadge
- [ ] Accept `heat: number`, `importance: number`, `mode: 'heat' | 'importance'`
- [ ] Implement `getHeatColor(heat)` function with correct thresholds
- [ ] Implement `getImportanceColor(importance)` function
- [ ] Render rounded rect badge with white text
- [ ] Support `isCompleted` prop for muted styling
- [ ] Support `onPress` for mode toggle

#### 4.2.2 StarButton
- [ ] Accept `level: 0 | 1 | 2 | 3`, `onPress`
- [ ] Use correct colors: gray/blue/yellow/orange
- [ ] Fill star icon for levels > 0
- [ ] Level 0: outline only with grayscale filter

#### 4.2.3 DueDateDisplay
- [ ] Accept `dueAt: Date | null`
- [ ] Format: "Today", "Tomorrow", "Jan 5", "Jan 5 '26"
- [ ] Overdue: red pill with white text
- [ ] No date: "No Due Date" in muted text
- [ ] Completed: no special styling

#### 4.2.4 PriorityText
- [ ] Accept `priority: 'low' | 'medium' | 'high' | 'top'`
- [ ] Accept `isNew: boolean`, `isCompleted: boolean`
- [ ] Apply correct font weight and color
- [ ] New tasks: green bold override
- [ ] Completed: strikethrough + muted + italic

#### 4.2.5 Checkbox
- [ ] Accept `checked: boolean`, `onToggle`
- [ ] Circular checkbox style
- [ ] Animated checkmark on completion
- [ ] Green fill when checked

---

### 4.3 Enhanced TaskListItem

**Goal:** Upgrade existing TaskListItem with full styling and interactions.

**File:** `apps/mobile/components/TaskListItem.tsx` (refactor existing)

**Tasks:**
- [ ] Add left color strip based on heat color
- [ ] Integrate new HeatBadge component (replace inline badge)
- [ ] Integrate PriorityText for title styling
- [ ] Integrate StarButton (replace inline star)
- [ ] Add DueDateDisplay in meta row
- [ ] Add notes indicator icon when task has notes
- [ ] Support density prop: 'compact' | 'comfortable'
- [ ] Comfortable mode: show secondary meta row
- [ ] Handle completed task styling (opacity, strikethrough)
- [ ] Handle focused task styling (green background tint)

**Layout structure:**
```
[Strip][Checkbox][Badge][Content Area][Star][Notes]
                        └── Title
                        └── Meta row (comfortable only)
```

---

### 4.4 Swipeable Task Row

**Goal:** Add swipe gestures for heat/cool actions.

**File:** `apps/mobile/components/task/SwipeableTaskRow.tsx`

**Tasks:**
- [ ] Wrap TaskListItem with react-native-gesture-handler PanGestureHandler
- [ ] Track horizontal swipe distance
- [ ] Reveal background during swipe:
  - Right swipe: orange background + Flame icon + "Heat" text
  - Left swipe: blue background + Snowflake icon + "Cool" text
- [ ] Show threshold indicator line at 60% width
- [ ] Trigger haptic feedback when crossing threshold
- [ ] Call `onHeat` / `onCool` on release past threshold
- [ ] Animate row back to resting position
- [ ] Support `enableSwipe` prop (disable for completed tasks)

**Dependencies:**
- react-native-gesture-handler (already in project)
- react-native-reanimated (for smooth animations)
- expo-haptics (for haptic feedback)

---

### 4.5 Task Detail Screen

**Goal:** Full task editing screen with all fields.

**File:** `apps/mobile/app/task/[id].tsx` (refactor existing)

**New components to create:**
```
apps/mobile/components/detail/
├── TaskDetailHeader.tsx   # Header with badge, star, heat/cool
├── TaskDetailForm.tsx     # All editable fields
├── FieldRow.tsx           # Label + value row
├── NotesEditor.tsx        # Multiline notes input
└── pickers/
    ├── PriorityPicker.tsx     # Bottom sheet for priority
    ├── ProjectPicker.tsx      # Bottom sheet for project
    ├── RecurrencePicker.tsx   # Bottom sheet for recurrence
    └── DatePicker.tsx         # Date selection modal
```

**Tasks:**

#### 4.5.1 TaskDetailHeader
- [ ] Back button (arrow-left, navigates back)
- [ ] Centered controls: Badge, Star, Heat, Cool buttons
- [ ] Right side: Created/Modified timestamps
- [ ] Badge: tappable to toggle heat/importance mode
- [ ] Star: cycles through levels
- [ ] Heat/Cool: trigger mutations

#### 4.5.2 TaskDetailForm
- [ ] Checkbox + Title input row at top
- [ ] Title input auto-saves on blur
- [ ] Field rows for: Due Date, Priority, Project, Recurrence
- [ ] Each field row: label left, tappable value right
- [ ] Tapping value opens appropriate picker

#### 4.5.3 Pickers (Bottom Sheets)
- [ ] Use @gorhom/bottom-sheet for native feel
- [ ] PriorityPicker: List with Top, High, Medium, Low
- [ ] ProjectPicker: "No Project" + list of projects with color dots
- [ ] RecurrencePicker: None, Daily, Weekly, Monthly, Yearly, Custom
- [ ] DatePicker: Use @react-native-community/datetimepicker

#### 4.5.4 NotesEditor
- [ ] Multiline TextInput
- [ ] Minimum height 150px, grows with content
- [ ] Auto-save on blur
- [ ] Placeholder: "Notes"
- [ ] Handle completed task state (disabled/muted)

---

### 4.6 Quick Add Enhancement

**Goal:** Upgrade QuickAdd with modal and settings integration.

**Files:**
```
apps/mobile/components/add/
├── QuickAddFAB.tsx        # Floating action button
└── QuickAddModal.tsx      # Modal with input
```

**Tasks:**

#### 4.6.1 QuickAddFAB
- [ ] Fixed position: bottom-right with safe area inset
- [ ] Brand orange (#f24c05), 56px circle
- [ ] Plus icon, shadow
- [ ] Opens QuickAddModal on press

#### 4.6.2 QuickAddModal
- [ ] Full-width modal from bottom
- [ ] Header: "Add Task" + close button
- [ ] Input field with "Add a new task..." placeholder
- [ ] Submit button (arrow icon)
- [ ] Auto-focus input on open
- [ ] Submit on keyboard "Done" or button press
- [ ] Use default priority/due date from settings
- [ ] Create task in current bucket
- [ ] Close on success, clear input
- [ ] Show loading state during creation

---

### 4.7 Settings Screen

**Goal:** Settings page with user preferences and sync status.

**File:** `apps/mobile/app/(tabs)/settings.tsx` (refactor existing)

**Tasks:**
- [ ] Create SettingsSection component (card with title)
- [ ] Create SettingRow component (label + value/control)
- [ ] Section: Default Task Values
  - [ ] Default Priority picker (Low/Medium/High/Top)
  - [ ] Default Due Date picker (None/Today/Tomorrow/Next Week)
- [ ] Section: Account
  - [ ] Show user email (read-only)
  - [ ] Sign Out button
- [ ] Section: Sync
  - [ ] Last Sync timestamp
  - [ ] Pending Changes count
  - [ ] Force Sync button
- [ ] Integrate with useSettings hook
- [ ] Save changes immediately on selection

---

### 4.8 Tab Screens Polish

**Goal:** Ensure all three main tabs (Todo/Watch/Later) work properly.

**Files:**
- `apps/mobile/app/(tabs)/index.tsx` (Todo)
- `apps/mobile/app/(tabs)/watch.tsx`
- `apps/mobile/app/(tabs)/later.tsx`

**Tasks:**
- [ ] Each tab filters by bucket
- [ ] Integrate enhanced TaskListItem
- [ ] Add SwipeableTaskRow wrapper
- [ ] Add pull-to-refresh
- [ ] Add empty state with appropriate message
- [ ] Add QuickAddFAB to each screen
- [ ] Add sort mode selector (Heat vs Importance) in header
- [ ] Add density toggle in header options

---

### 4.9 Dark Mode Support

**Goal:** Full dark mode support across all components.

**Tasks:**
- [ ] Use React Native's useColorScheme hook
- [ ] Create ThemeProvider context
- [ ] Define dark variants for all colors
- [ ] Update all components to use theme colors
- [ ] Test priority colors in dark mode (use alternate hex values)
- [ ] Test badge colors in dark mode
- [ ] Handle system theme changes

---

### 4.10 Testing & Polish

**Tasks:**
- [ ] Test on iOS simulator
- [ ] Test on Android emulator
- [ ] Test offline behavior
- [ ] Test sync edge cases
- [ ] Verify haptic feedback works
- [ ] Verify animations are smooth
- [ ] Check accessibility (screen reader labels)
- [ ] Performance test with 100+ tasks

---

## Task Dependencies

```
4.1 (Design System)
  └── 4.2 (Utility Components)
        ├── 4.3 (TaskListItem)
        │     └── 4.4 (SwipeableTaskRow)
        │           └── 4.8 (Tab Screens)
        └── 4.5 (Task Detail)
              └── 4.6 (Quick Add)
                    └── 4.7 (Settings)
                          └── 4.9 (Dark Mode)
                                └── 4.10 (Testing)
```

---

## Estimated Scope

| Section | Components | Complexity |
|---------|------------|------------|
| 4.1 Design System | 4 files | Low |
| 4.2 Utility Components | 6 components | Medium |
| 4.3 TaskListItem | 1 component (refactor) | Medium |
| 4.4 Swipeable Row | 1 component | High |
| 4.5 Task Detail | 8 components | High |
| 4.6 Quick Add | 2 components | Low |
| 4.7 Settings | 1 screen + 2 components | Medium |
| 4.8 Tab Screens | 3 screens | Low |
| 4.9 Dark Mode | Theme updates | Medium |
| 4.10 Testing | N/A | Ongoing |

---

## Files Changed Summary

**New files:**
- `apps/mobile/constants/colors.ts`
- `apps/mobile/constants/typography.ts`
- `apps/mobile/constants/spacing.ts`
- `apps/mobile/constants/theme.ts`
- `apps/mobile/components/ui/HeatBadge.tsx`
- `apps/mobile/components/ui/StarButton.tsx`
- `apps/mobile/components/ui/DueDateDisplay.tsx`
- `apps/mobile/components/ui/PriorityText.tsx`
- `apps/mobile/components/ui/Checkbox.tsx`
- `apps/mobile/components/ui/ColorDot.tsx`
- `apps/mobile/components/task/SwipeableTaskRow.tsx`
- `apps/mobile/components/detail/TaskDetailHeader.tsx`
- `apps/mobile/components/detail/TaskDetailForm.tsx`
- `apps/mobile/components/detail/FieldRow.tsx`
- `apps/mobile/components/detail/NotesEditor.tsx`
- `apps/mobile/components/detail/pickers/PriorityPicker.tsx`
- `apps/mobile/components/detail/pickers/ProjectPicker.tsx`
- `apps/mobile/components/detail/pickers/RecurrencePicker.tsx`
- `apps/mobile/components/detail/pickers/DatePicker.tsx`
- `apps/mobile/components/add/QuickAddFAB.tsx`
- `apps/mobile/components/add/QuickAddModal.tsx`
- `apps/mobile/components/settings/SettingsSection.tsx`
- `apps/mobile/components/settings/SettingRow.tsx`
- `apps/mobile/utils/formatDate.ts`
- `apps/mobile/utils/getHeatColor.ts`
- `apps/mobile/utils/getPriorityStyle.ts`

**Files to refactor:**
- `apps/mobile/components/TaskListItem.tsx`
- `apps/mobile/components/QuickAddTask.tsx`
- `apps/mobile/app/(tabs)/index.tsx`
- `apps/mobile/app/(tabs)/watch.tsx`
- `apps/mobile/app/(tabs)/later.tsx`
- `apps/mobile/app/(tabs)/settings.tsx`
- `apps/mobile/app/task/[id].tsx`
- `apps/mobile/app/_layout.tsx` (add theme provider)

---

## Package Dependencies

May need to add:
```bash
# Gesture handling (likely already installed)
npx expo install react-native-gesture-handler react-native-reanimated

# Bottom sheet for pickers
npx expo install @gorhom/bottom-sheet

# Date picker
npx expo install @react-native-community/datetimepicker

# Haptics
npx expo install expo-haptics
```
