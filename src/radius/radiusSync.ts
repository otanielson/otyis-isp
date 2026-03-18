/**
 * Sincronização portal → FreeRADIUS (radcheck, radusergroup, radgroupreply).
 * Usado ao criar/editar instalações e planos.
 */
type PoolLike = Awaited<ReturnType<typeof import('../db.js').getPool>>;

/** Garante que o grupo "suspenso" existe em radgroupreply. */
export async function ensureSuspensoGroup(pool: PoolLike): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO radgroupreply (groupname, attribute, op, value)
       SELECT 'suspenso', 'Mikrotik-Rate-Limit', '=', '1k/1k'
       WHERE NOT EXISTS (SELECT 1 FROM radgroupreply WHERE groupname = 'suspenso' AND attribute = 'Mikrotik-Rate-Limit')`
    );
    await pool.query(
      `INSERT INTO radgroupreply (groupname, attribute, op, value)
       SELECT 'suspenso', 'Simultaneous-Use', '=', '1'
       WHERE NOT EXISTS (SELECT 1 FROM radgroupreply WHERE groupname = 'suspenso' AND attribute = 'Simultaneous-Use')`
    );
  } catch (e) {
    if (isRadiusTableError(e)) return;
    throw e;
  }
}

/** Garante que o grupo "reduzido_10m" existe (franquia excedida). */
export async function ensureReduzidoGroup(pool: PoolLike): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO radgroupreply (groupname, attribute, op, value)
       SELECT 'reduzido_10m', 'Mikrotik-Rate-Limit', '=', '10M/10M'
       WHERE NOT EXISTS (SELECT 1 FROM radgroupreply WHERE groupname = 'reduzido_10m' AND attribute = 'Mikrotik-Rate-Limit')`
    );
    await pool.query(
      `INSERT INTO radgroupreply (groupname, attribute, op, value)
       SELECT 'reduzido_10m', 'Simultaneous-Use', '=', '1'
       WHERE NOT EXISTS (SELECT 1 FROM radgroupreply WHERE groupname = 'reduzido_10m' AND attribute = 'Simultaneous-Use')`
    );
  } catch (e) {
    if (isRadiusTableError(e)) return;
    throw e;
  }
}

const RATE_ATTRS = ['Mikrotik-Rate-Limit', 'WISPr-Bandwidth'] as const;
const SIMULTANEOUS_USE = 'Simultaneous-Use';

export interface SyncPlanOptions {
  framedPool?: string | null;
  vlanId?: number | null;
}

/** Sincroniza plano em radgroupreply: velocidade, Framed-Pool, VLAN, Simultaneous-Use. */
export async function syncPlanToRadgroupreply(
  pool: PoolLike,
  planCode: string,
  speedDownloadMbps: number | null,
  speedUploadMbps: number | null,
  options?: SyncPlanOptions
): Promise<void> {
  if (!planCode || !planCode.trim()) return;
  const groupname = String(planCode).trim();
  const down = speedDownloadMbps != null && Number.isFinite(speedDownloadMbps) && speedDownloadMbps > 0
    ? (speedDownloadMbps >= 1000 ? `${speedDownloadMbps}M` : `${Math.round(speedDownloadMbps)}M`)
    : null;
  const up = speedUploadMbps != null && Number.isFinite(speedUploadMbps) && speedUploadMbps > 0
    ? (speedUploadMbps >= 1000 ? `${speedUploadMbps}M` : `${Math.round(speedUploadMbps)}M`)
    : null;
  const rateValue = down && up ? `${down}/${up}` : '64k/64k';
  try {
    for (const attr of RATE_ATTRS) {
      await pool.query(
        `DELETE FROM radgroupreply WHERE groupname = :groupname AND attribute = :attr`,
        { groupname, attr }
      );
      await pool.query(
        `INSERT INTO radgroupreply (groupname, attribute, op, value) VALUES (:groupname, :attr, '=', :value)`,
        { groupname, attr, value: rateValue }
      );
    }
    await pool.query(
      `DELETE FROM radgroupreply WHERE groupname = :groupname AND attribute = :attr`,
      { groupname, attr: SIMULTANEOUS_USE }
    );
    await pool.query(
      `INSERT INTO radgroupreply (groupname, attribute, op, value) VALUES (:groupname, :attr, '=', '1')`,
      { groupname, attr: SIMULTANEOUS_USE }
    );
    if (options?.framedPool != null && String(options.framedPool).trim() !== '') {
      const fp = String(options.framedPool).trim();
      await pool.query(
        `DELETE FROM radgroupreply WHERE groupname = :groupname AND attribute = 'Framed-Pool'`
      , { groupname });
      await pool.query(
        `INSERT INTO radgroupreply (groupname, attribute, op, value) VALUES (:groupname, 'Framed-Pool', '=', :value)`,
        { groupname, value: fp }
      );
    } else {
      await pool.query(
        `DELETE FROM radgroupreply WHERE groupname = :groupname AND attribute = 'Framed-Pool'`,
        { groupname }
      );
    }
    if (options?.vlanId != null && Number.isFinite(options.vlanId)) {
      const vlan = String(options.vlanId);
      await pool.query(
        `DELETE FROM radgroupreply WHERE groupname = :groupname AND attribute = 'Tunnel-Private-Group-Id'`,
        { groupname }
      );
      await pool.query(
        `INSERT INTO radgroupreply (groupname, attribute, op, value) VALUES (:groupname, 'Tunnel-Private-Group-Id', '=', :value)`,
        { groupname, value: vlan }
      );
    } else {
      await pool.query(
        `DELETE FROM radgroupreply WHERE groupname = :groupname AND attribute = 'Tunnel-Private-Group-Id'`,
        { groupname }
      );
    }
  } catch (e) {
    if (isRadiusTableError(e)) return;
    throw e;
  }
}

