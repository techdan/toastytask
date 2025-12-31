# Mobile App v1 → v2 Migration Plan

> Migration from tab-based bucket navigation to header + drawer navigation with unified task list

## Executive Summary

This migration removes the bottom tab bar (Todo/Watch/Later/Settings) and replaces it with:
- A sticky mobile header with hamburger menu, search, and options
- A slide-out projects drawer for filtering
- A single unified task list with user-selectable sorting
- Enhanced settings with theme, density, and sort preferences

**Estimated Complexity: Medium-High**
- Navigation restructuring: High (breaking change to app structure)
- Component reuse: Medium (many existing components can be adapted)
- Data layer: Low (hooks and storage remain unchanged)

---

## Phase 1: Foundation & State Management
**Complexity: Medium** | **Files: 5 new, 2 modified**

### 1.1 Create App Settings Context
New persistent settings state for mobile-specific preferences.

**Create:** `apps/mobile/contexts/AppSettingsContext.tsx`
```typescript
interface AppSettings {
  sortMode: 'importance' | 'heat' | 'createdAt' | 'updatedAt';
  sortDirection: 'asc' | 'desc';
  density: 'comfortable' | 'compact';
  badgeMode: 'heat' | 'importance';
  showCompleted: boolean;
  theme: 'light' | 'dark' | 'system';
}
```

**Features:**
- AsyncStorage persistence
- Context provider with hooks
- Default values from user settings (synced)

**Dependencies:** None

### 1.2 Create Projects Hook
Hook for accessing projects from local database.

**Create:** `apps/mobile/hooks/useProjects.ts`
- Read projects from LocalDatabase
- Calculate task counts per project
- Calculate focused task count
- Return sorted by display order

**Dependencies:** `lib/storage/database.ts` (already has `getProjects()`)

### 1.3 Create Filter State Hook
Hook for managing current filter selection.

**Create:** `apps/mobile/hooks/useFilterState.ts`
```typescript
type FilterState = {
  projectId: number | null | 'all' | 'focus';
  searchQuery: string;
};
```

**Dependencies:** Phase 1.1

### 1.4 Update useTasks Hook
Modify existing hook to support new filtering.

**Modify:** `apps/mobile/hooks/useTasks.ts`
- Remove bucket parameter requirement
- Add `projectId` filtering
- Add `isFocused` filtering
- Add multi-sort support (importance/heat/created/modified)
- Add sort direction support

**Dependencies:** Phase 1.1

### 1.5 Add Sorting Utilities
Sorting functions matching web implementation.

**Create:** `apps/mobile/lib/sorting.ts`
- `sortTasksByMode(tasks, sortMode, direction)`
- `compareTasks(a, b, sortMode)`
- Untouched task pinning logic

**Dependencies:** None

---

## Phase 2: Navigation Components
**Complexity: High** | **Files: 4 new**

### 2.1 Create Mobile Header Component
The primary navigation header replacing the tab bar.

**Create:** `apps/mobile/components/navigation/MobileHeader.tsx`

**Layout (Normal Mode):**
```
┌─────────────────────────────────────────────────────────────────┐
│ [☰]           🔥 Toasty Task                    [🔍] [⋮]        │
└─────────────────────────────────────────────────────────────────┘
```

**Layout (Search Mode):**
```
┌─────────────────────────────────────────────────────────────────┐
│ [←]    [Search tasks and notes...              ] [✓]            │
└─────────────────────────────────────────────────────────────────┘
```

**Props:**
```typescript
interface MobileHeaderProps {
  onOpenDrawer: () => void;
  onOpenSearch: () => void;
  onOpenOptions: () => void;
  isSearchActive: boolean;
  searchValue: string;
  onSearchChange: (value: string) => void;
  onSearchSubmit: (value: string) => void;
  onSearchCancel: () => void;
}
```

**Specs:**
- Height: 56px (h-14)
- Position: sticky top, z-30
- Shadow: `shadow-sm`
- Search animation: 200ms slide-in from right

**Dependencies:** Logo component (reuse from web or create)

### 2.2 Create Projects Drawer Component
Slide-out drawer for project navigation.

**Create:** `apps/mobile/components/navigation/ProjectsDrawer.tsx`

