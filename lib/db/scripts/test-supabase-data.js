const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../../.env.local') });

const { Client } = require('pg');

async function testData() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });

  try {
    await client.connect();
    console.log('✓ Connected to Supabase\n');

    // Count all records
    const projectsCount = await client.query('SELECT COUNT(*) FROM projects');
    const tasksCount = await client.query('SELECT COUNT(*) FROM tasks');
    const settingsCount = await client.query('SELECT COUNT(*) FROM settings');

    console.log('Data Summary:');
    console.log(`  Projects: ${projectsCount.rows[0].count}`);
    console.log(`  Tasks: ${tasksCount.rows[0].count}`);
    console.log(`  Settings: ${settingsCount.rows[0].count}\n`);

    // Show sample tasks
    const tasks = await client.query('SELECT id, title, priority, bucket FROM tasks LIMIT 5');
    console.log('Sample Tasks:');
    tasks.rows.forEach(task => {
      console.log(`  ${task.id}. [${task.priority}] ${task.title} (${task.bucket})`);
    });

    await client.end();
    console.log('\n✓ Supabase is ready to use!');
    process.exit(0);
  } catch (error) {
    console.error('✗ Test failed:', error.message);
    process.exit(1);
  }
}

testData();
