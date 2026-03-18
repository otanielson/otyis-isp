/**
 * Sincroniza tenant_nas (portal) com a tabela nas (FreeRADIUS).
 * Ao criar/editar/remover um NAS no portal, o FreeRADIUS passa a autorizar esse equipamento.
 */
type PoolLike = {
  query(sql: string, params?: Record<string, unknown>): Promise<[unknown, unknown[]]>;
};

function isTableNotFound(e: unknown): boolean {
  const err = e as { code?: string };
  return err?.code === '42P01' || err?.code === 'ER_NO_SUCH_TABLE';
}

/** Obtém o secret a usar para um NAS: nas_secret > tenant_radius_config.nas_default_secret > RADIUS_SECRET > 'radius_secret'. */
async function getNasSecret(
  pool: PoolLike,
  tenantId: number,
  nasSecret: string | null | undefined
): Promise<string> {
  if (nasSecret != null && String(nasSecret).trim() !== '') return String(nasSecret).trim();
  try {
    const [rows] = await pool.query(
      'SELECT nas_default_secret FROM tenant_radius_config WHERE tenant_id = :tid LIMIT 1',
      { tid: tenantId }
    );
    const list = Array.isArray(rows) ? rows : [];
    const r = list[0] as { nas_default_secret?: string | null } | undefined;
    if (r?.nas_default_secret != null && String(r.nas_default_secret).trim() !== '') return String(r.nas_default_secret).trim();
  } catch {
    /* tenant_radius_config ou coluna pode não existir */
  }
  const env = process.env.RADIUS_SECRET;
  if (env && String(env).trim() !== '') return String(env).trim();
  return 'radius_secret';
}

/**
 * Sincroniza um NAS do tenant para a tabela nas (FreeRADIUS).
 * Deve ser chamado após INSERT ou UPDATE em tenant_nas.
 */
export async function syncNasToRadius(
  pool: PoolLike,
  tenantId: number,
  row: { nas_ip: string; name: string; description?: string | null; nas_secret?: string | null }
): Promise<{ ok: boolean; message?: string }> {
  const nasname = String(row.nas_ip).trim();
  const shortname = String(row.name || row.nas_ip).trim() || nasname;
  const description = row.description != null && String(row.description).trim() !== '' ? String(row.description).trim() : null;
  if (!nasname) return { ok: false, message: 'nas_ip é obrigatório' };

  try {
    const secret = await getNasSecret(pool, tenantId, row.nas_secret);

    const [existing] = await pool.query('SELECT id FROM nas WHERE nasname = :nasname LIMIT 1', { nasname });
    const has = Array.isArray(existing) && existing.length > 0;

    if (has) {
      await pool.query(
        `UPDATE nas SET shortname = :shortname, secret = :secret, description = :description WHERE nasname = :nasname`,
        { shortname, secret, description, nasname }
      );
    } else {
      await pool.query(
        `INSERT INTO nas (nasname, shortname, type, secret, description) VALUES (:nasname, :shortname, 'other', :secret, :description)`,
        { nasname, shortname, secret, description: description ?? '' }
      );
    }
    return { ok: true };
  } catch (e) {
    if (isTableNotFound(e)) return { ok: false, message: 'Tabela nas não existe (FreeRADIUS schema)' };
    throw e;
  }
}

/**
 * Remove um NAS da tabela nas (FreeRADIUS) pelo IP.
 * Deve ser chamado após DELETE em tenant_nas (passe o nas_ip antes de deletar).
 */
export async function removeNasFromRadius(
  pool: PoolLike,
  nasIp: string
): Promise<{ ok: boolean; message?: string }> {
  const nasname = String(nasIp).trim();
  if (!nasname) return { ok: true };

  try {
    await pool.query('DELETE FROM nas WHERE nasname = :nasname', { nasname });
    return { ok: true };
  } catch (e) {
    if (isTableNotFound(e)) return { ok: true };
    throw e;
  }
}

/**
 * Sincroniza todos os NAS ativos do tenant para a tabela nas.
 * Útil para rodar após deploy ou para corrigir estado.
 */
export async function syncAllTenantNasToRadius(pool: PoolLike, tenantId: number): Promise<{ ok: boolean; synced: number; message?: string }> {
  let rows: { nas_ip: string; name: string; description?: string | null; nas_secret?: string | null }[] = [];
  try {
    const [r] = await pool.query(
      'SELECT nas_ip, name, description, nas_secret FROM tenant_nas WHERE tenant_id = :tid AND is_active = true',
      { tid: tenantId }
    );
    rows = Array.isArray(r) ? (r as typeof rows) : [];
  } catch (e) {
    if (isTableNotFound(e)) return { ok: false, synced: 0, message: 'Tabela tenant_nas não existe' };
    throw e;
  }

  let synced = 0;
  for (const row of rows) {
    const result = await syncNasToRadius(pool, tenantId, row);
    if (result.ok) synced++;
  }
  return { ok: true, synced };
}
