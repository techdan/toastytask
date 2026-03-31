# Cross-Platform Performance Refactor Plan

**Status:** Drafted from March 30, 2026 audit
**Scope:** Web performance, responsive web UX, and shared architecture support for React Native clients
**Primary route in scope:** [`/tasks`](../app/tasks/page.tsx)

---

## Overview

Toasty Task currently works, but the main task experience is carrying too much client-side work for a screen that needs to feel instant. The same architectural choices that make the web app feel laggy also make it harder to support React Native clients cleanly.

This document turns the audit into a concrete refactor plan. It covers:

- current findings
- proposed fixes
- target architecture for web and RN
- phased implementation plan
- success criteria and rollout guidance

The central recommendation is:

**Move to a shared domain/API model with lean list endpoints, focused detail endpoints, and platform-specific presentation layers.**

Do not try to share the current page-level UI logic between web and RN.

---

## Goals

- Make common task interactions feel instant on web.
- Keep responsive web behavior strong across desktop, tablet, and mobile browsers.
- Support RN clients through stable shared contracts instead of web-specific data flows.
- Reduce payload size, hydration work, avoidable re-renders, and unnecessary refetches.
- Keep task ordering and scoring consistent across clients.

## Non-Goals

- Rewriting the entire product in one pass.
- Sharing web UI components with RN.
- Replacing React Query.
- Solving every styling or UX issue unrelated to interaction speed.

---

## Summary of Findings

### 1. The main `/tasks` route is too large and too client-heavy

The current page is a single large client component that owns filtering, sorting, search, mutation coordination, responsive behavior, modal state, and task list orchestration.

Relevant files:

- [`app/tasks/page.tsx`](../app/tasks/page.tsx)
- [`components/tasks/task-list.tsx`](../components/tasks/task-list.tsx)
- [`components/tasks/task-row.tsx`](../components/tasks/task-row.tsx)

Why this matters:

- large hydration surface on web
- too much render work on view changes
- difficult to reuse behavior cleanly for RN
- hard to reason about cache and mutation boundaries

### 2. `/api/tasks` is doing expensive read and write work in the same request

The task list route currently:

- loads the full task set
- recalculates heat for every task
- writes updated heat back during GET
- loads notes for all returned tasks
- attaches full note content to the list payload

Relevant file:

- [`app/api/tasks/route.ts`](../app/api/tasks/route.ts)

Why this matters:

- slow list fetches
- expensive refetches after mutations
- poor fit for RN/mobile networks
- GET endpoints should not do per-item writes as part of normal reading

### 3. The list payload is too large

The main task query returns full note bodies for the list screen, then the client seeds per-task notes caches from that payload.

Relevant files:

- [`app/api/tasks/route.ts`](../app/api/tasks/route.ts)
- [`lib/queries/use-tasks-query.ts`](../lib/queries/use-tasks-query.ts)

Why this matters:

- larger JSON responses
- more memory retained in the browser
- unnecessary parsing on every list fetch
- wasteful for RN clients that only need list summaries

### 4. Row-level click behavior likely triggers avoidable task touch mutations

The row is clickable and marks the task as touched. Several inline controls sit inside that row. At least some of those controls do not clearly stop propagation before the row click handler runs.

Relevant files:

- [`components/tasks/task-row.tsx`](../components/tasks/task-row.tsx)
- [`components/tasks/due-date-display.tsx`](../components/tasks/due-date-display.tsx)
- [`components/tasks/priority-select.tsx`](../components/tasks/priority-select.tsx)
- [`components/tasks/project-select.tsx`](../components/tasks/project-select.tsx)
- [`components/tasks/recurrence-select.tsx`](../components/tasks/recurrence-select.tsx)
- [`lib/queries/use-task-mutations.ts`](../lib/queries/use-task-mutations.ts)

Why this matters:

- opening a dropdown can trigger a mutation
- extra network work and cache churn on a non-mutating interaction
- users experience this as click lag

### 5. Task detail fetches far more data than it needs

The task detail screen currently fetches the full task list, then finds a single task from that result.

Relevant file:

- [`components/tasks/task-detail-screen.tsx`](../components/tasks/task-detail-screen.tsx)

Why this matters:

- opening a detail view is much heavier than necessary
- the same anti-pattern would be especially costly in RN

### 6. Mutation invalidation is broader than it needs to be

Many mutations patch local state optimistically, but several actions still invalidate the full tasks query instead of updating the specific cached entities that changed.

Relevant files:

- [`lib/queries/use-task-mutations.ts`](../lib/queries/use-task-mutations.ts)
- [`components/providers/query-provider.tsx`](../components/providers/query-provider.tsx)

