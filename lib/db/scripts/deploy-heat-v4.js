/**
 * Deploy Heat Model v4 Normalization to Production
 *
 * This script applies the heat-v4-normalization.sql to the target database.
 * Changes:
 * - Converts heat values from 0-1 scale to 0-145 point scale
 *
 * Usage:
 *   # Deploy to production
 *   DATABASE_URL="your-prod-url" node lib/db/scripts/deploy-heat-v4.js
 *
 *   # Test against local database
 *   node lib/db/scripts/deploy-heat-v4.js
 *
 * Safe to run multiple times (idempotent).
 * Automatically detects if migration already applied.
 */

const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const connectionString = process.env.DATABASE_URL || 'postgresql://USER:PASSWORD@localhost:5432/toodle';

async function deployHeatV4() {
  const client = new Client({ connectionString });

  try {
    console.log('='.repeat(70));
    console.log('Heat Model v4 Normalization Deployment');
    console.log('='.repeat(70));
    console.log('\nTarget database:', connectionString.split('@')[1] || 'localhost');
    console.log('\nConnecting to PostgreSQL...');

    await client.connect();
    console.log('✓ Connected to PostgreSQL\n');

    // Pre-migration check: Get current heat range
    console.log('Checking current heat values...');
    const preCheck = await client.query(`
      SELECT
        MAX(heat) as max_heat,
        MIN(heat) as min_heat,
        AVG(heat) as avg_heat,
        COUNT(*) as task_count
      FROM tasks
      WHERE deleted_at IS NULL AND heat IS NOT NULL
    `);

    const preStats = preCheck.rows[0];
    console.log(`  Total tasks with heat: ${preStats.task_count}`);
    console.log(`  Current heat range: ${preStats.min_heat} to ${preStats.max_heat}`);
    console.log(`  Current heat average: ${preStats.avg_heat}`);

    // Check if already migrated
    if (preStats.max_heat > 1.0) {
      console.log('\n⚠ Heat values already appear to be in v4 scale (max > 1.0)');
      console.log('⚠ Migration likely already applied. Proceeding anyway (migration is idempotent).\n');
    } else {
      console.log('\n✓ Heat values in v3 scale (0-1), proceeding with migration...\n');
    }

    // Read the migration file
    const migrationPath = path.join(__dirname, '..', 'migrations', 'heat-v4-normalization.sql');
    console.log(`Reading migration file: ${migrationPath}`);

    if (!fs.existsSync(migrationPath)) {
      throw new Error(`Migration file not found: ${migrationPath}`);
    }

    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
    console.log('✓ Migration file loaded\n');

    // Apply the migration
    console.log('Applying migration...\n');
    console.log('-'.repeat(70));

    const result = await client.query(migrationSQL);

    console.log('-'.repeat(70));
    console.log('\n✓ Migration applied successfully!\n');

    // Post-migration verification
    console.log('Verifying migration results...');
    const postCheck = await client.query(`
      SELECT
        MAX(heat) as max_heat,
        MIN(heat) as min_heat,
        AVG(heat) as avg_heat,
        COUNT(*) as task_count,
        COUNT(*) FILTER (WHERE heat < 0 OR heat > 145) as out_of_range
      FROM tasks
      WHERE deleted_at IS NULL AND heat IS NOT NULL
    `);

    const postStats = postCheck.rows[0];
    console.log('✓ Post-migration stats:');
    console.log(`  Total tasks with heat: ${postStats.task_count}`);
    console.log(`  New heat range: ${postStats.min_heat} to ${postStats.max_heat}`);
    console.log(`  New heat average: ${postStats.avg_heat}`);
    console.log(`  Tasks out of range (0-145): ${postStats.out_of_range}`);

    if (postStats.out_of_range > 0) {
      console.warn(`\n⚠ Warning: ${postStats.out_of_range} tasks have heat outside 0-145 range!`);
    } else {
      console.log('\n✓ All heat values in valid range (0-145)');
    }

    // Show sample of migrated data
    console.log('\nSample of migrated data (top 5 by heat):');
    const samples = await client.query(`
      SELECT
        id,
        title,
        ROUND(heat::numeric, 1) as heat,
        importance_v1,
        ROUND(heat_adjustment::numeric, 3) as heat_adjustment
      FROM tasks
      WHERE deleted_at IS NULL AND heat IS NOT NULL
      ORDER BY heat DESC
      LIMIT 5
    `);

    if (samples.rows.length > 0) {
      samples.rows.forEach(row => {
        const title = row.title.length > 40 ? row.title.substring(0, 37) + '...' : row.title;
        console.log(`  ${row.id}: "${title}"`);
        console.log(`    Heat: ${row.heat} pts | Importance: ${row.importance_v1} | Adjustment: ${row.heat_adjustment}`);
      });
    } else {
      console.log('  No tasks with heat values');
    }

    // Show distribution by heat bands
    console.log('\nHeat distribution by color bands:');
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
    console.log('✓ Heat scale normalized: 0-1 → 0-145 points - toodle-174 (v4)');
    console.log('✓ Heat display updated to show integer points instead of percentages');
    console.log('✓ Heat colors derived from importance configuration for adaptability');
    console.log('\nRollback command (if needed):');
    console.log('  UPDATE tasks SET heat = heat / 145 WHERE heat IS NOT NULL;');
    console.log('\nNext steps:');
    console.log('1. Verify UI displays heat as 0-145 points');
    console.log('2. Test heat/cool buttons with new scale');
    console.log('3. Verify tooltips show point-based breakdown');
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
deployHeatV4();
