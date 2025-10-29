/**
 * Deploy Heat Model v2 Migration to Production
 *
 * This script applies the heat-v2-migration.sql to the target database.
 * Includes changes from:
 * - toodle-170: Sort mode toggle (settings.sort_mode)
 * - toodle-39: Heat v2 data model (heat columns and indexes)
 * - toodle-163: New task sort override & green styling
 *   - Marks all existing tasks as touched (other_touch_count = 1)
 *   - Prevents existing tasks from showing as new (green) after deployment
 *
 * Usage:
 *   # Deploy to production
 *   DATABASE_URL="your-prod-url" node lib/db/scripts/deploy-heat-v2.js
 *
 *   # Test against local database
 *   node lib/db/scripts/deploy-heat-v2.js
 *
 * Safe to run multiple times (idempotent).
 */

const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const connectionString = process.env.DATABASE_URL || 'postgresql://USER:PASSWORD@localhost:5432/toodle';

async function deployHeatV2() {
  const client = new Client({ connectionString });

  try {
    console.log('='.repeat(70));
    console.log('Heat Model v2 Production Deployment');
    console.log('='.repeat(70));
    console.log('\nTarget database:', connectionString.split('@')[1] || 'localhost');
    console.log('\nConnecting to PostgreSQL...');

    await client.connect();
    console.log('✓ Connected to PostgreSQL\n');

    // Read the migration file
    const migrationPath = path.join(__dirname, '..', 'migrations', 'heat-v2-migration.sql');
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

    // Verify settings table changes
    console.log('Verifying settings table...');
    const settingsColumns = await client.query(`
      SELECT column_name, data_type, column_default
      FROM information_schema.columns
      WHERE table_name = 'settings' AND column_name = 'sort_mode'
      ORDER BY column_name
    `);

    if (settingsColumns.rows.length > 0) {
      console.log('✓ Settings table updated:');
      settingsColumns.rows.forEach(row => {
        console.log(`  - ${row.column_name} (${row.data_type}, default: ${row.column_default})`);
      });
    } else {
      console.warn('⚠ Warning: sort_mode column not found in settings table');
    }

    // Verify tasks table changes
    console.log('\nVerifying tasks table...');
    const tasksColumns = await client.query(`
      SELECT column_name, data_type, column_default
      FROM information_schema.columns
      WHERE table_name = 'tasks'
        AND column_name IN (
          'heat', 'heat_calculated_at', 'heat_touch_count',
          'other_touch_count', 'last_heat_touched_at',
          'last_touched_at', 'cold_storage_at'
        )
      ORDER BY column_name
    `);

    console.log('✓ Tasks table columns:');
    tasksColumns.rows.forEach(row => {
      const defaultValue = row.column_default || 'null';
      console.log(`  - ${row.column_name} (${row.data_type}, default: ${defaultValue})`);
    });

    // Verify indexes
    console.log('\nVerifying indexes...');
    const indexes = await client.query(`
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE tablename = 'tasks'
        AND (
          indexname LIKE '%heat%'
          OR indexname LIKE '%cold%'
          OR indexname LIKE '%resurf%'
          OR indexname LIKE '%new_task%'
        )
      ORDER BY indexname
    `);

    console.log('✓ Heat-related indexes:');
    indexes.rows.forEach(row => {
      console.log(`  - ${row.indexname}`);
    });

    // Check for any existing tasks
    console.log('\nChecking existing data...');
    const taskCount = await client.query(`
      SELECT COUNT(*) as count FROM tasks WHERE deleted_at IS NULL
    `);
    console.log(`✓ Total active tasks in database: ${taskCount.rows[0].count}`);

    // Verify existing tasks were marked as touched (toodle-163)
    const touchedTasks = await client.query(`
      SELECT COUNT(*) as count FROM tasks
      WHERE deleted_at IS NULL
        AND (heat_touch_count > 0 OR other_touch_count > 0)
    `);
    console.log(`✓ Tasks marked as touched: ${touchedTasks.rows[0].count}`);

    const untouchedTasks = await client.query(`
      SELECT COUNT(*) as count FROM tasks
      WHERE deleted_at IS NULL
        AND heat_touch_count = 0
        AND other_touch_count = 0
    `);
    console.log(`✓ New/untouched tasks: ${untouchedTasks.rows[0].count} (will show as green)`);

    const settingsCount = await client.query(`
      SELECT COUNT(*) as count FROM settings
    `);
    console.log(`✓ Total settings rows: ${settingsCount.rows[0].count}`);

    await client.end();

    console.log('\n' + '='.repeat(70));
    console.log('✓ Deployment completed successfully!');
    console.log('='.repeat(70));
    console.log('\nIncluded changes:');
    console.log('✓ Sort mode toggle (Importance/Heat) - toodle-170');
    console.log('✓ Heat v2 data model (touch counters, timestamps) - toodle-39');
    console.log('✓ New task sort override & green styling - toodle-163');
    console.log('✓ Existing tasks marked as touched (won\'t show as new)');
    console.log('\nNext steps:');
    console.log('1. Implement field edit touch tracking (toodle-164)');
    console.log('2. Implement heat calculation engine (toodle-40)');
    console.log('3. Build heat visualization components (toodle-41)');
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
deployHeatV2();
