# Mobile & Tablet Responsive Design Plan

## Overview

This document outlines the comprehensive plan to make Toasty Task responsive across mobile, tablet, and desktop devices. The current implementation uses a fixed-width table layout that doesn't adapt to smaller screen sizes, resulting in poor mobile UX with excessive empty space and cramped content.

## Breakpoint Strategy

- **Mobile (`< sm`):** < 640px (card layout, full-screen modals, hamburger nav)
- **Tablet (`sm` / `md`):** 640px - 1023px (simplified table, centered modals)
- **Desktop (`lg+`):** ≥ 1024px (full table, inline editing, expanded sidebar; `lg` and `xl` share the same layout)

---

## Phase 1: Mobile Navigation & Header (< 640px)

### 1.1 Mobile Header Layout
**File:** [app/tasks/page.tsx](../app/tasks/page.tsx)

**Layout:**
- **Left:** Hamburger menu icon (opens global side nav)
- **Center:** Logo + "Toasty Task" text
- **Right:** ... menu icon, Search icon

### 1.2 Hamburger Menu
**Component:** Sheet/Drawer (existing component)

**Contents:**
- Global navigation in a side sheet:
  - Main task list entry
  - Projects section (existing sidebar content)
    - "All Projects" and "No Project" options
    - Create/edit/archive projects
  - Settings entry (navigates to `/settings`)
- All overflow actions (theme, account/profile, log out) live under the Settings page (see 1.5)
- Search remains accessible via the top-nav search icon (may optionally also be listed in the side nav)

### 1.3 Options Menu (... icon)
**New Component:** [components/tasks/mobile-options-menu.tsx](../components/tasks/mobile-options-menu.tsx)

**Options:**
- **Sort by:** Heat, Importance, Date Created, Date Modified
- **Sort direction:** Asc / Desc toggle
- **Density:** Compact / Comfortable
- **Show / Hide** completed tasks

### 1.4 Search Modal
**New Component:** [components/search/search-modal.tsx](../components/search/search-modal.tsx)

**Features:**
- Modal popup with dimmed backdrop
- Nav bar with close button
- Search input (autofocus)
- Enter key navigates to search results page
- Close button returns to main view
- Opening the search modal pushes a history entry; browser/OS back closes the modal before navigating away
- Esc key and backdrop click also close the modal
- Focus starts in the search input and is trapped inside the modal; on close, focus returns to the search icon trigger

### 1.5 Settings Page
**Route:** /settings

**Contents:**
- Theme toggle (light/dark/system)
- User account section (profile, email/settings)
- Log out button (Clerk sign-out) within the account section
- All other application settings and preferences
- Primary home for account management (profile, account settings, sign-out) across all breakpoints
- On mobile, this is the only place the theme toggle appears; the mobile header does not show a separate theme control
- Accessible from the hamburger side nav on mobile/tablet (Settings entry)
- On tablet and desktop, the theme toggle remains visible in the top header (as in the current design), while this page provides the underlying configuration
- On desktop, also accessible via a profile section in the left navigation/sidebar; the header keeps the existing theme toggle and search input, and no hamburger icon is shown

---

## Phase 2: Mobile Task List (< 640px)

### 2.1 Task List Header
**Behavior:** **REMOVED on mobile** - no header at all

All controls (sort, density, show completed) moved to the ... options menu.

### 2.2 Task Row Layout
**File:** [components/tasks/task-row.tsx](../components/tasks/task-row.tsx)

#### Compact Mode
- **Heat color strip:** 4px vertical border-left (uses heat/importance badge color)
- **Checkbox:** Functional, toggles completion
- **Star button:** Functional, cycles 0-3 levels
- **Notes indicator:** Icon shown if task has notes
- **Task title:** Clickable, opens task detail screen
- **No separate heat badge** component

#### Comfortable Mode
- **Primary row:** Same as compact
- **Secondary row:** Small, muted text
  - Format: "Due: Tomorrow • Priority: High • Project: Work • Repeats: Weekly"
  - Bullet-separated
  - Compact display

**Heights:**
- Compact: 56px
- Comfortable: 76px (56px + 20px secondary row)

