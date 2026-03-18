/**
 * API pública do site do provedor: dados para personalização (nome, contato, etc.)
 * Usa o tenant resolvido na requisição (standalone = tenant 1, ou por slug/path).
 */
import { Request, Response, Router } from 'express';
import { getPool } from '../db.js';

export const siteConfigRouter = Router();

function isTableNotFoundError(e: unknown): boolean {
  const err = e as { code?: string; message?: string };
  return err?.code === '42P01' || (typeof err?.message === 'string' && err.message.includes('does not exist'));
}

siteConfigRouter.get('/config', async (req: Request, res: Response): Promise<void> => {
  const tenant = req.tenant ?? null;
  if (!tenant) {
    res.json({
      ok: true,
      name: null,
      fantasyName: null,
      shortName: null,
      phone: null,
      whatsapp: null,
      email: null,
      website: null,
      colorPrimary: null,
      colorAccent: null,
      logoSite: null,
    });
    return;
  }

  try {
    const pool = getPool();
    const [rows] = await pool.query(
      `SELECT fantasy_name, legal_name, short_name, phone, whatsapp, email, website,
              color_primary, color_accent, logo_site
       FROM provider_settings
       WHERE tenant_id = :tid
       LIMIT 1`,
      { tid: tenant.id }
    );
    const list = Array.isArray(rows) ? rows : [];
    const row = list.length ? (list[0] as Record<string, unknown>) : null;

    const name = tenant.name ?? null;
    const fantasyName = (row?.fantasy_name as string) ?? name;
    const shortName = (row?.short_name as string) ?? fantasyName ?? name;

    res.json({
      ok: true,
      name: name ?? null,
      fantasyName: fantasyName ?? null,
      shortName: shortName ?? null,
      phone: (row?.phone as string) ?? null,
      whatsapp: (row?.whatsapp as string) ?? null,
      email: (row?.email as string) ?? null,
      website: (row?.website as string) ?? null,
      colorPrimary: (row?.color_primary as string) ?? null,
      colorAccent: (row?.color_accent as string) ?? null,
      logoSite: (row?.logo_site as string) ?? null,
    });
  } catch (e) {
    if (isTableNotFoundError(e)) {
      res.json({
        ok: true,
        name: tenant.name ?? null,
        fantasyName: tenant.name ?? null,
        shortName: tenant.name ?? null,
        phone: null,
        whatsapp: null,
        email: null,
        website: null,
        colorPrimary: null,
        colorAccent: null,
        logoSite: null,
      });
      return;
    }
    throw e;
  }
});
