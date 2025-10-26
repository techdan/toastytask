const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const connectionString = process.env.DATABASE_URL;

async function applyMigration() {
  if (!connectionString) {
    console.error('✗ DATABASE_URL environment variable is not set');
    process.exit(1);
  }

  const client = new Client({ connectionString });

  try {
    console.log('Connecting to PostgreSQL...');
    await client.connect();
    console.log('✓ Connected to PostgreSQL');

    // Read the migration file
    const migrationPath = path.join(__dirname, '..', 'migrations', '0002_add_projects_updated_at.sql');
    console.log(`Reading migration file: ${migrationPath}`);
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

    // Apply the migration
    console.log('Applying migration...');
    await client.query(migrationSQL);
    console.log('✓ Migration applied successfully!');

    // Verify the column was added
    const columnCheck = await client.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'projects'
      AND column_name = 'updated_at'
    `);

    if (columnCheck.rows.length > 0) {
      console.log('✓ Column projects.updated_at verified:', columnCheck.rows[0]);
    } else {
      console.error('✗ Column was not added properly');
    }

    await client.end();
    console.log('\n✓ Migration completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('✗ Migration failed:', error.message);
    console.error('\nFull error:', error);
    await client.end();
    process.exit(1);
  }
}

applyMigration();
