/**
 * Cliente CoA/Disconnect para FreeRADIUS via radclient.
 * Usado para derrubar sessão ou atualizar perfil (velocidade) sem desconectar.
 */
import { spawn } from 'child_process';

type PoolLike = {
  query(sql: string, params?: Record<string, unknown>): Promise<[unknown, unknown[]]>;
};

export interface RadclientResult {
  ok: boolean;
  message?: string;
}

function normalizeNasIp(value: string | null | undefined): string {
  return String(value || '').trim().split('/')[0].trim();
}

/** Obtém sessão ativa do usuário em radacct (acctsessionid, nasipaddress). */
export async function getActiveSession(
  pool: PoolLike,
  username: string
): Promise<{ acctsessionid: string; nasipaddress: string } | null> {
  const [rows] = await pool.query(
    `SELECT acctsessionid, regexp_replace(nasipaddress::text, '/.*$', '') AS nasipaddress
     FROM radacct WHERE username = :username AND acctstoptime IS NULL LIMIT 1`,
    { username: String(username).trim() }
  );
  const list = Array.isArray(rows) ? rows : [];
  const row = list[0] as { acctsessionid?: string; nasipaddress?: string } | undefined;
  if (!row?.acctsessionid || !row?.nasipaddress) return null;
  return { acctsessionid: row.acctsessionid, nasipaddress: normalizeNasIp(row.nasipaddress) };
}

function getCoaConfig(): { host: string; port: number; secret: string } | null {
  const host = process.env.RADIUS_COA_HOST || process.env.RADIUS_HOST;
  const port = Number(process.env.RADIUS_COA_PORT || process.env.RADIUS_COA_PORT_DEFAULT || '3799');
  const secret = process.env.RADIUS_SECRET;
  if (!host || !secret) return null;
  return { host, port, secret };
}

/** Envia Disconnect-Request ao FreeRADIUS (radclient). */
export function sendDisconnectRequest(attrs: string): Promise<RadclientResult> {
  const cfg = getCoaConfig();
  if (!cfg) return Promise.resolve({ ok: false, message: 'CoA não configurado. Defina RADIUS_COA_HOST e RADIUS_SECRET.' });

  return new Promise((resolve) => {
    const child = spawn('radclient', ['-x', `${cfg.host}:${cfg.port}`, 'disconnect', cfg.secret], {
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: process.platform === 'win32',
    });
    let stderr = '';
    child.stderr?.on('data', (d) => { stderr += d.toString(); });
    child.stdin?.end(attrs, () => {});
    const timeout = setTimeout(() => {
      try { child.kill('SIGKILL'); } catch { /* ignore */ }
      resolve({ ok: false, message: 'Timeout ao enviar Disconnect' });
    }, 8000);
    child.on('close', (code) => {
      clearTimeout(timeout);
      if (code === 0) resolve({ ok: true });
      else resolve({ ok: false, message: stderr?.trim() || 'radclient disconnect falhou.' });
    });
    child.on('error', (err) => {
      clearTimeout(timeout);
      resolve({ ok: false, message: err?.message || 'radclient não encontrado. Instale freeradius-utils.' });
    });
  });
}

/** Envia CoA-Request ao FreeRADIUS (radclient) com atributos (ex.: Mikrotik-Rate-Limit). */
export function sendCoaRequest(attrs: string): Promise<RadclientResult> {
  const cfg = getCoaConfig();
  if (!cfg) return Promise.resolve({ ok: false, message: 'CoA não configurado. Defina RADIUS_COA_HOST e RADIUS_SECRET.' });

  return new Promise((resolve) => {
    const child = spawn('radclient', ['-x', `${cfg.host}:${cfg.port}`, 'coa', cfg.secret], {
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: process.platform === 'win32',
    });
    let stderr = '';
    child.stderr?.on('data', (d) => { stderr += d.toString(); });
    child.stdin?.end(attrs, () => {});
    const timeout = setTimeout(() => {
      try { child.kill('SIGKILL'); } catch { /* ignore */ }
      resolve({ ok: false, message: 'Timeout ao enviar CoA' });
    }, 8000);
    child.on('close', (code) => {
      clearTimeout(timeout);
      if (code === 0) resolve({ ok: true });
      else resolve({ ok: false, message: stderr?.trim() || 'radclient coa falhou.' });
    });
    child.on('error', (err) => {
      clearTimeout(timeout);
      resolve({ ok: false, message: err?.message || 'radclient não encontrado.' });
    });
  });
}

/** Derruba sessão do usuário (busca sessão em radacct e envia Disconnect). */
export async function disconnectUser(pool: PoolLike, username: string): Promise<RadclientResult> {
  const session = await getActiveSession(pool, username);
  if (!session) return { ok: false, message: 'Nenhuma sessão ativa para este usuário' };
  const attrs = `User-Name=${username},Acct-Session-Id=${session.acctsessionid},NAS-IP-Address=${session.nasipaddress}`;
  return sendDisconnectRequest(attrs);
}

/** Atualiza perfil da sessão (ex.: velocidade) via CoA. */
export async function coaUpdateRate(pool: PoolLike, username: string, rate: string): Promise<RadclientResult> {
  const session = await getActiveSession(pool, username);
  if (!session) return { ok: false, message: 'Nenhuma sessão ativa para este usuário' };
  const attrs = `User-Name=${username},Acct-Session-Id=${session.acctsessionid},NAS-IP-Address=${session.nasipaddress},Mikrotik-Rate-Limit=${rate}`;
  return sendCoaRequest(attrs);
}
