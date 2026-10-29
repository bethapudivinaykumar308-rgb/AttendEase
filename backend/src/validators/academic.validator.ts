import { z } from 'zod';
import {
  dateOnlyString,
  dateRangeSchema,
  idParam,
  paginationSchema,
  parseDateOnly,
  sectionSchema,
} from './common.validator.js';

export const departmentBodySchema = z.object({
  departmentName: z.string().trim().min(2).max(120),
  departmentCode: z
    .string()
    .trim()
    .min(2)
    .max(20)
    .transform((value) => value.toUpperCase()),
});

export const academicYearFieldsSchema = z.object({
  yearName: z.string().trim().min(2).max(20),
  startDate: dateOnlyString.transform(parseDateOnly),
  endDate: dateOnlyString.transform(parseDateOnly),
  isActive: z.boolean().optional(),
});

export const academicYearBodySchema = academicYearFieldsSchema.refine(
  (data) => data.endDate > data.startDate,
  { message: 'End date must be after the start date', path: ['endDate'] },
);

export const semesterFieldsSchema = z.object({
  semesterNumber: z.coerce.number().int().min(1).max(12),
  academicYearId: z.coerce.number().int().positive(),
  startDate: dateOnlyString.transform(parseDateOnly),
  endDate: dateOnlyString.transform(parseDateOnly),
  isActive: z.boolean().optional(),
});

export const semesterBodySchema = semesterFieldsSchema.refine(
  (data) => data.endDate > data.startDate,
  { message: 'End date must be after the start date', path: ['endDate'] },
);

export const subjectBodySchema = z.object({
  subjectCode: z
    .string()
    .trim()
    .min(2)
    .max(40)
    .transform((value) => value.toUpperCase()),
  subjectName: z.string().trim().min(2).max(160),
  departmentId: z.coerce.number().int().positive(),
  semesterId: z.coerce.number().int().positive(),
  academicYearId: z.coerce.number().int().positive(),
  credits: z.coerce.number().int().min(0).max(20).default(3),
  isActive: z.boolean().optional(),
});

export const sectionBodySchema = z.object({
  subjectId: z.coerce.number().int().positive(),
  academicYearId: z.coerce.number().int().positive(),
  section: sectionSchema,
});

export const departmentListSchema = paginationSchema;
export const academicYearListSchema = paginationSchema;
export const semesterListSchema = paginationSchema.extend({
  academicYearId: z.coerce.number().int().positive().optional(),
});
export const subjectListSchema = paginationSchema.extend({
  departmentId: z.coerce.number().int().positive().optional(),
  semesterId: z.coerce.number().int().positive().optional(),
  academicYearId: z.coerce.number().int().positive().optional(),
  isActive: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional(),
});
export const sectionListSchema = paginationSchema.extend({
  subjectId: z.coerce.number().int().positive().optional(),
  academicYearId: z.coerce.number().int().positive().optional(),
});

export { dateRangeSchema, idParam };
