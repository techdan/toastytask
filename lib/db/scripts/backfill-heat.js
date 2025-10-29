/**
 * Backfill Heat Values for Existing Tasks
 *
 * This script calculates and updates heat values for all existing tasks in the database.
 * Ensures stored heat values match the on-the-fly calculation engine.
 *
 * Related to: toodle-173
 *
 * Usage:
 *   # Backfill production database
 *   DATABASE_URL="your-prod-url" node lib/db/scripts/backfill-heat.js
 *
 *   # Backfill local database
 *   node lib/db/scripts/backfill-heat.js
 *
 * Safe to run multiple times (idempotent).
 */

const { Client } = require('pg');

const connectionString = process.env.DATABASE_URL || 'postgresql://USER:PASSWORD@localhost:5432/toodle';

// Heat calculation constants (from heat-v2.ts)
const HEAT_DECAY_HALF_LIFE_HOURS = 168; // 7 days
const HEAT_TOUCH_CAP = 20;
const ACTIVITY_CAP = 20;
const CREATION_DECAY_DAYS = 60;

const WEIGHT_BASE = 0.20;
const WEIGHT_RECENCY = 0.25;
const WEIGHT_HEAT_TOUCHES = 0.30;
const WEIGHT_DUE_PROXIMITY = 0.15;
const WEIGHT_ACTIVITY = 0.05;
const WEIGHT_CREATION = 0.05;

const SNOOZE_PROXIMITY_BOOST_MAX = 0.30;
const SNOOZE_PROXIMITY_WINDOW_DAYS = 7;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function hoursBetween(date1, date2) {
  return Math.abs(date2.getTime() - date1.getTime()) / (1000 * 60 * 60);
}

function daysBetween(date1, date2) {
  return Math.abs(date2.getTime() - date1.getTime()) / (1000 * 60 * 60 * 24);
}

function calculateBaseImportance(importanceV1) {
  return clamp((importanceV1 - 2) / 10, 0, 1);
}

function calculateRecency(lastTouchedAt, now) {
  if (!lastTouchedAt) return 0;
  const hoursSinceTouch = hoursBetween(lastTouchedAt, now);
  return Math.exp(-hoursSinceTouch / HEAT_DECAY_HALF_LIFE_HOURS);
}

function calculateHeatTouches(heatTouchCount) {
  return clamp(heatTouchCount / HEAT_TOUCH_CAP, 0, 1);
}

function calculateDueProximity(dueAt, now) {
  if (!dueAt) return 0;

  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dueStart = new Date(dueAt.getFullYear(), dueAt.getMonth(), dueAt.getDate());
  const diffMs = dueStart.getTime() - todayStart.getTime();
  const daysToDue = diffMs / (1000 * 60 * 60 * 24);

  return 1 / (1 + Math.exp(daysToDue));
}

function calculateActivity(otherTouchCount) {
  if (otherTouchCount === 0) return 0;
  const cappedCount = Math.min(otherTouchCount, ACTIVITY_CAP);
  return Math.log(1 + cappedCount) / Math.log(1 + ACTIVITY_CAP);
}

function calculateCreationRecency(createdAt, heatTouchCount, otherTouchCount, now) {
  const totalTouches = heatTouchCount + otherTouchCount;
  if (totalTouches > 0) return 0;

  const daysSinceCreated = daysBetween(createdAt, now);
  return Math.exp(-daysSinceCreated / CREATION_DECAY_DAYS);
}

