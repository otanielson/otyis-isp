/**
 * API Estoque — Cadastros, Consultas, Movimentações, Viagens.
 * Montado em /api/portal/estoque (requer requireAuth).
 */
import { Router, type Request, type Response } from 'express';
import { getPool } from '../db.js';
import { requireAuth } from '../middlewares/auth.js';

export const estoqueRouter = Router();
estoqueRouter.use(requireAuth);

function tenantId(req: Request): number {
  return req.user!.tenantId;
}

/** PostgreSQL: relation does not exist. MySQL: ER_NO_SUCH_TABLE. */
function isTableNotFoundError(e: unknown): boolean {
  const err = e as { code?: string; message?: string };
  return err?.code === '42P01' || err?.code === 'ER_NO_SUCH_TABLE' ||
    (typeof err?.message === 'string' && /relation.*does not exist|Table.*doesn't exist/i.test(err.message));
}

/** PostgreSQL: column does not exist (42P03 undefined_column or 42703). */
function isColumnNotFoundError(e: unknown): boolean {
  const err = e as { code?: string; message?: string };
  return err?.code === '42703' || err?.code === '42P03' ||
    (typeof err?.message === 'string' && /column.*does not exist/i.test(err.message));
}

function asyncHandler(
  fn: (req: Request, res: Response) => Promise<Response | void>
): (req: Request, res: Response, _next: (err?: unknown) => void) => void {
  return (req: Request, res: Response, _next: (err?: unknown) => void) => {
    Promise.resolve(fn(req, res)).catch((err) => {
      if (isTableNotFoundError(err)) {
        console.warn('[Estoque API] Tabelas não encontradas. Execute: sql/estoque.pg.sql', err);
        if (req.method === 'GET') {
          return res.status(200).json({ ok: true, list: [] });
        }
        return res.status(503).json({
          message: 'Módulo Estoque não configurado. Execute a migração sql/estoque.pg.sql no banco de dados.',
        });
      }
      console.error('[Estoque API]', err);
      return res
        .status(500)
        .json({ message: err instanceof Error ? err.message : 'Erro interno' });
    });
  };
}

// ---- Dashboard (KPIs em uma chamada) ----
estoqueRouter.get(
  '/dashboard',
  asyncHandler(async (req: Request, res: Response): Promise<Response> => {
    const tid = tenantId(req);
    const pool = getPool();
    const zeros = { ok: true as const, produtos: 0, categorias: 0, locais: 0, movimentacoes: 0 };
    try {
      const [resProd, resCat, resLoc, resMov] = await Promise.all([
        pool.query('SELECT COUNT(*) AS c FROM estoque_produtos WHERE tenant_id = :tid', { tid }),
        pool.query('SELECT COUNT(*) AS c FROM estoque_categorias WHERE tenant_id = :tid', { tid }),
        pool.query('SELECT COUNT(*) AS c FROM estoque_locais WHERE tenant_id = :tid', { tid }),
        pool.query('SELECT COUNT(*) AS c FROM estoque_movimentacoes WHERE tenant_id = :tid', { tid }),
      ]);
      const getCount = (tuple: [unknown[], unknown]): number => {
        const rows = Array.isArray(tuple[0]) ? (tuple[0] as { c?: string | number }[]) : [];
        const row = rows[0];
        return row?.c != null ? Number(row.c) : 0;
      };
      return res.json({
        ok: true,
        produtos: getCount(resProd as [unknown[], unknown]),
        categorias: getCount(resCat as [unknown[], unknown]),
        locais: getCount(resLoc as [unknown[], unknown]),
        movimentacoes: getCount(resMov as [unknown[], unknown]),
      });
    } catch (err) {
      if (isTableNotFoundError(err)) return res.json(zeros);
      throw err;
    }
  })
);

// ---- Categorias ----
estoqueRouter.get(
  '/categorias',
  asyncHandler(async (req: Request, res: Response): Promise<Response> => {
    const tid = tenantId(req);
    const pool = getPool();
    const [rows] = await pool.query(
      'SELECT id, nome, ativo, created_at FROM estoque_categorias WHERE tenant_id = :tid ORDER BY nome',
      { tid }
    );
    const list = Array.isArray(rows) ? rows : [];
    return res.json({ ok: true, list });
  })
);

estoqueRouter.get(
  '/categorias/:id',
  asyncHandler(async (req: Request, res: Response): Promise<Response> => {
    const tid = tenantId(req);
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ message: 'ID inválido' });
    const pool = getPool();
    const [rows] = await pool.query(
      'SELECT id, nome, ativo, created_at FROM estoque_categorias WHERE id = :id AND tenant_id = :tid LIMIT 1',
      { id, tid }
    );
    const list = Array.isArray(rows) ? rows : [];
    if (!list.length) return res.status(404).json({ message: 'Categoria não encontrada' });
    return res.json(list[0]);
  })
);

estoqueRouter.post(
  '/categorias',
  asyncHandler(async (req: Request, res: Response): Promise<Response> => {
    const tid = tenantId(req);
    const body = req.body || {};
    const nome = String(body.nome || '').trim();
    if (!nome) return res.status(400).json({ message: 'Nome é obrigatório' });
    const pool = getPool();
    const [r] = await pool.query(
      'INSERT INTO estoque_categorias (tenant_id, nome, ativo) VALUES (:tid, :nome, COALESCE(:ativo, TRUE)) RETURNING id',
      { tid, nome, ativo: body.ativo !== false }
    );
    const insertId = (r as { insertId?: number })?.insertId;
    return res.status(201).json({ ok: true, id: insertId });
  })
);

estoqueRouter.put(
  '/categorias/:id',
  asyncHandler(async (req: Request, res: Response): Promise<Response> => {
    const tid = tenantId(req);
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ message: 'ID inválido' });
    const body = req.body || {};
    const nome = body.nome != null ? String(body.nome).trim() : undefined;
    const ativo = body.ativo !== undefined ? Boolean(body.ativo) : undefined;
    if (!nome && ativo === undefined)
      return res.status(400).json({ message: 'Nenhum campo para atualizar' });
    const pool = getPool();
    const updates: string[] = [];
    const params: Record<string, unknown> = { id, tid };
    if (nome !== undefined) {
      updates.push('nome = :nome');
      params.nome = nome;
    }
    if (ativo !== undefined) {
      updates.push('ativo = :ativo');
      params.ativo = ativo;
    }
    const [result] = await pool.query(
      `UPDATE estoque_categorias SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = :id AND tenant_id = :tid`,
      params
    );
    if ((result as { affectedRows?: number })?.affectedRows === 0)
      return res.status(404).json({ message: 'Categoria não encontrada' });
    return res.json({ ok: true });
  })
);

estoqueRouter.delete(
  '/categorias/:id',
  asyncHandler(async (req: Request, res: Response): Promise<Response> => {
    const tid = tenantId(req);
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ message: 'ID inválido' });
    const pool = getPool();
    const [result] = await pool.query(
      'DELETE FROM estoque_categorias WHERE id = :id AND tenant_id = :tid',
      { id, tid }
    );
    if ((result as { affectedRows?: number })?.affectedRows === 0)
      return res.status(404).json({ message: 'Categoria não encontrada' });
    return res.json({ ok: true });
  })
);