**Layout:**
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
│ ─────────────────────────────────────────────────────────────── │
│ No Project                                             (14)     │
├─────────────────────────────────────────────────────────────────┤
│ [⚙️ Settings]                                                    │
└─────────────────────────────────────────────────────────────────┘
```

**Props:**
```typescript
interface ProjectsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  projects: ProjectDTO[];
  selectedProjectId: number | null | 'all' | 'focus';
  onSelectProject: (id: number | null | 'all' | 'focus') => void;
  taskCounts: Record<number, number>;
  focusedTaskCount: number;
  onNavigateSettings: () => void;
}
```

**Specs:**
- Width: 80% (max 320px)
- Animation: slide from left edge (use react-native-reanimated)
- Backdrop: dims background with tap-to-close
- Swipe left or tap outside to close

**Dependencies:**
- Phase 1.2 (useProjects)
- react-native-reanimated (already installed)

### 2.3 Create Options Menu Component
Dropdown menu for sort/filter/display options.

**Create:** `apps/mobile/components/navigation/OptionsMenu.tsx`

**Menu Items:**
- Sort by: Importance / Heat / Created / Modified (radio)
- Direction: Ascending / Descending (toggle)
- Density: Comfortable / Compact (radio)
- Show completed: Toggle

**Implementation:**
- Use React Native Modal or custom dropdown
- Anchored to options button in header
- Animate in/out

**Dependencies:** Phase 1.1

### 2.4 Create Search Results Display
Component for showing search results inline.

**Create:** `apps/mobile/components/navigation/SearchResults.tsx`
- Shows "X results for 'query'" banner
- Back button to clear search
- Integrates with task list

**Dependencies:** Phase 1.3

---

## Phase 3: Task List Updates
**Complexity: Medium** | **Files: 3 modified, 1 new**

### 3.1 Create Unified TaskList Component
Single list component replacing tab-specific lists.

**Create:** `apps/mobile/components/task/TaskList.tsx`

**Features:**
- Single FlatList with all uncompleted tasks
- Collapsible "Completed (X)" section at bottom
- Pull-to-refresh triggers sync
- Empty states for:
  - No tasks at all
  - No tasks in selected project
  - No search results

**Props:**
```typescript
interface TaskListProps {
  tasks: TaskWithFreshValues[];
  projects: ProjectDTO[];
  sortMode: SortMode;
  density: DensityMode;
  badgeMode: BadgeMode;
  showCompleted: boolean;
  isLoading: boolean;
  onRefresh: () => void;
  onTaskPress: (taskId: number) => void;
  onHeat: (taskId: number) => void;
  onCool: (taskId: number) => void;
  onToggleComplete: (taskId: number) => void;
  onCycleStar: (taskId: number) => void;
  onBadgeModeToggle: () => void;
}
```

**Dependencies:**
- Phase 1.4 (updated useTasks)
- Existing SwipeableTaskRow (reuse)
- Existing TaskListItem (reuse)

### 3.2 Update TaskListItem for Density
Modify existing component to support compact mode.

**Modify:** `apps/mobile/components/TaskListItem.tsx`

**Changes:**
- Add density prop support (already partially implemented)
- Hide metadata row in compact mode
- Adjust padding: comfortable=12px, compact=4px
- Adjust gap: comfortable=8px, compact=6px

**Dependencies:** Phase 1.1

### 3.3 Update SwipeableTaskRow
Minor updates to existing component.

**Modify:** `apps/mobile/components/task/SwipeableTaskRow.tsx`

**Changes:**
- Ensure compatible with new TaskList
- No bucket-specific logic

**Dependencies:** None (already good)

### 3.4 Add Completed Tasks Section
Collapsible section for completed tasks.

**Create:** `apps/mobile/components/task/CompletedTasksSection.tsx`

**Features:**
- Header: "Completed (X)" with expand/collapse chevron
- Shows tasks completed in last 7 days
- Collapsed by default
- Completion items styled with strikethrough

**Dependencies:** Phase 3.1

---

## Phase 4: Quick Add Updates
**Complexity: Low** | **Files: 1 modified**

### 4.1 Update QuickAddModal
Remove bucket assignment, add project support.

**Modify:** `apps/mobile/components/add/QuickAddModal.tsx`

**Changes:**
- Remove `bucket` prop
- Add optional `projectId` prop (inherits from current filter)
- Remove bucket hint text
- Update to show project name if creating in a project

**Before:**
```typescript
interface QuickAddModalProps {
  visible: boolean;
  onClose: () => void;
  bucket: Bucket;  // REMOVE
}
```

**After:**
```typescript
interface QuickAddModalProps {
  visible: boolean;
  onClose: () => void;
  projectId?: number | null;  // ADD
}
```

**Dependencies:** None

---

## Phase 5: Settings Screen Enhancement
**Complexity: Medium** | **Files: 1 heavily modified**

### 5.1 Enhance Settings Screen
Add new display preferences.

**Modify:** `apps/mobile/app/(tabs)/settings.tsx` → Move to `apps/mobile/app/settings.tsx`

**New Sections:**

**DEFAULTS Section (existing, expand):**
- Default Priority: [Top/High/Medium/Low]
- Default Due Date: [None/Today/Tomorrow]
- Default Project: [None/Project list]

**DISPLAY Section (new):**
- Theme: [System/Light/Dark]
- Density: [Comfortable/Compact]
- Default Sort: [Importance/Heat/Created/Modified]
- Badge Display: [Heat/Importance]

**Implementation:**
- Use SettingRow with dropdown pickers
- Persist via AppSettingsContext
- Sync-able settings stored in settings table

**Dependencies:** Phase 1.1

---

## Phase 6: App Structure Refactoring
**Complexity: High** | **Files: 5 deleted, 4 modified, 1 new**

### 6.1 Remove Tab Navigation
Delete the tabs layout and replace with single-screen structure.

**Delete:**
- `apps/mobile/app/(tabs)/_layout.tsx`
- `apps/mobile/app/(tabs)/index.tsx`
- `apps/mobile/app/(tabs)/watch.tsx`
- `apps/mobile/app/(tabs)/later.tsx`
- `apps/mobile/app/(tabs)/settings.tsx`

### 6.2 Create Main Task Screen
New main screen combining header, drawer, and list.

**Create:** `apps/mobile/app/index.tsx`

**Structure:**
```typescript
export default function MainScreen() {
  return (
    <AppSettingsProvider>
      <View style={styles.container}>
        <MobileHeader {...headerProps} />
        <TaskList {...listProps} />
        <QuickAddFAB onPress={openAddModal} />
        <QuickAddModal {...modalProps} />
        <ProjectsDrawer {...drawerProps} />
        <OptionsMenu {...optionsProps} />
      </View>
    </AppSettingsProvider>
  );
}
```

**Dependencies:** Phases 1-5

### 6.3 Update Root Layout
Modify to use new screen structure.

**Modify:** `apps/mobile/app/_layout.tsx`

**Changes:**
```typescript
// BEFORE:
<Stack.Screen name="(tabs)" options={{ headerShown: false }} />

