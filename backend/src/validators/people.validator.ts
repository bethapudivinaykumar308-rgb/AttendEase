import { z } from 'zod';
import {
  emailSchema,
  idParam,
  nameSchema,
  paginationSchema,
  passwordSchema,
  sectionSchema,
} from './common.validator.js';

/** Blank or missing means "the administrator wants a generated password". */
const optionalPassword = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  passwordSchema.optional(),
);

export const createStudentSchema = z.object({
  name: nameSchema,
  email: emailSchema.optional(),
  password: optionalPassword,
  rollNumber: z.string().trim().min(2).max(40),
  departmentId: z.coerce.number().int().positive(),
  semesterId: z.coerce.number().int().positive(),
  section: sectionSchema,
  admissionYear: z.coerce.number().int().min(1990).max(2100),
});

export const updateStudentSchema = z.object({
  name: nameSchema.optional(),
  email: emailSchema.optional(),
  rollNumber: z.string().trim().min(2).max(40).optional(),
  departmentId: z.coerce.number().int().positive().optional(),
  semesterId: z.coerce.number().int().positive().optional(),
  section: sectionSchema.optional(),
  admissionYear: z.coerce.number().int().min(1990).max(2100).optional(),
  isActive: z.boolean().optional(),
});

export const studentListSchema = paginationSchema.extend({
  departmentId: z.coerce.number().int().positive().optional(),
  semesterId: z.coerce.number().int().positive().optional(),
  academicYearId: z.coerce.number().int().positive().optional(),
  section: sectionSchema.optional(),
  isActive: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional(),
});

export const createFacultySchema = z.object({
  name: nameSchema,
  email: emailSchema.optional(),
  password: optionalPassword,
  facultyId: z.string().trim().min(2).max(40),
  departmentId: z.coerce.number().int().positive(),
  designation: z.string().trim().min(2).max(80),
});

export const updateFacultySchema = z.object({
  name: nameSchema.optional(),
  email: emailSchema.optional(),
  facultyId: z.string().trim().min(2).max(40).optional(),
  departmentId: z.coerce.number().int().positive().optional(),
  designation: z.string().trim().min(2).max(80).optional(),
  isActive: z.boolean().optional(),
});

export const facultyListSchema = paginationSchema.extend({
  departmentId: z.coerce.number().int().positive().optional(),
  isActive: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional(),
});

export const assignmentBodySchema = z.object({
  facultyId: z.coerce.number().int().positive(),
  subjectId: z.coerce.number().int().positive(),
  sectionId: z.coerce.number().int().positive(),
  academicYearId: z.coerce.number().int().positive(),
});

export const enrollmentBodySchema = z.object({
  studentIds: z.array(z.coerce.number().int().positive()).min(1),
  subjectId: z.coerce.number().int().positive(),
  academicYearId: z.coerce.number().int().positive(),
  sectionId: z.coerce.number().int().positive().optional(),
});

/**
 * The admin either supplies a password or lets the API generate one, so the
 * body itself may be empty.
 */
export const resetPasswordSchema = z
  .object({ password: optionalPassword })
  .optional()
  .transform((value) => value ?? {});

export { idParam };