// ---- Fabricantes ----
function crudFabricantes() {
  const pool = getPool();
  return {
    list: (tid: number) =>
      pool.query(
        'SELECT id, nome, ativo, created_at FROM estoque_fabricantes WHERE tenant_id = :tid ORDER BY nome',
        { tid }
      ),
    get: (tid: number, id: number) =>
      pool.query(
        'SELECT id, nome, ativo, created_at FROM estoque_fabricantes WHERE id = :id AND tenant_id = :tid LIMIT 1',
        { id, tid }
      ),
    post: (tid: number, body: { nome?: string; ativo?: boolean }) =>
      pool.query(
        'INSERT INTO estoque_fabricantes (tenant_id, nome, ativo) VALUES (:tid, :nome, COALESCE(:ativo, TRUE)) RETURNING id',
        { tid, nome: String(body.nome || '').trim(), ativo: body.ativo !== false }
      ),
    put: (tid: number, id: number, body: { nome?: string; ativo?: boolean }) => {
      const updates: string[] = [];
      const params: Record<string, unknown> = { id, tid };
      if (body.nome !== undefined) {
        updates.push('nome = :nome');
        params.nome = String(body.nome).trim();
      }
      if (body.ativo !== undefined) {
        updates.push('ativo = :ativo');
        params.ativo = body.ativo;
      }
      if (!updates.length) return Promise.resolve([{ affectedRows: 0 }]);
      return pool.query(
        `UPDATE estoque_fabricantes SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = :id AND tenant_id = :tid`,
        params
      );
    },
    delete: (tid: number, id: number) =>
      pool.query(
        'DELETE FROM estoque_fabricantes WHERE id = :id AND tenant_id = :tid',
        { id, tid }
      ),
  };
}

estoqueRouter.get(
  '/fabricantes',
  asyncHandler(async (req: Request, res: Response): Promise<Response> => {
    const [rows] = await crudFabricantes().list(tenantId(req));
    return res.json({ ok: true, list: Array.isArray(rows) ? rows : [] });
  })
);
estoqueRouter.get(
  '/fabricantes/:id',
  asyncHandler(async (req: Request, res: Response): Promise<Response> => {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ message: 'ID inválido' });
    const [rows] = await crudFabricantes().get(tenantId(req), id);
    const list = Array.isArray(rows) ? rows : [];
    if (!list.length) return res.status(404).json({ message: 'Fabricante não encontrado' });
    return res.json(list[0]);
  })
);
estoqueRouter.post(
  '/fabricantes',
  asyncHandler(async (req: Request, res: Response): Promise<Response> => {
    const body = req.body || {};
    const nome = String(body.nome || '').trim();
    if (!nome) return res.status(400).json({ message: 'Nome é obrigatório' });
    const [r] = await crudFabricantes().post(tenantId(req), body);
    const insertId = (r as { insertId?: number })?.insertId;
    return res.status(201).json({ ok: true, id: insertId });
  })
);
estoqueRouter.put(
  '/fabricantes/:id',
  asyncHandler(async (req: Request, res: Response): Promise<Response> => {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ message: 'ID inválido' });
    const [result] = await crudFabricantes().put(tenantId(req), id, req.body || {});
    if ((result as { affectedRows?: number })?.affectedRows === 0)
      return res.status(404).json({ message: 'Fabricante não encontrado' });
    return res.json({ ok: true });
  })
);
estoqueRouter.delete(
  '/fabricantes/:id',
  asyncHandler(async (req: Request, res: Response): Promise<Response> => {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ message: 'ID inválido' });
    const [result] = await crudFabricantes().delete(tenantId(req), id);
    if ((result as { affectedRows?: number })?.affectedRows === 0)
      return res.status(404).json({ message: 'Fabricante não encontrado' });
    return res.json({ ok: true });
  })
);

// ---- NCM ----
estoqueRouter.get('/ncm', asyncHandler(async (req: Request, res: Response): Promise<Response> => {
  const tid = tenantId(req);
  const pool = getPool();
  const [rows] = await pool.query(
    'SELECT id, codigo, descricao, created_at FROM estoque_ncm WHERE tenant_id = :tid ORDER BY codigo',
    { tid }
  );
  return res.json({ ok: true, list: Array.isArray(rows) ? rows : [] });
}));
estoqueRouter.post('/ncm', asyncHandler(async (req: Request, res: Response): Promise<Response> => {
  const tid = tenantId(req);
  const body = req.body || {};
  const codigo = String(body.codigo || '').trim();
  const descricao = body.descricao != null ? String(body.descricao).trim() : null;
  if (!codigo) return res.status(400).json({ message: 'Código NCM é obrigatório' });
  const pool = getPool();
  const [r] = await pool.query(
    'INSERT INTO estoque_ncm (tenant_id, codigo, descricao) VALUES (:tid, :codigo, :descricao) RETURNING id',
    { tid, codigo, descricao }
  );
  return res.status(201).json({ ok: true, id: (r as { insertId?: number })?.insertId });
}));
estoqueRouter.put('/ncm/:id', asyncHandler(async (req: Request, res: Response): Promise<Response> => {
  const tid = tenantId(req);
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ message: 'ID inválido' });
  const body = req.body || {};
  const updates: string[] = [];
  const params: Record<string, unknown> = { id, tid };
  if (body.codigo !== undefined) {
    updates.push('codigo = :codigo');
    params.codigo = String(body.codigo).trim();
  }
  if (body.descricao !== undefined) {
    updates.push('descricao = :descricao');
    params.descricao = body.descricao ? String(body.descricao).trim() : null;
  }
  if (!updates.length) return res.status(400).json({ message: 'Nenhum campo para atualizar' });
  const pool = getPool();
  const [result] = await pool.query(
    `UPDATE estoque_ncm SET ${updates.join(', ')} WHERE id = :id AND tenant_id = :tid`,
    params
  );
  if ((result as { affectedRows?: number })?.affectedRows === 0)
    return res.status(404).json({ message: 'NCM não encontrado' });
  return res.json({ ok: true });
}));
estoqueRouter.delete('/ncm/:id', asyncHandler(async (req: Request, res: Response): Promise<Response> => {
  const tid = tenantId(req);
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ message: 'ID inválido' });
  const pool = getPool();
  const [result] = await pool.query(
    'DELETE FROM estoque_ncm WHERE id = :id AND tenant_id = :tid',
    { id, tid }
  );
  if ((result as { affectedRows?: number })?.affectedRows === 0)
    return res.status(404).json({ message: 'NCM não encontrado' });
  return res.json({ ok: true });
}));

