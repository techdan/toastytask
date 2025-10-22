const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../../.env.local') });

const { Client } = require('pg');

// Connection string from environment variable
const connectionString = process.env.DATABASE_URL || 'postgresql://USER:PASSWORD@localhost:5432/toodle';

async function testConnection() {
  const client = new Client({ connectionString });

  try {
    console.log('Attempting to connect to PostgreSQL...');
    console.log(`Connection string: ${connectionString.replace(/:[^:@]+@/, ':****@')}`);

    await client.connect();
    console.log('✓ Successfully connected to PostgreSQL!');

    // Test a simple query
    const result = await client.query('SELECT version()');
    console.log('✓ PostgreSQL version:', result.rows[0].version);

    // Check if database exists and is accessible
    const dbResult = await client.query('SELECT current_database()');
    console.log('✓ Connected to database:', dbResult.rows[0].current_database);

    await client.end();
    console.log('✓ Connection test completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('✗ Connection failed:', error.message);
    console.error('\nPossible issues:');
    console.error('- PostgreSQL server is not running');
    console.error('- Database "toodle" does not exist');
    console.error('- Username or password is incorrect');
    console.error('- Host or port is incorrect');
    process.exit(1);
  }
}

testConnection();
