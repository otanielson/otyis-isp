/**
 * Cria apenas a tabela tenant_nas (concentradores por provedor).
 * Usa o mesmo .env do projeto. Rode: node scripts/create-tenant-nas.mjs
 */
import 'dotenv/config';
import mysql from 'mysql2/promise';
import { readFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

async function run() {
  const config = {
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASS || '',
    database: process.env.DB_NAME,
    multipleStatements: true,
  };
  if (!config.user || !config.database) {
    console.error('Defina DB_USER e DB_NAME no .env');
    process.exit(1);
  }

  console.log('Conectando em', config.database, '...');
  const conn = await mysql.createConnection(config);
  const sqlPath = path.join(rootDir, 'sql', 'tenant_nas.sql');
  const sql = await readFile(sqlPath, 'utf8');
  await conn.query(sql);
  await conn.end();
  console.log('Tabela tenant_nas criada com sucesso.');
}

run().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