// ---- Locais ----
estoqueRouter.get('/locais', asyncHandler(async (req: Request, res: Response): Promise<Response> => {
  const tid = tenantId(req);
  const pool = getPool();
  const [rows] = await pool.query(
    'SELECT id, nome, ativo, created_at FROM estoque_locais WHERE tenant_id = :tid ORDER BY nome',
    { tid }
  );
  return res.json({ ok: true, list: Array.isArray(rows) ? rows : [] });
}));
estoqueRouter.post('/locais', asyncHandler(async (req: Request, res: Response): Promise<Response> => {
  const tid = tenantId(req);
  const body = req.body || {};
  const nome = String(body.nome || '').trim();
  if (!nome) return res.status(400).json({ message: 'Nome é obrigatório' });
  const pool = getPool();
  const [r] = await pool.query(
    'INSERT INTO estoque_locais (tenant_id, nome, ativo) VALUES (:tid, :nome, COALESCE(:ativo, TRUE)) RETURNING id',
    { tid, nome, ativo: body.ativo !== false }
  );
  return res.status(201).json({ ok: true, id: (r as { insertId?: number })?.insertId });
}));
estoqueRouter.put('/locais/:id', asyncHandler(async (req: Request, res: Response): Promise<Response> => {
  const tid = tenantId(req);
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ message: 'ID inválido' });
  const body = req.body || {};
  const updates: string[] = [];
  const params: Record<string, unknown> = { id, tid };
  if (body.nome !== undefined) {
    updates.push('nome = :nome');
    params.nome = String(body.nome).trim();
  }
  if (body.ativo !== undefined) {
    updates.push('ativo = :ativo');
    params.ativo = body.ativo;
  }
  if (!updates.length) return res.status(400).json({ message: 'Nenhum campo para atualizar' });
  const pool = getPool();
  const [result] = await pool.query(
    `UPDATE estoque_locais SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = :id AND tenant_id = :tid`,
    params
  );
  if ((result as { affectedRows?: number })?.affectedRows === 0)
    return res.status(404).json({ message: 'Local não encontrado' });
  return res.json({ ok: true });
}));
estoqueRouter.delete('/locais/:id', asyncHandler(async (req: Request, res: Response): Promise<Response> => {
  const tid = tenantId(req);
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ message: 'ID inválido' });
  const pool = getPool();
  const [result] = await pool.query(
    'DELETE FROM estoque_locais WHERE id = :id AND tenant_id = :tid',
    { id, tid }
  );
  if ((result as { affectedRows?: number })?.affectedRows === 0)
    return res.status(404).json({ message: 'Local não encontrado' });
  return res.json({ ok: true });
}));

// ---- Veículos ----
estoqueRouter.get('/veiculos', asyncHandler(async (req: Request, res: Response): Promise<Response> => {
  const tid = tenantId(req);
  const pool = getPool();
  const [rows] = await pool.query(
    'SELECT id, placa, modelo, ativo, created_at FROM estoque_veiculos WHERE tenant_id = :tid ORDER BY placa',
    { tid }
  );
  return res.json({ ok: true, list: Array.isArray(rows) ? rows : [] });
}));
estoqueRouter.post('/veiculos', asyncHandler(async (req: Request, res: Response): Promise<Response> => {
  const tid = tenantId(req);
  const body = req.body || {};
  const placa = String(body.placa || '').trim().toUpperCase();
  if (!placa) return res.status(400).json({ message: 'Placa é obrigatória' });
  const pool = getPool();
  const [r] = await pool.query(
    'INSERT INTO estoque_veiculos (tenant_id, placa, modelo, ativo) VALUES (:tid, :placa, :modelo, COALESCE(:ativo, TRUE)) RETURNING id',
    {
      tid,
      placa,
      modelo: body.modelo ? String(body.modelo).trim() : null,
      ativo: body.ativo !== false,
    }
  );
  return res.status(201).json({ ok: true, id: (r as { insertId?: number })?.insertId });
}));
estoqueRouter.put('/veiculos/:id', asyncHandler(async (req: Request, res: Response): Promise<Response> => {
  const tid = tenantId(req);
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ message: 'ID inválido' });
  const body = req.body || {};
  const updates: string[] = [];
  const params: Record<string, unknown> = { id, tid };
  if (body.placa !== undefined) {
    updates.push('placa = :placa');
    params.placa = String(body.placa).trim().toUpperCase();
  }
  if (body.modelo !== undefined) {
    updates.push('modelo = :modelo');
    params.modelo = body.modelo ? String(body.modelo).trim() : null;
  }
  if (body.ativo !== undefined) {
    updates.push('ativo = :ativo');
    params.ativo = body.ativo;
  }
  if (!updates.length) return res.status(400).json({ message: 'Nenhum campo para atualizar' });
  const pool = getPool();
  const [result] = await pool.query(
    `UPDATE estoque_veiculos SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = :id AND tenant_id = :tid`,
    params
  );
  if ((result as { affectedRows?: number })?.affectedRows === 0)
    return res.status(404).json({ message: 'Veículo não encontrado' });
  return res.json({ ok: true });
}));
estoqueRouter.delete('/veiculos/:id', asyncHandler(async (req: Request, res: Response): Promise<Response> => {
  const tid = tenantId(req);
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ message: 'ID inválido' });
  const pool = getPool();
  const [result] = await pool.query(
    'DELETE FROM estoque_veiculos WHERE id = :id AND tenant_id = :tid',
    { id, tid }
  );
  if ((result as { affectedRows?: number })?.affectedRows === 0)
    return res.status(404).json({ message: 'Veículo não encontrado' });
  return res.json({ ok: true });
}));

// ---- Fornecedores ----
estoqueRouter.get('/fornecedores', asyncHandler(async (req: Request, res: Response):Promise<Response> => {
  const tid = tenantId(req);
  const pool = getPool();
  const [rows] = await pool.query(
    'SELECT id, nome, documento, contato, ativo, created_at FROM estoque_fornecedores WHERE tenant_id = :tid ORDER BY nome',
    { tid }
  );
  return res.json({ ok: true, list: Array.isArray(rows) ? rows : [] });
}));
estoqueRouter.post('/fornecedores', asyncHandler(async (req: Request, res: Response): Promise<Response> => {
  const tid = tenantId(req);
  const body = req.body || {};
  const nome = String(body.nome || '').trim();
  if (!nome) return res.status(400).json({ message: 'Nome é obrigatório' });
  const pool = getPool();
  const [r] = await pool.query(
    `INSERT INTO estoque_fornecedores (tenant_id, nome, documento, contato, ativo)
     VALUES (:tid, :nome, :documento, :contato, COALESCE(:ativo, TRUE)) RETURNING id`,
    {
      tid,
      nome,
      documento: body.documento ? String(body.documento).trim() : null,
      contato: body.contato ? String(body.contato).trim() : null,
      ativo: body.ativo !== false,
    }
  );
  return res.status(201).json({ ok: true, id: (r as { insertId?: number })?.insertId });
}));
estoqueRouter.put('/fornecedores/:id', asyncHandler(async (req: Request, res: Response): Promise<Response> => {
  const tid = tenantId(req);
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ message: 'ID inválido' });
  const body = req.body || {};
  const updates: string[] = [];
  const params: Record<string, unknown> = { id, tid };
  ['nome', 'documento', 'contato', 'ativo'].forEach((f) => {
    if (body[f] !== undefined) {
      updates.push(`${f} = :${f}`);
      params[f] = f === 'ativo' ? body[f] : (body[f] ? String(body[f]).trim() : null);
    }
  });
  if (!updates.length) return res.status(400).json({ message: 'Nenhum campo para atualizar' });
  const pool = getPool();
  const [result] = await pool.query(
    `UPDATE estoque_fornecedores SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = :id AND tenant_id = :tid`,
    params
  );
  if ((result as { affectedRows?: number })?.affectedRows === 0)
    return res.status(404).json({ message: 'Fornecedor não encontrado' });
  return res.json({ ok: true });
}));
estoqueRouter.delete('/fornecedores/:id', asyncHandler(async (req: Request, res: Response): Promise<Response> => {
  const tid = tenantId(req);
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ message: 'ID inválido' });
  const pool = getPool();
  const [result] = await pool.query(
    'DELETE FROM estoque_fornecedores WHERE id = :id AND tenant_id = :tid',
    { id, tid }
  );
  if ((result as { affectedRows?: number })?.affectedRows === 0)
    return res.status(404).json({ message: 'Fornecedor não encontrado' });
  return res.json({ ok: true });
}));

