/**
 * Encontra portas livres (TCP e UDP) para provisionamento do stack do tenant.
 * Evita conflito com outros tenants e serviços no host.
 */
import net from 'net';
import dgram from 'dgram';

/** Portas TCP (site, portal admin): uso automático acima de 4000. */
const DEFAULT_TCP_START = 4001;
const DEFAULT_TCP_END = 49999;
/** Portas UDP (RADIUS auth+acct): uso automático acima de 4000. */
const DEFAULT_UDP_START = 4001;
const DEFAULT_UDP_END = 49999;

/**
 * Verifica se uma porta TCP está livre (tenta bind).
 */
function isTcpPortFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => {
      server.close(() => resolve(true));
    });
    server.listen(port, '0.0.0.0');
  });
}

/**
 * Verifica se uma porta UDP está livre (tenta bind).
 */
function isUdpPortFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = dgram.createSocket('udp4');
    socket.once('error', () => {
      try { socket.close(); } catch { /* ignore */ }
      resolve(false);
    });
    socket.once('listening', () => {
      try { socket.close(); } catch { /* ignore */ }
      resolve(true);
    });
    socket.bind(port, '0.0.0.0');
  });
}

/**
 * Encontra a primeira porta TCP livre em [start, end].
 */
export async function findFreeTcpPort(
  start: number = DEFAULT_TCP_START,
  end: number = DEFAULT_TCP_END
): Promise<number | null> {
  for (let p = start; p <= end; p++) {
    const free = await isTcpPortFree(p);
    if (free) return p;
  }
  return null;
}

/**
 * Encontra uma porta UDP livre no range [start, end].
 * Usa bind para garantir que a porta está livre.
 */
export async function findFreeUdpPort(
  start: number = DEFAULT_UDP_START,
  end: number = DEFAULT_UDP_END
): Promise<number | null> {
  for (let p = start; p <= end; p++) {
    const free = await isUdpPortFree(p);
    if (free) return p;
  }
  return null;
}

/**
 * Encontra duas portas UDP distintas e livres (auth e acct) no range [start, end].
 * Varre o range uma vez e retorna o primeiro par consecutivo livre (ex.: 20100 e 20101).
 */
export async function findFreeUdpPortPair(
  start: number = DEFAULT_UDP_START,
  end: number = DEFAULT_UDP_END
): Promise<[number, number] | null> {
  if (end - start < 1) return null;
  for (let p = start; p < end; p++) {
    const free1 = await isUdpPortFree(p);
    if (!free1) continue;
    const free2 = await isUdpPortFree(p + 1);
    if (free2) return [p, p + 1];
  }
  return null;
}

/**
 * Retorna range de portas a partir do .env (opcional).
 * TCP: site e portal admin. UDP: RADIUS auth/acct.
 */
export function getPortRanges(): {
  tcpStart: number;
  tcpEnd: number;
  udpStart: number;
  udpEnd: number;
} {
  return {
    tcpStart: Number(process.env.PROVISION_TCP_PORT_START) || DEFAULT_TCP_START,
    tcpEnd: Number(process.env.PROVISION_TCP_PORT_END) || DEFAULT_TCP_END,
    udpStart: Number(process.env.PROVISION_UDP_PORT_START) || DEFAULT_UDP_START,
    udpEnd: Number(process.env.PROVISION_UDP_PORT_END) || DEFAULT_UDP_END,
  };
}
