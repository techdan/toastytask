# Heat/Cool Button Flicker (HMR) Investigation

**Status:** Resolved – dev-mode only (Fast Refresh)  
**Last updated:** 2025‑11‑14  
**Owner:** Heat/Cool task force

## Summary

The heat/cool buttons appeared to “jump” back to their previous value immediately after a click, then settle on the correct value once the server responded. After consolidating the previous debug write‑ups, we confirmed:

- Optimistic calculations on the client and definitive calculations on the server are identical (same context, same adjustments).
- The flicker only occurs while Turbopack Fast Refresh (HMR) is active. Production builds (`npm run build && npm start`) never show the issue.
- Fast Refresh restores the React Query cache that existed before the mutation, overwriting the optimistic result until the network response arrives. This produces the visible flicker even though the math is correct.

## Timeline & Key Investigation Steps

1. **Initial reports (Nov 5)** – “Heat value jumping issue” document captured client/server heat mismatches and highlighted multiple cached queries in React Query.
2. **Instrument everything (Nov 12–13)** – Added extensive console logs in `app/tasks/page.tsx` and `lib/queries/use-task-mutations.ts` to capture query keys, context tasks, and per‑step adjustments.
3. **Intent tracking experiment** – Added `latestHeatIntent` refs so renders could override stale cache values. This prevented incorrect calculations after HMR restored the cache but could not stop the visible flash.
4. **Snapshot-based optimistic updates** – Updated the mutations to derive their working set from a single authoritative query before patching the cache. This removed multi-query drift but the flicker persisted in dev mode.
5. **Production verification (Nov 14)** – Running `npm run build && npm start` proved the UI behaves correctly without HMR. Every log line in production shows a single “Using snapshot key …” block and no intent overrides.

## Findings

### Optimistic math matches the server
- Client logs show `boostHeatDelta` / `dropHeatDelta` values that match the server’s logs for the same request.
- Both sides recalculate importance and heat for the same visible task IDs, so there is no longer any discrepancy in the numeric results.

### HMR restores stale caches mid-mutation
- Each Fast Refresh cycle runs before the network response returns, causing React Query to repopulate caches with the pre-mutation values.
- The UI renders with those stale values until the mutation’s `onSuccess` handler runs, producing the temporary flash.
- Intent tracking masks the calculation error but cannot stop the DOM from repainting with the restored cache.

### Production (and dev without Fast Refresh) is clean
- Building and running the production server removes the flicker entirely.
- Disabling Fast Refresh locally (`NEXT_DISABLE_FAST_REFRESH=1 npm run dev` or the `npx cross-env …` variant) produces the same flicker-free behavior, confirming the issue is dev/HMR-only.

## Root Cause

Hot Module Replacement resets React Query’s caches between the optimistic update and the mutation response. Because the cache snapshot used for the optimistic update is thrown away, the UI briefly shows the old value. When the response arrives, the UI updates again, giving the user a “58 → 60 → 58” flash for cool or the inverse for heat.

## Resolution & Recommendations

1. **Acknowledge the scope:** The bug is dev-only. No production users are affected.
2. **Preferred local workaround:** Disable Fast Refresh when validating heat/cool behavior:
   - PowerShell: `$env:NEXT_DISABLE_FAST_REFRESH = "1"; npm run dev`
   - One-off: `npx cross-env NEXT_DISABLE_FAST_REFRESH=1 npm run dev`
   - Or run the production server: `npm run build && npm start`
3. **Optional long-term fix (not yet implemented):**
   - Persist the React Query cache across HMR reloads (React Query’s `persistQueryClient`, custom storage).
   - Replace the intent tracking hack with a simpler state reconciliation once HMR persistence is in place.

## Verification

- Logged heat/cool actions in production and dev-without-HMR: no flicker observed.
- Verified client/server logs show identical context and adjustments.
- Confirmed no additional `/api/tasks/[id]/touch` requests occur when clicking the heat/cool buttons.

## Follow-up Work

Technical debt accumulated during this investigation—intent tracking refs, verbose logging, and other experimental code—should be cleaned up separately. See `docs/clean-heat-cool-tech-debt.md` for the actionable list.
