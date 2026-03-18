/**
 * Gera docker-compose.yml por tenant: app (portal + site) + freeradius + postgres.
 * Suporta imagens modelo: defina PROVISION_*_IMAGE para usar uma imagem pré-construída.
 *
 * Containers criados (aparecem no Portainer / Docker):
 * - pg_<slug>       — Postgres (postgres:16-alpine ou imagem modelo)
 * - portal_<slug>  — App único: portal admin + site (Node), porta APP_PORT:3000
 * Rede: tenant_<slug>, volume: pgdata_<slug>.
 * FreeRADIUS roda no host (systemd freeradius-tenant@<slug>), não em container.
 */
const DEFAULT_POSTGRES_IMAGE = 'postgres:16-alpine';

export interface ComposeTemplateParams {
  slug: string;
  tenantId: number;
  radiusAuthPort: number;
  radiusAcctPort: number;
  /** Porta TCP do app (portal + site) no host (127.0.0.1). */
  appPort: number;
  /** Porta no host (127.0.0.1) para o Postgres; usada para configurar FreeRADIUS/portal e acesso externo. */
  pgHostPort?: number;
  radiusSecret: string;
  dbName: string;
  dbUser: string;
  dbPassword: string;
  /** Imagem do Postgres: padrão postgres:16-alpine; use imagem modelo com schema já aplicado. */
  postgresImage?: string;
  /** Quando true, o init é montado em /tenant-init (só 02-tenant.sql); a imagem modelo aplica 01+03 e depois 02. */
  usePostgresModel?: boolean;
  /** Imagem do app (portal + site): se definida, não faz build por tenant (usa modelo). */
  portalAdminImage?: string;
  appContextPath?: string;
}

/**
 * Gera o conteúdo do .env na raiz do tenant (usado pelo docker-compose e pelos serviços).
 */
export function generateTenantRootEnv(params: {
  slug: string;
  domain?: string;
  dbName: string;
  dbUser: string;
  dbPassword: string;
  radiusAuthPort: number;
  radiusAcctPort: number;
  /** Porta TCP do app (portal + site) no host. */
  appPort: number;
  /** Porta do Postgres no host (127.0.0.1) — para configurar FreeRADIUS/portal e acesso externo. */
  pgHostPort?: number;
  radiusSecret: string;
  jwtSecret: string;
  baseUrl: string;
}): string {
  const useHostNetwork = params.pgHostPort != null;
  const dbHost = useHostNetwork ? '127.0.0.1' : `pg_${params.slug}`;
  const dbPort = useHostNetwork ? params.pgHostPort! : 5432;
  const radiusHost = useHostNetwork ? '127.0.0.1' : `radius_${params.slug}`;
  const radiusPort = useHostNetwork ? params.radiusAuthPort : 1812;
  const appPort = params.appPort;
  const lines = [
    `# Tenant stack — gerado pelo SaaS Multi-Portal`,
    `TENANT=${params.slug}`,
    `PG_DB=${params.dbName}`,
    `PG_USER=${params.dbUser}`,
    `PG_PASS=${params.dbPassword}`,
    ...(params.pgHostPort != null ? [`PG_HOST_PORT=${params.pgHostPort}`] : []),
    `RADIUS_AUTH_PORT=${params.radiusAuthPort}`,
    `RADIUS_ACCT_PORT=${params.radiusAcctPort}`,
    `APP_PORT=${params.appPort}`,
    `RADIUS_SECRET=${params.radiusSecret}`,
    `BASE_URL=${params.baseUrl}`,
    `TENANT_SLUG=${params.slug}`,
    `TENANT_ID=1`,
    `NODE_ENV=production`,
    `PORT=${useHostNetwork ? appPort : 3000}`,
    `DB_HOST=${dbHost}`,
    `DB_PORT=${dbPort}`,
    `DB_USER=${params.dbUser}`,
    `DB_PASS=${params.dbPassword}`,
    `DB_NAME=${params.dbName}`,
    `DATABASE_URL=postgres://${params.dbUser}:${encodeURIComponent(params.dbPassword)}@${dbHost}:${dbPort}/${params.dbName}`,
    `RADIUS_HOST=${radiusHost}`,
    `RADIUS_PORT=${radiusPort}`,
    `JWT_SECRET=${params.jwtSecret}`,
    `JWT_EXPIRES_IN=7d`,
  ];
  return lines.join('\n');
}

