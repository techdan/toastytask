# Heat/Cool Tech Debt Cleanup

The heat/cool flicker investigation introduced several temporary experiments
that can now be rolled back. Use this checklist to clean up the remaining
technical debt while keeping the working heat/cool flow intact.

## High Priority

1. **Remove the heat intent tracking system**
   - Files: `app/tasks/page.tsx`, `components/tasks/task-list.tsx`,
     `lib/queries/use-task-mutations.ts`
   - Context: The `latestHeatIntent` ref, render-time overrides, and mutation
     bookkeeping were only needed to survive Fast Refresh cache restores. The
     root cause is dev-only, so the intent map can be removed entirely.

2. **Strip verbose debug logging**
   - Files: `app/tasks/page.tsx`, `lib/queries/use-task-mutations.ts`,
     `app/api/tasks/[id]/heat/route.ts`, `app/api/tasks/[id]/cool/route.ts`
   - Clean out the console spam (`[PAGE] useTasksQuery`, `[HEAT onMutate] …`,
     etc.) once you no longer need the instrumentation.

3. **Tighten optimistic update helpers**
   - Files: `lib/queries/use-task-mutations.ts`
   - Now that we pick a single snapshot per mutation, we can simplify the code,
     remove redundant guards, and ensure only the active query is updated.

## Medium Priority

1. **Revisit multi-query caching strategy**
   - Files: `app/tasks/page.tsx`, `lib/queries/index.ts`
   - Consider collapsing to a single `["tasks", { includeCompleted: true }]`
     query with client-side filtering to reduce cache churn and simplify
     optimistic updates.

2. **Optimize repeated heat/importance calculations**
   - Files: `app/tasks/page.tsx`, `lib/scoring/*`
   - Every render recalculates importance/heat for every visible task.
     Investigate memoization or background precomputation if performance
     becomes an issue.

3. **Replace intent tracking with cache persistence (optional)**
   - If we still want to protect the UI during Fast Refresh, integrate React
     Query’s `persistQueryClient` instead of manual intent maps.

## Suggested Order of Operations

1. Remove intent tracking and logging (highest ROI, minimal risk).
2. Simplify the mutation helpers.
3. Evaluate broader architectural changes (single query, memoization) if
   needed.

Track any follow-up work in `bd` so we can close the original bug with confidence.
