const path = require('path');

// Load environment variables from .env.local
require('dotenv').config({ path: path.join(__dirname, '../../../.env.local') });

const { Client } = require('pg');
const Database = require('better-sqlite3');

// Configuration
const sqlitePath = process.env.SQLLITE_DATABASE_URL || path.join(process.cwd(), 'data', 'toodle.db');
const postgresConnectionString = process.env.DATABASE_URL;

/**
 * Convert SQLite timestamp to PostgreSQL timestamp
 */
function convertTimestamp(sqliteTimestamp) {
  if (!sqliteTimestamp) return null;
  if (typeof sqliteTimestamp === 'string') {
    return new Date(sqliteTimestamp);
  }
  if (typeof sqliteTimestamp === 'number') {
    const timestamp = sqliteTimestamp > 10000000000 ? sqliteTimestamp : sqliteTimestamp * 1000;
    return new Date(timestamp);
  }
  return null;
}

async function importToSupabase() {
  console.log('SQLite to Supabase Data Import');
  console.log('='.repeat(50) + '\n');

  // Open SQLite connection
  console.log(`Opening SQLite database: ${sqlitePath}`);
  const sqlite = new Database(sqlitePath);
  console.log('✓ Connected to SQLite\n');

  // Open PostgreSQL connection
  console.log('Connecting to Supabase...');
  const pgClient = new Client({ connectionString: postgresConnectionString });
  await pgClient.connect();
  console.log('✓ Connected to Supabase\n');

  try {
    // Begin transaction
    await pgClient.query('BEGIN');

    // Migrate projects (no updated_at column)
    console.log('Migrating projects...');
    const projects = sqlite.prepare('SELECT * FROM projects').all();
    let projectCount = 0;

    for (const project of projects) {
      await pgClient.query(
        `INSERT INTO projects (id, name, color_hex, archived, created_at)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          project.id,
          project.name,
          project.colorHex || project.color_hex,
          project.archived,
          convertTimestamp(project.createdAt || project.created_at)
        ]
      );
      projectCount++;
    }

    if (projectCount > 0) {
      await pgClient.query(`SELECT setval('projects_id_seq', (SELECT MAX(id) FROM projects))`);
    }
    console.log(`✓ Migrated ${projectCount} projects\n`);

    // Migrate settings (overwrite the default row with id=1)
    console.log('Migrating settings...');
    const settings = sqlite.prepare('SELECT * FROM settings LIMIT 1').get();
    let settingsCount = 0;

    if (settings) {
      // Delete the default settings row first
      await pgClient.query('DELETE FROM settings WHERE id = 1');

      await pgClient.query(
        `INSERT INTO settings (
          id, default_priority, default_bucket, default_due_date,
          heat_decay_half_life_todo, heat_decay_half_life_watch, heat_decay_half_life_later,
          activity_normalization_constant, new_task_heat_boost, new_task_heat_half_life,
          escalation_threshold, de_escalation_threshold_todo_watch, de_escalation_threshold_watch_later,
          retirement_threshold, retirement_days, review_cadence_watch, review_cadence_later,
          snooze_todo_days, snooze_watch_days, snooze_later_days,
          grouping_mode, updated_at
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22
        )`,
        [
          settings.id,
          settings.defaultPriority || settings.default_priority,
          settings.defaultBucket || settings.default_bucket,
          settings.defaultDueDate || settings.default_due_date,
          settings.heatDecayHalfLifeTodo || settings.heat_decay_half_life_todo,
          settings.heatDecayHalfLifeWatch || settings.heat_decay_half_life_watch,
          settings.heatDecayHalfLifeLater || settings.heat_decay_half_life_later,
          settings.activityNormalizationConstant || settings.activity_normalization_constant,
          settings.newTaskHeatBoost || settings.new_task_heat_boost,
          settings.newTaskHeatHalfLife || settings.new_task_heat_half_life,
          settings.escalationThreshold || settings.escalation_threshold,
          settings.deEscalationThresholdTodoWatch || settings.de_escalation_threshold_todo_watch,
          settings.deEscalationThresholdWatchLater || settings.de_escalation_threshold_watch_later,
          settings.retirementThreshold || settings.retirement_threshold,
          settings.retirementDays || settings.retirement_days,
          settings.reviewCadenceWatch || settings.review_cadence_watch,
          settings.reviewCadenceLater || settings.review_cadence_later,
          settings.snoozeTodoDays || settings.snooze_todo_days,
          settings.snoozeWatchDays || settings.snooze_watch_days,
          settings.snoozeLaterDays || settings.snooze_later_days,
          settings.groupingMode || settings.grouping_mode,
          convertTimestamp(settings.updatedAt || settings.updated_at)
        ]
      );
      settingsCount = 1;
    }

    if (settingsCount > 0) {
      await pgClient.query(`SELECT setval('settings_id_seq', (SELECT MAX(id) FROM settings))`);
    }
    console.log(`✓ Migrated ${settingsCount} settings row\n`);

    // Migrate tasks
    console.log('Migrating tasks...');
    const tasks = sqlite.prepare('SELECT * FROM tasks').all();
    let taskCount = 0;

    for (const task of tasks) {
      await pgClient.query(
        `INSERT INTO tasks (
          id, title, project_id, priority, star, due_at, bucket, repeat_type,
          heat, touch_count, last_touched_at, next_surface_at, importance_v1,
          completed_at, archived_at, deleted_at, created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)`,
        [
          task.id,
          task.title,
          task.projectId || task.project_id,
          task.priority,
          task.star,
          convertTimestamp(task.dueAt || task.due_at),
          task.bucket,
          task.repeatType || task.repeat_type,
          task.heat,
          task.touchCount || task.touch_count,
          convertTimestamp(task.lastTouchedAt || task.last_touched_at),
          convertTimestamp(task.nextSurfaceAt || task.next_surface_at),
          task.importanceV1 || task.importance_v1,
          convertTimestamp(task.completedAt || task.completed_at),
          convertTimestamp(task.archivedAt || task.archived_at),
          convertTimestamp(task.deletedAt || task.deleted_at),
          convertTimestamp(task.createdAt || task.created_at),
          convertTimestamp(task.updatedAt || task.updated_at)
        ]
      );
      taskCount++;
    }

    if (taskCount > 0) {
      await pgClient.query(`SELECT setval('tasks_id_seq', (SELECT MAX(id) FROM tasks))`);
    }
    console.log(`✓ Migrated ${taskCount} tasks\n`);

    // Migrate note_rows
    console.log('Migrating note_rows...');
    const noteRows = sqlite.prepare('SELECT * FROM note_rows').all();
    let noteRowCount = 0;

    for (const noteRow of noteRows) {
      await pgClient.query(
        `INSERT INTO note_rows (id, task_id, ordinal, active_version_id, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          noteRow.id,
          noteRow.taskId || noteRow.task_id,
          noteRow.ordinal,
          noteRow.activeVersionId || noteRow.active_version_id,
          convertTimestamp(noteRow.createdAt || noteRow.created_at),
          convertTimestamp(noteRow.updatedAt || noteRow.updated_at)
        ]
      );
      noteRowCount++;
    }

    if (noteRowCount > 0) {
      await pgClient.query(`SELECT setval('note_rows_id_seq', (SELECT MAX(id) FROM note_rows))`);
    }
    console.log(`✓ Migrated ${noteRowCount} note rows\n`);

    // Migrate note_row_versions
    console.log('Migrating note_row_versions...');
    const noteRowVersions = sqlite.prepare('SELECT * FROM note_row_versions').all();
    let noteRowVersionCount = 0;

    for (const version of noteRowVersions) {
      await pgClient.query(
        `INSERT INTO note_row_versions (id, note_row_id, text, created_at)
         VALUES ($1, $2, $3, $4)`,
        [
          version.id,
          version.noteRowId || version.note_row_id,
          version.text,
          convertTimestamp(version.createdAt || version.created_at)
        ]
      );
      noteRowVersionCount++;
    }

    if (noteRowVersionCount > 0) {
      await pgClient.query(`SELECT setval('note_row_versions_id_seq', (SELECT MAX(id) FROM note_row_versions))`);
    }
    console.log(`✓ Migrated ${noteRowVersionCount} note row versions\n`);

    // Commit transaction
    await pgClient.query('COMMIT');

    console.log('='.repeat(50));
    console.log('✓ Import completed successfully!\n');
    console.log('Summary:');
    console.log(`  - Projects: ${projectCount}`);
    console.log(`  - Settings: ${settingsCount}`);
    console.log(`  - Tasks: ${taskCount}`);
    console.log(`  - Note Rows: ${noteRowCount}`);
    console.log(`  - Note Row Versions: ${noteRowVersionCount}`);
    console.log('='.repeat(50));

  } catch (error) {
    await pgClient.query('ROLLBACK');
    console.error('\n✗ Import failed:', error.message);
    console.error('Full error:', error);
    throw error;
  } finally {
    sqlite.close();
    await pgClient.end();
  }
}

importToSupabase()
  .then(() => {
    console.log('\n✓ All data imported to Supabase successfully!');
    process.exit(0);
  })
  .catch(() => {
    console.error('\n✗ Import script failed');
    process.exit(1);
  });
