import { Router, type Request, type Response } from 'express';
import { nanoid } from 'nanoid';
import { getPool } from '../db.js';
import { normalizeWhatsapp, requireFields } from '../utils/validation.js';

export const clubeRouter = Router();

interface CampaignRow {
  id: number;
  name: string;
  status: string;
}

interface CustomerRow {
  id: number;
  name: string;
  whatsapp: string;
}

async function ensureActiveCampaign(pool: ReturnType<typeof getPool>): Promise<CampaignRow> {
  const name = process.env.ACTIVE_CAMPAIGN_NAME || 'Campanha Ativa';
  const [rows] = await pool.query(
    "SELECT id, name, status FROM raffle_campaigns WHERE status = 'ACTIVE' ORDER BY id DESC LIMIT 1"
  );
  const row = Array.isArray(rows) ? (rows as CampaignRow[])[0] : undefined;
  if (row) return row;

  const [ins] = await pool.query(
    "INSERT INTO raffle_campaigns (name, status, rules_json) VALUES (:name, 'ACTIVE', :rules) RETURNING id",
    { name, rules: JSON.stringify({ source: 'AUTO', createdAt: new Date().toISOString() }) }
  );
  const insertResult = ins as { insertId: number };
  return { id: insertResult.insertId, name, status: 'ACTIVE' };
}

async function getOrCreateCustomer(pool: ReturnType<typeof getPool>, { name, whatsapp }: { name: string; whatsapp: string }): Promise<CustomerRow> {
  const [rows] = await pool.query(
    'SELECT id, name, whatsapp FROM customers WHERE whatsapp=:whatsapp LIMIT 1',
    { whatsapp }
  );
  const list = Array.isArray(rows) ? (rows as CustomerRow[]) : [];
  if (list.length) {
    const row = list[0];
    if (name && (!row.name || row.name === '')) {
      await pool.query('UPDATE customers SET name=:name WHERE id=:id', { name, id: row.id });
    }
    return { ...row, name: name || row.name };
  }
  const [ins] = await pool.query(
    'INSERT INTO customers (name, whatsapp) VALUES (:name, :whatsapp) RETURNING id',
    { name, whatsapp }
  );
  const insertResult = ins as { insertId: number };
  return { id: insertResult.insertId, name, whatsapp };
}

async function ensureLoyalty(pool: ReturnType<typeof getPool>, customerId: number): Promise<void> {
  const [rows] = await pool.query(
    'SELECT customer_id FROM loyalty_accounts WHERE customer_id=:cid LIMIT 1',
    { cid: customerId }
  );
  if (Array.isArray(rows) && (rows as { customer_id: number }[]).length) return;
  await pool.query(
    "INSERT INTO loyalty_accounts (customer_id, points_balance, tier) VALUES (:cid, 0, 'BRONZE')",
    { cid: customerId }
  );
}

async function addPoints(
  pool: ReturnType<typeof getPool>,
  customerId: number,
  points: number,
  reason: string,
  refId: string | null = null
): Promise<void> {
  await ensureLoyalty(pool, customerId);
  await pool.query(
    "INSERT INTO loyalty_ledger (customer_id, points, entry_type, reason, ref_id) VALUES (:cid, :points, 'EARN', :reason, :ref)",
    { cid: customerId, points, reason, ref: refId }
  );
  await pool.query(
    'UPDATE loyalty_accounts SET points_balance = points_balance + :points WHERE customer_id=:cid',
    { points, cid: customerId }
  );
}

clubeRouter.post('/stand/signup', async (req: Request, res: Response): Promise<Response> => {
  const body = req.body || {};
  const err = requireFields(body as Record<string, unknown>, ['name', 'whatsapp']);
  if (err) return res.status(400).json({ message: err });

  const pool = getPool();
  const whatsapp = normalizeWhatsapp(String(body.whatsapp ?? ''));
  const name = String(body.name ?? '').trim();

  const customer = await getOrCreateCustomer(pool, { name, whatsapp });
  await ensureLoyalty(pool, customer.id);

  const campaign = await ensureActiveCampaign(pool);

  const welcomePoints = Number(body.welcomePoints ?? 200);
  const entryNumber = 'CM-' + nanoid(6).toUpperCase();

  await addPoints(pool, customer.id, welcomePoints, 'Cadastro no stand (Clube Multi)', entryNumber);

  await pool.query(
    "INSERT INTO raffle_entries (campaign_id, customer_id, entry_number, source) VALUES (:camp, :cid, :num, 'STAND')",
    { camp: campaign.id, cid: customer.id, num: entryNumber }
  );

  const [accRows] = await pool.query(
    'SELECT points_balance, tier FROM loyalty_accounts WHERE customer_id=:cid LIMIT 1',
    { cid: customer.id }
  );
  const acc = Array.isArray(accRows) ? (accRows as { points_balance: number }[])[0] : undefined;

  return res.json({
    ok: true,
    campaign: { id: campaign.id, name: campaign.name },
    customer: { id: customer.id, name: customer.name, whatsapp: customer.whatsapp },
    awardedPoints: welcomePoints,
    entryNumber,
    pointsBalance: acc?.points_balance ?? 0,
  });
});