// AFTER:
<Stack.Screen name="index" options={{ headerShown: false }} />
<Stack.Screen name="settings" options={{ title: "Settings" }} />
```

**Dependencies:** Phase 6.1, 6.2

### 6.4 Update Auth Guard Redirect
Update redirect destination after auth.

**Modify:** `apps/mobile/app/_layout.tsx`

**Change:**
```typescript
// BEFORE:
router.replace("/(tabs)");

// AFTER:
router.replace("/");
```

### 6.5 Move Settings to Standalone Screen
Settings becomes a pushed screen, not a tab.

**Create:** `apps/mobile/app/settings.tsx`
- Move settings implementation here
- Add back navigation

**Dependencies:** Phase 5.1

---

## Phase 7: Polish & Integration
**Complexity: Low** | **Files: Various**

### 7.1 Update Color Constants
Ensure design tokens match v2 spec.

**Modify:** `apps/mobile/constants/colors.ts`
- Add any missing colors from Section 15 of spec
- Verify heat/importance color scales match

### 7.2 Add Logo Component
Create or port logo for header.

**Create:** `apps/mobile/components/ui/Logo.tsx`
- SVG logo component
- Match web implementation

### 7.3 Update Task Detail Screen
Ensure detail screen works with new navigation.

**Modify:** `apps/mobile/app/task/[id].tsx`
- Verify back navigation works
- Update any bucket references

### 7.4 Testing & Verification
- Test all navigation flows
- Test pull-to-refresh sync
- Test offline behavior
- Verify auth flow still works
- Test on both iOS and Android

---

## File Changes Summary

### New Files (12)
```
apps/mobile/
├── app/
│   ├── index.tsx                    # Main task screen (Phase 6.2)
│   └── settings.tsx                 # Standalone settings (Phase 6.5)
├── components/
│   ├── navigation/
│   │   ├── MobileHeader.tsx         # Phase 2.1
│   │   ├── ProjectsDrawer.tsx       # Phase 2.2
│   │   ├── OptionsMenu.tsx          # Phase 2.3
│   │   └── SearchResults.tsx        # Phase 2.4
│   ├── task/
│   │   ├── TaskList.tsx             # Phase 3.1
│   │   └── CompletedTasksSection.tsx # Phase 3.4
│   └── ui/
│       └── Logo.tsx                 # Phase 7.2
├── contexts/
│   └── AppSettingsContext.tsx       # Phase 1.1
├── hooks/
│   ├── useProjects.ts               # Phase 1.2
│   └── useFilterState.ts            # Phase 1.3
└── lib/
    └── sorting.ts                   # Phase 1.5
