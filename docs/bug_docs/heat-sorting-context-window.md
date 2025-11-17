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

_2025-11-16 update:_ Added client-side instrumentation (`[heat-debug]` logs in `app/tasks/page.tsx`) to capture target heat values, visible context IDs, and before/after task order snapshots whenever heat/cool mutations run. Check the browser console in production to trace future anomalies without redeploying.

_2025-11-17 update:_ Pulled a snapshot of production data into a staging database and pointed the dev environment at it. All heat/cool operations behaved correctly in dev (context-aware deltas of ±1 relative to neighbors, correct resorting), while production still exhibited the incorrect ±5 jumps and mis-ordering. This confirms the bug is not data-driven; something about the production environment (build, runtime config, downstream services, or caching) is behaving differently even on the same dataset.

### Current hypotheses / next steps

1. **Environment-specific code path:** Production (Vercel) may be serving an older lambda bundle or edge cache that never received the latest heat/cool API changes. Verify the deployed build ID, redeploy if necessary, and consider purging Vercel serverless cache.
2. **Caching layer or replica lag:** Production uses Supabase (Postgres). If reads go through a replica or cached API response, the context tasks could be stale, causing the server to calculate the full ±5 delta each time. Inspect connection strings (`DATABASE_URL`, `SUPABASE_DB_URL`) and confirm we’re hitting the primary. Consider logging `contextTasks` + heat values inside `app/api/tasks/[id]/heat` and `/cool` to compare dev vs prod behavior.
3. **Runtime config differences:** Environment variables or feature flags might alter behavior (e.g., a fallback to legacy heat logic). Compare `.env.local` with Vercel Env settings, especially anything referencing heat/cool.
4. **Client payload differences:** We now send ±20 IDs based on display order. Add temporary logging to `getNearbyTaskIds` to confirm the list is sorted and contains the neighbors right before the request (especially in production where the bug still appears).
5. **Manual refresh requirement:** We’ve confirmed that `taskOrder` is not responsible; manual Refresh simply forces the natural order. The real issue is incorrect heat deltas (73→63→68/81). Focus efforts on server-side calculations rather than client ordering.

### Relevant files
- `components/tasks/task-list.tsx` – Builds `visibleTaskIds` payload (currently ±20 window).
- `app/tasks/page.tsx` – Contains `[heat-debug]` logs and task order management.
- `app/api/tasks/[id]/heat/route.ts` and `app/api/tasks/[id]/cool/route.ts` – Server endpoints that calculate context-aware boosts/drops. Instrument here next.
- `lib/scoring/heat-v3.ts` – Core heat calculation logic (`calculateHeatBoost`, `calculateCoolDrop`).
- Vercel configuration (project settings + env vars) and Supabase connection strings – to confirm prod vs dev differences.
