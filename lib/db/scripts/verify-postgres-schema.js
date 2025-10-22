const { Client } = require('pg');

const connectionString = process.env.DATABASE_URL || 'postgresql://USER:PASSWORD@localhost:5432/toodle';

async function verifySchema() {
  const client = new Client({ connectionString });

  try {
    await client.connect();
    console.log('PostgreSQL Schema Verification\n' + '='.repeat(50) + '\n');

    // Get all tables
    const tables = ['projects', 'tasks', 'settings', 'note_rows', 'note_row_versions'];

    for (const table of tables) {
      console.log(`\n${table.toUpperCase()} TABLE:`);
      console.log('-'.repeat(50));

      // Get columns
      const columnsResult = await client.query(`
        SELECT
          column_name,
          data_type,
          is_nullable,
          column_default
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = $1
        ORDER BY ordinal_position
      `, [table]);

      columnsResult.rows.forEach(col => {
        const nullable = col.is_nullable === 'YES' ? 'NULL' : 'NOT NULL';
        const defaultVal = col.column_default ? `DEFAULT ${col.column_default}` : '';
        console.log(`  ${col.column_name.padEnd(30)} ${col.data_type.padEnd(20)} ${nullable.padEnd(10)} ${defaultVal}`);
      });
    }

    // Check indexes
    console.log(`\n\nINDEXES:`);
    console.log('-'.repeat(50));
    const indexesResult = await client.query(`
      SELECT
        tablename,
        indexname,
        indexdef
      FROM pg_indexes
      WHERE schemaname = 'public'
      ORDER BY tablename, indexname
    `);

    indexesResult.rows.forEach(idx => {
      console.log(`  ${idx.tablename}: ${idx.indexname}`);
    });

    // Check triggers
    console.log(`\n\nTRIGGERS:`);
    console.log('-'.repeat(50));
    const triggersResult = await client.query(`
      SELECT
        event_object_table,
        trigger_name,
        event_manipulation,
        action_timing
      FROM information_schema.triggers
      WHERE trigger_schema = 'public'
      ORDER BY event_object_table, trigger_name
    `);

    triggersResult.rows.forEach(trg => {
      console.log(`  ${trg.event_object_table}: ${trg.trigger_name} (${trg.action_timing} ${trg.event_manipulation})`);
    });

    await client.end();
    console.log('\n✓ Schema verification completed!\n');
    process.exit(0);
  } catch (error) {
    console.error('✗ Verification failed:', error.message);
    process.exit(1);
  }
}

verifySchema();
