import bcrypt from 'bcryptjs';
import { prisma } from '../config/prisma.js';
import { env } from '../config/env.js';
import { badRequest, unauthorized } from '../utils/errors.js';
import { generateToken, hashToken } from '../utils/crypto.js';
import { signSessionToken } from '../middleware/auth.js';
import type { Role } from '@prisma/client';

const BCRYPT_ROUNDS = 12;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export interface AuthenticatedUser {
  id: number;
  name: string;
  email: string;
  role: Role;
  isActive: boolean;
  createdAt: Date;
}

export async function authenticate(email: string, password: string): Promise<AuthenticatedUser> {
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });

  // Always run a hash comparison so response timing does not reveal whether
  // the email exists.
  const hash = user?.passwordHash ?? '$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidin';
  const passwordMatches = await verifyPassword(password, hash);

  if (!user || !passwordMatches) {
    throw unauthorized('Incorrect email or password');
  }
  if (!user.isActive) {
    throw unauthorized('This account has been deactivated. Please contact the administrator.');
  }

  const { passwordHash: _ignored, ...safeUser } = user;
  return safeUser;
}

export function createSessionToken(user: { id: number; name: string; email: string; role: Role }): string {
  return signSessionToken({ sub: user.id, name: user.name, email: user.email, role: user.role });
}

export async function requestPasswordReset(email: string): Promise<string | null> {
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  // A null return means the email is unknown. The API intentionally does not
  // reveal whether the address exists.
  if (!user || !user.isActive) return null;

  const rawToken = generateToken(32);
  await prisma.passwordResetToken.create({
    data: {
      userId: user.id,
      tokenHash: hashToken(rawToken),
      expiresAt: new Date(Date.now() + env.RESET_TOKEN_TTL_MINUTES * 60 * 1000),
    },
  });

  // In a production deployment this token is emailed to the user. Without an
  // SMTP provider it is returned so the flow stays testable end to end.
  return rawToken;
}

export async function resetPasswordWithToken(rawToken: string, newPassword: string): Promise<void> {
  const tokenHash = hashToken(rawToken);
  const resetToken = await prisma.passwordResetToken.findUnique({ where: { tokenHash } });

  if (!resetToken || resetToken.usedAt || resetToken.expiresAt.getTime() < Date.now()) {
    throw badRequest('This reset link is invalid or has expired. Please request a new one.');
  }

  const passwordHash = await hashPassword(newPassword);

  await prisma.$transaction([
    prisma.user.update({
      where: { id: resetToken.userId },
      data: { passwordHash },
    }),
    prisma.passwordResetToken.update({
      where: { id: resetToken.id },
      data: { usedAt: new Date() },
    }),
    prisma.passwordResetToken.deleteMany({
      where: { userId: resetToken.userId, usedAt: null },
    }),
  ]);
}

export async function changePassword(
  userId: number,
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw unauthorized();

  const matches = await verifyPassword(currentPassword, user.passwordHash);
  if (!matches) throw badRequest('Your current password is incorrect');

  const passwordHash = await hashPassword(newPassword);
  await prisma.user.update({ where: { id: userId }, data: { passwordHash } });
}

/** Full profile for the signed-in user, including their role-specific record. */
export async function getProfile(userId: number) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      isActive: true,
      createdAt: true,
      student: {
        select: {
          id: true,
          rollNumber: true,
          section: true,
          admissionYear: true,
          department: { select: { id: true, departmentName: true, departmentCode: true } },
          semester: {
            select: {
              id: true,
              semesterNumber: true,
              academicYear: { select: { id: true, yearName: true } },
            },
          },
        },
      },
      faculty: {
        select: {
          id: true,
          facultyId: true,
          designation: true,
          department: { select: { id: true, departmentName: true, departmentCode: true } },
        },
      },
    },
  });

  return user;
}
