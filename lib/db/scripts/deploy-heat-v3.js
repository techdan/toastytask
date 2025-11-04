/**
 * Deploy Heat Model v3 Migration to Production
 *
 * This script applies the heat-v3-migration.sql to the target database.
 * Changes:
 * - Enhanced star system (boolean → 0-3 levels)
 * - Direct heat adjustment tracking (replaces click counting)
 *
 * Usage:
 *   # Deploy to production
 *   DATABASE_URL="your-prod-url" node lib/db/scripts/deploy-heat-v3.js
 *
 *   # Test against local database
 *   node lib/db/scripts/deploy-heat-v3.js
 *
 * Safe to run multiple times (idempotent).
 */

const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const connectionString = process.env.DATABASE_URL || 'postgresql://USER:PASSWORD@localhost:5432/toodle';

async function deployHeatV3() {
  const client = new Client({ connectionString });

  try {
    console.log('='.repeat(70));
    console.log('Heat Model v3 Production Deployment');
    console.log('='.repeat(70));
    console.log('\nTarget database:', connectionString.split('@')[1] || 'localhost');
    console.log('\nConnecting to PostgreSQL...');

    await client.connect();
    console.log('✓ Connected to PostgreSQL\n');

    // Read the migration file
    const migrationPath = path.join(__dirname, '..', 'migrations', 'heat-v3-migration.sql');
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

    // Verify tasks table changes
    console.log('Verifying tasks table...');
    const tasksColumns = await client.query(`
      SELECT column_name, data_type, column_default
      FROM information_schema.columns
      WHERE table_name = 'tasks'
        AND column_name IN ('star_level', 'heat_adjustment')
      ORDER BY column_name
    `);

    if (tasksColumns.rows.length > 0) {
      console.log('✓ Tasks table columns:');
      tasksColumns.rows.forEach(row => {
        const defaultValue = row.column_default || 'null';
        console.log(`  - ${row.column_name} (${row.data_type}, default: ${defaultValue})`);
      });
    } else {
      console.warn('⚠ Warning: Heat v3 columns not found in tasks table');
    }

    // Verify constraints
    console.log('\nVerifying constraints...');
    const constraints = await client.query(`
      SELECT constraint_name, check_clause
      FROM information_schema.check_constraints
      WHERE constraint_name IN ('tasks_star_level_check', 'tasks_heat_adjustment_check')
      ORDER BY constraint_name
    `);

    console.log('✓ Heat v3 constraints:');
    constraints.rows.forEach(row => {
      console.log(`  - ${row.constraint_name}`);
    });

    // Check migration results
    console.log('\nChecking migration results...');

    // Star migration
    const starMigration = await client.query(`
      SELECT
        COUNT(*) FILTER (WHERE star = true) as starred_tasks,
        COUNT(*) FILTER (WHERE star_level > 0) as level_tasks,
        COUNT(*) FILTER (WHERE star = true AND star_level >= 1) as migrated_tasks
      FROM tasks
      WHERE deleted_at IS NULL
    `);

    const starStats = starMigration.rows[0];
    console.log(`✓ Star migration:`);
    console.log(`  - Tasks with star=true: ${starStats.starred_tasks}`);
    console.log(`  - Tasks with star_level>0: ${starStats.level_tasks}`);
    console.log(`  - Successfully migrated: ${starStats.migrated_tasks}`);

    // Heat adjustment migration
    const heatMigration = await client.query(`
      SELECT
        COUNT(*) FILTER (WHERE heat_touch_count != 0) as heated_tasks,
        COUNT(*) FILTER (WHERE heat_adjustment != 0) as adjusted_tasks,
        COUNT(*) FILTER (WHERE heat_touch_count != 0 AND heat_adjustment != 0) as migrated_tasks
      FROM tasks
      WHERE deleted_at IS NULL
    `);

    const heatStats = heatMigration.rows[0];
    console.log(`\n✓ Heat adjustment migration:`);
    console.log(`  - Tasks with heat_touch_count!=0: ${heatStats.heated_tasks}`);
    console.log(`  - Tasks with heat_adjustment!=0: ${heatStats.adjusted_tasks}`);
    console.log(`  - Successfully migrated: ${heatStats.migrated_tasks}`);

    // Show sample of migrated data
    console.log('\nSample of migrated data:');
    const samples = await client.query(`
      SELECT
        id,
        title,
        star,
        star_level,
        ROUND(heat_touch_count::numeric, 2) as heat_touch_count,
        ROUND(heat_adjustment::numeric, 3) as heat_adjustment
      FROM tasks
      WHERE deleted_at IS NULL
        AND (star_level > 0 OR heat_adjustment != 0)
      ORDER BY heat_adjustment DESC
      LIMIT 5
    `);

    if (samples.rows.length > 0) {
      console.log('  Top 5 tasks with adjustments:');
      samples.rows.forEach(row => {
        const title = row.title.length > 40 ? row.title.substring(0, 37) + '...' : row.title;
        console.log(`    ${row.id}: "${title}"`);
        console.log(`      star=${row.star} → star_level=${row.star_level}`);
        console.log(`      heat_touch_count=${row.heat_touch_count} → heat_adjustment=${row.heat_adjustment}`);
      });
    } else {
      console.log('  No tasks with adjustments (all tasks at default values)');
    }

    await client.end();

    console.log('\n' + '='.repeat(70));
    console.log('✓ Deployment completed successfully!');
    console.log('='.repeat(70));
    console.log('\nKey changes:');
    console.log('✓ Enhanced star system (0-3 levels) - toodle-174');
    console.log('✓ Direct heat adjustment tracking - toodle-174');
    console.log('✓ Migrated existing star and heat_touch_count data');
    console.log('\nNext steps:');
    console.log('1. Update importance calculation to use star_level');
    console.log('2. Implement heat v3 algorithm');
    console.log('3. Update API endpoints for heat/cool/star');
    console.log('4. Update UI for enhanced star and glow states');
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
deployHeatV3();
