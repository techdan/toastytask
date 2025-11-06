# Production Deployment Workflow - Heat System

**Status:** Ready for Deployment
**Epic:** [toodle-866c](toodle-866c) - Production deployment of Heat V2-V4 and optional V5 cleanup

## Overview

This document outlines the complete workflow for deploying the heat branch to production. The heat system includes database migrations and code changes that must be deployed in a specific order for safety.

## Key Principle: Migrations First, Code Second

✅ **Correct Order:**
1. Deploy database migrations (adds new columns)
2. Verify migrations succeeded
3. Merge and deploy application code (uses new columns)
4. Verify application works

❌ **Wrong Order:**
- Deploying code first will fail (code expects columns that don't exist yet)

## Why This Works

The V2-V4 migrations are **backwards compatible**:
- **Adds** new columns: `star_level`, `heat_adjustment`, etc.
- **Keeps** old columns: `star`, `heat_touch_count`, etc.
- Old production code continues working with old fields
- New code switches to using new fields

After V5 cleanup (optional, later):
- **Removes** old deprecated columns permanently
- Requires code to already be using new fields

## Deployment Phases

### Phase 0: Pre-Deployment Checklist

**Current State:**
- Production is running on `master` branch
- Database has Heat V1 schema (basic heat field only)
- `heat` branch has complete Heat V2-V4 implementation

**Prerequisites:**
- [ ] All heat branch code is tested and working locally
- [ ] Local migration testing completed successfully
- [ ] Staging environment tested (if available)
- [ ] Team notified of deployment window
- [ ] Database backup plan confirmed

### Phase 1: Database Migration (V2-V4)

**Timeline:** ~10-30 minutes
**Risk:** Low (non-destructive, backwards compatible)
**Rollback:** Not needed (old code still works)

#### Step 1.1: Test Migration Locally

```bash
# Task: toodle-866c.1

# Ensure you're on the heat branch
git checkout heat

# Run migration on local database
node lib/db/scripts/deploy-heat-production.js

# Verify migration
node lib/db/scripts/check-prod-schema.js

# Check database has new columns
psql $DATABASE_URL -c "SELECT column_name FROM information_schema.columns WHERE table_name = 'tasks' AND column_name IN ('star_level', 'heat_adjustment');"
# Should return 2 rows

# Test application still works
npm run dev
# Test task creation, heat/cool, star cycling
```

**Success Criteria:**
- Migration completes without errors
- All new columns exist
- All indexes created
- Application functions correctly
- Old columns still present (backwards compatibility)

#### Step 1.2: Create Production Database Backup

```bash
# Task: toodle-866c.2

# Set production database URL
export PROD_DATABASE_URL="your-production-database-url"

# Create timestamped backup
pg_dump "$PROD_DATABASE_URL" > backups/backup_pre_heat_v2_v4_$(date +%Y%m%d_%H%M%S).sql

# Verify backup file exists and has content
ls -lh backups/backup_pre_heat_v2_v4_*.sql

# Store backup securely (upload to S3, Google Drive, etc.)
```

**⚠️ CRITICAL:** Do not proceed without a verified backup!

#### Step 1.3: Deploy Migrations to Production

```bash
# Task: toodle-866c.3

# Double-check you have the backup
ls -lh backups/backup_pre_heat_v2_v4_*.sql

# Run production migration
export PROD_DATABASE_URL="your-production-database-url"
node lib/db/scripts/deploy-heat-production.js

# Monitor output for errors
# Expected: "✓ Deployment completed successfully!"
```

**What Happens:**
- Heat V2: Adds tracking columns, indexes, sort mode
- Heat V3: Adds `star_level` (0-3), `heat_adjustment` (±45)
- Heat V4: Normalizes scales (heat → 0-145, adjustment → ±45)
- Old columns remain for backwards compatibility

#### Step 1.4: Verify Migration in Production

```bash
# Task: toodle-866c.4 (partial)

# Run post-migration verification queries
psql "$PROD_DATABASE_URL" << 'EOF'

-- Check new columns exist
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'tasks'
AND column_name IN ('star_level', 'heat_adjustment', 'heat_calculated_at');

-- Check constraints
SELECT constraint_name
FROM information_schema.constraint_column_usage
WHERE table_name = 'tasks'
AND constraint_name IN ('tasks_star_level_check', 'tasks_heat_adjustment_check', 'tasks_heat_check');

-- Check indexes
SELECT indexname
FROM pg_indexes
WHERE tablename = 'tasks'
AND indexname LIKE 'tasks_%';

-- Sample data
SELECT id, title, star, star_level, heat, heat_adjustment
FROM tasks
WHERE deleted_at IS NULL
ORDER BY heat DESC
LIMIT 5;

EOF
```

**Success Criteria:**
- All new columns present
- All constraints present
- All indexes present
- Data migration successful (star → star_level, etc.)
- No errors in database logs

**🎯 Checkpoint:** Production database now has Heat V2-V4 schema, old code still running and working.

---

### Phase 2: Code Deployment

**Timeline:** ~5-10 minutes
**Risk:** Low-Medium (new code, but migrations already complete)
**Rollback:** Revert merge, redeploy previous code

#### Step 2.1: Merge Heat Branch to Master

```bash
# Ensure heat branch is up to date
git checkout heat
git pull origin heat

# Ensure master is up to date
git checkout master
git pull origin master

# Merge heat into master
git merge heat

# Resolve any conflicts (if present)
# Review changes
git log --oneline -10

# Run tests
npm test
npm run build

# Push to master
git push origin master
```

**⚠️ Important:** Do NOT push to production yet - just merge to master.

#### Step 2.2: Deploy Code to Production

```bash
# Build production bundle
npm run build

# Deploy to your hosting platform
# Examples:

# Vercel:
vercel --prod

# Netlify:
netlify deploy --prod

# Docker:
docker build -t toodle:latest .
docker push your-registry/toodle:latest
# Update production deployment

# Custom server:
rsync -avz --exclude node_modules . user@server:/path/to/app/
ssh user@server "cd /path/to/app && npm install && npm run build && pm2 restart toodle"
```

#### Step 2.3: Verify Application in Production

```bash
# Task: toodle-866c.4 (completion)

# Test critical endpoints
curl https://your-app.com/api/tasks
curl -X POST https://your-app.com/api/tasks/[id]/star
curl -X POST https://your-app.com/api/tasks/[id]/heat
curl -X POST https://your-app.com/api/tasks/[id]/cool

# Monitor production logs
# Vercel: vercel logs --prod
# Custom: tail -f /var/log/toodle/app.log

# Check for errors in UI
# Open https://your-app.com
# Test:
# - Task list loads
# - Star icon cycles through 4 states (none, blue, yellow, orange)
# - Heat/cool buttons work and move tasks up/down
# - Heat values show as 0-145 points
# - Importance colors display correctly
```

#### Step 2.4: Monitor for 24-48 Hours

**Monitor:**
- Error logs (server, database, client)
- Performance metrics (response times, query times)
- User reports (if applicable)
- Heat calculations (verify they're working)
- Star cycling (verify 4-state behavior)

**Look for:**
- ❌ Database errors related to columns
- ❌ Null pointer errors on heat fields
- ❌ Type errors (expecting new vs old fields)
- ❌ Query performance issues
- ✅ Heat values in 0-145 range
- ✅ Star levels 0-3 working correctly

**🎯 Checkpoint:** Production running with Heat V2-V4! New features working correctly.

---

### Phase 3: Stable Operation Period

**Timeline:** 2-4 weeks
**Task:** [toodle-866c.5](toodle-866c.5)

**Wait and Monitor:**
- Allow 2-4 weeks of stable operation
- Verify no rollback issues
- Verify heat calculations are correct
- Verify star system working as expected
- Verify no complaints about deprecated columns

**Success Criteria:**
- No errors in production logs related to heat system
- Heat/cool/star features working correctly
- No need to rollback to old schema
- Confidence in new system

**🎯 Checkpoint:** Heat system proven stable in production.

---

### Phase 4: V5 Cleanup (Optional)

**Timeline:** ~5-10 minutes
**Risk:** Medium-High (IRREVERSIBLE - permanently drops columns)
**Rollback:** Database restore only (loses any data since backup)

**⚠️ WARNING:** Only proceed if Phase 3 was completely successful!

#### Step 4.1: Test V5 Cleanup Locally

```bash
# Task: toodle-866c.6

# Test on local database copy
psql $DATABASE_URL < lib/db/migrations/heat-v5-cleanup.sql

# Verify columns removed
psql $DATABASE_URL -c "SELECT column_name FROM information_schema.columns WHERE table_name = 'tasks' AND column_name IN ('star', 'heat_touch_count', 'other_touch_count');"
# Should return 0 rows

# Test application still works
npm run dev
# Verify all features work without old columns
```

#### Step 4.2: Update Schema Files

```bash
# Task: toodle-866c.7

# Create archive folder
mkdir -p lib/scoring/archive

# Move legacy heat algorithm
git mv lib/scoring/heat-v2.ts lib/scoring/archive/heat-v2.ts

# Update schema.ts - remove deprecated columns
# Edit lib/db/schema.ts and remove:
# - star: boolean("star")
# - heatTouchCount: real("heat_touch_count")
# - otherTouchCount: integer("other_touch_count")
# - touchCount: integer("touch_count")
# - nextSurfaceAt: timestamp("next_surface_at")
# - coldStorageAt: timestamp("cold_storage_at")

# Remove deprecated indexes from schema.ts:
# - coldStorageIdx
# - resurfacingIdx
# - newTaskIdx

# Test build
npm run build

# Commit changes
git add -A
git commit -m "chore: remove deprecated Heat V2-V4 columns from schema

- Remove deprecated columns: star, heat_touch_count, other_touch_count, touch_count, next_surface_at, cold_storage_at
- Archive heat-v2.ts to lib/scoring/archive/
- Remove deprecated indexes
- Related: toodle-866c.7"

git push origin master
```

#### Step 4.3: Create Final Backup Before V5

```bash
# Task: toodle-866c.8

# This is the LAST backup with deprecated column data!
pg_dump "$PROD_DATABASE_URL" > backups/backup_pre_v5_cleanup_$(date +%Y%m%d_%H%M%S).sql

# Store backup securely for at least 30 days
```

#### Step 4.4: Deploy V5 Cleanup to Production

```bash
# Task: toodle-866c.9

# ⚠️ FINAL WARNING: This is IRREVERSIBLE!
# ⚠️ Ensure you have a backup!
# ⚠️ Ensure Phase 3 was successful!

# Run V5 cleanup
psql "$PROD_DATABASE_URL" < lib/db/migrations/heat-v5-cleanup.sql

# Verify cleanup
psql "$PROD_DATABASE_URL" -c "SELECT column_name FROM information_schema.columns WHERE table_name = 'tasks' AND column_name IN ('star', 'heat_touch_count', 'other_touch_count', 'touch_count', 'next_surface_at', 'cold_storage_at');"
# Should return 0 rows

# Deploy updated code (with cleaned schema.ts)
npm run build
# Deploy to production (same method as Phase 2)
```

#### Step 4.5: Monitor After V5 Cleanup

```bash
# Task: toodle-866c.10

# Monitor for 7 days
# Watch for:
# - Any errors about missing columns
# - Any queries referencing old fields
# - Application functionality issues

# If issues arise:
# - Restore from backup_pre_v5_cleanup backup
# - Investigate issue
# - Fix code
# - Retry V5 cleanup
```

**🎯 Checkpoint:** Schema cleaned up, deprecated columns removed!

---

## Rollback Procedures

### Rollback Phase 1 (Database Migrations)

**Not needed!** V2-V4 migrations are backwards compatible. Old code continues working.

If absolutely necessary:
```bash
# Restore from backup
psql "$PROD_DATABASE_URL" < backups/backup_pre_heat_v2_v4_TIMESTAMP.sql
```

### Rollback Phase 2 (Code Deployment)

```bash
# Revert merge on master
git checkout master
git revert -m 1 <merge-commit-hash>
git push origin master

# Redeploy previous code
npm run build
# Deploy to production
```

**Note:** Database still has V2-V4 columns, but old code doesn't use them.

### Rollback Phase 4 (V5 Cleanup)

```bash
# Restore from backup (ONLY option)
psql "$PROD_DATABASE_URL" < backups/backup_pre_v5_cleanup_TIMESTAMP.sql

# Revert schema changes
git revert <cleanup-commit-hash>
git push origin master

# Redeploy
npm run build
# Deploy to production
```

---

## Quick Reference Checklist

### Pre-Deployment
- [ ] Heat branch fully tested locally
- [ ] Local migration test successful
- [ ] Team notified
- [ ] Backup plan confirmed

### Phase 1: Migrations (V2-V4)
- [ ] Test migration locally (toodle-866c.1)
- [ ] Create production backup (toodle-866c.2)
- [ ] Deploy migrations to prod (toodle-866c.3)
- [ ] Verify migration success (toodle-866c.4)

### Phase 2: Code Deployment
- [ ] Merge heat → master
- [ ] Deploy code to production
- [ ] Verify application works
- [ ] Monitor for 24-48 hours

### Phase 3: Stable Operation
- [ ] Wait 2-4 weeks (toodle-866c.5)
- [ ] Monitor for issues
- [ ] Confirm stability

### Phase 4: V5 Cleanup (Optional)
- [ ] Test V5 locally (toodle-866c.6)
- [ ] Update schema files (toodle-866c.7)
- [ ] Create final backup (toodle-866c.8)
- [ ] Deploy V5 cleanup (toodle-866c.9)
- [ ] Monitor for 7 days (toodle-866c.10)

---

## References

- Epic: [toodle-866c](toodle-866c)
- Deployment Guide: [HEAT_PRODUCTION_DEPLOYMENT_GUIDE.md](lib/db/migrations/HEAT_PRODUCTION_DEPLOYMENT_GUIDE.md)
- V5 Cleanup Plan: [HEAT_V5_CLEANUP_PLAN.md](lib/db/migrations/HEAT_V5_CLEANUP_PLAN.md)
- V2-V4 Migration: [heat-production-migration.sql](lib/db/migrations/heat-production-migration.sql)
- V5 Cleanup: [heat-v5-cleanup.sql](lib/db/migrations/heat-v5-cleanup.sql)
- Current Algorithm: [docs/current-heat-algorithm.md](docs/current-heat-algorithm.md)
