/**
 * Diagnóstico do ambiente de provisionamento (VPS/produção).
 * GET /api/saas/provisioning-check retorna se Docker, paths e permissões estão OK.
 */
import fs from 'fs/promises';
import path from 'path';
import { checkDockerAvailable } from './dockerRunner.js';

const DEFAULT_BASE_PATH = process.platform === 'win32' ? 'C:\\srv\\tenants' : '/srv/tenants';

export interface ProvisioningCheckResult {
  ok: boolean;
  provisionDockerEnabled: boolean;
  tenantsBasePath: string;
  appContextPath: string;
  docker: { available: boolean; error?: string };
  tenantsDirWritable: boolean;
  tenantsDirError?: string;
  schemaExists: boolean;
  schemaPath: string;
  hints: string[];
}

export async function getProvisioningCheck(): Promise<ProvisioningCheckResult> {
  const hints: string[] = [];
  const provisionDockerEnabled = !/^0|false|no$/i.test(String(process.env.PROVISION_DOCKER || '').trim());
  const tenantsBasePath = path.resolve(process.env.TENANTS_BASE_PATH || DEFAULT_BASE_PATH);
  const appContextPath = path.resolve(process.env.PROVISION_APP_CONTEXT || process.cwd());
  const schemaPath = path.join(appContextPath, 'sql', 'schema.pg.sql');

  let dockerAvailable = false;
  let dockerError: string | undefined;
  try {
    dockerAvailable = await checkDockerAvailable();
  } catch (e) {
    dockerError = (e as Error).message;
  }
  if (!dockerAvailable) {
    hints.push('Docker não está disponível. Instale Docker e adicione o usuário do app ao grupo docker (sudo usermod -aG docker $USER).');
  }

  let tenantsDirWritable = false;
  let tenantsDirError: string | undefined;
  try {
    await fs.mkdir(tenantsBasePath, { recursive: true });
    await fs.access(tenantsBasePath, fs.constants.W_OK);
    tenantsDirWritable = true;
  } catch (e) {
    tenantsDirError = (e as Error).message;
    hints.push(`Crie o diretório e dê permissão: sudo mkdir -p ${tenantsBasePath} && sudo chown $(whoami) ${tenantsBasePath}`);
  }

  let schemaExists = false;
  try {
    await fs.access(schemaPath, fs.constants.R_OK);
    schemaExists = true;
  } catch {
    hints.push(`Defina PROVISION_APP_CONTEXT com o caminho da raiz do projeto (onde está sql/schema.pg.sql). Ex.: PROVISION_APP_CONTEXT=${process.cwd()}`);
  }

  if (!provisionDockerEnabled) {
    hints.push('Provisionamento está desativado (PROVISION_DOCKER=0). Remova ou defina PROVISION_DOCKER=1 para criar stack ao criar provedor.');
  }

  const ok = provisionDockerEnabled && dockerAvailable && tenantsDirWritable && schemaExists;

  return {
    ok,
    provisionDockerEnabled,
    tenantsBasePath,
    appContextPath,
    docker: { available: dockerAvailable, error: dockerError },
    tenantsDirWritable,
    tenantsDirError,
    schemaExists,
    schemaPath,
    hints,
  };
}
