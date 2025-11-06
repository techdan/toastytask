/**
 * Round Heat Adjustment Values
 *
 * This script rounds all existing heat adjustment values in the database to integers.
 * This is necessary after implementing the integer-only heat calculation system.
 *
 * Context:
 * - Heat calculations now use Math.round() on all components to ensure integer values
 * - Existing database records may have fractional heat adjustment values from decay
 * - This script ensures the database state matches the new integer-only architecture
 *
 * Usage:
 *   # Round adjustments in production database
 *   DATABASE_URL="your-prod-url" node lib/db/scripts/round-heat-adjustments.js
 *
 *   # Round adjustments in local database
 *   node lib/db/scripts/round-heat-adjustments.js
 *
 * Safe to run multiple times (idempotent).
 */

const { Client } = require('pg');

const connectionString = process.env.DATABASE_URL || 'postgresql://USER:PASSWORD@localhost:5432/toodle';

async function roundHeatAdjustments() {
  const client = new Client({ connectionString });

  try {
    console.log('='.repeat(70));
    console.log('Round Heat Adjustment Values');
    console.log('='.repeat(70));
    console.log('\nTarget database:', connectionString.split('@')[1] || 'localhost');
    console.log('\nConnecting to PostgreSQL...');

    await client.connect();
    console.log('✓ Connected to PostgreSQL\n');

    // First, check current state
    console.log('Analyzing current heat adjustment values...');
    const analysisResult = await client.query(`
      SELECT
        COUNT(*) as total_tasks,
        COUNT(*) FILTER (WHERE heat_adjustment IS NOT NULL) as tasks_with_adjustment,
        COUNT(*) FILTER (WHERE heat_adjustment IS NOT NULL AND heat_adjustment != ROUND(heat_adjustment)) as tasks_with_fractional
      FROM tasks
      WHERE deleted_at IS NULL
    `);

    const stats = analysisResult.rows[0];
    console.log(`Total active tasks: ${stats.total_tasks}`);
    console.log(`Tasks with heat adjustment: ${stats.tasks_with_adjustment}`);
    console.log(`Tasks with fractional adjustments: ${stats.tasks_with_fractional}`);

    if (stats.tasks_with_fractional === '0') {
      console.log('\n✓ All heat adjustments are already integers. Nothing to do.\n');
      await client.end();
      process.exit(0);
    }

    // Show sample of tasks that will be updated
    console.log('\nSample tasks with fractional adjustments (before rounding):');
    const sampleBefore = await client.query(`
      SELECT
        id,
        title,
        heat_adjustment,
        ROUND(heat_adjustment) as rounded_adjustment
      FROM tasks
      WHERE deleted_at IS NULL
        AND heat_adjustment IS NOT NULL
        AND heat_adjustment != ROUND(heat_adjustment)
      ORDER BY ABS(heat_adjustment - ROUND(heat_adjustment)) DESC
      LIMIT 10
    `);

    console.log('-'.repeat(70));
    sampleBefore.rows.forEach(task => {
      console.log(
        `  ID: ${task.id.toString().padEnd(6)} | ` +
        `Before: ${task.heat_adjustment.toFixed(4).padStart(8)} | ` +
        `After: ${task.rounded_adjustment.toString().padStart(3)} | ` +
        `Title: ${task.title.substring(0, 25)}`
      );
    });
    console.log('-'.repeat(70));

    // Update all fractional heat adjustments to rounded integers
    console.log('\nRounding heat adjustment values...');
    const updateResult = await client.query(`
      UPDATE tasks
      SET heat_adjustment = ROUND(heat_adjustment)
      WHERE deleted_at IS NULL
        AND heat_adjustment IS NOT NULL
        AND heat_adjustment != ROUND(heat_adjustment)
    `);

    console.log(`✓ Updated ${updateResult.rowCount} tasks\n`);

    // Verify the update
    console.log('Verifying results...');
    const verifyResult = await client.query(`
      SELECT
        COUNT(*) FILTER (WHERE heat_adjustment IS NOT NULL AND heat_adjustment != ROUND(heat_adjustment)) as remaining_fractional
      FROM tasks
      WHERE deleted_at IS NULL
    `);

    const remainingFractional = verifyResult.rows[0].remaining_fractional;
    if (remainingFractional === '0') {
      console.log('✓ All heat adjustments are now integers\n');
    } else {
      console.log(`⚠ Warning: ${remainingFractional} tasks still have fractional adjustments\n`);
    }

    // Show distribution of adjustment values
    console.log('Heat adjustment distribution (after rounding):');
    const distribution = await client.query(`
      SELECT
        heat_adjustment,
        COUNT(*) as count
      FROM tasks
      WHERE deleted_at IS NULL
        AND heat_adjustment IS NOT NULL
        AND heat_adjustment != 0
      GROUP BY heat_adjustment
      ORDER BY heat_adjustment DESC
      LIMIT 15
    `);

    console.log('-'.repeat(70));
    distribution.rows.forEach(row => {
      const bar = '█'.repeat(Math.min(50, Math.ceil(row.count / 2)));
      console.log(
        `  ${row.heat_adjustment >= 0 ? '+' : ''}${row.heat_adjustment.toString().padStart(3)}: ${bar} (${row.count} tasks)`
      );
    });
    console.log('-'.repeat(70));

    await client.end();

    console.log('\n' + '='.repeat(70));
    console.log('✓ Heat adjustment rounding completed successfully!');
    console.log('='.repeat(70));
    console.log('\nNext steps:');
    console.log('1. Verify heat values in UI (hover over heat badges for tooltip)');
    console.log('2. Check that all adjustments show as integers in tooltips');
    console.log('3. Monitor decay calculations (should produce rounded values)');
    console.log('='.repeat(70) + '\n');

    process.exit(0);
  } catch (error) {
    console.error('\n✗ Script failed:', error.message);
    console.error('\nFull error:', error);

    try {
      await client.end();
    } catch (e) {
      // Ignore cleanup errors
    }

    process.exit(1);
  }
}

// Run the script
roundHeatAdjustments();
