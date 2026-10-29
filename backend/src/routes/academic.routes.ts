import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import {
  createDepartment,
  createAcademicYear,
  createSection,
  createSemester,
  createSubject,
  deleteAcademicYear,
  deleteDepartment,
  deleteSection,
  deleteSemester,
  deleteSubject,
  getAcademicOptions,
  getAcademicYear,
  getDepartment,
  getSection,
  getSemester,
  getSubject,
  listAcademicYears,
  listDepartments,
  listSections,
  listSemesters,
  listSubjects,
  updateAcademicYear,
  updateDepartment,
  updateSection,
  updateSemester,
  updateSubject,
} from '../controllers/academic.controller.js';
import {
  academicYearBodySchema,
  academicYearFieldsSchema,
  academicYearListSchema,
  departmentBodySchema,
  departmentListSchema,
  idParam,
  sectionBodySchema,
  sectionListSchema,
  semesterBodySchema,
  semesterFieldsSchema,
  semesterListSchema,
  subjectBodySchema,
  subjectListSchema,
} from '../validators/academic.validator.js';

export const departmentsRouter = Router();
departmentsRouter.get(
  '/',
  requireAuth,
  validate({ query: departmentListSchema }),
  listDepartments,
);
departmentsRouter.post(
  '/',
  requireRole('ADMIN'),
  validate({ body: departmentBodySchema }),
  createDepartment,
);
departmentsRouter.get('/:id', requireAuth, validate({ params: idParam }), getDepartment);
departmentsRouter.put(
  '/:id',
  requireRole('ADMIN'),
  validate({ params: idParam, body: departmentBodySchema.partial() }),
  updateDepartment,
);
departmentsRouter.delete('/:id', requireRole('ADMIN'), validate({ params: idParam }), deleteDepartment);

export const academicYearsRouter = Router();
academicYearsRouter.get(
  '/',
  requireAuth,
  validate({ query: academicYearListSchema }),
  listAcademicYears,
);
academicYearsRouter.post(
  '/',
  requireRole('ADMIN'),
  validate({ body: academicYearBodySchema }),
  createAcademicYear,
);
academicYearsRouter.get('/:id', requireAuth, validate({ params: idParam }), getAcademicYear);
academicYearsRouter.put(
  '/:id',
  requireRole('ADMIN'),
  validate({ params: idParam, body: academicYearFieldsSchema.partial() }),
  updateAcademicYear,
);
academicYearsRouter.delete(
  '/:id',
  requireRole('ADMIN'),
  validate({ params: idParam }),
  deleteAcademicYear,
);

export const semestersRouter = Router();
semestersRouter.get(
  '/',
  requireAuth,
  validate({ query: semesterListSchema }),
  listSemesters,
);
semestersRouter.post(
  '/',
  requireRole('ADMIN'),
  validate({ body: semesterBodySchema }),
  createSemester,
);
semestersRouter.get('/:id', requireAuth, validate({ params: idParam }), getSemester);
semestersRouter.put(
  '/:id',
  requireRole('ADMIN'),
  validate({ params: idParam, body: semesterFieldsSchema.partial() }),
  updateSemester,
);
semestersRouter.delete('/:id', requireRole('ADMIN'), validate({ params: idParam }), deleteSemester);

export const subjectsRouter = Router();
subjectsRouter.get('/', requireAuth, validate({ query: subjectListSchema }), listSubjects);
subjectsRouter.post(
  '/',
  requireRole('ADMIN'),
  validate({ body: subjectBodySchema }),
  createSubject,
);
subjectsRouter.get('/:id', requireAuth, validate({ params: idParam }), getSubject);
subjectsRouter.put(
  '/:id',
  requireRole('ADMIN'),
  validate({ params: idParam, body: subjectBodySchema.partial() }),
  updateSubject,
);
subjectsRouter.delete('/:id', requireRole('ADMIN'), validate({ params: idParam }), deleteSubject);

export const sectionsRouter = Router();
sectionsRouter.get('/', requireAuth, validate({ query: sectionListSchema }), listSections);
sectionsRouter.post(
  '/',
  requireRole('ADMIN'),
  validate({ body: sectionBodySchema }),
  createSection,
);
sectionsRouter.get('/:id', requireAuth, validate({ params: idParam }), getSection);
sectionsRouter.put(
  '/:id',
  requireRole('ADMIN'),
  validate({ params: idParam, body: sectionBodySchema.partial() }),
  updateSection,
);
sectionsRouter.delete('/:id', requireRole('ADMIN'), validate({ params: idParam }), deleteSection);

export const academicOptionsRouter = Router();
academicOptionsRouter.get('/', requireAuth, getAcademicOptions);