function calculateHeat(task, now = new Date()) {
  const baseImportance = calculateBaseImportance(task.importance_v1 || 0);
  const recency = calculateRecency(task.last_touched_at, now);
  const heatTouches = calculateHeatTouches(task.heat_touch_count || 0);
  const dueProximity = calculateDueProximity(task.due_at, now);
  const activity = calculateActivity(task.other_touch_count || 0);
  const creation = calculateCreationRecency(
    task.created_at,
    task.heat_touch_count || 0,
    task.other_touch_count || 0,
    now
  );

  let heat =
    WEIGHT_BASE * baseImportance +
    WEIGHT_RECENCY * recency +
    WEIGHT_HEAT_TOUCHES * heatTouches +
    WEIGHT_DUE_PROXIMITY * dueProximity +
    WEIGHT_ACTIVITY * activity +
    WEIGHT_CREATION * creation;

  // Handle snooze proximity boost
  if (task.next_surface_at) {
    const hoursUntilResurface = (task.next_surface_at.getTime() - now.getTime()) / (1000 * 60 * 60);
    const daysUntilResurface = hoursUntilResurface / 24;

    if (daysUntilResurface <= SNOOZE_PROXIMITY_WINDOW_DAYS) {
      if (daysUntilResurface <= 0) {
        heat = Math.min(1.0, heat + SNOOZE_PROXIMITY_BOOST_MAX);
      } else {
        const proximityBoost =
          SNOOZE_PROXIMITY_BOOST_MAX * (1 - daysUntilResurface / SNOOZE_PROXIMITY_WINDOW_DAYS);
        heat = Math.min(1.0, heat + proximityBoost);
      }
    }
  }

  return clamp(heat, 0, 1);
}

async function backfillHeat() {
  const client = new Client({ connectionString });

  try {
    console.log('='.repeat(70));
    console.log('Heat Values Backfill');
    console.log('='.repeat(70));
    console.log('\nTarget database:', connectionString.split('@')[1] || 'localhost');
    console.log('\nConnecting to PostgreSQL...');

    await client.connect();
    console.log('✓ Connected to PostgreSQL\n');

    // Fetch all tasks
    console.log('Fetching all tasks...');
    const result = await client.query(`
      SELECT
        id,
        importance_v1,
        heat_touch_count,
        other_touch_count,
        last_touched_at,
        due_at,
        created_at,
        next_surface_at,
        completed_at,
        deleted_at
      FROM tasks
      WHERE deleted_at IS NULL
    `);

    const tasks = result.rows;
    console.log(`✓ Found ${tasks.length} active tasks\n`);

    if (tasks.length === 0) {
      console.log('No tasks to process. Exiting.\n');
      await client.end();
      process.exit(0);
    }

    // Calculate heat for each task
    console.log('Calculating heat values...');
    const now = new Date();
    let updated = 0;
    let skipped = 0;

    for (const task of tasks) {
      const heat = calculateHeat(task, now);

      // Update task with calculated heat
      await client.query(
        `UPDATE tasks
         SET heat = $1, heat_calculated_at = $2
         WHERE id = $3`,
        [heat, now, task.id]
      );

      updated++;

      // Log progress every 100 tasks
      if (updated % 100 === 0) {
        console.log(`  Processed ${updated} of ${tasks.length} tasks...`);
      }
    }

    console.log(`✓ Updated ${updated} tasks with calculated heat values\n`);

    // Show sample of results
    console.log('Sample heat values (first 10 tasks):');
    const sample = await client.query(`
      SELECT
        id,
        title,
        importance_v1,
        heat,
        heat_touch_count,
        other_touch_count
      FROM tasks
      WHERE deleted_at IS NULL
      ORDER BY heat DESC
      LIMIT 10
    `);

    console.log('-'.repeat(70));
    sample.rows.forEach(task => {
      console.log(
        `  ID: ${task.id.toString().padEnd(6)} | ` +
        `Heat: ${(task.heat * 100).toFixed(0).padStart(3)} | ` +
        `Imp: ${task.importance_v1.toString().padStart(2)} | ` +
        `Title: ${task.title.substring(0, 30)}`
      );
    });
    console.log('-'.repeat(70));

    await client.end();

    console.log('\n' + '='.repeat(70));
    console.log('✓ Backfill completed successfully!');
    console.log('='.repeat(70));
    console.log('\nNext steps:');
    console.log('1. Verify heat values in UI');
    console.log('2. Test heat-based sorting');
    console.log('3. Monitor heat tooltip breakdown');
    console.log('='.repeat(70) + '\n');

    process.exit(0);
  } catch (error) {
    console.error('\n✗ Backfill failed:', error.message);
    console.error('\nFull error:', error);

    try {
      await client.end();
    } catch (e) {
      // Ignore cleanup errors
    }

    process.exit(1);
  }
}

// Run the backfill
backfillHeat();
