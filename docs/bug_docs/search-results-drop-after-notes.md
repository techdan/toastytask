# Search results hide active tasks after inline edits
bead toodle-kjzw

## Summary
- Querying for `"squeeze"` shows both an active task (`id=14`) and a completed task (`id=98`).
- Touching the active task (e.g. Expanding the notes panel or selecting due date dropdown) causes it to disappear from both the search results page and the live dropdown suggestions.
- Refreshing the page restores the result, implying state corruption rather than data loss.

## Reproduction
1. Navigate to `/tasks` and type `squeeze` in the search bar.
2. Press Enter to enter `mode=search`; confirm both the active and completed tasks appear.
3. Expand the notes on the active task (task 14) via the notebook icon.
4. Observe the active task immediately disappears from the rendered results; reopening the dropdown shows only the completed task.
5. Refreshing the page brings the active task back.

## Investigation so far
- Added support for including completed tasks in search results while keeping the dropdown limited to active tasks (`committedSearchQuery`, `dropdownSearchResults`, `pageSearchResults`).
- Synced the search bar input with URL params and later added `committedSearchQuery` to preserve the canonical query when mutations temporarily clear `?q`.
- Despite these guards the issue reoccurs after some time, suggesting a server refetch or cache invalidation returns data that lacks the active task or drops the query string entirely, which resets local state after other UI interactions (e.g., notes save revalidation).

## Open questions / next steps
1. Trace network requests triggered when expanding/saving notes to confirm which responses arrive and whether they omit the searched task.
2. Inspect `useNotesQuery` / `useSaveNotes` side effects (especially `queryClient.invalidateQueries`) to see if they re-fetch tasks without query context and consequently clear the search filter.
3. Consider persisting `mode=search` and the query in router state that survives task refetches (e.g., add `keepSearchParams` when pushState is used or avoid clearing search params when tasks mutate).
4. Instrument search state (console logs or telemetry) to capture when `searchInputValue` and `committedSearchQuery` diverge, helping reproduce the eventual failure automatically.

## Resolution
- Inline interactions (e.g., clicking the notes icon, touching/heat/cool) call single-task endpoints that return Task rows without `notes`, `notesCount`, or `notesLastModified`.
- Our React Query cache used those partial responses to replace cached tasks, so search lost access to notes for just-touched tasks and hid them from note-only queries.
- Added a helper that preserves cached note metadata whenever a server response omits it, wired it into all mutation success handlers (including the page-level completion handlers), and added search logging to warn when a task advertises `notesCount` but has no `notes` payload loaded.