### 2.3 Swipe Gestures
**Library:** react-swipeable (gesture detection) + CSS transforms for animation (mobile only; disabled on tablet and desktop)

#### Swipe Right (Heat)
- Orange/flame background reveals at ~30% swipe
- Action triggers at ~60%+ swipe
- Haptic feedback on trigger

#### Swipe Left (Cool)
- Blue/snowflake background reveals at ~30% swipe
- Action triggers at ~60%+ swipe
- Haptic feedback on trigger

#### Gesture Precedence & Fallbacks
- Vertical scrolling takes priority: if `abs(deltaY) > abs(deltaX)` (initial movement mostly vertical), treat the interaction as scroll, not a swipe
- Swipes start only when the gesture begins on the card background; starting on interactive controls (checkbox, star, notes icon) performs that control's primary action and does not initiate a swipe
- On non-touch/pointer-only devices (mouse/trackpad) and on tablet/desktop breakpoints, swipe gestures are disabled; heat/cool actions remain accessible via explicit buttons in the card and task detail screen
- On platforms without `navigator.vibrate` or similar APIs, haptic feedback calls are no-ops while keeping all interactions functional

### 2.4 Task Detail Screen
**New Component:** [components/tasks/task-detail-screen.tsx](../components/tasks/task-detail-screen.tsx)

**Route:** `/tasks/[id]` (dedicated task detail route)
**Mode:** Full screen on mobile (< 640px)

#### Header
- **Left:** Back arrow
- **Center:** Heat badge (tappable to toggle heat & importance)
- **Right:** Close X
- **Height:** 56px

#### Content (scrollable)
1. **Task title input** (large, auto-focus)
2. **Actions section** (below title):
   - Checkbox (complete/uncomplete)
   - Star button (cycle 0-3)
   - Heat button (flame icon)
   - Cool button (snowflake icon)
3. **Fields section:**
   - Due date picker
   - Priority selector
   - Project selector
   - Recurrence builder
   - Notes textarea (expandable)
4. **Delete button** (bottom, destructive style)

#### Behavior
- **Auto-save on blur** (no Save/Cancel buttons)
- **Swipe down to dismiss**
- **OS back gesture dismisses** (detail screen pushes a history entry; back closes it before leaving the page)
- **Haptic feedback** on actions (gracefully no-op where not supported)
- **Smooth animations** for open/close
- **Save errors:** failed auto-save shows a non-blocking error (toast or inline banner); edits stay in local state and subsequent blurs retry the save
- **Save status indicator:** subtle "Saving…/Saved" status near the header while background saves are in flight

---

## Phase 3: Tablet Layout (640px - 1024px)

### 3.1 Simplified Table
**File:** [components/tasks/task-list.tsx](../components/tasks/task-list.tsx)

#### Column Structure
- **Column 1:** Heat strip + Checkbox + Star + Notes indicator (80px fixed)
- **Column 2:** Task title (flex-1, expands to fill space)
- **Column 3:** Delete icon (visible on hover, 40px fixed)

#### Dropped Columns
- Due date
- Priority
- Project
- Recurrence

**Access:** All dropped fields accessible via task edit modal (click row)

#### Behavior
- Entire row clickable → opens task edit modal
- Hover shows delete icon
- Maintains table structure for familiar desktop-like UX

### 3.2 Task Edit Modal (Tablet)
**Component:** Same as mobile task detail, different presentation

**Differences from Mobile:**
- **Centered modal** (not full screen)
- **Max-width:** 600px
- **Max-height:** 80vh
- **Dimmed backdrop**
- **Scrollable content** if needed
- **Auto-save on blur**
- **Esc key to close**
- **Actions section:** same controls as mobile detail (checkbox, star, heat, cool), so heat/cool buttons remain available in tablet mode

### 3.3 Tablet Header
**Adjustments:**
- Keep search bar visible (condensed width)
- Show ... menu for sort/density/completed
- Sidebar toggle icon visible
- Keep theme toggle visible in the header (same position as desktop, with condensed spacing)
- Responsive padding

---

## Phase 4: Responsive Sidebar

**File:** [components/projects/projects-sidebar.tsx](../components/projects/projects-sidebar.tsx)

