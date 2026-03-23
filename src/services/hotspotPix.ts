import crypto from 'crypto';
import fs from 'fs';
import https from 'https';
import path from 'path';

export interface HotspotTemplateGatewayConfig {
  logoUrl: string | null;
  hotspotGatewayName: string | null;
  hotspotGatewayType: string | null;
  hotspotPixKey: string | null;
  hotspotWebhookUrl: string | null;
  hotspotWebhookSecret: string | null;
  hotspotGatewayClientId: string | null;
  hotspotGatewayClientSecret: string | null;
  hotspotGatewayCertificatePath: string | null;
  hotspotGatewayCertificateKeyPath: string | null;
  hotspotGatewayCertificatePassphrase: string | null;
  hotspotGatewaySandbox: boolean;
  hotspotGatewayBaseUrl: string | null;
}

export interface HotspotPixChargeInput {
  amount: number;
  payerName?: string | null;
  payerPhone?: string | null;
  payerDocument?: string | null;
  description?: string | null;
  expirationSeconds?: number | null;
  txid?: string | null;
  externalReference?: string | null;
}

export interface HotspotPixChargeResult {
  gateway: 'efi';
  txid: string;
  status: string | null;
  locationId: number | null;
  qrcode: string | null;
  imagemQrcode: string | null;
  linkVisualizacao: string | null;
  chargeResponse: Record<string, unknown>;
}

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as JsonRecord) : {};
}

function stringOrNull(value: unknown): string | null {
  if (value == null) return null;
  const normalized = String(value).trim();
  return normalized ? normalized : null;
}

function boolish(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') return /^(1|true|yes|sim|on)$/i.test(value.trim());
  return false;
}

function resolveCredentialPath(filePath: string | null): string | null {
  if (!filePath) return null;
  return path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath);
}

function safeMask(value: string | null): string | null {
  if (!value) return null;
  if (value.length <= 6) return '***';
  return `${value.slice(0, 3)}***${value.slice(-2)}`;
}

export function parseHotspotGatewayConfig(configJson: unknown): HotspotTemplateGatewayConfig {
  const cfg = asRecord(configJson);
  const sandbox = boolish(cfg.hotspot_gateway_sandbox);
  return {
    logoUrl: stringOrNull(cfg.logo_url),
    hotspotGatewayName: stringOrNull(cfg.hotspot_gateway_name),
    hotspotGatewayType: stringOrNull(cfg.hotspot_gateway_type),
    hotspotPixKey: stringOrNull(cfg.hotspot_pix_key),
    hotspotWebhookUrl: stringOrNull(cfg.hotspot_webhook_url),
    hotspotWebhookSecret: stringOrNull(cfg.hotspot_webhook_secret),
    hotspotGatewayClientId: stringOrNull(cfg.hotspot_gateway_client_id),
    hotspotGatewayClientSecret: stringOrNull(cfg.hotspot_gateway_client_secret),
    hotspotGatewayCertificatePath: stringOrNull(cfg.hotspot_gateway_certificate_path),
    hotspotGatewayCertificateKeyPath: stringOrNull(cfg.hotspot_gateway_certificate_key_path),
    hotspotGatewayCertificatePassphrase: stringOrNull(cfg.hotspot_gateway_certificate_passphrase),
    hotspotGatewaySandbox: sandbox,
    hotspotGatewayBaseUrl: stringOrNull(cfg.hotspot_gateway_base_url) || (sandbox ? 'https://pix-h.api.efipay.com.br' : 'https://pix.api.efipay.com.br'),
  };
}

export function sanitizeHotspotTemplateConfig(configJson: unknown, options?: { includeSecrets?: boolean }): JsonRecord {
  const cfg = asRecord(configJson);
  const includeSecrets = !!options?.includeSecrets;
  const sanitized: JsonRecord = { ...cfg };
  if (!includeSecrets) {
    delete sanitized.hotspot_gateway_client_secret;
    delete sanitized.hotspot_gateway_certificate_path;
    delete sanitized.hotspot_gateway_certificate_key_path;
    delete sanitized.hotspot_gateway_certificate_passphrase;
    delete sanitized.hotspot_webhook_secret;
    delete sanitized.hotspot_gateway_client_id;
    sanitized.hotspot_gateway_client_id_masked = safeMask(stringOrNull(cfg.hotspot_gateway_client_id));
    sanitized.hotspot_gateway_secret_configured = !!stringOrNull(cfg.hotspot_gateway_client_secret);
    sanitized.hotspot_gateway_certificate_configured = !!stringOrNull(cfg.hotspot_gateway_certificate_path);
    sanitized.hotspot_gateway_webhook_secret_configured = !!stringOrNull(cfg.hotspot_webhook_secret);
  }
  return sanitized;
}

