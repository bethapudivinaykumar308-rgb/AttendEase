import crypto from 'node:crypto';
import { prisma } from '../config/prisma.js';

/**
 * Credentials are issued by the administrator, never chosen by the account
 * holder: the API generates a temporary password and, when the admin does not
 * supply one, an institutional email address.
 */

const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const LOWER = 'abcdefghijkmnopqrstuvwxyz';
const DIGITS = '23456789';
const SYMBOLS = '@#$%&*!?';
const ALL = UPPER + LOWER + DIGITS + SYMBOLS;

const EMAIL_DOMAINS = {
  STUDENT: 'students.attendease.edu',
  FACULTY: 'faculty.attendease.edu',
} as const;

function pick(characters: string): string {
  return characters[crypto.randomInt(characters.length)];
}

/** Random password that always satisfies the password policy. */
export function generateTemporaryPassword(length = 12): string {
  const required = [pick(UPPER), pick(LOWER), pick(DIGITS), pick(SYMBOLS)];
  const filler = Array.from({ length: Math.max(0, length - required.length) }, () => pick(ALL));
  const characters = [...required, ...filler];

  for (let i = characters.length - 1; i > 0; i -= 1) {
    const j = crypto.randomInt(i + 1);
    [characters[i], characters[j]] = [characters[j], characters[i]];
  }

  return characters.join('');
}

/** `Dr. Arun Kumar` -> `arun.kumar` */
export function emailLocalPart(name: string): string {
  return name
    .toLowerCase()
    .replace(/^(dr|mr|mrs|ms)\.?\s+/, '')
    .replace(/[^a-z\s]/g, '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .join('.');
}

/** Builds `name@role-domain`, adding a numeric suffix when it is already taken. */
export async function generateUniqueEmail(
  name: string,
  role: keyof typeof EMAIL_DOMAINS,
): Promise<string> {
  const domain = EMAIL_DOMAINS[role];
  const base = emailLocalPart(name) || role.toLowerCase();

  let candidate = `${base}@${domain}`;
  let suffix = 2;

  while (await prisma.user.findUnique({ where: { email: candidate }, select: { id: true } })) {
    candidate = `${base}${suffix}@${domain}`;
    suffix += 1;
  }

  return candidate;
}