### Breakpoint Behaviors

#### Mobile (< 640px)
- **Hidden by default**
- Only accessible via hamburger menu
- Opens as drawer/sheet overlay

#### Tablet (640px - 1024px)
- **Collapsed by default** (56px icon-only view)
- User can expand via toggle button
- Preference saved to localStorage

#### Desktop (≥ 1024px)
- **Expanded by default** (256px full view)
- User preference persists
- Toggle between expanded/collapsed
- Includes a profile section (e.g., avatar + name) near the bottom that links to `/settings` and exposes a log-out action, mirroring the account management entry points used on mobile/tablet

---

## Phase 5: Component Updates

### 5.1 Quick Add
**File:** [components/tasks/quick-add.tsx](../components/tasks/quick-add.tsx)

#### Mobile
- Replace the inline quick add row at the top of the list with a floating action button (FAB)
- **FAB:** circular 56px × 56px button with "+" icon, positioned in the lower-right corner above the safe area inset
- Tapping the FAB opens a Quick Add modal
- **Quick Add modal:** minimal fields (single task text input only), autofocus text input, Enter or primary button adds the task and closes the modal; when invoked from a project view, the new task is created in that project by default (matching current behavior), otherwise it is created with no project or the default context

#### Tablet/Desktop
- Keep current inline quick add row with full "Add Task" button at the top of the list

### 5.2 Task List
**File:** [components/tasks/task-list.tsx](../components/tasks/task-list.tsx)

#### Mobile
- Remove `<TaskListHeader>` completely
- Card-based layout (no table element)
- Stack cards vertically with gap

#### Tablet
- Simplified table (3 columns)
- Keep table structure
- Show header with sort controls

#### Desktop
- Full table (7 columns)
- Complete header with all controls

---

## Phase 6: New Components to Create

### 1. Mobile Task Card
**Path:** components/tasks/mobile-task-card.tsx

**Purpose:** Card-style task row for mobile devices

**Props:**
- task: TaskWithFreshValues
- onComplete: (id: number) => void
- onStar: (id: number) => void
- onHeat: (id: number) => void
- onCool: (id: number) => void
- onClick: () => void (opens detail screen)
- density: "compact" | "comfortable"

### 2. Task Detail Screen
**Path:** components/tasks/task-detail-screen.tsx

**Purpose:** Full-screen task editor (mobile) / modal (tablet)

**Props:**
- taskId: number
- onClose: () => void
- mode: "fullscreen" | "modal"

### 3. Search Modal
**Path:** components/search/search-modal.tsx

**Purpose:** Search interface as modal popup

**Props:**
- isOpen: boolean
- onClose: () => void
- onSearch: (query: string) => void

### 4. Mobile Options Menu
**Path:** components/tasks/mobile-options-menu.tsx

**Purpose:** ... menu for sort/density/completed controls

**Props:**
- sortMode: SortMode
- sortDirection: SortDirection
- density: TaskDensity
- showCompleted: boolean
- onSortModeChange: (mode: SortMode) => void
- onToggleSortDirection: () => void
- onDensityChange: (density: TaskDensity) => void
- onToggleCompleted: () => void

### 5. Mobile Header
**Path:** components/navigation/mobile-header.tsx

**Purpose:** Responsive header layout

**Props:**
- onOpenProjects: () => void
- onOpenSearch: () => void
- onOpenOptions: () => void

### 6. Breakpoint Hook
**Path:** lib/hooks/use-breakpoint.ts

**Purpose:** Detect current breakpoint for behavioral decisions (gestures, modals, etc.) that are difficult to express purely with CSS breakpoints

**Returns:** "mobile" | "tablet" | "desktop"

**Example:**
```typescript
const breakpoint = useBreakpoint()

if (breakpoint === "mobile") {
  return <MobileTaskCard {...props} />
} else {
  return <TaskRow {...props} />
}
```

---

## Phase 7: Implementation Order

### 1. Setup & Infrastructure
- [ ] Create breakpoint hook (`use-breakpoint.ts`)
- [ ] Add swipe gesture library (react-swipeable)
- [ ] Setup responsive utilities

