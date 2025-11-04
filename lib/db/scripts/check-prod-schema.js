/**
 * Check Production Database Schema
 *
 * This script checks the current state of the production database
 * to understand what migrations have been applied.
 */

const { Client } = require('pg');

const prodConnectionString = process.env.PROD_DATABASE_URL || 'postgresql://USER:PASSWORD@aws-1-us-east-2.pooler.supabase.com:6543/postgres';

async function checkProdSchema() {
  const client = new Client({ connectionString: prodConnectionString });

  try {
    console.log('='.repeat(70));
    console.log('Production Database Schema Check');
    console.log('='.repeat(70));
    console.log('\nConnecting to production database...');

    await client.connect();
    console.log('✓ Connected to production PostgreSQL\n');

    // Check heat-related columns
    console.log('Checking heat-related columns in tasks table...');
    const columns = await client.query(`
      SELECT column_name, data_type, column_default
      FROM information_schema.columns
      WHERE table_name = 'tasks'
        AND column_name IN (
          'star', 'star_level',
          'heat', 'heat_adjustment', 'heat_touch_count', 'heat_calculated_at',
          'other_touch_count', 'last_heat_touched_at', 'last_touched_at',
          'cold_storage_at', 'next_surface_at'
        )
      ORDER BY column_name
    `);

    console.log('\nCurrent heat columns:');
    if (columns.rows.length > 0) {
      columns.rows.forEach(row => {
        const defaultValue = row.column_default || 'null';
        console.log(`  ✓ ${row.column_name} (${row.data_type}, default: ${defaultValue})`);
      });
    } else {
      console.log('  (no heat columns found)');
    }

    // Check for missing V2 columns
    const missingV2 = ['heat_calculated_at', 'heat_touch_count', 'other_touch_count', 'last_heat_touched_at', 'cold_storage_at'];
    const foundV2 = columns.rows.map(r => r.column_name);
    const missingV2Cols = missingV2.filter(col => !foundV2.includes(col));

    console.log('\nMissing Heat V2 columns:');
    if (missingV2Cols.length > 0) {
      missingV2Cols.forEach(col => console.log(`  ✗ ${col}`));
    } else {
      console.log('  ✓ All V2 columns present');
    }

    // Check for missing V3 columns
    const missingV3 = ['star_level', 'heat_adjustment'];
    const missingV3Cols = missingV3.filter(col => !foundV2.includes(col));

    console.log('\nMissing Heat V3 columns:');
    if (missingV3Cols.length > 0) {
      missingV3Cols.forEach(col => console.log(`  ✗ ${col}`));
    } else {
      console.log('  ✓ All V3 columns present');
    }

    // Check heat value range
    console.log('\nChecking heat value scale...');
    const heatCheck = await client.query(`
      SELECT
        MAX(heat) as max_heat,
        MIN(heat) as min_heat,
        AVG(heat) as avg_heat,
        COUNT(*) as task_count
      FROM tasks
      WHERE deleted_at IS NULL AND heat IS NOT NULL
    `);

    const heatStats = heatCheck.rows[0];
    if (heatStats.task_count > 0) {
      console.log(`  Total tasks: ${heatStats.task_count}`);
      console.log(`  Heat range: ${heatStats.min_heat} to ${heatStats.max_heat}`);
      console.log(`  Average heat: ${heatStats.avg_heat}`);

      if (heatStats.max_heat > 1.0) {
        console.log('  ✓ Heat scale: V4 (0-145 points)');
      } else {
        console.log('  ✓ Heat scale: V1/V2/V3 (0-1 normalized)');
      }
    } else {
      console.log('  (no tasks with heat values)');
    }

    // Check settings table for sort_mode
    console.log('\nChecking settings table...');
    const settingsColumns = await client.query(`
      SELECT column_name, data_type, column_default
      FROM information_schema.columns
      WHERE table_name = 'settings'
        AND column_name = 'sort_mode'
    `);

    if (settingsColumns.rows.length > 0) {
      console.log('  ✓ sort_mode column exists');
    } else {
      console.log('  ✗ sort_mode column missing (needed for V2)');
    }

    await client.end();

    console.log('\n' + '='.repeat(70));
    console.log('Schema Check Complete');
    console.log('='.repeat(70));

    // Determine migration status
    console.log('\nMigration Status:');
    if (missingV2Cols.length === 0 && missingV3Cols.length === 0 && heatStats.max_heat > 1.0) {
      console.log('  ✓ Production is on Heat V4 (fully up to date)');
    } else if (missingV2Cols.length === 0 && missingV3Cols.length === 0) {
      console.log('  ⚠ Production is on Heat V3 (needs V4 normalization)');
    } else if (missingV2Cols.length === 0) {
      console.log('  ⚠ Production is on Heat V2 (needs V3 and V4)');
    } else {
      console.log('  ⚠ Production is on Heat V1 or earlier (needs V2, V3, and V4)');
    }

    console.log('\n' + '='.repeat(70) + '\n');

    process.exit(0);
  } catch (error) {
    console.error('\n✗ Schema check failed:', error.message);
    console.error('\nFull error:', error);

    try {
      await client.end();
    } catch (e) {
      // Ignore cleanup errors
    }

    process.exit(1);
  }
}

// Run the check
checkProdSchema();
