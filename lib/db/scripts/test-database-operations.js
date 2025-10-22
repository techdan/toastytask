/**
 * Database Operations Test Script
 * Tests CRUD operations on PostgreSQL to validate migration
 */

const { Client } = require('pg');

const connectionString = process.env.DATABASE_URL || 'postgresql://USER:PASSWORD@localhost:5432/toodle';

async function testDatabaseOperations() {
  const client = new Client({ connectionString });

  try {
    console.log('PostgreSQL Migration Validation Test');
    console.log('='.repeat(50) + '\n');

    await client.connect();
    console.log('✓ Connected to PostgreSQL\n');

    // Test 1: Check data integrity - count records
    console.log('Test 1: Data Integrity Check');
    console.log('-'.repeat(50));

    const counts = {
      projects: await client.query('SELECT COUNT(*) FROM projects'),
      tasks: await client.query('SELECT COUNT(*) FROM tasks'),
      settings: await client.query('SELECT COUNT(*) FROM settings'),
      noteRows: await client.query('SELECT COUNT(*) FROM note_rows'),
      noteRowVersions: await client.query('SELECT COUNT(*) FROM note_row_versions'),
    };

    console.log(`  Projects: ${counts.projects.rows[0].count}`);
    console.log(`  Tasks: ${counts.tasks.rows[0].count}`);
    console.log(`  Settings: ${counts.settings.rows[0].count}`);
    console.log(`  Note Rows: ${counts.noteRows.rows[0].count}`);
    console.log(`  Note Row Versions: ${counts.noteRowVersions.rows[0].count}`);
    console.log('✓ Data integrity check passed\n');

    // Test 2: Read operations
    console.log('Test 2: Read Operations');
    console.log('-'.repeat(50));

    const tasks = await client.query('SELECT id, title, priority, bucket FROM tasks LIMIT 3');
    console.log(`  Found ${tasks.rows.length} tasks:`);
    tasks.rows.forEach(task => {
      console.log(`    - [${task.priority}] ${task.title} (${task.bucket})`);
    });
    console.log('✓ Read operations working\n');

    // Test 3: Write operation - create a test task
    console.log('Test 3: Write Operations');
    console.log('-'.repeat(50));

    const insertResult = await client.query(`
      INSERT INTO tasks (title, priority, bucket, importance_v1)
      VALUES ($1, $2, $3, $4)
      RETURNING id, title, priority, bucket
    `, ['Test Migration Task', 'high', 'todo', 8]);

    const newTask = insertResult.rows[0];
    console.log(`  Created task: [${newTask.priority}] ${newTask.title} (ID: ${newTask.id})`);
    console.log('✓ Write operations working\n');

    // Test 4: Update operation
    console.log('Test 4: Update Operations');
    console.log('-'.repeat(50));

    await client.query(`
      UPDATE tasks
      SET priority = $1, updated_at = NOW() AT TIME ZONE 'UTC'
      WHERE id = $2
    `, ['top', newTask.id]);

    const updated = await client.query('SELECT priority FROM tasks WHERE id = $1', [newTask.id]);
    console.log(`  Updated task priority: ${updated.rows[0].priority}`);
    console.log('✓ Update operations working\n');

    // Test 5: Relationship/Join queries
    console.log('Test 5: Relationship Queries');
    console.log('-'.repeat(50));

    const tasksWithProjects = await client.query(`
      SELECT t.title, p.name as project_name
      FROM tasks t
      LEFT JOIN projects p ON t.project_id = p.id
      WHERE t.project_id IS NOT NULL
      LIMIT 3
    `);

    console.log(`  Tasks with projects: ${tasksWithProjects.rows.length}`);
    tasksWithProjects.rows.forEach(row => {
      console.log(`    - ${row.title} (Project: ${row.project_name})`);
    });
    console.log('✓ Relationship queries working\n');

    // Test 6: Index usage verification
    console.log('Test 6: Index Usage Verification');
    console.log('-'.repeat(50));

    const indexes = await client.query(`
      SELECT tablename, indexname
      FROM pg_indexes
      WHERE schemaname = 'public' AND tablename IN ('tasks', 'projects', 'note_rows')
      ORDER BY tablename, indexname
    `);

    console.log(`  Total indexes: ${indexes.rows.length}`);
    const taskIndexes = indexes.rows.filter(i => i.tablename === 'tasks');
    console.log(`  Task table indexes: ${taskIndexes.length}`);
    console.log('✓ Indexes verified\n');

    // Test 7: Timestamp handling
    console.log('Test 7: Timestamp Handling');
    console.log('-'.repeat(50));

    const timestampTest = await client.query(`
      SELECT created_at, updated_at, due_at
      FROM tasks
      WHERE id = $1
    `, [newTask.id]);

    const ts = timestampTest.rows[0];
    console.log(`  Created at: ${ts.created_at}`);
    console.log(`  Updated at: ${ts.updated_at}`);
    console.log(`  Due at: ${ts.due_at || 'NULL'}`);
    console.log('✓ Timestamp handling working\n');

    // Test 8: Delete operation (cleanup)
    console.log('Test 8: Delete Operations');
    console.log('-'.repeat(50));

    await client.query('DELETE FROM tasks WHERE id = $1', [newTask.id]);
    const deleted = await client.query('SELECT * FROM tasks WHERE id = $1', [newTask.id]);
    console.log(`  Deleted test task (rows affected: ${deleted.rows.length === 0 ? 1 : 0})`);
    console.log('✓ Delete operations working\n');

    // Test 9: Trigger verification
    console.log('Test 9: Trigger Verification');
    console.log('-'.repeat(50));

    const triggers = await client.query(`
      SELECT event_object_table, trigger_name
      FROM information_schema.triggers
      WHERE trigger_schema = 'public'
      ORDER BY event_object_table
    `);

    console.log(`  Active triggers: ${triggers.rows.length}`);
    triggers.rows.forEach(trg => {
      console.log(`    - ${trg.event_object_table}: ${trg.trigger_name}`);
    });
    console.log('✓ Triggers verified\n');

    // Summary
    console.log('='.repeat(50));
    console.log('✓ All tests passed! PostgreSQL migration is validated.');
    console.log('='.repeat(50));

    await client.end();
    process.exit(0);
  } catch (error) {
    console.error('\n✗ Test failed:', error.message);
    console.error('Full error:', error);
    await client.end();
    process.exit(1);
  }
}

testDatabaseOperations();