### 2. Mobile Header & Navigation
- [ ] Build mobile header component
- [ ] Create options menu (... icon)
- [ ] Build search modal
- [ ] Update hamburger to show projects only (remove theme/account)
- [ ] Create settings page route

### 3. Task Detail Screen
- [ ] Build full-screen task editor component
- [ ] Add swipe-to-dismiss gesture
- [ ] Implement auto-save on blur
- [ ] Add heat/importance toggle in header
- [ ] Test on mobile devices

### 4. Mobile Task List
- [ ] Remove TaskListHeader on mobile breakpoint
- [ ] Create mobile task card component
- [ ] Add heat color strip (4px border-left)
- [ ] Implement swipe gestures for heat/cool
- [ ] Add haptic feedback

### 5. Tablet Optimizations
- [ ] Simplify table to 3 columns
- [ ] Create modal version of task detail
- [ ] Adjust header for tablet breakpoint
- [ ] Test on tablet devices

### 6. Quick Add & Polish
- [ ] Replace top quick add row with FAB + quick add modal on mobile
- [ ] Ensure all touch targets are 44px minimum
- [ ] Add haptic feedback where appropriate
- [ ] Create loading/empty states for mobile
- [ ] Test gestures and interactions

### 7. Testing & Refinement
- [ ] Test on various mobile devices (iOS/Android)
- [ ] Test on tablets (iPad, Android tablets)
- [ ] Verify breakpoint transitions
- [ ] Check accessibility (screen readers, keyboard)
- [ ] Performance testing (swipe latency, modal animations)

---

## Key Design Specifications

### Mobile (< 640px)

**Dimensions:**
- Header: 56px height
- Task row (compact): 56px height
- Task row (comfortable): 76px height (56px + 20px secondary)
- Heat strip: 4px width, full row height, border-left
- Touch targets: 44px × 44px minimum
- Quick add FAB: 56px × 56px (circular, bottom-right)
- Modal padding: 16px

**Interaction:**
- Swipe reveal threshold: ~30%
- Swipe trigger threshold: ~60%
- Haptic feedback on triggers
- Smooth 250ms animations

### Tablet (640px - 1024px)

**Dimensions:**
- Simplified table, 3 columns
- Modal: 600px max-width, 80vh max-height
- Sidebar: 56px collapsed, 256px expanded
- Header: Condensed spacing

**Interaction:**
- Click to open modal
- Esc to close
- Backdrop click to dismiss
- No swipe gestures for heat/cool; use explicit buttons in the table row and task edit modal instead

### Desktop (≥ 1024px)

**Dimensions:**
- Full table, 7 columns
- Sidebar: 256px default (user preference)
- All inline editing enabled

**Interaction:**
- Current desktop behavior maintained
- Keyboard shortcuts enabled
- Mouse hover states

---

## Components to Modify

### Primary Files
- [app/tasks/page.tsx](../app/tasks/page.tsx) - Header responsive layout, breakpoint switching
- [components/tasks/task-list.tsx](../components/tasks/task-list.tsx) - Conditional rendering mobile vs table
- [components/tasks/task-row.tsx](../components/tasks/task-row.tsx) - Tablet simplified columns
- [components/tasks/quick-add.tsx](../components/tasks/quick-add.tsx) - Mobile button styling
- [components/projects/projects-sidebar.tsx](../components/projects/projects-sidebar.tsx) - Responsive behavior
- [components/search/search-bar.tsx](../components/search/search-bar.tsx) - Convert to modal trigger on mobile

### New Files to Create
- components/tasks/mobile-task-card.tsx
- components/tasks/task-detail-screen.tsx
- components/search/search-modal.tsx
- components/tasks/mobile-options-menu.tsx
- components/navigation/mobile-header.tsx
- lib/hooks/use-breakpoint.ts

---

## Technical Considerations

