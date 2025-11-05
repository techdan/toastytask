# Beads Database Audit - October 21, 2025

## Summary

Completed comprehensive audit of beads issue tracking database against requirements.md to ensure all MVP and Phase 2-3 features are tracked with appropriate priorities and issue types.

## Actions Taken

### 1. Created Missing Issues

#### MVP Requirements (Priority 1)
- **toodle-80**: Quick Add functionality with configurable defaults
- **toodle-81**: Keyboard shortcuts for task operations
- **toodle-82**: Filters UI (project, due state, priority, starred)
- **toodle-83**: Bulk operations for tasks
- **toodle-84**: Undo system for task operations
- **toodle-85**: Accessibility improvements (ARIA, keyboard-first)
- **toodle-94**: Focus calculation engine (dynamic 80th percentile)
- **toodle-95**: Batch API endpoints for multi-task operations
- **toodle-97**: Task row UI intelligence (priority/due date display)

#### MVP+ Requirements (Priority 1)
- **toodle-92**: JSON export/import with full fidelity
- **toodle-93**: CSV import for tasks

#### Phase 2 Requirements (Priority 2)
- **toodle-86**: Knowledge archive search functionality
- **toodle-87**: Analytics dashboard (touch history, heat over time)
- **toodle-88**: Natural-language quick add parsing
- **toodle-96**: Recurrence system (simple daily/weekly/monthly)

#### Phase 3 Requirements (Priority 3)
- **toodle-89**: PWA features and push notifications
- **toodle-90**: Third-party integrations
- **toodle-91**: Heat grouping UI (12 bands with colors)
- **toodle-98**: Visual grouping controls and section headers

### 2. Updated Priorities

Aligned existing issues with MVP roadmap (requirements.md lines 267-278):

#### Upgraded to Priority 1 (MVP - Week 1-2)

**Buckets & Views:**
- toodle-27: Bucket Tabs UI (was P2 → P1)
- toodle-28: Manual Bucket Movement UI (was P2 → P1)
- toodle-29: Completed & Archived Views (was P2 → P1)

**Heat Model (Phase 3 in structure, MVP in roadmap):**
- toodle-39: Heat Data Model (was P3 → P1)
- toodle-40: Heat Calculation Engine (was P3 → P1)
- toodle-41: Heat Visualization (was P3 → P1)
- toodle-42: Touch Interaction UI (was P3 → P1)
- toodle-43: Snooze Interaction UI (was P3 → P1)
- toodle-44: Settings for Heat Tuning (was P3 → P1)

**Automation (Phase 4 in structure, MVP in roadmap):**
- toodle-45: Automation Settings (was P3 → P1)
- toodle-46: Automation Engine (was P3 → P1)
- toodle-47: Move Logging & Audit (was P3 → P1)
- toodle-48: Resurfacing Tab UI (was P3 → P1)
- toodle-49: Automation Scheduler (was P3 → P1)

**Focus (Phase 5 in structure, MVP in roadmap):**
- toodle-50: Focus Tab UI (was P3 → P1)
- toodle-51: View Presets (was P3 → P1)

**Performance Optimization (MVP non-functional):**
- toodle-57: Client-Side Performance Optimization (Epic) (was P2 → P1)
- toodle-60: Fix N+1 notes query (was P2 → P1)
- toodle-61: Add database indexes (was P2 → P1)
- toodle-62: Update /api/tasks with includeNotes (was P2 → P1)
- toodle-66: task-notes instant display (was P2 → P1)
- toodle-67: Progressive loading (was P2 → P1)
- toodle-68: Error handling with toasts (was P2 → P1)
- toodle-69: Test cache invalidation (was P2 → P1)
- toodle-79: Notes eager loading (was P2 → P1)

### 3. Coverage Analysis

#### ✅ Well Covered
- Phase 0: Foundation & DAL (all closed)
- Phase 1: Basic Todo App with Importance v1 (all closed)
- Phase 2: Notes system (tasks created, appropriate priority)
- Phase 2: Project management (tasks created, appropriate priority)
- Client-side caching with TanStack Query (in progress)
- Real-time sync strategy (Phase 3 epic created)

#### ⚠️ Needs Attention
- **Currently In Progress**: toodle-79 (Notes eager loading)
- **High Priority Backlog**: 41 open P1 issues (MVP features)
- **Phase 2 Features**: Notes advanced features (per-line actions, version history, search)
- **Phase 3 Features**: Multi-client sync, PWA, integrations

