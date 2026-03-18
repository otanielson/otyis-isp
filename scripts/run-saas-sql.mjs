/**
 * Executa o schema PostgreSQL (usa .env: DB_HOST, DB_PORT, DB_USER, DB_PASS, DB_NAME).
 * Uso: node scripts/run-saas-sql.mjs
 */
import 'dotenv/config';
import pg from 'pg';
import { readFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

async function run() {
  const config = {
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 5432),
    user: process.env.DB_USER,
    password: process.env.DB_PASS || '',
    database: process.env.DB_NAME,
  };
  if (!config.user || !config.database) {
    console.error('Defina DB_USER e DB_NAME no .env');
    process.exit(1);
  }

  const client = new pg.Client(config);
  await client.connect();

  const schemaPath = path.join(rootDir, 'sql', 'schema.pg.sql');
  console.log('Executando schema.pg.sql ...');
  try {
    const sql = await readFile(schemaPath, 'utf8');
    await client.query(sql);
    console.log('  OK: schema.pg.sql');
  } catch (err) {
    console.error('Erro:', err.message);
    await client.end();
    process.exit(1);
  }

  await client.end();
  console.log('Concluído.');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