const DEFAULT_CLUBE_PAGE_CONFIG = {
  hero: {
    badge: 'Benefícios exclusivos',
    title: 'Clube Multi',
    description: 'Pontos, sorteios e vantagens para quem é cliente. Assine um plano e ganhe streaming, descontos e muito mais.',
    ctaText: 'Assinar e entrar no clube',
    ctaHref: '/assinar.html',
  },
  benefits: {
    sectionTitle: 'Vantagens do Clube Multi',
    sectionSubtitle: 'Assinando um plano Multi você tem acesso a benefícios exclusivos. Confira as ofertas disponíveis.',
    note: 'Ofertas sujeitas à disponibilidade e alteração. Consulte condições na contratação.',
    items: [
      { name: 'Netflix', description: '1 mês grátis de Netflix ao assinar seu plano. Aproveite séries e filmes à vontade.', iconColor: 'red' },
      { name: 'Telecine', description: 'Acesso ao Telecine pelo Clube Multi. Filmes, séries e canais ao vivo.', iconColor: 'purple' },
      { name: 'Disney+', description: 'Disney+ incluso em planos selecionados. Marvel, Star Wars, Pixar e mais.', iconColor: 'blue' },
      { name: 'Spotify', description: 'Músicas e podcasts com benefício Spotify para clientes do Clube Multi.', iconColor: 'green' },
    ],
  },
  points: {
    sectionTitle: 'Como ganhar pontos',
    items: [
      { label: 'Cadastro no stand', value: '+200 pontos', text: 'Visite nosso stand, escaneie o QR Code e ganhe pontos na hora.', icon: 'bi-qr-code-scan' },
      { label: 'Assinar plano', value: 'Bônus de pontos', text: 'Ao fechar seu plano de internet você recebe pontos de boas-vindas.', icon: 'bi-telephone-plus' },
      { label: 'Pagamento em dia', value: 'Bônus recorrente', text: 'Mantenha as contas em dia e acumule pontos todo mês.', icon: 'bi-calendar-check' },
      { label: 'Indique amigos', value: 'Pontos por indicação', text: 'Indique alguém para a Multi e ganhe pontos quando fecharem plano.', icon: 'bi-people' },
    ],
  },
  actions: {
    consultTitle: 'Consultar meu saldo',
    consultDesc: 'Digite seu WhatsApp para ver seus pontos e números do sorteio.',
    standBadge: 'Eventos',
    standTitle: 'Cadastro rápido no stand',
    standDesc: 'Está em um evento? Escaneie o QR Code do stand, cadastre-se em segundos e ganhe 200 pontos na hora + número no sorteio.',
    standLinkText: 'Ir para cadastro do stand',
    standHref: '/clube/stand.html',
  },
  cta: {
    title: 'Quer entrar no Clube Multi?',
    text: 'Assine um plano e comece a acumular pontos e benefícios hoje.',
    buttonText: 'Ver planos',
    buttonHref: '/planos.html',
  },
};

clubeRouter.get('/page', async (_req: Request, res: Response): Promise<Response> => {
  try {
    const pool = getPool();
    const [rows] = await pool.query(
      'SELECT config_json FROM clube_page_config WHERE id = 1 LIMIT 1'
    );
    const list = Array.isArray(rows) ? rows : [];
    if (list.length) {
      const row = list[0] as { config_json: string | object };
      const config = typeof row.config_json === 'string' ? JSON.parse(row.config_json) : row.config_json;
      return res.json({ ok: true, config });
    }
  } catch {
    /* table may not exist */
  }
  return res.json({ ok: true, config: DEFAULT_CLUBE_PAGE_CONFIG });
});

clubeRouter.get('/me', async (req: Request, res: Response): Promise<Response> => {
  const whatsapp = normalizeWhatsapp(String(req.query.whatsapp || ''));
  if (!whatsapp) return res.status(400).json({ message: 'Informe whatsapp' });

  const pool = getPool();
  const [cust] = await pool.query(
    'SELECT id, name, whatsapp FROM customers WHERE whatsapp=:w LIMIT 1',
    { w: whatsapp }
  );
  const custList = Array.isArray(cust) ? (cust as CustomerRow[]) : [];
  if (!custList.length) return res.status(404).json({ message: 'Cliente não encontrado' });

  const customerId = custList[0].id;
  await ensureLoyalty(pool, customerId);

  const [acc] = await pool.query(
    'SELECT points_balance, tier FROM loyalty_accounts WHERE customer_id=:cid LIMIT 1',
    { cid: customerId }
  );
  const [ledger] = await pool.query(
    'SELECT points, entry_type, reason, ref_id, created_at FROM loyalty_ledger WHERE customer_id=:cid ORDER BY id DESC LIMIT 20',
    { cid: customerId }
  );
  const [entries] = await pool.query(
    `SELECT re.entry_number, rc.name AS campaign_name, re.created_at
     FROM raffle_entries re
     JOIN raffle_campaigns rc ON rc.id = re.campaign_id
     WHERE re.customer_id=:cid
     ORDER BY re.id DESC LIMIT 50`,
    { cid: customerId }
  );

  const accList = Array.isArray(acc) ? (acc as { points_balance: number; tier: string }[]) : [];
  return res.json({
    ok: true,
    customer: custList[0],
    loyalty: {
      pointsBalance: accList[0]?.points_balance ?? 0,
      tier: accList[0]?.tier ?? 'BRONZE',
    },
    ledger: Array.isArray(ledger) ? ledger : [],
    raffleEntries: Array.isArray(entries) ? entries : [],
  });
});