// ---- Produtos (ERP completo; fallback para schema base sem migração ERP) ----
const PRODUTO_BASE_COLS =
  'p.id, p.codigo, p.nome, p.categoria_id, p.fabricante_id, p.ncm_id, p.unidade, p.estoque_minimo, p.ativo, p.created_at, p.updated_at';
const PRODUTO_COLS =
  PRODUTO_BASE_COLS + ',' +
  'p.descricao, p.tipo_produto, p.preco_venda, p.custo, p.margem_lucro, p.permitir_desconto, p.preco_minimo,' +
  'p.controlar_estoque, p.local_estoque_id, p.fornecedor_principal_id,' +
  'p.cfop, p.cst, p.origem_mercadoria, p.codigo_anatel,' +
  'p.codigo_barras, p.modelo, p.marca, p.permitir_numero_serie,' +
  'p.tipo_equipamento, p.compatibilidade, p.usado_comodato, p.permitir_venda, p.vincular_mac, p.vincular_serial_onu,' +
  'p.peso_kg, p.altura_cm, p.largura_cm, p.comprimento_cm,' +
  'p.imagem_url, p.manual_url, p.documentos_url,' +
  'p.produto_padrao_instalacao, p.uso_ordem_servico, p.uso_venda, p.uso_contrato, p.uso_comodato,' +
  'p.permitir_comodato, p.tempo_comodato_meses, p.valor_equipamento_comodato, p.termo_devolucao_obrigatorio,' +
  'p.garantia_meses, p.produto_substituto_id, p.produto_equivalente_id, p.tags, p.observacoes_internas';

function coerceProdutoBody(body: Record<string, unknown>): Record<string, unknown> {
  const num = (v: unknown) => (v != null && v !== '' ? Number(v) : null);
  const numReq = (v: unknown) => (v != null && v !== '' ? Number(v) : 0);
  const str = (v: unknown) => (v != null && v !== '' ? String(v).trim() : null);
  return {
    codigo: str(body.codigo),
    nome: str(body.nome) || undefined,
    descricao: str(body.descricao),
    categoria_id: num(body.categoria_id),
    fabricante_id: num(body.fabricante_id),
    ncm_id: num(body.ncm_id),
    unidade: str(body.unidade) || 'UN',
    estoque_minimo: body.estoque_minimo != null ? numReq(body.estoque_minimo) : undefined,
    ativo: body.ativo,
    tipo_produto: str(body.tipo_produto) || 'EQUIPAMENTO',
    preco_venda: num(body.preco_venda),
    custo: num(body.custo),
    margem_lucro: num(body.margem_lucro),
    permitir_desconto: body.permitir_desconto,
    preco_minimo: num(body.preco_minimo),
    controlar_estoque: body.controlar_estoque,
    local_estoque_id: num(body.local_estoque_id),
    fornecedor_principal_id: num(body.fornecedor_principal_id),
    cfop: str(body.cfop),
    cst: str(body.cst),
    origem_mercadoria: str(body.origem_mercadoria),
    codigo_anatel: str(body.codigo_anatel),
    codigo_barras: str(body.codigo_barras),
    modelo: str(body.modelo),
    marca: str(body.marca),
    permitir_numero_serie: body.permitir_numero_serie,
    tipo_equipamento: str(body.tipo_equipamento),
    compatibilidade: str(body.compatibilidade),
    usado_comodato: body.usado_comodato,
    permitir_venda: body.permitir_venda,
    vincular_mac: body.vincular_mac,
    vincular_serial_onu: body.vincular_serial_onu,
    peso_kg: num(body.peso_kg),
    altura_cm: num(body.altura_cm),
    largura_cm: num(body.largura_cm),
    comprimento_cm: num(body.comprimento_cm),
    imagem_url: str(body.imagem_url),
    manual_url: str(body.manual_url),
    documentos_url: str(body.documentos_url),
    produto_padrao_instalacao: body.produto_padrao_instalacao,
    uso_ordem_servico: body.uso_ordem_servico,
    uso_venda: body.uso_venda,
    uso_contrato: body.uso_contrato,
    uso_comodato: body.uso_comodato,
    permitir_comodato: body.permitir_comodato,
    tempo_comodato_meses: body.tempo_comodato_meses != null ? Number(body.tempo_comodato_meses) : null,
    valor_equipamento_comodato: num(body.valor_equipamento_comodato),
    termo_devolucao_obrigatorio: body.termo_devolucao_obrigatorio,
    garantia_meses: body.garantia_meses != null ? Number(body.garantia_meses) : null,
    produto_substituto_id: num(body.produto_substituto_id),
    produto_equivalente_id: num(body.produto_equivalente_id),
    tags: str(body.tags),
    observacoes_internas: str(body.observacoes_internas),
  };
}

estoqueRouter.get('/produtos', asyncHandler(async (req: Request, res: Response): Promise<Response> => {
  const tid = tenantId(req);
  const pool = getPool();
  const [rows] = await pool.query(
    `SELECT p.id, p.codigo, p.nome, p.unidade, p.estoque_minimo, p.ativo, p.created_at,
      c.nome AS categoria_nome, f.nome AS fabricante_nome, n.codigo AS ncm_codigo
     FROM estoque_produtos p
     LEFT JOIN estoque_categorias c ON c.id = p.categoria_id AND c.tenant_id = p.tenant_id
     LEFT JOIN estoque_fabricantes f ON f.id = p.fabricante_id AND f.tenant_id = p.tenant_id
     LEFT JOIN estoque_ncm n ON n.id = p.ncm_id AND n.tenant_id = p.tenant_id
     WHERE p.tenant_id = :tid ORDER BY p.nome`,
    { tid }
  );
  return res.json({ ok: true, list: Array.isArray(rows) ? rows : [] });
}));
estoqueRouter.get('/produtos/:id', asyncHandler(async (req: Request, res: Response): Promise<Response> => {
  const tid = tenantId(req);
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ message: 'ID inválido' });
  const pool = getPool();
  const joinsBase =
    ' FROM estoque_produtos p LEFT JOIN estoque_categorias c ON c.id = p.categoria_id AND c.tenant_id = p.tenant_id' +
    ' LEFT JOIN estoque_fabricantes f ON f.id = p.fabricante_id AND f.tenant_id = p.tenant_id' +
    ' LEFT JOIN estoque_ncm n ON n.id = p.ncm_id AND n.tenant_id = p.tenant_id';
  let rows: unknown[] = [];
  try {
    const [r] = await pool.query(
      `SELECT ${PRODUTO_COLS},
        c.nome AS categoria_nome, f.nome AS fabricante_nome, n.codigo AS ncm_codigo, n.descricao AS ncm_descricao,
        le.nome AS local_estoque_nome, fp.nome AS fornecedor_principal_nome
       ${joinsBase}
       LEFT JOIN estoque_locais le ON le.id = p.local_estoque_id AND le.tenant_id = p.tenant_id
       LEFT JOIN estoque_fornecedores fp ON fp.id = p.fornecedor_principal_id AND fp.tenant_id = p.tenant_id
       WHERE p.id = :id AND p.tenant_id = :tid LIMIT 1`,
      { id, tid }
    );
    rows = Array.isArray(r) ? r : [];
  } catch (err) {
    if (!isColumnNotFoundError(err)) throw err;
    const [r] = await pool.query(
      `SELECT ${PRODUTO_BASE_COLS},
        c.nome AS categoria_nome, f.nome AS fabricante_nome, n.codigo AS ncm_codigo, n.descricao AS ncm_descricao
       ${joinsBase}
       WHERE p.id = :id AND p.tenant_id = :tid LIMIT 1`,
      { id, tid }
    );
    rows = Array.isArray(r) ? r : [];
  }
  if (!rows.length) return res.status(404).json({ message: 'Produto não encontrado' });
  return res.json(rows[0]);
}));
const PRODUTO_INSERT_BASE_COLS = ['tenant_id', 'codigo', 'nome', 'categoria_id', 'fabricante_id', 'ncm_id', 'unidade', 'estoque_minimo', 'ativo'];

