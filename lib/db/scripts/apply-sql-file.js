const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

function getConnectionString() {
  if (process.env.PROD_DATABASE_URL) return process.env.PROD_DATABASE_URL;
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  // Try to read from .env.local
  try {
    const envPath = path.join(process.cwd(), '.env.local');
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf8');
      const match = content.match(/^DATABASE_URL=(.*)$/m);
      if (match) {
        return match[1].trim();
      }
    }
  } catch {}
  return 'postgresql://USER:PASSWORD@localhost:5432/toodle';
}

// Allow override via CLI: node script.js <sql> --cs <connectionString>
let connectionString = getConnectionString();
for (let i = 2; i < process.argv.length; i++) {
  if (process.argv[i] === '--cs' && process.argv[i+1]) {
    connectionString = process.argv[i+1];
    break;
  }
}

async function main() {
  const fileArg = process.argv[2];
  if (!fileArg) {
    console.error('Usage: node lib/db/scripts/apply-sql-file.js <path-to-sql>');
    process.exit(1);
  }
  const sqlPath = path.resolve(process.cwd(), fileArg);
  if (!fs.existsSync(sqlPath)) {
    console.error(`SQL file not found: ${sqlPath}`);
    process.exit(1);
  }

  const sql = fs.readFileSync(sqlPath, 'utf8');
  const client = new Client({ connectionString });

  try {
    console.log(`Connecting to PostgreSQL at ${connectionString} ...`);
    await client.connect();
    console.log(`✓ Connected. Applying ${sqlPath}`);
    await client.query('BEGIN');
    await client.query(sql);
    await client.query('COMMIT');
    console.log('✓ SQL applied successfully');
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch {}
    console.error('✗ Failed applying SQL:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
