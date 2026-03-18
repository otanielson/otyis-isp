import jwt from 'jsonwebtoken';

export interface JwtPayload {
  tenantId: number;
  userId: number;
  roles: string[];
  permissions: string[];
  isMaster: boolean;
}

const secret = process.env.JWT_SECRET || 'change-me-in-production';
const expiresIn = process.env.JWT_EXPIRES_IN || '7d';

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, secret, { expiresIn } as jwt.SignOptions);
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, secret) as JwtPayload;
}
