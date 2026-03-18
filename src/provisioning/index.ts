/**
 * Provisionamento Docker por tenant: portal + site + FreeRADIUS.
 * Ativa com PROVISION_DOCKER=1; POST /api/saas/tenants chama provisionTenantStack.
 */
export {
  provisionTenantStack,
  getTenantProvisioningStatus,
  deprovisionTenantStack,
  getTenantStackLogs,
  restartTenantStack,
} from './orchestrator.js';
export { getTenantDbClient } from './tenantDbClient.js';
export { findFreeUdpPort, findFreeUdpPortPair, getPortRanges } from './portFinder.js';
export { dockerComposeUp, dockerComposeDown, checkDockerAvailable } from './dockerRunner.js';
export { getProvisioningCheck } from './provisioningCheck.js';
export { generateDockerCompose, generateRadiusClientsConf, generateRadiusUsersFile } from './composeGenerator.js';
export type { TenantProvisionInput, ProvisionResult, ProvisioningConfig, TenantPorts } from './types.js';
