/**
 * PostgreSQL: pool + wrapper que converte parâmetros nomeados (:name) para $1, $2
 * e retorna formato compatível com o que o código esperava do mysql2 (insertId, [rows]).
 */
import pg from 'pg';

const { Pool } = pg;

let pool: pg.Pool | undefined;

export interface QueryResultMeta {
  insertId?: number;
  affectedRows?: number;
}

/** Converte SQL com :param ou ? em $1, $2 e array de valores. */
function namedToPositional(
  sql: string,
  params: Record<string, unknown> | unknown[]
): { sql: string; values: unknown[] } {
  if (Array.isArray(params)) {
    if (/\?/.test(sql)) {
      let i = 0;
      const sql2 = sql.replace(/\?/g, () => `$${++i}`);
      return { sql: sql2, values: params };
    }
    return { sql, values: params };
  }
  const keys: string[] = [];
  const seen = new Set<string>();
  // Protege :: do PostgreSQL (::int, ::jsonb, ::date) antes de substituir :param
  const PG_CAST = '\x00\x00PG_CAST\x00\x00';
  const protectedSql = sql.replace(/::/g, PG_CAST);
  const sql2 = protectedSql
    .replace(/:([a-zA-Z_][a-zA-Z0-9_]*)/g, (_, key) => {
      if (!seen.has(key)) {
        seen.add(key);
        keys.push(key);
      }
      const idx = keys.indexOf(key) + 1;
      return `$${idx}`;
    })
    .split(PG_CAST).join('::');
  const values = keys.map((k) => (params as Record<string, unknown>)[k]);
  return { sql: sql2, values };
}

/** Resultado no formato compatível: [rows] ou [resultHeader] para INSERT. */
function wrapResult(
  result: pg.QueryResult,
  isInsertWithReturning: boolean
): [unknown[] | { insertId: number; affectedRows: number }, unknown[]] {
  const rows = result.rows;
  const affectedRows = result.rowCount ?? 0;
  if (isInsertWithReturning && rows.length > 0) {
    const row = rows[0] as Record<string, unknown>;
    const idVal = row.id ?? row.Id ?? row.ID;
    if (idVal != null) {
      const insertId = Number(idVal);
      if (!Number.isNaN(insertId)) {
        return [{ insertId, affectedRows }, []];
      }
    }
  }
  if (
    result.command === 'INSERT' ||
    result.command === 'UPDATE' ||
    result.command === 'DELETE'
  ) {
    return [{ insertId: 0, affectedRows: affectedRows as number }, []];
  }
  return [rows, []];
}

function isInsertWithReturning(sql: string): boolean {
  const u = sql.trim().toUpperCase();
  return u.startsWith('INSERT') && u.includes('RETURNING');
}

export interface PoolConnection {
  query(
    sql: string,
    params?: Record<string, unknown> | unknown[]
  ): Promise<[unknown[] | { insertId: number; affectedRows: number }, unknown[]]>;
  beginTransaction(): Promise<void>;
  commit(): Promise<void>;
  rollback(): Promise<void>;
  release(): void;
}

async function runQuery(
  client: pg.PoolClient,
  sql: string,
  params?: Record<string, unknown> | unknown[]
): Promise<[unknown[] | { insertId: number; affectedRows: number }, unknown[]]> {
  const { sql: pgSql, values } = params
    ? namedToPositional(sql, params)
    : { sql, values: [] };
  const result = await client.query(pgSql, values);
  const isReturning = isInsertWithReturning(sql);
  return wrapResult(result, isReturning);
}

export function getPool(): {
  query(
    sql: string,
    params?: Record<string, unknown> | unknown[]
  ): Promise<[unknown[] | { insertId: number; affectedRows: number }, unknown[]]>;
  getConnection(): Promise<PoolConnection>;
} {
  if (!pool) {
    pool = new Pool({
      host: process.env.DB_HOST || '127.0.0.1',
      port: Number(process.env.DB_PORT || 5432),
      user: process.env.DB_USER,
      password: process.env.DB_PASS,
      database: process.env.DB_NAME,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    });
  }

  return {
    async query(
      sql: string,
      params?: Record<string, unknown> | unknown[]
    ): Promise<[unknown[] | { insertId: number; affectedRows: number }, unknown[]]> {
      const { sql: pgSql, values } = params
        ? namedToPositional(sql, params)
        : { sql, values: [] };
      const result = await pool!.query(pgSql, values);
      const isReturning = isInsertWithReturning(sql);
      return wrapResult(result, isReturning);
    },

    async getConnection(): Promise<PoolConnection> {
      const client = await pool!.connect();
      return {
        query: (sql: string, params?: Record<string, unknown> | unknown[]) =>
          runQuery(client, sql, params),
        beginTransaction: async () => {
          await client.query('BEGIN');
        },
        commit: async () => {
          await client.query('COMMIT');
        },
        rollback: async () => {
          await client.query('ROLLBACK');
        },
        release: () => client.release(),
      };
    },
  };
}

export async function pingDb(): Promise<boolean> {
  const p = getPool();
  const [rows] = await p.query('SELECT 1 AS ok');
  const row = Array.isArray(rows) ? (rows as { ok: number }[])[0] : undefined;
  return row?.ok === 1;
}