estoqueRouter.post('/produtos', asyncHandler(async (req: Request, res: Response): Promise<Response> => {
  const tid = tenantId(req);
  const body = coerceProdutoBody(req.body || {});
  const nome = body.nome as string;
  if (!nome) return res.status(400).json({ message: 'Nome do produto é obrigatório' });
  const pool = getPool();
  const colsFull: string[] = ['tenant_id', 'codigo', 'nome', 'descricao', 'categoria_id', 'fabricante_id', 'ncm_id', 'unidade', 'estoque_minimo', 'ativo',
    'tipo_produto', 'preco_venda', 'custo', 'margem_lucro', 'permitir_desconto', 'preco_minimo',
    'controlar_estoque', 'local_estoque_id', 'fornecedor_principal_id',
    'cfop', 'cst', 'origem_mercadoria', 'codigo_anatel',
    'codigo_barras', 'modelo', 'marca', 'permitir_numero_serie',
    'tipo_equipamento', 'compatibilidade', 'usado_comodato', 'permitir_venda', 'vincular_mac', 'vincular_serial_onu',
    'peso_kg', 'altura_cm', 'largura_cm', 'comprimento_cm',
    'imagem_url', 'manual_url', 'documentos_url',
    'produto_padrao_instalacao', 'uso_ordem_servico', 'uso_venda', 'uso_contrato', 'uso_comodato',
    'permitir_comodato', 'tempo_comodato_meses', 'valor_equipamento_comodato', 'termo_devolucao_obrigatorio',
    'garantia_meses', 'produto_substituto_id', 'produto_equivalente_id', 'tags', 'observacoes_internas'];
  const paramsFull: Record<string, unknown> = { tid, ...body };
  if (paramsFull.ativo === undefined) paramsFull.ativo = true;
  if (paramsFull.unidade === undefined) paramsFull.unidade = 'UN';
  if (paramsFull.estoque_minimo === undefined) paramsFull.estoque_minimo = 0;
  if (paramsFull.tipo_produto === undefined) paramsFull.tipo_produto = 'EQUIPAMENTO';
  ['permitir_desconto', 'controlar_estoque', 'permitir_numero_serie', 'usado_comodato', 'permitir_venda', 'vincular_mac', 'vincular_serial_onu',
    'produto_padrao_instalacao', 'uso_ordem_servico', 'uso_venda', 'uso_contrato', 'uso_comodato', 'permitir_comodato', 'termo_devolucao_obrigatorio'].forEach((k) => {
    if (paramsFull[k] === undefined) paramsFull[k] = false;
  });
  if (paramsFull.uso_ordem_servico === undefined) paramsFull.uso_ordem_servico = true;
  if (paramsFull.uso_venda === undefined) paramsFull.uso_venda = true;
  try {
    const placeholders = colsFull.map((c) => (c === 'tenant_id' ? ':tid' : ':' + c)).join(', ');
    const [r] = await pool.query(
      `INSERT INTO estoque_produtos (${colsFull.join(', ')}) VALUES (${placeholders}) RETURNING id`,
      paramsFull
    );
    return res.status(201).json({ ok: true, id: (r as { insertId?: number })?.insertId });
  } catch (err) {
    if (!isColumnNotFoundError(err)) throw err;
    const placeholders = PRODUTO_INSERT_BASE_COLS.map((c) => (c === 'tenant_id' ? ':tid' : ':' + c)).join(', ');
    const paramsBase: Record<string, unknown> = {
      tid,
      codigo: body.codigo ?? null,
      nome,
      categoria_id: body.categoria_id ?? null,
      fabricante_id: body.fabricante_id ?? null,
      ncm_id: body.ncm_id ?? null,
      unidade: body.unidade ?? 'UN',
      estoque_minimo: body.estoque_minimo ?? 0,
      ativo: body.ativo !== false,
    };
    const [r] = await pool.query(
      `INSERT INTO estoque_produtos (${PRODUTO_INSERT_BASE_COLS.join(', ')}) VALUES (${placeholders}) RETURNING id`,
      paramsBase
    );
    return res.status(201).json({ ok: true, id: (r as { insertId?: number })?.insertId });
  }
}));
estoqueRouter.put('/produtos/:id', asyncHandler(async (req: Request, res: Response): Promise<Response> => {
  const tid = tenantId(req);
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ message: 'ID inválido' });
  const body = coerceProdutoBody(req.body || {});
  delete (body as Record<string, unknown>).nome; // allow empty update for other fields
  const pool = getPool();
  const strFields = ['codigo', 'nome', 'descricao', 'unidade', 'tipo_produto', 'cfop', 'cst', 'origem_mercadoria', 'codigo_anatel',
    'codigo_barras', 'modelo', 'marca', 'tipo_equipamento', 'compatibilidade', 'imagem_url', 'manual_url', 'documentos_url', 'tags', 'observacoes_internas'];
  const numFields = ['categoria_id', 'fabricante_id', 'ncm_id', 'estoque_minimo', 'preco_venda', 'custo', 'margem_lucro', 'preco_minimo',
    'local_estoque_id', 'fornecedor_principal_id', 'peso_kg', 'altura_cm', 'largura_cm', 'comprimento_cm',
    'tempo_comodato_meses', 'valor_equipamento_comodato', 'garantia_meses', 'produto_substituto_id', 'produto_equivalente_id'];
  const boolFields = ['ativo', 'permitir_desconto', 'controlar_estoque', 'permitir_numero_serie', 'usado_comodato', 'permitir_venda', 'vincular_mac', 'vincular_serial_onu',
    'produto_padrao_instalacao', 'uso_ordem_servico', 'uso_venda', 'uso_contrato', 'uso_comodato', 'permitir_comodato', 'termo_devolucao_obrigatorio'];
  const updates: string[] = [];
  const params: Record<string, unknown> = { id, tid };
  [...strFields, ...numFields, ...boolFields].forEach((f) => {
    if (body[f] === undefined) return;
    updates.push(`${f} = :${f}`);
    if (boolFields.includes(f)) params[f] = body[f] !== false && body[f] !== 'false' && body[f] !== 0;
    else if (numFields.includes(f)) params[f] = body[f] != null && body[f] !== '' ? Number(body[f]) : null;
    else params[f] = body[f] != null ? String(body[f]).trim() : null;
  });
  if (updates.length === 0) return res.status(400).json({ message: 'Nenhum campo para atualizar' });
  try {
    const [result] = await pool.query(
      `UPDATE estoque_produtos SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = :id AND tenant_id = :tid`,
      params
    );
    if ((result as { affectedRows?: number })?.affectedRows === 0)
      return res.status(404).json({ message: 'Produto não encontrado' });
    return res.json({ ok: true });
  } catch (err) {
    if (!isColumnNotFoundError(err)) throw err;
    const baseFields = ['codigo', 'nome', 'categoria_id', 'fabricante_id', 'ncm_id', 'unidade', 'estoque_minimo', 'ativo'];
    const baseUpdates: string[] = [];
    const baseParams: Record<string, unknown> = { id, tid };
    baseFields.forEach((f) => {
      if (body[f] === undefined) return;
      baseUpdates.push(`${f} = :${f}`);
      if (f === 'ativo') baseParams[f] = body[f] !== false && body[f] !== 'false' && body[f] !== 0;
      else if (['categoria_id', 'fabricante_id', 'ncm_id'].includes(f)) baseParams[f] = body[f] != null ? Number(body[f]) : null;
      else if (f === 'estoque_minimo') baseParams[f] = Number(body[f]) || 0;
      else baseParams[f] = body[f] != null ? String(body[f]).trim() : null;
    });
    if (baseUpdates.length === 0) return res.status(400).json({ message: 'Nenhum campo para atualizar' });
    const [result] = await pool.query(
      `UPDATE estoque_produtos SET ${baseUpdates.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = :id AND tenant_id = :tid`,
      baseParams
    );
    if ((result as { affectedRows?: number })?.affectedRows === 0)
      return res.status(404).json({ message: 'Produto não encontrado' });
    return res.json({ ok: true });
  }
}));
estoqueRouter.delete('/produtos/:id', asyncHandler(async (req: Request, res: Response): Promise<Response> => {
  const tid = tenantId(req);
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ message: 'ID inválido' });
  const pool = getPool();
  const [result] = await pool.query(
    'DELETE FROM estoque_produtos WHERE id = :id AND tenant_id = :tid',
    { id, tid }
  );
  if ((result as { affectedRows?: number })?.affectedRows === 0)
    return res.status(404).json({ message: 'Produto não encontrado' });
  return res.json({ ok: true });
}));

