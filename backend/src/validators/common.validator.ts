import { z } from 'zod';

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
  search: z.string().trim().optional(),
  sortBy: z.string().trim().optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
});

export type PaginationQuery = z.infer<typeof paginationSchema>;

export const idParam = z.object({ id: z.coerce.number().int().positive() });
export const studentIdParam = z.object({ studentId: z.coerce.number().int().positive() });
export const subjectIdParam = z.object({ subjectId: z.coerce.number().int().positive() });

export const dateRangeSchema = z.object({
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
});

export const attendanceStatusSchema = z.enum(['PRESENT', 'ABSENT', 'LATE', 'ON_LEAVE']);

export const roleSchema = z.enum(['ADMIN', 'FACULTY', 'STUDENT']);

export const emailSchema = z
  .string()
  .trim()
  .min(5)
  .max(160)
  .email('Enter a valid email address')
  .transform((value) => value.toLowerCase());

export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  // bcrypt silently truncates anything past 72 bytes, so longer passwords
  // would be accepted but not fully honoured.
  .max(72, 'Password must be at most 72 characters')
  .regex(/[a-z]/, 'Password must contain a lowercase letter')
  .regex(/[A-Z]/, 'Password must contain an uppercase letter')
  .regex(/[0-9]/, 'Password must contain a number');

export const nameSchema = z
  .string()
  .trim()
  .min(2, 'Name must be at least 2 characters')
  .max(120);

export const sectionSchema = z
  .string()
  .trim()
  .min(1)
  .max(10)
  .transform((value) => value.toUpperCase());

/**
 * Date-only values are kept as `YYYY-MM-DD` strings on the wire and stored as
 * UTC midnight, which keeps them free of timezone drift in MySQL DATE columns.
 */
export const dateOnlyString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter a valid date (YYYY-MM-DD)')
  .refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00Z`)), 'Enter a valid date');

export function parseDateOnly(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

export const optionalDateOnlyString = dateOnlyString.optional();

