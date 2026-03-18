import { Router, type Request, type Response } from 'express';
import { getPool } from '../db.js';

export const plansRouter = Router();

const handler = async (req: Request, res: Response) => {
  const pool = getPool();
  const tenantId = req.tenant?.id;

  const planCols = 'id, code, speed_display, unit, tagline, features_json, badge, sort_order';
  const planColsWithPrice = planCols + ', COALESCE(price, 99.90) AS price';
  let list: unknown[] = [];
  if (tenantId) {
    try {
      const [rows] = await pool.query(
        `SELECT ${planColsWithPrice}
         FROM plans
         WHERE active = true AND tenant_id = ?
         ORDER BY sort_order ASC, id ASC`,
        [tenantId]
      );
      list = Array.isArray(rows) ? rows : [];
    } catch {
      try {
        const [rows] = await pool.query(
          `SELECT ${planCols}
           FROM plans
           WHERE active = true AND tenant_id = ?
           ORDER BY sort_order ASC, id ASC`,
          [tenantId]
        );
        list = Array.isArray(rows) ? rows : [];
      } catch {
        /* plans.tenant_id ou price podem não existir em DB antigo */
      }
    }
  }
  if (list.length === 0) {
    try {
      const [rows] = await pool.query(
        `SELECT ${planColsWithPrice}
         FROM plans
         WHERE active = true
         ORDER BY sort_order ASC, id ASC`
      );
      list = Array.isArray(rows) ? rows : [];
    } catch {
      const [rows] = await pool.query(
        `SELECT ${planCols}
         FROM plans
         WHERE active = true
         ORDER BY sort_order ASC, id ASC`
      );
      list = Array.isArray(rows) ? rows : [];
    }
  }
  // Garantir price numérico para exibição (quando coluna não existe vem undefined)
  list = list.map((p: unknown) => {
    const row = p as Record<string, unknown>;
    if (row.price == null && (row as { price?: number }).price !== 0) row.price = 99.9;
    return row;
  });
  return res.json({ ok: true, plans: list });
};
plansRouter.get('/', handler);
plansRouter.get('', handler);
