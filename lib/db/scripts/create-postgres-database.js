const { Client } = require('pg');

// Connect to default postgres database to create our database
const connectionString = 'postgresql://USER:PASSWORD@localhost:5432/postgres';

async function createDatabase() {
  const client = new Client({ connectionString });

  try {
    console.log('Connecting to PostgreSQL server...');
    await client.connect();
    console.log('✓ Connected to PostgreSQL server');

    // Check if database already exists
    const checkDb = await client.query(
      "SELECT 1 FROM pg_database WHERE datname = 'toodle'"
    );

    if (checkDb.rows.length > 0) {
      console.log('✓ Database "toodle" already exists');
    } else {
      console.log('Creating database "toodle"...');
      await client.query('CREATE DATABASE toodle');
      console.log('✓ Database "toodle" created successfully!');
    }

    await client.end();
    console.log('✓ Setup completed!');
    process.exit(0);
  } catch (error) {
    console.error('✗ Failed to create database:', error.message);
    process.exit(1);
  }
}

createDatabase();
