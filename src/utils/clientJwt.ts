import jwt from 'jsonwebtoken';

export interface ClientJwtPayload {
  tenantId: number;
  customerId: number;
}

const secret = process.env.JWT_SECRET || 'change-me-in-production';
const expiresIn = process.env.CLIENT_JWT_EXPIRES_IN || '7d';

export function signClientToken(payload: ClientJwtPayload): string {
  return jwt.sign(payload, secret, { expiresIn } as jwt.SignOptions);
}

export function verifyClientToken(token: string): ClientJwtPayload {
  return jwt.verify(token, secret) as ClientJwtPayload;
}

