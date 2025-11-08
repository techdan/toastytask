const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

function getConnectionStringFromEnvOrFile() {
  if (process.env.PROD_DATABASE_URL) return process.env.PROD_DATABASE_URL;
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
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

async function main() {
  // Allow override via CLI: node script.js --cs <connectionString>
  let cs = getConnectionStringFromEnvOrFile();
  for (let i = 2; i < process.argv.length; i++) {
    if (process.argv[i] === '--cs' && process.argv[i+1]) {
      cs = process.argv[i+1];
      break;
    }
  }
  const client = new Client({ connectionString: cs });
  await client.connect();
  const res = await client.query(
    `SELECT t.tgname, pg_get_triggerdef(t.oid) AS def, p.proname
     FROM pg_trigger t
     JOIN pg_class c ON c.oid = t.tgrelid
     JOIN pg_proc p ON p.oid = t.tgfoid
     WHERE c.relname = 'note_rows' AND NOT t.tgisinternal`
  );
  console.log(JSON.stringify(res.rows, null, 2));
  await client.end();
}

main().catch(err => { console.error(err); process.exit(1); });
