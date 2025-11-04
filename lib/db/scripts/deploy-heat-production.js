/**
 * Deploy Heat Model to Production
 *
 * This script applies the consolidated heat-production-migration.sql to the
 * target database. It brings production from Heat V1 to V4 in a single migration.
 *
 * Changes:
 * - Heat V2: Add heat tracking columns, indexes, and sort mode
 * - Heat V3: Add star levels (0-3) and direct heat adjustment
 * - Heat V4: Normalize heat scale from 0-1 to 0-145 points
 *
 * Usage:
 *   # Deploy to production (Supabase)
 *   PROD_DATABASE_URL="your-prod-url" node lib/db/scripts/deploy-heat-production.js
 *
 *   # Test against local database
 *   node lib/db/scripts/deploy-heat-production.js
 *
 * Safe to run multiple times (idempotent).
 * Automatically detects if migrations already applied.
 */

const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

// Use PROD_DATABASE_URL for production, or DATABASE_URL for testing
const connectionString = process.env.PROD_DATABASE_URL || process.env.DATABASE_URL || 'postgresql://USER:PASSWORD@localhost:5432/toodle';

async function deployHeatProduction() {
  const client = new Client({ connectionString });

  try {
    console.log('='.repeat(70));
    console.log('Heat Model Production Deployment');
    console.log('='.repeat(70));
    console.log('\nTarget database:', connectionString.split('@')[1] || 'localhost');
    console.log('\nConnecting to PostgreSQL...');

    await client.connect();
    console.log('✓ Connected to PostgreSQL\n');

    // Pre-migration check: Get current state
    console.log('Checking current database state...');
    const preCheck = await client.query(`
      SELECT
        EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'tasks' AND column_name = 'heat_calculated_at') as has_v2,
        EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'tasks' AND column_name = 'star_level') as has_v3,
        MAX(heat) as max_heat,
        COUNT(*) as task_count
      FROM tasks
      WHERE deleted_at IS NULL AND heat IS NOT NULL
    `);

    const preState = preCheck.rows[0];
    console.log(`  Total tasks: ${preState.task_count}`);
    console.log(`  Heat V2 applied: ${preState.has_v2 ? 'Yes' : 'No'}`);
    console.log(`  Heat V3 applied: ${preState.has_v3 ? 'Yes' : 'No'}`);
    console.log(`  Heat V4 applied: ${preState.max_heat > 1.0 ? 'Yes' : 'No'} (max heat: ${preState.max_heat})`);

    if (preState.has_v2 && preState.has_v3 && preState.max_heat > 1.0) {
      console.log('\n✓ All migrations already applied!');
      console.log('  Migration script is idempotent and will verify state.\n');
    } else {
      console.log('\n⚠ Database needs migration.');
      console.log('  Proceeding with consolidated heat migration...\n');
    }

    // Read the migration file
    const migrationPath = path.join(__dirname, '..', 'migrations', 'heat-production-migration.sql');
    console.log(`Reading migration file: ${migrationPath}`);

    if (!fs.existsSync(migrationPath)) {
      throw new Error(`Migration file not found: ${migrationPath}`);
    }

    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
    console.log('✓ Migration file loaded\n');

    // Apply the migration
    console.log('Applying migration...\n');
    console.log('-'.repeat(70));

    await client.query(migrationSQL);

    console.log('-'.repeat(70));
    console.log('\n✓ Migration applied successfully!\n');

    // Post-migration verification
    console.log('Verifying migration results...');
    const postCheck = await client.query(`
      SELECT
        column_name,
        data_type
      FROM information_schema.columns
      WHERE table_name = 'tasks'
        AND column_name IN (
          'heat_calculated_at', 'heat_touch_count', 'other_touch_count',
          'last_heat_touched_at', 'cold_storage_at',
          'star_level', 'heat_adjustment'
        )
      ORDER BY column_name
    `);

    console.log('✓ Heat columns present:');
    postCheck.rows.forEach(row => {
      console.log(`  - ${row.column_name} (${row.data_type})`);
    });

    // Check constraints
    const constraints = await client.query(`
      SELECT constraint_name
      FROM information_schema.constraint_column_usage
      WHERE table_name = 'tasks'
        AND constraint_name IN (
          'tasks_star_level_check',
          'tasks_heat_adjustment_check',
          'tasks_heat_check'
        )
      ORDER BY constraint_name
    `);

    console.log('\n✓ Constraints present:');
    constraints.rows.forEach(row => {
      console.log(`  - ${row.constraint_name}`);
    });

    // Check indexes
    const indexes = await client.query(`
      SELECT indexname
      FROM pg_indexes
      WHERE tablename = 'tasks'
        AND indexname IN (
          'tasks_heat_sort_idx',
          'tasks_cold_storage_idx',
          'tasks_resurfacing_idx',
          'tasks_new_task_idx'
        )
      ORDER BY indexname
    `);

    console.log('\n✓ Indexes present:');
    indexes.rows.forEach(row => {
      console.log(`  - ${row.indexname}`);
    });

    // Show sample of migrated data
    console.log('\nSample of migrated data (top 5 by heat):');
    const samples = await client.query(`
      SELECT
        id,
        LEFT(title, 40) as title,
        ROUND(heat::numeric, 1) as heat,
        importance_v1,
        star_level,
        ROUND(heat_adjustment::numeric, 1) as heat_adjustment
      FROM tasks
      WHERE deleted_at IS NULL AND heat IS NOT NULL
      ORDER BY heat DESC
      LIMIT 5
    `);

    if (samples.rows.length > 0) {
      samples.rows.forEach(row => {
        console.log(`  ${row.id}: "${row.title}"`);
        console.log(`    Heat: ${row.heat} pts | Importance: ${row.importance_v1} | Star: ${row.star_level} | Adj: ${row.heat_adjustment}`);
      });
    } else {
      console.log('  No tasks with heat values');
    }

    // Show distribution
    console.log('\nHeat distribution:');
    const distribution = await client.query(`
      SELECT
        CASE
          WHEN heat >= 102 THEN 'Red (Hot: 102-145)'
          WHEN heat >= 73 THEN 'Orange (Warm: 73-102)'
          WHEN heat >= 44 THEN 'Yellow (Cooling: 44-73)'
          WHEN heat >= 22 THEN 'Blue (Cool: 22-44)'
          WHEN heat >= 7 THEN 'Cyan (Cold: 7-22)'
          ELSE 'Gray (Freezing: 0-7)'
        END as band,
        COUNT(*) as count
      FROM tasks
      WHERE deleted_at IS NULL AND heat IS NOT NULL
      GROUP BY band
      ORDER BY MIN(heat) DESC
    `);

    distribution.rows.forEach(row => {
      console.log(`  ${row.band}: ${row.count} tasks`);
    });

    await client.end();

    console.log('\n' + '='.repeat(70));
    console.log('✓ Deployment completed successfully!');
    console.log('='.repeat(70));
    console.log('\nKey changes:');
    console.log('✓ Heat V2: Data model, indexes, sort mode');
    console.log('✓ Heat V3: Star levels (0-3), direct adjustment tracking');
    console.log('✓ Heat V4: Point-based scale (0-145 heat, ±45 adjustment)');
    console.log('\nNext steps:');
    console.log('1. Deploy updated application code to production');
    console.log('2. Verify UI displays heat as 0-145 points');
    console.log('3. Test heat/cool/star interactions');
    console.log('4. Monitor heat calculations and color bands');
    console.log('='.repeat(70) + '\n');

    process.exit(0);
  } catch (error) {
    console.error('\n✗ Deployment failed:', error.message);
    console.error('\nFull error:', error);

    try {
      await client.end();
    } catch (e) {
      // Ignore cleanup errors
    }

    process.exit(1);
  }
}

// Run the deployment
deployHeatProduction();
