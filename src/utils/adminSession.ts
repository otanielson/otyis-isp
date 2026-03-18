import { randomBytes } from 'crypto';

const adminSessions = new Set<string>();
const SESSION_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24h
const sessionExpiry = new Map<string, number>();

export function createAdminSession(): string {
  const token = randomBytes(32).toString('hex');
  adminSessions.add(token);
  sessionExpiry.set(token, Date.now() + SESSION_MAX_AGE_MS);
  return token;
}

export function isValidAdminSession(token: string | undefined): boolean {
  if (!token) return false;
  const exp = sessionExpiry.get(token);
  if (exp && Date.now() > exp) {
    adminSessions.delete(token);
    sessionExpiry.delete(token);
    return false;
  }
  return adminSessions.has(token);
}

export function destroyAdminSession(token: string): void {
  adminSessions.delete(token);
  sessionExpiry.delete(token);
}