function buildEfiHttpsAgent(config: HotspotTemplateGatewayConfig): https.Agent {
  const certificatePath = resolveCredentialPath(config.hotspotGatewayCertificatePath);
  if (!certificatePath) {
    throw new Error('Certificado EFI não configurado para este modelo.');
  }
  const certBuffer = fs.readFileSync(certificatePath);
  const passphrase = config.hotspotGatewayCertificatePassphrase || '';
  const ext = path.extname(certificatePath).toLowerCase();
  if (ext === '.p12' || ext === '.pfx') {
    return new https.Agent({
      pfx: certBuffer,
      passphrase,
      minVersion: 'TLSv1.2',
    });
  }
  const keyPath = resolveCredentialPath(config.hotspotGatewayCertificateKeyPath);
  return new https.Agent({
    cert: certBuffer,
    key: keyPath ? fs.readFileSync(keyPath) : certBuffer,
    passphrase: passphrase || undefined,
    minVersion: 'TLSv1.2',
  });
}

function buildJsonBody(data: unknown): string {
  return JSON.stringify(data ?? {});
}

function makeRequest<T = JsonRecord>(
  method: string,
  targetUrl: string,
  headers: Record<string, string>,
  body: string | null,
  agent: https.Agent
): Promise<T> {
  return new Promise((resolve, reject) => {
    const url = new URL(targetUrl);
    const req = https.request(
      {
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port || 443,
        path: `${url.pathname}${url.search}`,
        method,
        headers,
        agent,
      },
      (res) => {
        let raw = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          raw += chunk;
        });
        res.on('end', () => {
          const contentType = String(res.headers['content-type'] || '');
          const isJson = contentType.includes('application/json');
          let parsed: unknown = raw;
          if (isJson && raw) {
            try {
              parsed = JSON.parse(raw);
            } catch {
              parsed = { raw };
            }
          }
          if ((res.statusCode || 500) >= 400) {
            const msg = asRecord(parsed).message || asRecord(parsed).mensagem || raw || `Erro HTTP ${res.statusCode}`;
            reject(new Error(String(msg)));
            return;
          }
          resolve((parsed || {}) as T);
        });
      }
    );
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function getEfiAccessToken(config: HotspotTemplateGatewayConfig): Promise<string> {
  const clientId = config.hotspotGatewayClientId;
  const clientSecret = config.hotspotGatewayClientSecret;
  if (!clientId || !clientSecret) {
    throw new Error('Client ID / Client Secret da EFI não configurados.');
  }
  const agent = buildEfiHttpsAgent(config);
  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const body = buildJsonBody({ grant_type: 'client_credentials' });
  const baseUrl = config.hotspotGatewayBaseUrl || 'https://pix.api.efipay.com.br';
  const tokenResponse = await makeRequest<{ access_token?: string }>(
    'POST',
    `${baseUrl}/oauth/token`,
    {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'Content-Length': Buffer.byteLength(body).toString(),
    },
    body,
    agent
  );
  if (!tokenResponse.access_token) {
    throw new Error('A EFI não retornou access_token.');
  }
  return tokenResponse.access_token;
}

function createEfiTxid(seed?: string | null): string {
  const base = (seed || crypto.randomUUID()).replace(/[^a-zA-Z0-9]/g, '').slice(0, 35);
  return base || crypto.randomBytes(16).toString('hex').slice(0, 35);
}

function normalizeBrazilDocument(value: string | null | undefined): { cpf?: string; cnpj?: string } | null {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length === 11) return { cpf: digits };
  if (digits.length === 14) return { cnpj: digits };
  return null;
}