/** Normaliza MAC para formato AA:BB:CC:DD:EE:FF (RADIUS Calling-Station-Id). */
export function normalizeMac(mac: string | null | undefined): string | null {
  if (mac == null || typeof mac !== 'string') return null;
  const s = mac.replace(/[\s\-:]/g, '').toUpperCase();
  if (s.length !== 12 || !/^[0-9A-F]+$/.test(s)) return null;
  return `${s.slice(0, 2)}:${s.slice(2, 4)}:${s.slice(4, 6)}:${s.slice(6, 8)}:${s.slice(8, 10)}:${s.slice(10, 12)}`;
}

export interface SyncInstallationOptions {
  macAuthorized?: string | null;
}

/**
 * Sincroniza uma instalação com o FreeRADIUS:
 * - radcheck: Cleartext-Password, Calling-Station-Id (MAC autorizado)
 * - radusergroup: grupo = planCode (ACTIVE) ou 'suspenso' (SUSPENDED/CANCELLED)
 */
export async function syncInstallationToRadius(
  pool: PoolLike,
  pppoeUser: string | null,
  pppoePassword: string | null,
  planCode: string | null,
  status: string,
  options?: SyncInstallationOptions
): Promise<void> {
  const username = pppoeUser ? String(pppoeUser).trim() : null;
  if (!username) return;

  const groupname = (status === 'ACTIVE' && planCode && String(planCode).trim())
    ? String(planCode).trim()
    : 'suspenso';

  try {
    await ensureSuspensoGroup(pool);

    // radusergroup: sempre atualizar (grupo do plano ou suspenso)
    await pool.query('DELETE FROM radusergroup WHERE username = :username', { username });
    await pool.query(
      'INSERT INTO radusergroup (username, groupname, priority) VALUES (:username, :groupname, 1)',
      { username, groupname }
    );

    // radcheck: senha (permite autenticação PAP)
    if (pppoePassword != null && String(pppoePassword).trim() !== '') {
      const value = String(pppoePassword).trim();
      await pool.query(
        'DELETE FROM radcheck WHERE username = :username AND attribute = \'Cleartext-Password\'',
        { username }
      );
      await pool.query(
        `INSERT INTO radcheck (username, attribute, op, value) VALUES (:username, 'Cleartext-Password', ':=', :value)`,
        { username, value }
      );
    } else {
      await pool.query(
        'DELETE FROM radcheck WHERE username = :username AND attribute = \'Cleartext-Password\'',
        { username }
      );
    }

    // radcheck: MAC autorizado (Calling-Station-Id) — controle por equipamento
    const mac = normalizeMac(options?.macAuthorized);
    await pool.query(
      'DELETE FROM radcheck WHERE username = :username AND attribute = \'Calling-Station-Id\'',
      { username }
    );
    if (mac) {
      await pool.query(
        `INSERT INTO radcheck (username, attribute, op, value) VALUES (:username, 'Calling-Station-Id', ':=', :value)`,
        { username, value: mac }
      );
    }
  } catch (e) {
    if (isRadiusTableError(e)) return;
    throw e;
  }
}

/** Remove usuário do RADIUS (radcheck + radusergroup). Útil ao cancelar instalação. */
export async function removeUserFromRadius(pool: PoolLike, pppoeUser: string | null): Promise<void> {
  const username = pppoeUser ? String(pppoeUser).trim() : null;
  if (!username) return;
  try {
    await pool.query('DELETE FROM radusergroup WHERE username = :username', { username });
    await pool.query('DELETE FROM radcheck WHERE username = :username', { username });
  } catch (e) {
    if (isRadiusTableError(e)) return;
    throw e;
  }
}

function isRadiusTableError(e: unknown): boolean {
  const err = e as { code?: string };
  return err?.code === '42P01' || err?.code === 'ER_NO_SUCH_TABLE' || err?.code === '42P07';
}
