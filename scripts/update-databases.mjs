#!/usr/bin/env node
/**
 * Atualiza os bancos de dados com as migrações SQL.
 *
 * Uso:
 *   node scripts/update-databases.mjs              — atualiza banco central (DB_* do .env)
 *   node scripts/update-databases.mjs --tenants     — atualiza banco central + todos os tenants provisionados
 *   node scripts/update-databases.mjs --tenants tk  — atualiza banco central + tenant tk
 *
 * Migrações executadas (em ordem): plans_isp_extras, erp_fase1/2, contract_templates,
 * support_status_lock_triggers, erp_proposal_templates, erp_notify, payment_gateways,
 * carne_lots, caixa_movimentos, finance_suppliers_chart_payables.pg, estoque.pg.sql,
 * customer_comodato.pg.sql (Comodato/Venda por cliente).
 * Tenants: inclui radius_group_bloqueado, radius_advanced.pg.sql (franquia, MAC, vouchers, NAS secret).
 *
 * Requer: .env com DB_HOST, DB_PORT, DB_USER, DB_PASS, DB_NAME
 */
import 'dotenv/config';
import pg from 'pg';
import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const MIGRATIONS_CENTRAL = [
  { file: 'plans_isp_extras.sql', desc: 'Planos ISP (velocidade Mbps, concentradores, bloqueio)' },
  { file: 'erp_fase1.sql', desc: 'ERP Fase 1 (propostas, ordens de serviço, tickets)' },
  { file: 'erp_fase2.sql', desc: 'ERP Fase 2 (clientes endereço/histórico, contratos, vínculos)' },
  { file: 'contract_templates.sql', desc: 'Modelos de contrato' },
  { file: 'support_status_lock_triggers.sql', desc: 'Regras: status encerrado (OS/chamado) não pode ser alterado' },
  { file: 'erp_proposal_templates.sql', desc: 'Modelos de propostas comerciais' },
  { file: 'erp_notify.sql', desc: 'Fila de notificações (message_queue)' },
  { file: 'payment_gateways.sql', desc: 'Gateways de pagamento (EFI/GerenciaNet, etc.)' },
  { file: 'carne_lots.sql', desc: 'Lotes de carnê (gerar, imprimir, entrega)' },
  { file: 'caixa_movimentos.sql', desc: 'Movimento de caixa + status CANCELLED em faturas' },
  { file: 'finance_suppliers_chart_payables.pg.sql', desc: 'Fornecedores, Plano de Contas, Contas a Pagar' },
  { file: 'estoque.pg.sql', desc: 'Estoque (categorias, produtos, locais, movimentações, viagens)' },
  { file: 'estoque_produto_erp.pg.sql', desc: 'Estoque produto ERP (campos completos cadastro)' },
  { file: 'customer_comodato.pg.sql', desc: 'Comodato/Venda por cliente (customer_comodato)' },
  { file: 'customer_comodato_equipamento.pg.sql', desc: 'Comodato equipamento, endereço, devolução e histórico' },
];

const MIGRATIONS_TENANT = [
  { file: 'plans_isp_extras.sql', desc: 'Planos ISP (velocidade Mbps, concentradores, bloqueio)' },
  { file: 'erp_fase1.sql', desc: 'ERP Fase 1 (propostas, ordens de serviço, tickets)' },
  { file: 'erp_fase2.sql', desc: 'ERP Fase 2 (clientes endereço/histórico, contratos, vínculos)' },
  { file: 'contract_templates.sql', desc: 'Modelos de contrato' },
  { file: 'support_status_lock_triggers.sql', desc: 'Regras: status encerrado (OS/chamado) não pode ser alterado' },
  { file: 'erp_proposal_templates.sql', desc: 'Modelos de propostas comerciais' },
  { file: 'erp_notify.sql', desc: 'Fila de notificações (message_queue)' },
  { file: 'installations_pppoe_password.pg.sql', desc: 'Coluna pppoe_password em installations (usuário/senha PPPoE)' },
  { file: 'migrations/001_radius_portal.pg.sql', desc: 'RADIUS + Portal (schema FreeRADIUS, franquia, vouchers, tenant_radius_config, NAS)' },
  { file: 'radius_group_bloqueado.sql', desc: 'Grupo RADIUS bloqueado (64k/64k)' },
  { file: 'radius_advanced.pg.sql', desc: 'RADIUS avançado (franquia, MAC, vouchers, CGNAT/VLAN, tenant_radius_config, nas_secret)' },
  { file: 'payment_gateways.sql', desc: 'Gateways de pagamento (EFI/GerenciaNet, etc.)' },
  { file: 'carne_lots.sql', desc: 'Lotes de carnê (gerar, imprimir, entrega)' },
  { file: 'caixa_movimentos.sql', desc: 'Movimento de caixa + status CANCELLED em faturas' },
  { file: 'finance_suppliers_chart_payables.pg.sql', desc: 'Fornecedores, Plano de Contas, Contas a Pagar' },
  { file: 'estoque.pg.sql', desc: 'Estoque (categorias, produtos, locais, movimentações, viagens)' },
  { file: 'estoque_produto_erp.pg.sql', desc: 'Estoque produto ERP (campos completos cadastro)' },
  { file: 'customer_comodato.pg.sql', desc: 'Comodato/Venda por cliente (customer_comodato)' },
  { file: 'customer_comodato_equipamento.pg.sql', desc: 'Comodato equipamento, endereço, devolução e histórico' },
];