// ---- Produto-Fornecedores (vínculo) ----
estoqueRouter.get('/produtos/:produtoId/fornecedores', asyncHandler(async (req: Request, res: Response): Promise<Response> => {
  const tid = tenantId(req);
  const produtoId = Number(req.params.produtoId);
  if (!produtoId) return res.status(400).json({ message: 'ID do produto inválido' });
  const pool = getPool();
  const [rows] = await pool.query(
    `SELECT pf.id, pf.produto_id, pf.fornecedor_id, pf.sku_fornecedor, pf.preco_custo, f.nome AS fornecedor_nome
     FROM estoque_produto_fornecedores pf
     JOIN estoque_fornecedores f ON f.id = pf.fornecedor_id AND f.tenant_id = pf.tenant_id
     WHERE pf.tenant_id = :tid AND pf.produto_id = :produtoId`,
    { tid, produtoId }
  );
  return res.json({ ok: true, list: Array.isArray(rows) ? rows : [] });
}));
estoqueRouter.post('/produtos/:produtoId/fornecedores', asyncHandler(async (req: Request, res: Response): Promise<Response> => {
  const tid = tenantId(req);
  const produtoId = Number(req.params.produtoId);
  if (!produtoId) return res.status(400).json({ message: 'ID do produto inválido' });
  const body = req.body || {};
  const fornecedorId = Number(body.fornecedor_id);
  if (!fornecedorId) return res.status(400).json({ message: 'fornecedor_id é obrigatório' });
  const pool = getPool();
  const [r] = await pool.query(
    `INSERT INTO estoque_produto_fornecedores (tenant_id, produto_id, fornecedor_id, sku_fornecedor, preco_custo)
     VALUES (:tid, :produtoId, :fornecedor_id, :sku_fornecedor, :preco_custo) RETURNING id`,
    {
      tid,
      produtoId,
      fornecedor_id: fornecedorId,
      sku_fornecedor: body.sku_fornecedor ? String(body.sku_fornecedor).trim() : null,
      preco_custo: body.preco_custo != null ? Number(body.preco_custo) : null,
    }
  );
  return res.status(201).json({ ok: true, id: (r as { insertId?: number })?.insertId });
}));
estoqueRouter.delete('/produto-fornecedores/:id', asyncHandler(async (req: Request, res: Response): Promise<Response> => {
  const tid = tenantId(req);
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ message: 'ID inválido' });
  const pool = getPool();
  const [result] = await pool.query(
    'DELETE FROM estoque_produto_fornecedores WHERE id = :id AND tenant_id = :tid',
    { id, tid }
  );
  if ((result as { affectedRows?: number })?.affectedRows === 0)
    return res.status(404).json({ message: 'Vínculo não encontrado' });
  return res.json({ ok: true });
}));

// ---- Kits de Instalação ----
estoqueRouter.get('/kits', asyncHandler(async (req: Request, res: Response): Promise<Response> => {
  const tid = tenantId(req);
  const pool = getPool();
  const [rows] = await pool.query(
    'SELECT id, nome, ativo, created_at FROM estoque_kits WHERE tenant_id = :tid ORDER BY nome',
    { tid }
  );
  return res.json({ ok: true, list: Array.isArray(rows) ? rows : [] });
}));
estoqueRouter.get('/kits/:id', asyncHandler(async (req: Request, res: Response): Promise<Response> => {
  const tid = tenantId(req);
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ message: 'ID inválido' });
  const pool = getPool();
  const [head] = await pool.query(
    'SELECT id, nome, ativo, created_at FROM estoque_kits WHERE id = :id AND tenant_id = :tid LIMIT 1',
    { id, tid }
  );
  const list = Array.isArray(head) ? head : [];
  if (!list.length) return res.status(404).json({ message: 'Kit não encontrado' });
  const [itens] = await pool.query(
    `SELECT ki.id, ki.produto_id, ki.quantidade, p.nome AS produto_nome, p.codigo AS produto_codigo
     FROM estoque_kit_itens ki
     JOIN estoque_produtos p ON p.id = ki.produto_id AND p.tenant_id = :tid
     WHERE ki.kit_id = :id`,
    { id, tid }
  );
  return res.json({ ...(list[0] as object), itens: Array.isArray(itens) ? itens : [] });
}));
estoqueRouter.post('/kits', asyncHandler(async (req: Request, res: Response): Promise<Response> => {
  const tid = tenantId(req);
  const body = req.body || {};
  const nome = String(body.nome || '').trim();
  if (!nome) return res.status(400).json({ message: 'Nome do kit é obrigatório' });
  const pool = getPool();
  const [r] = await pool.query(
    'INSERT INTO estoque_kits (tenant_id, nome, ativo) VALUES (:tid, :nome, COALESCE(:ativo, TRUE)) RETURNING id',
    { tid, nome, ativo: body.ativo !== false }
  );
  const kitId = (r as { insertId?: number })?.insertId;
  const itens = Array.isArray(body.itens) ? body.itens : [];
  for (const item of itens) {
    const produtoId = Number(item.produto_id);
    const qty = Number(item.quantidade) || 1;
    if (produtoId) {
      await pool.query(
        'INSERT INTO estoque_kit_itens (kit_id, produto_id, quantidade) VALUES (:kitId, :produtoId, :qty)',
        { kitId, produtoId, qty }
      );
    }
  }
  return res.status(201).json({ ok: true, id: kitId });
}));
estoqueRouter.put('/kits/:id', asyncHandler(async (req: Request, res: Response): Promise<Response> => {
  const tid = tenantId(req);
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ message: 'ID inválido' });
  const body = req.body || {};
  const pool = getPool();
  if (body.nome !== undefined) {
    await pool.query(
      'UPDATE estoque_kits SET nome = :nome, ativo = COALESCE(:ativo, ativo), updated_at = CURRENT_TIMESTAMP WHERE id = :id AND tenant_id = :tid',
      { id, tid, nome: String(body.nome).trim(), ativo: body.ativo }
    );
  }
  if (Array.isArray(body.itens)) {
    await pool.query('DELETE FROM estoque_kit_itens WHERE kit_id = :id', { id });
    for (const item of body.itens) {
      const produtoId = Number(item.produto_id);
      const qty = Number(item.quantidade) || 1;
      if (produtoId) {
        await pool.query(
          'INSERT INTO estoque_kit_itens (kit_id, produto_id, quantidade) VALUES (:id, :produtoId, :qty)',
          { id, produtoId, qty }
        );
      }
    }
  }
  return res.json({ ok: true });
}));
estoqueRouter.delete('/kits/:id', asyncHandler(async (req: Request, res: Response): Promise<Response> => {
  const tid = tenantId(req);
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ message: 'ID inválido' });
  const pool = getPool();
  const [result] = await pool.query(
    'DELETE FROM estoque_kits WHERE id = :id AND tenant_id = :tid',
    { id, tid }
  );
  if ((result as { affectedRows?: number })?.affectedRows === 0)
    return res.status(404).json({ message: 'Kit não encontrado' });
  return res.json({ ok: true });
}));