Why this matters:

- avoidable full-list refetches
- UI jank after simple actions
- more battery/network cost on mobile clients

### 7. Large lists are fully rendered with many interactive controls

Every visible task row mounts several interactive client controls, and there is no virtualization or equivalent rendering strategy for large lists.

Relevant files:

- [`components/tasks/task-list.tsx`](../components/tasks/task-list.tsx)
- [`components/tasks/task-row.tsx`](../components/tasks/task-row.tsx)

Why this matters:

- high input latency for large task sets
- expensive hydration and re-render costs

### 8. The architecture is web-first in the wrong places

Today the code is optimized around a Next.js page component rather than a shared contract and shared domain model. That makes it harder to support:

- responsive web
- full desktop web
- mobile web
- RN clients

The shared unit should be the domain and API contract, not the page.

### 9. Build stability is already showing stress

A local production build hit Turbopack worker memory limits before sandbox font fetch errors blocked a final build. That is not a direct proof of bundle size, but it is still a useful signal that the current route graph deserves decomposition and measurement.

---

## Cross-Platform Implications

Supporting RN changes the implementation priorities:

- web-specific event bugs still matter
- payload shape becomes much more important
- detail vs list query separation becomes mandatory
- search should not depend on scanning the full list client-side
- mutation contracts must be stable across clients

The correct split is:

- shared domain logic and server contracts
- platform-specific presentation and interaction models

### What should be shared

- task DTOs
- notes DTOs
- mutation request and response shapes
- sorting and filtering semantics
- scoring rules, if both clients can consume the same TS package
- query key conventions and cache semantics

### What should remain platform-specific

- responsive table layout
- hover states
- row click behavior
- modal and route presentation
- gesture handling
- keyboard interactions
- RN navigation and native list rendering

---

## Target Architecture

```text
Shared Domain / Contracts
    |
    |- task DTOs
    |- scoring rules
    |- notes metadata contracts
    |- mutation semantics
    |
Server API Layer
    |
    |- task list summary endpoint
    |- task detail endpoint
    |- notes endpoint
    |- search endpoint
    |- task mutation endpoints
    |
Platform Clients
    |
    |- Next.js web shell + client islands
    |- RN screens + native list rendering
```

### Key design rules

1. List endpoints return summaries, not full note bodies.
2. Detail endpoints return one task plus the extra data needed for editing.
3. Search is a first-class server contract, not an in-memory client-only feature.
4. GET endpoints do not perform persistence writes.
5. Clients may use optimistic updates, but the server remains authoritative.
6. Web and RN consume the same data contracts even if their UIs differ completely.

---

## Proposed Data Contracts

These do not have to be implemented exactly as shown, but the separation should be preserved.

### Task list summary DTO

```ts
type TaskListItem = {
  id: number
  title: string
  projectId: number | null
  priority: "low" | "medium" | "high" | "top"
  dueAt: string | null
  repeatType: string | null
  repeatRule: string | null
  completedAt: string | null
  isFocused: boolean
  focusSnoozeUntil: string | null
  starLevel: number
  notesCount: number
  notesLastModified: string | null
  displayImportance: number
  displayHeat: number
  createdAt: string
  updatedAt: string
}
```

### Task detail DTO

```ts
type TaskDetail = TaskListItem & {
  notes: NoteRow[]
  heatAdjustment: number
  lastTouchedAt: string | null
  lastHeatTouchedAt: string | null
  touchCount: number
}
```

### Search result DTO

```ts
type TaskSearchResult = {
  taskId: number
  type: "task" | "note"
  title: string
  snippet: string
  projectId: number | null
  completedAt: string | null
}
```

### Recommendation on scoring ownership

Short term:

- server returns `displayHeat` and `displayImportance`
- web keeps limited optimistic logic where necessary

Medium term:

- extract scoring code into a shared package if web and RN can both consume it
- if that is not realistic, keep the server authoritative and keep client optimism minimal

---

## Proposed Fixes

### A. Immediate fixes

### A1. Remove accidental mutations from inline control clicks

Actions:

- stop row click propagation from all inline controls
- consider removing row-level touch mutation entirely from basic UI clicks
- if touch tracking is still needed, move it to explicit user actions only

Expected impact:

- immediate improvement for dropdown and popover responsiveness
- fewer network calls on non-mutating interactions

### A2. Make `/api/tasks` read-only and slim

Actions:

- remove `updateHeat` writes from GET
- stop attaching full notes to list responses
- return notes metadata only
- move full notes loading to task detail or explicit notes endpoints

