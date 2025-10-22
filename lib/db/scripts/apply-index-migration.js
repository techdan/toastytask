const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const connectionString = process.env.DATABASE_URL || 'postgresql://USER:PASSWORD@localhost:5432/toodle';

async function applyIndexMigration() {
  const client = new Client({ connectionString });

  try {
    console.log('Connecting to PostgreSQL...');
    await client.connect();
    console.log('✓ Connected to PostgreSQL\n');

    // Read the index migration file
    const migrationPath = path.join(__dirname, '..', 'migrations', '0001_add_task_indexes.sql');
    console.log(`Reading migration file: ${migrationPath}`);
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

    // Apply the migration
    console.log('Applying index migration...');
    await client.query(migrationSQL);
    console.log('✓ Indexes created successfully!\n');

    // Verify indexes were created
    const indexesResult = await client.query(`
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE schemaname = 'public' AND tablename = 'tasks'
      ORDER BY indexname
    `);

    console.log('Current task table indexes:');
    indexesResult.rows.forEach(idx => {
      console.log(`  ✓ ${idx.indexname}`);
    });

    await client.end();
    console.log('\n✓ Migration completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('✗ Migration failed:', error.message);
    console.error('\nFull error:', error);
    process.exit(1);
  }
}

applyIndexMigration();