// ---- Consultas: Saldo Estoque ----
estoqueRouter.get('/saldo', asyncHandler(async (req: Request, res: Response): Promise<Response> => {
  const tid = tenantId(req);
  const localId = req.query.local_id != null ? Number(req.query.local_id) : null;
  const pool = getPool();
  let sql = `SELECT s.produto_id, s.local_id, s.quantidade, s.updated_at,
    p.codigo AS produto_codigo, p.nome AS produto_nome, l.nome AS local_nome
    FROM estoque_saldo s
    JOIN estoque_produtos p ON p.id = s.produto_id AND p.tenant_id = s.tenant_id
    JOIN estoque_locais l ON l.id = s.local_id AND l.tenant_id = s.tenant_id
    WHERE s.tenant_id = :tid AND s.quantidade <> 0`;
  const params: Record<string, unknown> = { tid };
  if (localId != null) {
    sql += ' AND s.local_id = :localId';
    params.localId = localId;
  }
  sql += ' ORDER BY p.nome, l.nome';
  const [rows] = await pool.query(sql, params);
  return res.json({ ok: true, list: Array.isArray(rows) ? rows : [] });
}));

// ---- Consultas: Lançamentos (últimas movimentações) ----
estoqueRouter.get('/lancamentos', asyncHandler(async (req: Request, res: Response): Promise<Response> => {
  const tid = tenantId(req);
  const limit = Math.min(100, Number(req.query.limit) || 50);
  const pool = getPool();
  const [rows] = await pool.query(
    `SELECT m.id, m.tipo, m.data_movimento, m.numero_documento, m.observacoes, m.created_at,
      (SELECT COUNT(*) FROM estoque_movimentacao_itens WHERE movimentacao_id = m.id) AS itens_count
     FROM estoque_movimentacoes m
     WHERE m.tenant_id = :tid ORDER BY m.created_at DESC LIMIT :limit`,
    { tid, limit }
  );
  return res.json({ ok: true, list: Array.isArray(rows) ? rows : [] });
}));

// ---- Consultas: Quantitativo por Produto ----
estoqueRouter.get('/quantitativo-produto', asyncHandler(async (req: Request, res: Response): Promise<Response> => {
  const tid = tenantId(req);
  const pool = getPool();
  const [rows] = await pool.query(
    `SELECT p.id AS produto_id, p.codigo, p.nome,
      COALESCE(SUM(s.quantidade), 0) AS quantidade_total
     FROM estoque_produtos p
     LEFT JOIN estoque_saldo s ON s.produto_id = p.id AND s.tenant_id = p.tenant_id
     WHERE p.tenant_id = :tid
     GROUP BY p.id, p.codigo, p.nome
     ORDER BY p.nome`,
    { tid }
  );
  return res.json({ ok: true, list: Array.isArray(rows) ? rows : [] });
}));

// ---- Movimentações: listar por tipo ----
estoqueRouter.get('/movimentacoes', asyncHandler(async (req: Request, res: Response): Promise<Response> => {
  const tid = tenantId(req);
  const tipo = req.query.tipo as string | undefined;
  const pool = getPool();
  let sql = `SELECT m.id, m.tipo, m.data_movimento, m.numero_documento, m.observacoes, m.fornecedor_id, m.customer_id, m.veiculo_id, m.created_at,
    (SELECT COUNT(*) FROM estoque_movimentacao_itens WHERE movimentacao_id = m.id) AS itens_count
    FROM estoque_movimentacoes m WHERE m.tenant_id = :tid`;
  const params: Record<string, unknown> = { tid };
  if (tipo) {
    sql += ' AND m.tipo = :tipo';
    params.tipo = tipo;
  }
  sql += ' ORDER BY m.created_at DESC LIMIT 200';
  const [rows] = await pool.query(sql, params);
  return res.json({ ok: true, list: Array.isArray(rows) ? rows : [] });
}));

estoqueRouter.get('/movimentacoes/:id', asyncHandler(async (req: Request, res: Response): Promise<Response> => {
  const tid = tenantId(req);
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ message: 'ID inválido' });
  const pool = getPool();
  const [mov] = await pool.query(
    'SELECT id, tipo, data_movimento, numero_documento, observacoes, fornecedor_id, customer_id, veiculo_id, created_at FROM estoque_movimentacoes WHERE id = :id AND tenant_id = :tid LIMIT 1',
    { id, tid }
  );
  const movList = Array.isArray(mov) ? mov : [];
  if (!movList.length) return res.status(404).json({ message: 'Movimentação não encontrada' });
  const [itens] = await pool.query(
    `SELECT mi.id, mi.produto_id, mi.local_id, mi.quantidade, mi.entrada_saida, mi.custo_unitario, mi.valor_unitario,
      p.nome AS produto_nome, p.codigo AS produto_codigo, l.nome AS local_nome
     FROM estoque_movimentacao_itens mi
     JOIN estoque_produtos p ON p.id = mi.produto_id
     JOIN estoque_locais l ON l.id = mi.local_id
     WHERE mi.movimentacao_id = :id`,
    { id }
  );
  return res.json({ ...(movList[0] as object), itens: Array.isArray(itens) ? itens : [] });
}));

/**
 * POST /movimentacoes
 * Body: { tipo, data_movimento?, numero_documento?, observacoes?, fornecedor_id?, itens: [{ produto_id, local_id, quantidade, entrada_saida }] }
 * Tipos: COMPRA | COMPRA_NFE | VENDA | COMODATO | CORRECAO | TRANSFERENCIA
 */
// Criar movimentação e atualizar saldo
function applySaldo(
  pool: Awaited<ReturnType<typeof getPool>>,
  tid: number,
  produtoId: number,
  localId: number,
  delta: number
): Promise<unknown> {
  return pool.query(
    `INSERT INTO estoque_saldo (tenant_id, produto_id, local_id, quantidade, updated_at)
     VALUES (:tid, :produtoId, :localId, :delta, CURRENT_TIMESTAMP)
     ON CONFLICT (tenant_id, produto_id, local_id)
     DO UPDATE SET quantidade = estoque_saldo.quantidade + :delta, updated_at = CURRENT_TIMESTAMP`,
    { tid, produtoId, localId, delta }
  );
}

