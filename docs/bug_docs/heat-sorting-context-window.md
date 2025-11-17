## Heat sorting context mismatch

**Date:** 2025-11-17  
**Issue:** toodle-t3r9  
**Status:** Fixed

### Summary
Heat/cool clicks in production occasionally placed a task above/below the wrong neighbors even though the badges still showed the correct heat values. The server endpoints rely on the `visibleTaskIds` array to determine the nearby context when calculating the target heat, but the client had been sending the 21 tasks whose `_freshHeat` (or `_freshImportance`) was numerically closest to the clicked row. When local ordering drifted—e.g., due to manual adjustments or stale `taskOrder` entries—the visually adjacent rows could have very different scores and fall outside that numeric window. As a result, the API never considered them, so tasks jumped relative to a different set of neighbors than the user expected.

### Resolution
`components/tasks/task-list.tsx` now builds the context list from the actual rendered order instead of score proximity. We take the active (non-completed) rows in their on-screen sequence, locate the clicked task, and send a ±20 sliding window of IDs (clamped to bounds, falling back to the entire active list if the row cannot be found). This guarantees that every heat/cool mutation includes the rows the user just saw above and below the target, eliminating the mismatch while still keeping the payload bounded.

### Testing / Verification
* Manually inspect large lists in both Heat and Importance sort modes.
* Trigger heat/cool actions near the top, middle, and bottom of the list and confirm that the row repositions relative to its visible neighbors with no unexpected jumps.
* Observe network requests to ensure the payload contains the contiguous IDs and that the window shrinks automatically when fewer than 40 tasks are active.

### Follow-ups
If we ever see this behavior again, consider:
1. Increasing the window size or sending all active IDs for small accounts.
2. Adding telemetry on the server to log when a clicked row’s immediate neighbors were missing from the payload.
3. Re-evaluating `taskOrder` stability to ensure local ordering doesn’t drift excessively between refreshes.