function buildEfiChargePayload(config: HotspotTemplateGatewayConfig, input: HotspotPixChargeInput, txid: string): JsonRecord {
  const amount = Number(input.amount || 0);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('Valor Pix inválido para gerar cobrança.');
  }
  const expiration = Math.max(300, Math.min(86400, Number(input.expirationSeconds) || 900));
  const payload: JsonRecord = {
    calendario: { expiracao: expiration },
    valor: { original: amount.toFixed(2) },
    chave: config.hotspotPixKey,
    solicitacaoPagador: String(input.description || `Acesso hotspot ${txid}`).slice(0, 140),
    infoAdicionais: [
      { nome: 'referencia', valor: String(input.externalReference || txid).slice(0, 200) },
      input.payerPhone ? { nome: 'telefone', valor: String(input.payerPhone).slice(0, 60) } : null,
    ].filter(Boolean),
  };
  const devedorDoc = normalizeBrazilDocument(input.payerDocument);
  const payerName = stringOrNull(input.payerName);
  if (payerName && devedorDoc?.cpf) {
    payload.devedor = { nome: payerName.slice(0, 200), cpf: devedorDoc.cpf };
  } else if (payerName && devedorDoc?.cnpj) {
    payload.devedor = { nome: payerName.slice(0, 200), cnpj: devedorDoc.cnpj };
  }
  return payload;
}

export async function createEfiPixCharge(configJson: unknown, input: HotspotPixChargeInput): Promise<HotspotPixChargeResult> {
  const config = parseHotspotGatewayConfig(configJson);
  if ((config.hotspotGatewayType || '').toLowerCase() !== 'efi') {
    throw new Error('Este modelo não está configurado com gateway EFI.');
  }
  if (!config.hotspotPixKey) {
    throw new Error('Chave Pix da EFI não configurada no modelo.');
  }
  const agent = buildEfiHttpsAgent(config);
  const token = await getEfiAccessToken(config);
  const txid = createEfiTxid(input.txid);
  const baseUrl = config.hotspotGatewayBaseUrl || 'https://pix.api.efipay.com.br';
  const chargePayload = buildEfiChargePayload(config, input, txid);
  const chargeResponse = await makeRequest<JsonRecord>(
    'PUT',
    `${baseUrl}/v2/cob/${encodeURIComponent(txid)}`,
    {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    buildJsonBody(chargePayload),
    agent
  );
  const loc = asRecord(chargeResponse.loc);
  const locationId = Number(loc.id || 0) || null;
  let qrcode: string | null = null;
  let imagemQrcode: string | null = null;
  let linkVisualizacao: string | null = null;
  if (locationId) {
    try {
      const qrResponse = await makeRequest<JsonRecord>(
        'GET',
        `${baseUrl}/v2/loc/${locationId}/qrcode`,
        {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
        null,
        agent
      );
      qrcode = stringOrNull(qrResponse.qrcode);
      imagemQrcode = stringOrNull(qrResponse.imagemQrcode);
      linkVisualizacao = stringOrNull(qrResponse.linkVisualizacao);
    } catch {
      // A cobrança continua válida mesmo sem QR enriquecido.
    }
  }
  return {
    gateway: 'efi',
    txid,
    status: stringOrNull(chargeResponse.status),
    locationId,
    qrcode,
    imagemQrcode,
    linkVisualizacao,
    chargeResponse,
  };
}

export async function fetchEfiPixCharge(configJson: unknown, txid: string): Promise<JsonRecord> {
  const config = parseHotspotGatewayConfig(configJson);
  if ((config.hotspotGatewayType || '').toLowerCase() !== 'efi') {
    throw new Error('Este modelo não está configurado com gateway EFI.');
  }
  const agent = buildEfiHttpsAgent(config);
  const token = await getEfiAccessToken(config);
  const baseUrl = config.hotspotGatewayBaseUrl || 'https://pix.api.efipay.com.br';
  return makeRequest<JsonRecord>(
    'GET',
    `${baseUrl}/v2/cob/${encodeURIComponent(txid)}`,
    {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
    null,
    agent
  );
}

export function extractPaidTxidsFromWebhook(body: unknown): Array<{ txid: string; payload: JsonRecord }> {
  const root = asRecord(body);
  const pixItems = Array.isArray(root.pix) ? root.pix : [];
  const found: Array<{ txid: string; payload: JsonRecord }> = [];
  for (const item of pixItems) {
    const payload = asRecord(item);
    const txid = stringOrNull(payload.txid);
    if (!txid) continue;
    found.push({ txid, payload });
  }
  return found;
}
