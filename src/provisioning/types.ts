/**
 * Tipos do provisionamento Docker por tenant (portal + site + FreeRADIUS).
 */
export interface TenantPorts {
  /** Porta UDP de autenticação RADIUS no host (ex.: 30112). */
  radiusAuthPort: number;
  /** Porta UDP de accounting RADIUS no host (ex.: 30113). */
  radiusAcctPort: number;
  /** Porta TCP do site (nginx) no host para proxy (ex.: 21008). */
  sitePort: number;
  /** Porta TCP do portal admin no host, só em 127.0.0.1 (ex.: 21002), para Nginx path-based /slug/ e /slug/portal/. Opcional em stacks antigos. */
  adminPort?: number;
  /** Porta TCP do Postgres no host (127.0.0.1), para acesso externo/debug e para configurar outros serviços. */
  pgHostPort?: number;
}

export interface ProvisioningConfig {
  /** Caminho no host onde ficam o compose e configs do tenant (ex.: /srv/tenants/slug). */
  stackPath: string;
  /** Portas atribuídas (radius auth, radius acct no host). */
  ports: TenantPorts;
  /** Secret RADIUS gerado para o tenant. */
  radiusSecret: string;
  /** Nome do banco PostgreSQL do tenant. */
  dbName?: string;
  /** Usuário PostgreSQL do tenant. */
  dbUser?: string;
  /** Senha PostgreSQL do tenant (guardar com cuidado; uso em recuperação/backup). */
  dbPass?: string;
  /** Status do provisionamento. */
  status: 'pending' | 'provisioning' | 'running' | 'error' | 'stopped';
  /** Última mensagem de log ou erro. */
  lastLog?: string;
  /** Timestamp do último provisionamento. */
  lastProvisionedAt?: string;
}

export interface MasterUserSeed {
  email: string;
  name: string;
  password_hash: string;
}

export interface TenantProvisionInput {
  tenantId: number;
  slug: string;
  name: string;
  /** Domínio ou subdomínio para o portal/site (ex.: provedor1.seudominio.com). */
  domain?: string;
  /** Secret RADIUS desejado; se não informado, é gerado. */
  radiusSecret?: string;
  /** Usuário Master para inserir no banco do tenant (login no portal). */
  masterUser?: MasterUserSeed;
}

export interface ProvisionResult {
  success: boolean;
  message: string;
  config?: ProvisioningConfig;
  log?: string[];
}
