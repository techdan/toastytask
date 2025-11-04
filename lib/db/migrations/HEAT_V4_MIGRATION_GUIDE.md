# Heat V4 Migration Guide (PostgreSQL)

This guide covers the database steps required to bring production data in line with the Heat V4 point-based model (0–145 heat, ±45 manual adjustment). Run these scripts before deploying the latest application build.

## Prerequisites

- `DATABASE_URL` exported for the target PostgreSQL database.
- Heat V2/V3 migrations already applied (columns such as `star_level`, `heat_adjustment`, `heat_calculated_at` exist).
- Ability to run `psql` with privileges to update data and modify constraints.

## Step 1 – Backup

```bash
pg_dump "$DATABASE_URL" > backup_pre_heat_v4_$(date +%Y%m%d_%H%M%S).sql
```

## Step 2 – Normalize Stored Heat (0–145)

```bash
psql "$DATABASE_URL" -f lib/db/migrations/heat-v4-normalization.sql
```

- Idempotent: skips if `MAX(heat) > 1` (already points).
- Converts existing `heat` values by multiplying by 145.
- Logs pre/post statistics.

## Step 3 – Scale Heat Adjustment & Enforce Constraints

```bash
psql "$DATABASE_URL" -f lib/db/migrations/heat-v4-adjustment-points.sql
```

- Scales `heat_adjustment` from ±0.45 to ±45 (if needed).
- Adds/refreshes `CHECK (heat_adjustment BETWEEN -45 AND 45)`.
- Adds/refreshes `CHECK (heat BETWEEN 0 AND 145)`.
- Updates column comments to reference points.

## Step 4 – Deploy Application Code

Deploy the release that contains Heat V4 logic:
- Endpoints `/api/tasks/[id]/heat` and `/cool` expect point-based values.
- `GET /api/tasks` recalculates and persists heat server-side.
- Client optimistic updates mirror these rules.

## Step 5 – Verification Queries

```sql
-- Heat range
SELECT MIN(heat) AS min_heat, MAX(heat) AS max_heat
FROM tasks WHERE deleted_at IS NULL;

-- Adjustment range
SELECT MIN(heat_adjustment) AS min_adj, MAX(heat_adjustment) AS max_adj
FROM tasks WHERE deleted_at IS NULL;

-- Constraint validation (should return zero rows)
SELECT id FROM tasks WHERE deleted_at IS NULL AND (heat < 0 OR heat > 145);
SELECT id FROM tasks WHERE deleted_at IS NULL AND (heat_adjustment < -45 OR heat_adjustment > 45);
```

## Step 6 – API Smoke Tests

```bash
curl -X POST https://<host>/api/tasks/<taskId>/heat
curl -X POST https://<host>/api/tasks/<taskId>/cool
```

Verify the responses show ±5 / ±10 point deltas and the UI reflects the same positions.

## Rollback Plan

If the migration must be undone, restore the backup created in Step 1:

```bash
psql "$DATABASE_URL" < backup_pre_heat_v4_YYYYMMDD_HHMMSS.sql
```

Partial rollbacks are not recommended; restoring the snapshot ensures schema and data consistency.

## Reference

- `lib/db/migrations/heat-v4-normalization.sql`
- `lib/db/migrations/heat-v4-adjustment-points.sql`
- Runtime logic: `lib/scoring/heat-v3.ts`, `app/api/tasks/[id]/heat|cool/route.ts`
- Algorithm spec: `docs/heat-algorithm-v3.md`