estoqueRouter.post('/movimentacoes', asyncHandler(async (req: Request, res: Response): Promise<Response> => {
  const tid = tenantId(req);
  const body = req.body || {};
  const tipo = String(body.tipo || '').toUpperCase();
  const validTipos = ['COMPRA', 'COMPRA_NFE', 'VENDA', 'COMODATO', 'CORRECAO', 'TRANSFERENCIA'];
  if (!validTipos.includes(tipo)) return res.status(400).json({ message: 'Tipo de movimentação inválido' });
  const itens = Array.isArray(body.itens) ? body.itens : [];
  if (!itens.length) return res.status(400).json({ message: 'Informe ao menos um item' });
  const pool = getPool();
  const dataMovimento = body.data_movimento || new Date().toISOString().slice(0, 10);
  const numeroDocumento = body.numero_documento ? String(body.numero_documento).trim() : null;
  const observacoes = body.observacoes ? String(body.observacoes).trim() : null;
  const fornecedorId = body.fornecedor_id != null ? Number(body.fornecedor_id) : null;
  const customerId = body.customer_id != null ? Number(body.customer_id) : null;
  const veiculoId = body.veiculo_id != null ? Number(body.veiculo_id) : null;

  const [r] = await pool.query(
    `INSERT INTO estoque_movimentacoes (tenant_id, tipo, data_movimento, numero_documento, observacoes, fornecedor_id, customer_id, veiculo_id)
     VALUES (:tid, :tipo, :data_movimento::date, :numero_documento, :observacoes, :fornecedor_id, :customer_id, :veiculo_id) RETURNING id`,
    {
      tid,
      tipo,
      data_movimento: dataMovimento,
      numero_documento: numeroDocumento,
      observacoes: observacoes,
      fornecedor_id: fornecedorId,
      customer_id: customerId,
      veiculo_id: veiculoId,
    }
  );
  const movId = (r as { insertId?: number })?.insertId;
  if (!movId) return res.status(500).json({ message: 'Erro ao criar movimentação' });

  for (const item of itens) {
    const produtoId = Number(item.produto_id);
    const localId = Number(item.local_id);
    let quantidade = Number(item.quantidade) || 0;
    const entradaSaida = (item.entrada_saida || 'E').toString().toUpperCase().startsWith('S') ? 'S' : 'E';
    const custoUnitario = item.custo_unitario != null ? Number(item.custo_unitario) : null;
    const valorUnitario = item.valor_unitario != null ? Number(item.valor_unitario) : null;
    if (entradaSaida === 'S') quantidade = -Math.abs(quantidade);
    else quantidade = Math.abs(quantidade);
    if (!produtoId || !localId) continue;

    await pool.query(
      `INSERT INTO estoque_movimentacao_itens (movimentacao_id, produto_id, local_id, quantidade, entrada_saida, custo_unitario, valor_unitario)
       VALUES (:movId, :produtoId, :localId, :quantidade, :entrada_saida, :custo_unitario, :valor_unitario)`,
      {
        movId,
        produtoId,
        localId,
        quantidade: Math.abs(Number(item.quantidade) || 0),
        entrada_saida: entradaSaida,
        custo_unitario: custoUnitario,
        valor_unitario: valorUnitario,
      }
    );
    const delta = entradaSaida === 'S' ? -Math.abs(Number(item.quantidade) || 0) : Math.abs(Number(item.quantidade) || 0);
    await applySaldo(pool, tid, produtoId, localId, delta);
  }

  return res.status(201).json({ ok: true, id: movId });
}));

// ---- Viagens (Registro de Viagem) ----
estoqueRouter.get('/viagens', asyncHandler(async (req: Request, res: Response): Promise<Response> => {
  const tid = tenantId(req);
  const veiculoId = req.query.veiculo_id != null ? Number(req.query.veiculo_id) : null;
  const pool = getPool();
  let sql = `SELECT v.id, v.veiculo_id, v.data_saida, v.data_retorno, v.km_saida, v.km_retorno, v.motorista, v.destino, v.observacoes, v.created_at,
    ve.placa, ve.modelo
    FROM estoque_viagens v
    JOIN estoque_veiculos ve ON ve.id = v.veiculo_id AND ve.tenant_id = v.tenant_id
    WHERE v.tenant_id = :tid`;
  const params: Record<string, unknown> = { tid };
  if (veiculoId != null) {
    sql += ' AND v.veiculo_id = :veiculoId';
    params.veiculoId = veiculoId;
  }
  sql += ' ORDER BY v.data_saida DESC LIMIT 100';
  const [rows] = await pool.query(sql, params);
  return res.json({ ok: true, list: Array.isArray(rows) ? rows : [] });
}));
estoqueRouter.post('/viagens', asyncHandler(async (req: Request, res: Response): Promise<Response> => {
  const tid = tenantId(req);
  const body = req.body || {};
  const veiculoId = Number(body.veiculo_id);
  if (!veiculoId) return res.status(400).json({ message: 'veiculo_id é obrigatório' });
  const dataSaida = body.data_saida ? String(body.data_saida).trim() : new Date().toISOString();
  const pool = getPool();
  const [r] = await pool.query(
    `INSERT INTO estoque_viagens (tenant_id, veiculo_id, data_saida, data_retorno, km_saida, km_retorno, motorista, destino, observacoes)
     VALUES (:tid, :veiculo_id, :data_saida::timestamptz, :data_retorno::timestamptz, :km_saida, :km_retorno, :motorista, :destino, :observacoes) RETURNING id`,
    {
      tid,
      veiculo_id: veiculoId,
      data_saida: dataSaida,
      data_retorno: body.data_retorno ? String(body.data_retorno).trim() : null,
      km_saida: body.km_saida != null ? Number(body.km_saida) : null,
      km_retorno: body.km_retorno != null ? Number(body.km_retorno) : null,
      motorista: body.motorista ? String(body.motorista).trim() : null,
      destino: body.destino ? String(body.destino).trim() : null,
      observacoes: body.observacoes ? String(body.observacoes).trim() : null,
    }
  );
  return res.status(201).json({ ok: true, id: (r as { insertId?: number })?.insertId });
}));
estoqueRouter.put('/viagens/:id', asyncHandler(async (req: Request, res: Response): Promise<Response> => {
  const tid = tenantId(req);
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ message: 'ID inválido' });
  const body = req.body || {};
  const updates: string[] = [];
  const params: Record<string, unknown> = { id, tid };
  const fields = ['data_retorno', 'km_saida', 'km_retorno', 'motorista', 'destino', 'observacoes'];
  fields.forEach((f) => {
    if (body[f] !== undefined) {
      if (f === 'data_retorno') {
        updates.push('data_retorno = :data_retorno::timestamptz');
        params.data_retorno = body[f];
      } else if (f.startsWith('km_')) {
        updates.push(`${f} = :${f}`);
        params[f] = body[f] != null ? Number(body[f]) : null;
      } else {
        updates.push(`${f} = :${f}`);
        params[f] = body[f] != null ? String(body[f]).trim() : null;
      }
    }
  });
  if (!updates.length) return res.status(400).json({ message: 'Nenhum campo para atualizar' });
  const pool = getPool();
  const [result] = await pool.query(
    `UPDATE estoque_viagens SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = :id AND tenant_id = :tid`,
    params
  );
  if ((result as { affectedRows?: number })?.affectedRows === 0)
    return res.status(404).json({ message: 'Viagem não encontrada' });
  return res.json({ ok: true });
}));
