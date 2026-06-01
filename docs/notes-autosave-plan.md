# Notes Autosave Plan

## Goal

Persist notes as the user types instead of waiting for the notes field to blur. A typed character should be captured immediately, reflected in the local UI/cache immediately, and retried until the server acknowledges the latest note text.

## Persistence Model

- Update textarea state on every keystroke.
- Update the notes React Query cache on every keystroke so the rest of the task UI sees the current draft immediately.
- Store the latest draft in `localStorage` by task id on every unsaved change.
- Save to the existing `POST /api/tasks/[id]/notes` endpoint with a debounce instead of sending one request per keypress.
- Keep the local draft until the server acknowledges the exact current text.
- Restore any newer local draft on the next mount and retry the server save.

## Flush Strategy

- Debounced save after a short idle window.
- Periodic flush while text remains unsaved.
- Immediate flush on blur, note panel collapse/unmount, task detail close/unmount, `visibilitychange`, and `pagehide`.
- Use a `keepalive` request during page hide as a last-chance server write. The local draft remains until a normal acknowledged save clears it.

## Save State

Use an explicit notes save state:

- `saved`: server has acknowledged the current text.
- `unsaved`: local text differs from the latest acknowledged server text.
- `saving`: a save request is in flight.
- `retrying`: a save failed and another retry is scheduled.
- `error`: save failed and no retry is currently scheduled.

The important operational state is `unsaved`, because optimistic React Query data is not proof that the server has persisted the text.

## Performance Notes

- Normal typing should only update local state, React Query cache, and localStorage.
- Server saves are coalesced by debounce and a periodic backstop.
- Only one save request should be in flight for a task. If text changes while a request is running, queue one follow-up save with the latest text.
- Stale server responses must not overwrite newer local text.
- The existing notes endpoint should remain unchanged so line diffing, note versioning, task touch, and heat recalculation stay centralized.

## Verification

- Inline task notes update and show the latest text after typing and blurring.
- Task detail notes update and save without needing blur.
- Continuous typing eventually saves through the periodic flush.
- Closing/collapsing/unmounting triggers a flush.
- Failed saves leave a local draft and retry later.
- `npm run lint` passes.
