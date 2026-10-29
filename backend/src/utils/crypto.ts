import crypto from 'node:crypto';

export function generateToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('hex');
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function randomIdempotencyKey(): string {
  return crypto.randomUUID();
}
