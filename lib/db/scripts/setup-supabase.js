/**
 * Supabase Database Setup Script
 *
 * This script will:
 * 1. Test connection to Supabase
 * 2. Apply the PostgreSQL schema
 * 3. Optionally import data from SQLite
 */

const path = require('path');

// Load environment variables from .env.local
require('dotenv').config({ path: path.join(__dirname, '../../../.env.local') });

const { Client } = require('pg');
const fs = require('fs');

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error('❌ Error: DATABASE_URL environment variable is not set');
  console.error('\nPlease set it in your .env.local file with your Supabase connection string.');
  console.error('\nGet it from: Supabase Dashboard > Project Settings > Database > Connection string');
  console.error('Use "Transaction mode" (port 6543) for better connection pooling.\n');
  process.exit(1);
}

if (connectionString.includes('[YOUR-PROJECT-REF]') || connectionString.includes('[YOUR-PASSWORD]')) {
  console.error('❌ Error: You need to replace the placeholder values in DATABASE_URL');
  console.error('\nYour current value has placeholders like [YOUR-PROJECT-REF]');
  console.error('Replace this with the actual connection string from Supabase.\n');
  process.exit(1);
}

async function setupSupabase() {
  console.log('Supabase PostgreSQL Setup');
  console.log('='.repeat(60) + '\n');

  const client = new Client({ connectionString });

  try {
    // Step 1: Test connection
    console.log('Step 1: Testing connection to Supabase...');
    await client.connect();

    const versionResult = await client.query('SELECT version()');
    console.log('✓ Connected to Supabase PostgreSQL!');
    console.log(`  Version: ${versionResult.rows[0].version.split(' ').slice(0, 2).join(' ')}\n`);

    // Step 2: Check if schema already exists
    console.log('Step 2: Checking existing schema...');
    const tablesResult = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name IN ('projects', 'tasks', 'settings', 'note_rows', 'note_row_versions')
      ORDER BY table_name
    `);

    if (tablesResult.rows.length > 0) {
      console.log(`⚠️  Found ${tablesResult.rows.length} existing tables:`);
      tablesResult.rows.forEach(row => console.log(`    - ${row.table_name}`));
      console.log('\n⚠️  Schema already exists. Skipping schema creation.');
      console.log('   If you want to recreate the schema, drop the tables first.\n');

      await client.end();
      console.log('Setup completed. Your Supabase database is ready to use!');
      process.exit(0);
    }

    console.log('✓ No existing tables found. Will create schema.\n');

    // Step 3: Apply schema migration
    console.log('Step 3: Creating database schema...');
    const migrationPath = path.join(__dirname, '..', 'migrations', '0000_init_postgresql.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

    await client.query(migrationSQL);
    console.log('✓ Schema created successfully!\n');

    // Step 4: Apply index migration
    console.log('Step 4: Creating performance indexes...');
    const indexMigrationPath = path.join(__dirname, '..', 'migrations', '0001_add_task_indexes.sql');
    const indexMigrationSQL = fs.readFileSync(indexMigrationPath, 'utf8');

    await client.query(indexMigrationSQL);
    console.log('✓ Indexes created successfully!\n');

    // Step 5: Create initial settings row
    console.log('Step 5: Creating default settings...');
    const settingsResult = await client.query('SELECT COUNT(*) FROM settings');

    if (settingsResult.rows[0].count === '0') {
      await client.query(`
        INSERT INTO settings (id)
        VALUES (1)
      `);
      console.log('✓ Default settings created!\n');
    } else {
      console.log('✓ Settings already exist.\n');
    }

    // Step 6: Verify setup
    console.log('Step 6: Verifying setup...');
    const verifyTables = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);

    const verifyIndexes = await client.query(`
      SELECT COUNT(*) as count
      FROM pg_indexes
      WHERE schemaname = 'public' AND tablename = 'tasks'
    `);

    console.log(`✓ Tables created: ${verifyTables.rows.length}`);
    verifyTables.rows.forEach(row => console.log(`    - ${row.table_name}`));
    console.log(`✓ Task indexes: ${verifyIndexes.rows[0].count}\n`);

    await client.end();

    console.log('='.repeat(60));
    console.log('✅ Supabase setup completed successfully!');
    console.log('='.repeat(60));
    console.log('\nNext steps:');
    console.log('  1. Your database schema is ready');
    console.log('  2. Start your app with: npm run dev');
    console.log('  3. Optionally import local data with: npm run pg:import');
    console.log('\nYour app is now using Supabase PostgreSQL! 🚀\n');

    process.exit(0);
  } catch (error) {
    console.error('\n❌ Setup failed:', error.message);

    if (error.message.includes('password authentication failed')) {
      console.error('\n💡 Tip: Check that your password is correct in DATABASE_URL');
    } else if (error.message.includes('no pg_hba.conf entry')) {
      console.error('\n💡 Tip: Check that your IP is allowed in Supabase database settings');
    } else if (error.message.includes('ENOTFOUND') || error.message.includes('ETIMEDOUT')) {
      console.error('\n💡 Tip: Check your internet connection and Supabase project status');
    }

    console.error('\nFull error:', error);
    await client.end();
    process.exit(1);
  }
}

setupSupabase();