Expected impact:

- smaller payloads
- faster task list fetches
- safer and cleaner server behavior

### A3. Add a dedicated task detail query

Actions:

- add a task detail endpoint and query hook
- update detail screen to fetch one task only

Expected impact:

- detail opens faster
- simpler RN reuse

### B. Structural fixes

### B1. Introduce shared task contracts

Actions:

- create a shared contract module for task list, detail, notes, and search DTOs
- use the same serializers for web and RN consumers

Expected impact:

- cleaner cross-platform evolution
- lower risk of contract drift

### B2. Split page orchestration from presentation

Actions:

- reduce [`app/tasks/page.tsx`](../app/tasks/page.tsx) to route orchestration and layout
- extract search state, selection state, and mutation coordination into smaller modules
- keep the server shell server-rendered where possible
- isolate client islands for only the interactive parts that need them

Expected impact:

- smaller hydration surface
- easier performance profiling

### B3. Reduce broad invalidation

Actions:

- patch specific entities in cache where possible
- reserve full task-list invalidation for cases that truly require it
- disable devtools in production builds

Expected impact:

- lower interaction latency
- fewer full-screen refresh effects

### C. Scale fixes

### C1. Add large-list rendering strategy

Actions:

- add list virtualization for large datasets, or use `content-visibility` as an interim step
- avoid mounting heavy row controls until needed

Expected impact:

- lower INP for large lists
- better RN parity when thinking in terms of lightweight list rows

### C2. Move search to a server contract

Actions:

- add a search endpoint that can search titles and notes
- keep client-side search only as a small local refinement layer if needed

Expected impact:

- better responsiveness for large task sets
- consistent behavior across web and RN

---

## Implementation Plan

## Phase 0: Instrumentation and Baseline

Goal: measure before refactoring.

Tasks:

- add a lightweight web vitals reporter for INP, LCP, and CLS
- log task list payload size in development
- measure list request duration and detail request duration
- capture list size buckets: 25, 100, 250, 500 active tasks
- measure mutation-to-settle timing for complete, focus, snooze, and notes save

Suggested files:

- `app/layout.tsx`
- new `components/perf/web-vitals.tsx`
- `lib/queries/use-tasks-query.ts`

## Phase 1: Fast Interaction Fixes

Goal: remove the worst interaction lag without changing the whole app.

Tasks:

- stop propagation from all inline task row controls
- verify opening due date, priority, project, and recurrence controls causes no touch mutation
- gate React Query devtools to development only
- review default `refetchOnWindowFocus` behavior and narrow it where appropriate

Suggested files:

- [`components/tasks/task-row.tsx`](../components/tasks/task-row.tsx)
- [`components/tasks/due-date-display.tsx`](../components/tasks/due-date-display.tsx)
- [`components/tasks/priority-select.tsx`](../components/tasks/priority-select.tsx)
- [`components/tasks/project-select.tsx`](../components/tasks/project-select.tsx)
- [`components/tasks/recurrence-select.tsx`](../components/tasks/recurrence-select.tsx)
- [`components/providers/query-provider.tsx`](../components/providers/query-provider.tsx)

## Phase 2: Contract and Payload Refactor

Goal: make the data model RN-ready and reduce list cost.

Tasks:

- create shared task DTO types
- split task list summary from task detail
- remove full notes from the list endpoint
- ensure `/api/tasks` performs no writes
- add notes metadata fields only
- add a task detail endpoint and hook

Suggested files:

- new `lib/contracts/tasks.ts`
- new `lib/server/tasks/serializers.ts`
- [`app/api/tasks/route.ts`](../app/api/tasks/route.ts)
- `app/api/tasks/[id]/route.ts`
- `app/api/tasks/[id]/notes/route.ts`
- [`lib/queries/use-tasks-query.ts`](../lib/queries/use-tasks-query.ts)
- new `lib/queries/use-task-detail-query.ts`
- [`components/tasks/task-detail-screen.tsx`](../components/tasks/task-detail-screen.tsx)

## Phase 3: Search and Query Model

Goal: stop depending on the full list for search and detail experiences.

Tasks:

- add server-backed task search endpoint
- move search dropdown and search page to consume the search contract
- ensure search results include enough metadata for web and RN navigation

Suggested files:

- new `app/api/tasks/search/route.ts`
- [`lib/search/search-utils.ts`](../lib/search/search-utils.ts)
- [`components/search/search-dropdown.tsx`](../components/search/search-dropdown.tsx)
- [`app/tasks/page.tsx`](../app/tasks/page.tsx)

