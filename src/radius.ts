/**
 * Cliente RADIUS para autenticação (Access-Request / Access-Accept | Access-Reject).
 * Conecta ao servidor RADIUS configurado em .env (RADIUS_HOST, RADIUS_PORT, RADIUS_SECRET).
 */
import dgram from 'dgram';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const radius = require('radius');

const RADIUS_PORT_DEFAULT = 1812;
const AUTH_TIMEOUT_MS = 5000;

export interface RadiusConfig {
  host: string;
  port: number;
  secret: string;
  nasIp?: string;
}

export interface AuthResult {
  success: boolean;
  message?: string;
}

/**
 * Lê a configuração do servidor RADIUS a partir do ambiente.
 */
export function getRadiusConfig(): RadiusConfig | null {
  const host = process.env.RADIUS_HOST;
  const secret = process.env.RADIUS_SECRET;
  if (!host || !secret) return null;
  return {
    host,
    port: Number(process.env.RADIUS_PORT || RADIUS_PORT_DEFAULT),
    secret,
    nasIp: process.env.RADIUS_NAS_IP || undefined,
  };
}

/**
 * Verifica se o RADIUS está configurado e disponível para uso.
 */
export function isRadiusConfigured(): boolean {
  return getRadiusConfig() !== null;
}

/**
 * Autentica com uma configuração RADIUS específica (útil para multi-tenant).
 */
export function authenticateWithConfig(
  config: RadiusConfig,
  username: string,
  password: string
): Promise<AuthResult> {
  return new Promise((resolve) => {
    const cfg = { ...config, nasIp: config.nasIp || undefined };
    runAuthRequest(cfg, username, password, resolve);
  });
}

/**
 * Autentica um usuário no servidor RADIUS (Access-Request).
 * Usa configuração do .env; para config específica use authenticateWithConfig.
 */
export function authenticate(username: string, password: string): Promise<AuthResult> {
  const config = getRadiusConfig();
  if (!config) {
    return Promise.resolve({
      success: false,
      message: 'Servidor RADIUS não configurado (RADIUS_HOST e RADIUS_SECRET no .env).',
    });
  }
  return authenticateWithConfig(config, username, password);
}

function runAuthRequest(
  config: RadiusConfig,
  username: string,
  password: string,
  resolve: (r: AuthResult) => void
): void {
  const client = dgram.createSocket('udp4');
  const identifier = Math.floor(Math.random() * 256);
  let resolved = false;

  const finish = (result: AuthResult) => {
    if (resolved) return;
    resolved = true;
    try { client.close(); } catch { /* ignore */ }
    resolve(result);
  };

  const timeout = setTimeout(() => {
    finish({ success: false, message: 'Timeout ao conectar no servidor RADIUS.' });
  }, AUTH_TIMEOUT_MS);

  const attrs: [string, string][] = [
    ['User-Name', username],
    ['User-Password', password],
  ];
  if (config.nasIp) attrs.unshift(['NAS-IP-Address', config.nasIp]);

  let rawPacket: Buffer;
  try {
    rawPacket = radius.encode({
      code: 'Access-Request',
      secret: config.secret,
      identifier,
      attributes: attrs,
      add_message_authenticator: true,
    });
  } catch (err) {
    finish({ success: false, message: (err as Error).message });
    return;
  }

  client.on('message', (msg: Buffer) => {
    let decoded: { code?: string; identifier?: number };
    try {
      decoded = radius.decode({ packet: msg, secret: config.secret });
    } catch {
      finish({ success: false, message: 'Resposta inválida do servidor RADIUS.' });
      return;
    }
    if (decoded.identifier !== identifier) return;

    clearTimeout(timeout);
    const valid = radius.verify_response({
      response: msg,
      request: rawPacket,
      secret: config.secret,
    });
    if (!valid) {
      finish({ success: false, message: 'Resposta do RADIUS não verificada (secret incorreto?).' });
      return;
    }
    if (decoded.code === 'Access-Accept') {
      finish({ success: true });
    } else {
      const msg = decoded.code === 'Access-Reject'
        ? 'Usuário ou senha inválidos. Confira no Portal do Provedor: Clientes → instalação do cliente → usuário e senha PPPoE (devem estar sincronizados no RADIUS).'
        : `Resposta inesperada: ${decoded.code}`;
      finish({ success: false, message: msg });
    }
  });

  client.on('error', (err) => {
    clearTimeout(timeout);
    finish({ success: false, message: err?.message || 'Erro de rede ao falar com o RADIUS.' });
  });

  client.bind(0, () => {
    client.send(rawPacket, 0, rawPacket.length, config.port, config.host, (err: Error | null) => {
      if (err) {
        clearTimeout(timeout);
        finish({ success: false, message: err.message || 'Falha ao enviar requisição ao RADIUS.' });
      }
    });
  });
}
