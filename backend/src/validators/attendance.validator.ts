import { z } from 'zod';
import {
  attendanceStatusSchema,
  dateOnlyString,
  idParam,
  optionalDateOnlyString,
  paginationSchema,
  parseDateOnly,
  studentIdParam,
  subjectIdParam,
} from './common.validator.js';

export const createSessionSchema = z.object({
  subjectId: z.coerce.number().int().positive(),
  sectionId: z.coerce.number().int().positive(),
  attendanceDate: dateOnlyString.transform(parseDateOnly),
  startTime: z
    .string()
    .trim()
    .regex(/^\d{1,2}:\d{2}(\s?[AP]M)?$/i, 'Enter a valid time (e.g. 09:30 or 9:30 AM)')
    .optional()
    .or(z.literal('')),
  endTime: z
    .string()
    .trim()
    .regex(/^\d{1,2}:\d{2}(\s?[AP]M)?$/i, 'Enter a valid time (e.g. 10:30 or 10:30 AM)')
    .optional()
    .or(z.literal('')),
  topic: z.string().trim().max(200).optional(),
  sessionNumber: z.coerce.number().int().min(1).max(20).default(1),
});

export const submitRecordsSchema = z.object({
  records: z
    .array(
      z.object({
        studentId: z.coerce.number().int().positive(),
        attendanceStatus: attendanceStatusSchema,
        remarks: z.string().trim().max(255).optional(),
      }),
    )
    .min(1, 'At least one attendance record is required')
    .max(1000),
});

export const updateRecordSchema = z.object({
  attendanceStatus: attendanceStatusSchema,
  remarks: z.string().trim().max(255).optional(),
});

export const sessionListSchema = paginationSchema.extend({
  subjectId: z.coerce.number().int().positive().optional(),
  facultyId: z.coerce.number().int().positive().optional(),
  sectionId: z.coerce.number().int().positive().optional(),
  academicYearId: z.coerce.number().int().positive().optional(),
  departmentId: z.coerce.number().int().positive().optional(),
  date: optionalDateOnlyString.transform((v) => (v ? parseDateOnly(v) : undefined)),
  startDate: optionalDateOnlyString.transform((v) => (v ? parseDateOnly(v) : undefined)),
  endDate: optionalDateOnlyString.transform((v) => (v ? parseDateOnly(v) : undefined)),
  status: attendanceStatusSchema.optional(),
});

export const reportQuerySchema = paginationSchema
  .extend({
    reportType: z.enum([
      'student-wise',
      'subject-wise',
      'class-wise',
      'department-wise',
      'date-wise',
      'monthly',
      'semester-wise',
      'low-attendance',
      'faculty-wise',
    ]),
    academicYearId: z.coerce.number().int().positive().optional(),
    semesterId: z.coerce.number().int().positive().optional(),
    departmentId: z.coerce.number().int().positive().optional(),
    subjectId: z.coerce.number().int().positive().optional(),
    sectionId: z.coerce.number().int().positive().optional(),
    section: z.string().trim().max(10).optional(),
    studentId: z.coerce.number().int().positive().optional(),
    facultyId: z.coerce.number().int().positive().optional(),
    startDate: optionalDateOnlyString.transform((v) => (v ? parseDateOnly(v) : undefined)),
    endDate: optionalDateOnlyString.transform((v) => (v ? parseDateOnly(v) : undefined)),
    status: attendanceStatusSchema.optional(),
    threshold: z.coerce.number().min(1).max(100).optional(),
  })
  .refine(
    (data) => !data.startDate || !data.endDate || data.endDate >= data.startDate,
    { message: 'End date must be on or after the start date', path: ['endDate'] },
  );

export { idParam, studentIdParam, subjectIdParam };