## Phase 4: Web Route Decomposition

Goal: reduce hydration cost and isolate client work.

Tasks:

- break the task route into a server shell plus smaller client islands
- isolate the main task list controller from responsive layout concerns
- dynamically load expensive mobile-only or rarely used UI where appropriate
- move modal/detail route handling to smaller focused modules

Suggested files:

- [`app/tasks/page.tsx`](../app/tasks/page.tsx)
- new `components/tasks/task-page-shell.tsx`
- new `components/tasks/task-page-client.tsx`
- [`components/navigation/mobile-header.tsx`](../components/navigation/mobile-header.tsx)
- [`components/navigation/mobile-nav-drawer.tsx`](../components/navigation/mobile-nav-drawer.tsx)
- [`components/search/search-modal.tsx`](../components/search/search-modal.tsx)

## Phase 5: Mutation and Cache Cleanup

Goal: reduce unnecessary refetching and make optimistic behavior more predictable.

Tasks:

- patch cache locally for focus and snooze instead of invalidating the whole tasks query
- review complete/uncomplete and notes save for list-wide invalidation opportunities
- normalize task patch helpers where useful

Suggested files:

- [`lib/queries/use-task-mutations.ts`](../lib/queries/use-task-mutations.ts)
- [`lib/queries/use-notes-mutations.ts`](../lib/queries/use-notes-mutations.ts)
- [`lib/queries/task-cache-helpers.ts`](../lib/queries/task-cache-helpers.ts)

## Phase 6: Large-List Optimization

Goal: keep interaction cost flat as task counts grow.

Tasks:

- add virtualization or equivalent list windowing
- defer heavy row controls until interaction
- consider lightweight row mode for large datasets

Suggested files:

- [`components/tasks/task-list.tsx`](../components/tasks/task-list.tsx)
- [`components/tasks/task-row.tsx`](../components/tasks/task-row.tsx)
- [`components/tasks/mobile-task-table.tsx`](../components/tasks/mobile-task-table.tsx)

## Phase 7: RN Integration Layer

Goal: make the backend and contracts genuinely reusable by RN.

Tasks:

- add a small shared API client or contract package
- document endpoint behavior for RN consumers
- align web and RN query semantics around list, detail, notes, search, and mutations

Suggested files:

- new `lib/contracts/tasks.ts`
- new `lib/contracts/notes.ts`
- new `docs/mobile/mobile-api-reference.md` updates

---

## Recommended Execution Order

If we want the highest value with the least churn, do the work in this order:

1. fix row-control click propagation
2. remove writes and full notes from `/api/tasks`
3. add task detail endpoint and query
4. add search endpoint
5. reduce query invalidation breadth
6. decompose the web task route
7. add virtualization for large lists

---

## Success Criteria

### Interaction

- opening due date, priority, project, and recurrence controls performs no task touch mutation
- project/view switching feels immediate for common task counts
- detail view opens without requiring the full task list query

### Data

- list endpoint does not return full notes
- GET task routes do not perform persistence writes
- search uses a dedicated contract

### Cross-platform

- web and RN can consume the same task summary and task detail contracts
- no web-only assumptions are embedded in shared DTOs
- scoring and ordering semantics remain consistent across clients

### Performance

- p75 INP on task interactions trends below 200ms, with a stretch goal under 100ms
- list payload size drops materially after note removal
- full-list invalidations are reduced for common task mutations

---

## Risks and Tradeoffs

### Shared scoring logic

If scoring remains duplicated in clients, contract drift is a long-term risk.

Mitigation:

- prefer server-authoritative score fields
- extract a shared scoring package only if operationally realistic

### Virtualization complexity

Virtualization improves scale, but can complicate row measurement, drag behavior, and keyboard navigation.

Mitigation:

- do it after payload and mutation fixes
- use thresholds so it only activates when list size justifies it

### Search migration

Moving search server-side changes ranking and result timing.

Mitigation:

- keep result ordering explicit
- document ranking rules
- test web and RN consumers together

---

## Notes for Implementation

- Keep web and RN aligned on contracts, not presentation.
- Prefer serializer modules over ad hoc JSON shaping inside route handlers.
- Prefer entity-level cache updates over whole-list invalidation.
- Do not let responsive web requirements dictate RN data flow.
- Do not let RN requirements force web to give up responsive, server-assisted rendering where it helps.

---

## Reference Inputs

This plan is based on:

- local code inspection of the current Next.js task architecture
- March 30, 2026 audit findings
- Vercel guidance for Next.js App Router performance, caching, and client boundary reduction