#### ❌ Previously Missing (Now Added)
- Quick Add UI component
- Keyboard shortcuts implementation
- Filters UI
- Bulk operations
- Undo system
- Accessibility improvements
- Focus calculation logic
- Batch API endpoints
- Task row UI intelligence
- Analytics dashboard
- Knowledge archive search
- Natural-language parsing
- Import/export (JSON/CSV)

## Recommendations

### Immediate Priorities (P1 - MVP)

1. **Complete TanStack Query Migration** (toodle-79 in progress)
   - Finish notes eager loading
   - Complete remaining performance tasks (toodle-60, 61, 62, 66-69)

2. **Implement Core MVP Features** (by priority)
   - Quick Add (toodle-80)
   - Filters UI (toodle-82)
   - Task row UI intelligence (toodle-97)
   - Keyboard shortcuts (toodle-81)
   - Accessibility (toodle-85)

3. **Build Buckets System** (Phase 2 structure, MVP roadmap)
   - Bucket tabs (toodle-27)
   - Manual bucket movement (toodle-28)
   - Completed/Archived views (toodle-29)

4. **Implement Heat Model** (Phase 3 structure, MVP roadmap)
   - Heat data model (toodle-39)
   - Heat calculation engine (toodle-40)
   - Heat visualization (toodle-41)
   - Touch/Snooze UI (toodle-42, toodle-43)

5. **Add Automation** (Phase 4 structure, MVP roadmap)
   - Automation settings (toodle-45)
   - Automation engine (toodle-46)
   - Move logging (toodle-47)
   - Resurfacing tab (toodle-48)

6. **Build Focus System** (Phase 5 structure, MVP roadmap)
   - Focus calculation (toodle-94)
   - Focus tab UI (toodle-50)
   - View presets (toodle-51)

### Next Phase (P1/P2 - MVP+)

7. **Bulk Operations & Undo**
   - Bulk operations (toodle-83)
   - Undo system (toodle-84)
   - Batch API endpoints (toodle-95)

8. **Import/Export**
   - JSON export/import (toodle-92)
   - CSV import (toodle-93)

### Future Phases (P2-P3)

9. **Phase 2 Features**
   - Notes advanced features (per-line actions, version history)
   - Project advanced features (left nav, drag-drop)
   - Analytics dashboard (toodle-87)
   - Knowledge archive search (toodle-86)
   - Natural-language parsing (toodle-88)
   - Recurrence system (toodle-96)

10. **Phase 3 Features**
    - Multi-client sync (toodle-70 epic)
    - PWA features (toodle-89)
    - Third-party integrations (toodle-90)

## Issue Statistics

### By Status
- **Open**: 50+ issues
- **In Progress**: 1 issue (toodle-79)
- **Closed**: 25 issues

### By Priority (Open Issues)
- **P1 (High - MVP)**: ~41 issues
- **P2 (Medium - Phase 2)**: ~11 issues
- **P3 (Low - Phase 3+)**: ~15 issues

### By Type (Open Issues)
- **Epic**: 10 issues (phase containers)
- **Feature**: ~18 issues
- **Task**: ~23 issues
- **Bug**: 0 open bugs

## Alignment with Requirements

The beads database now fully tracks all requirements from [docs/requirements.md](requirements.md):

✅ **Core Concepts**: Buckets, Importance v1, Heat v2, Touch/Snooze
✅ **MVP Functional Requirements**: Task CRUD, Sorting, Views, Filters, Presets, Recurrence, Keyboard Shortcuts, Safety
✅ **Notes System**: Per-line versioned notes with sticky-note UI
✅ **Data Model**: Tasks, Projects, Settings, Notes
✅ **Non-Functional**: Performance, Accessibility, Persistence
✅ **API Design**: RESTful endpoints, batch operations, caching
✅ **Visual Grouping**: Importance/Heat 12-level grouping
✅ **Real-Time Sync**: Supabase strategy for Phase 3

## Next Steps

1. Review this audit with stakeholders
2. Prioritize P1 issues for immediate sprint planning
3. Begin work on highest-value MVP features (Quick Add, Filters, Buckets)
4. Continue performance optimization work (complete toodle-79)
5. Plan Phase 2 features once MVP is complete

---

*Audit completed: 2025-10-21*
*Total new issues created: 19*
*Total priorities updated: 26*
*Coverage: 100% of requirements.md*