function parseEnv(content) {
  const out = {};
  for (const line of (content || '').split('\n')) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
  }
  return out;
}

async function runMigrations(client, migrations) {
  for (const m of migrations) {
    const filePath = path.join(ROOT, 'sql', m.file);
    if (!existsSync(filePath)) {
      console.warn('  [AVISO]', m.desc, '— arquivo não encontrado:', m.file, '(copie sql/' + m.file + ' para o servidor)');
      continue;
    }
    try {
      const sql = await readFile(filePath, 'utf8');
      await client.query(sql);
      console.log('  [OK]', m.desc);
    } catch (err) {
      if (err.message?.includes('does not exist') || err.message?.includes('already exists')) {
        console.log('  [SKIP]', m.desc, '—', err.message.split('\n')[0]);
      } else {
        console.error('  [ERRO]', m.desc, '—', err.message);
        throw err;
      }
    }
  }
}

async function updateCentral() {
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

  console.log('Banco central:', config.database, '@', config.host + ':' + config.port);
  const client = new pg.Client(config);
  await client.connect();
  try {
    await runMigrations(client, MIGRATIONS_CENTRAL);
  } finally {
    await client.end();
  }
}

async function updateTenants(slugFilter) {
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

  const central = new pg.Client(config);
  await central.connect();

  let tenants = [];
  try {
    const res = await central.query(
      `SELECT slug, config_json FROM tenants WHERE status = 'ACTIVE' ORDER BY slug`
    );
    tenants = res.rows || [];
  } finally {
    await central.end();
  }

  const provisioned = tenants.filter((t) => {
    const prov = t.config_json?.provisioning;
    return prov && typeof prov === 'object' && prov.stackPath;
  });

  let toUpdate = provisioned;
  if (slugFilter) {
    toUpdate = provisioned.filter((t) => t.slug === slugFilter);
    if (toUpdate.length === 0) {
      console.error('Tenant "' + slugFilter + '" não encontrado ou sem stack provisionado.');
      process.exit(1);
    }
  }

  for (const t of toUpdate) {
    const stackPath = t.config_json?.provisioning?.stackPath;
    if (!stackPath) continue;

    const tenantEnvPath = path.join(stackPath, '.env');
    let tenantEnv = {};
    try {
      const content = await readFile(tenantEnvPath, 'utf8');
      tenantEnv = parseEnv(content);
    } catch (e) {
      console.warn('  [AVISO]', t.slug, '— não foi possível ler .env do tenant');
      continue;
    }

    const pgPort = tenantEnv.PG_HOST_PORT || tenantEnv.DB_PORT || 5432;
    const tenantConfig = {
      host: '127.0.0.1',
      port: Number(pgPort),
      user: tenantEnv.PG_USER || tenantEnv.DB_USER,
      password: tenantEnv.PG_PASS || tenantEnv.DB_PASS || '',
      database: tenantEnv.PG_DB || tenantEnv.DB_NAME,
    };

    if (!tenantConfig.user || !tenantConfig.database) {
      console.warn('  [AVISO]', t.slug, '— .env do tenant sem PG_USER/PG_DB');
      continue;
    }

    console.log('\nTenant:', t.slug, '—', tenantConfig.database, '@127.0.0.1:' + pgPort);
    const client = new pg.Client(tenantConfig);
    try {
      await client.connect();
      await runMigrations(client, MIGRATIONS_TENANT);
      await client.end();
    } catch (err) {
      console.error('  [ERRO]', t.slug, err.message);
    }
  }
}

async function main() {
  const args = process.argv.slice(2);
  const withTenants = args.includes('--tenants');
  const slugFilter = args.find((a) => !a.startsWith('--'));

  console.log('=== Atualização de bancos de dados ===\n');

  await updateCentral();
  console.log('');

  if (withTenants) {
    console.log('=== Tenants provisionados ===');
    await updateTenants(slugFilter);
  }

  console.log('\nConcluído.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