### Breakpoints & Layout
- Use Tailwind CSS breakpoints: `sm` (≥ 640px), `md` (≥ 768px), `lg` (≥ 1024px), `xl` (≥ 1280px)
- Mobile uses base styles (`< sm`), tablet uses `sm`/`md`, and desktop uses `lg+` (merged layout for `lg` and `xl`)
- Prefer Tailwind responsive utilities (`hidden`, `block`, `flex`, etc.) for major layout changes; avoid heavy JS-driven layout switches where possible
- `use-breakpoint` is used primarily for behavioral toggles (gestures, full-screen vs modal presentation) and must be SSR-safe (check `typeof window !== "undefined"` and provide a sensible default)

### Performance
- Lazy load mobile components to reduce desktop bundle size
- Use CSS transforms for smooth swipe animations
- Debounce auto-save to prevent excessive API calls
- Optimize re-renders with React.memo where appropriate
- Dynamically import heavy, mobile-only components (task detail screen, mobile task list, search modal) with `next/dynamic` where they rely on browser-only APIs
- If large task lists cause scroll or animation jank, consider list virtualization/windowing as a follow-up optimization

### Accessibility
- Ensure keyboard navigation works in modals
- Screen reader announcements for swipe actions
- Focus management when opening/closing modals (focus trap inside modal, restore focus to the trigger on close)
- ARIA labels for icon-only buttons
- Respect `prefers-reduced-motion` to reduce or disable swipe and modal animations for users who prefer less motion

### Browser Compatibility
- Test swipe gestures on iOS Safari
- Verify modal behavior on Android Chrome
- Check viewport height handling (vh units on mobile)
- Test PWA behavior if applicable
- Ensure haptic feedback calls degrade gracefully: skip `navigator.vibrate` where unsupported without errors

### Edge Cases
- Handle landscape orientation on mobile: keep header visible, adjust card widths, and ensure FAB and modals reposition correctly
- Very small screens (< 360px): slightly reduce horizontal padding, allow task titles to wrap, and avoid horizontal scrolling
- Large tablets in landscape (width >= 1024px): treat as desktop (`lg+`) layout; in portrait, keep tablet (`sm`/`md`) layout
- Keyboard open on mobile (viewport resize): anchor FAB and bottom elements using safe-area insets (`env(safe-area-inset-bottom)`) and account for dynamic viewport height

---

## Success Criteria

- [ ] All functionality accessible on mobile (no feature loss)
- [ ] Touch targets meet 44px minimum
- [ ] Swipe gestures feel natural and responsive
- [ ] Modals/screens open/close smoothly
- [ ] No horizontal scrolling on any screen size
- [ ] Empty space reduced, content fills screen appropriately
- [ ] App usable with one hand on mobile
- [ ] Performance: 60fps animations, < 100ms interaction latency

---

## Decisions & Tradeoffs

- **Routing for task detail:** Use a dedicated `/tasks/[id]` route that renders the shared `task-detail-screen` component; on mobile this route appears as a full-screen page, and on tablet it is typically shown as a centered modal above the list when navigated from `/tasks`
- **Quick Add modal scope:** Quick Add stays minimal with a single task text input; when invoked from a project page, new tasks inherit that project automatically (matching current behavior), otherwise they are created with no project/default context
- **Desktop settings UX:** `/settings` is the primary home for account management (profile, account settings, sign-out) across all breakpoints; on desktop it is accessed via a profile section in the left nav/sidebar, while the header retains theme toggle and search and no longer shows a hamburger
- **Large tablets vs desktop:** For larger tablets in landscape (width ≥ 1024px), is it acceptable to always show the desktop layout, or do we want a variant that keeps tablet-style modals for task detail?
- **Swipe on trackpads:** Should swipe-to-heat/cool be enabled for trackpad gestures on laptops, or restricted to touch pointer types only?
- **Save feedback depth:** Is the current auto-save + error toast pattern sufficient, or do we also want an explicit "Saving…/Saved" status indicator on the task detail screen?

---

> Encoding note: this document previously experienced some character encoding issues. If you see stray `�`-style symbols (for example near `>=` breakpoints or separators), treat them as their plain-text equivalents; the surrounding specs are the source of truth.

## Future Enhancements (Not in Initial Plan)

- Pull-to-refresh gesture
- Long-press context menus
- Keyboard shortcuts on tablet with keyboard
- Pinch-to-zoom on task list
- Voice input for quick add
- Offline mode indicators
- Progressive Web App optimizations