/**
 * Gera o docker-compose.yml do tenant usando variáveis do .env (${TENANT}, ${PG_DB}, etc.).
 */
export function generateDockerCompose(params: ComposeTemplateParams): string {
  const { slug, tenantId, postgresImage, usePostgresModel, portalAdminImage, appContextPath, pgHostPort } = params;

  const postgresImg = postgresImage || DEFAULT_POSTGRES_IMAGE;
  const useHostNetwork = pgHostPort != null;
  const postgresPortsBlock =
    pgHostPort != null
      ? `
    ports:
      - "127.0.0.1:\${PG_HOST_PORT}:5432"`
      : '';
  const portalAdminImageLine = portalAdminImage
    ? `image: ${portalAdminImage}`
    : `image: multi-portal-admin:${slug}`;
  const portalAdminBuildBlock =
    !portalAdminImage && appContextPath
      ? `
    build:
      context: ${appContextPath}
      dockerfile: Dockerfile`
      : '';

  return `# Stack do tenant: ${slug} (tenant_id=${tenantId})
# App único: portal + site no mesmo container.

services:
  postgres:
    image: ${postgresImg}
    container_name: pg_${slug}
    environment:
      POSTGRES_DB: \${PG_DB}
      POSTGRES_USER: \${PG_USER}
      POSTGRES_PASSWORD: \${PG_PASS}
    volumes:
      - pg_data:/var/lib/postgresql/data
${usePostgresModel ? '      - ./postgres/init:/tenant-init:ro' : '      - ./postgres/init:/docker-entrypoint-initdb.d:ro'}
    networks:
      tenant_net:
        aliases:
          - pg_${slug}
    restart: unless-stopped
${postgresPortsBlock}
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U \${PG_USER} -d \${PG_DB}"]
      interval: 5s
      timeout: 5s
      retries: 5

  portal_admin:
    ${portalAdminImageLine}
${portalAdminBuildBlock}
    container_name: portal_${slug}
    env_file:
      - .env
    environment:
      TENANT_ID: "1"
      TENANT_SLUG: \${TENANT}
    depends_on:
      postgres:
        condition: service_healthy
    restart: unless-stopped
${useHostNetwork ? `    network_mode: host
    volumes:
      - ./site/static:/app/site/static:ro
      - ./portal:/app/web/portal:ro
      - /var/run/docker.sock:/var/run/docker.sock` : `    networks:
      - tenant_net
    ports:
      - "127.0.0.1:\${APP_PORT}:3000"
    volumes:
      - ./site/static:/app/site/static:ro
      - ./portal:/app/web/portal:ro
      - /var/run/docker.sock:/var/run/docker.sock`}

networks:
  tenant_net:
    name: tenant_${slug.replace(/[^a-z0-9_-]/gi, '_')}
    driver: bridge

volumes:
  pg_data:
    name: pgdata_${slug.replace(/[^a-z0-9_-]/gi, '_')}
`;
}

/**
 * Gera clients.conf do FreeRADIUS (clientes NAS).
 */
export function generateRadiusClientsConf(radiusSecret: string, slug: string, nasIps: string[] = []): string {
  if (nasIps.length > 0) {
    return nasIps.map(
      (ip) => `
client nas_${ip.replace(/\./g, '_')} {
  ipaddr = ${ip}
  secret = ${radiusSecret}
  shortname = nas-${ip.replace(/\./g, '-')}
  require_message_authenticator = no
  limit_proxy_state = false
}
`
    ).join('').trim() + '\n';
  }
  return `# Aceita qualquer NAS (configure IPs em produção)
# require_message_authenticator = no + limit_proxy_state = false: evita BlastRADIUS rejeitar teste do portal e NAS que não enviam Message-Authenticator/Proxy-State; o portal envia Message-Authenticator (add_message_authenticator = true).
client mikrotik_${slug} {
  ipaddr = 0.0.0.0
  netmask = 0
  secret = ${radiusSecret}
  shortname = ${slug}
  require_message_authenticator = no
  limit_proxy_state = false
}
`;
}