```

### Modified Files (6)
```
apps/mobile/
├── app/
│   ├── _layout.tsx                  # Phase 6.3, 6.4
│   └── task/[id].tsx                # Phase 7.3
├── components/
│   ├── TaskListItem.tsx             # Phase 3.2
│   ├── task/SwipeableTaskRow.tsx    # Phase 3.3
│   └── add/QuickAddModal.tsx        # Phase 4.1
├── constants/
│   └── colors.ts                    # Phase 7.1
└── hooks/
    └── useTasks.ts                  # Phase 1.4
```

### Deleted Files (5)
```
apps/mobile/app/(tabs)/
├── _layout.tsx                      # Phase 6.1
├── index.tsx                        # Phase 6.1
├── watch.tsx                        # Phase 6.1
├── later.tsx                        # Phase 6.1
└── settings.tsx                     # Phase 6.1
```

---

## Database Schema Changes

**None required.** The existing local SQLite schema already supports:
- Projects with all necessary fields
- Tasks with projectId, isFocused, bucket (bucket becomes unused)
- Settings table for user preferences

The `bucket` field will become unused but does not need to be removed (backward compatible).

---

## Shared Package Updates

**None required.** The `@toasty/contracts` package already includes:
- All necessary DTOs (TaskDTO, ProjectDTO, etc.)
- Sort types can be added locally to mobile app

If we want type sharing for sort modes:
```typescript
// @toasty/contracts (optional)
export type SortMode = 'importance' | 'heat' | 'createdAt' | 'updatedAt';
export type SortDirection = 'asc' | 'desc';
export type DensityMode = 'comfortable' | 'compact';
```

---

## Implementation Order & Dependencies

```
Phase 1 (Foundation) ─────────────────────────────────────────────┐
  1.1 AppSettingsContext                                          │
  1.2 useProjects hook                                            │
  1.3 useFilterState hook ←── depends on 1.1                      │
  1.4 Update useTasks ←── depends on 1.1                          │
  1.5 Sorting utilities                                           │
                                                                  │
Phase 2 (Navigation) ←── depends on Phase 1 ──────────────────────┤
  2.1 MobileHeader                                                │
  2.2 ProjectsDrawer ←── depends on 1.2                           │
  2.3 OptionsMenu ←── depends on 1.1                              │
  2.4 SearchResults                                               │
                                                                  │
Phase 3 (Task List) ←── depends on Phases 1, 2 ───────────────────┤
  3.1 TaskList component                                          │
  3.2 Update TaskListItem                                         │
  3.3 Update SwipeableTaskRow                                     │
  3.4 CompletedTasksSection                                       │
                                                                  │
Phase 4 (Quick Add) ←── can run parallel with Phase 3 ────────────┤
  4.1 Update QuickAddModal                                        │
                                                                  │
Phase 5 (Settings) ←── depends on Phase 1.1 ──────────────────────┤
  5.1 Enhance Settings Screen                                     │
                                                                  │
Phase 6 (Restructure) ←── depends on Phases 2-5 ──────────────────┤
  6.1 Remove tab navigation                                       │
  6.2 Create main screen ←── depends on 2.1, 2.2, 3.1             │
  6.3 Update root layout                                          │
  6.4 Update auth redirect                                        │
  6.5 Move settings screen                                        │
                                                                  │
Phase 7 (Polish) ←── depends on Phase 6 ──────────────────────────┘
  7.1 Update colors
  7.2 Add logo
  7.3 Update task detail
  7.4 Testing
```

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Navigation state bugs | Medium | High | Thorough testing of drawer/modal states |
| Gesture conflicts (swipe vs drawer) | Medium | Medium | Careful gesture handler configuration |
| Performance with large task lists | Low | Medium | Reuse existing optimized FlatList |
| Auth flow breaks | Low | High | Test early in Phase 6 |
| Sync conflicts | Low | Low | No changes to sync layer |

---

## Success Criteria

1. ✅ No bottom tab bar visible
2. ✅ Header with hamburger, search, options working
3. ✅ Projects drawer slides out and filters tasks
4. ✅ "Focused" filter shows only focused tasks
5. ✅ Sort mode selector works (importance/heat/created/modified)
6. ✅ Density toggle works (comfortable/compact)
7. ✅ Search finds tasks by title and notes
8. ✅ FAB creates task in currently selected project
9. ✅ Settings accessible from drawer
10. ✅ Pull-to-refresh triggers sync
11. ✅ Offline-first behavior preserved
12. ✅ Auth flow unchanged

---

*Created: December 2024*
*Based on: mobile-ui-spec-v2.md*