/**
 * Gera arquivo users (authorize) do FreeRADIUS (fallback quando SQL não retorna usuário).
 */
export function generateRadiusUsersFile(extraLines: string[] = []): string {
  const lines = [
    '# FreeRADIUS users (authorize) — fallback se SQL não tiver o usuário',
    '# Formato: usuario Cleartext-Password := "senha"',
    '#',
    ...extraLines,
  ];
  return lines.join('\n').trim() + '\n';
}

/**
 * Gera mods-available/sql do FreeRADIUS apontando para o Postgres.
 * RADIUS no host: use postgresHost 127.0.0.1 e postgresPort = porta do host (ex.: 4002).
 */
export function generateRadiusSqlMod(
  dbName: string,
  dbUser: string,
  dbPassword: string,
  postgresHost: string,
  postgresPort: number = 5432
): string {
  const escaped = dbPassword.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return `# SQL module — PostgreSQL (gerado pelo SaaS). Host=${postgresHost} port=${postgresPort}

sql {
\tdialect = "postgresql"
\tdriver = "rlm_sql_postgresql"

\t# Conexão com o Postgres do tenant
\tradius_db = "dbname=${dbName} host=${postgresHost} port=${postgresPort} user=${dbUser} password=${escaped}"

\t# Tabela de NAS/clients usada pelo FreeRADIUS (necessária para \${client_table} em queries.conf)
\tclient_table = "nas"

\tacct_table1 = "radacct"
\tacct_table2 = "radacct"
\tpostauth_table = "radpostauth"
\tauthcheck_table = "radcheck"
\tgroupcheck_table = "radgroupcheck"
\tauthreply_table = "radreply"
\tgroupreply_table = "radgroupreply"
\tusergroup_table = "radusergroup"
\t# Obrigatório antes do $INCLUDE queries.conf (ele referencia \${group_attribute})
\tgroup_attribute = "SQL-Group"

\t$INCLUDE \${modconfdir}/sql/driver/postgresql
\t$INCLUDE \${modconfdir}/sql/main/postgresql/queries.conf

\tpool {
\t\tstart = 0
\t\tmin = 1
\t\tmax = 32
\t}
}
`;
}

/**
 * Gera sites-available/default: estrutura plana (igual ao site oficial) para authorize, authenticate, post-auth e accounting.
 * post-auth com sql grava em radpostauth para Auditoria / Logs no portal.
 */
export function generateRadiusDefaultSite(): string {
  return `# Site default — estrutura plana (gerado pelo SaaS). post-auth sql grava em radpostauth.
server default {
\tnamespace = radius

\tlisten {
\t\ttype = auth
\t\tipaddr = *
\t\tport = 0
\t}
\tlisten {
\t\ttype = acct
\t\tipaddr = *
\t\tport = 0
\t}

\tauthorize {
\t\tpreprocess
\t\tsql
\t\tpap
\t}
\tauthenticate {
\t\tAuth-Type PAP {
\t\t\tpap
\t\t}
\t}
\tpost-auth {
\t\tsql
\t}
\taccounting {
\t\tsql
\t}
}
`;
}

/**
 * Gera radiusd.conf mínimo para FreeRADIUS no host (systemd).
 * @param radiusDirPath Caminho absoluto do diretório radius (ex.: /srv/tenants/tp/radius).
 */
export function generateRadiusdConf(radiusDirPath: string): string {
  return `# FreeRADIUS — config mínima por tenant (gerado pelo SaaS). Roda no host (systemd).
prefix = ${radiusDirPath}
logdir = \${prefix}/log
run_dir = \${prefix}/run
modconfdir = \${prefix}/mods-config
\$INCLUDE clients.conf
\$INCLUDE mods-enabled/
\$INCLUDE sites-enabled/
`;
}
