import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import {
  createAssignment,
  createEnrollments,
  deleteAssignment,
  deleteEnrollment,
  getSubjectRoster,
  listAssignments,
  listEnrollments,
  updateAssignment,
} from '../controllers/assignments.controller.js';
import {
  assignmentBodySchema,
  enrollmentBodySchema,
  idParam,
} from '../validators/people.validator.js';
import { paginationSchema, subjectIdParam } from '../validators/common.validator.js';

export const assignmentsRouter = Router();
assignmentsRouter.get(
  '/',
  requireAuth,
  validate({ query: paginationSchema }),
  listAssignments,
);
assignmentsRouter.post(
  '/',
  requireRole('ADMIN'),
  validate({ body: assignmentBodySchema }),
  createAssignment,
);
assignmentsRouter.put(
  '/:id',
  requireRole('ADMIN'),
  validate({ params: idParam, body: assignmentBodySchema.partial() }),
  updateAssignment,
);
assignmentsRouter.delete('/:id', requireRole('ADMIN'), validate({ params: idParam }), deleteAssignment);

export const enrollmentsRouter = Router();
enrollmentsRouter.get(
  '/',
  requireAuth,
  validate({ query: paginationSchema }),
  listEnrollments,
);
enrollmentsRouter.post(
  '/',
  requireRole('ADMIN'),
  validate({ body: enrollmentBodySchema }),
  createEnrollments,
);
enrollmentsRouter.delete('/:id', requireRole('ADMIN'), validate({ params: idParam }), deleteEnrollment);
enrollmentsRouter.get(
  '/subject/:subjectId',
  requireAuth,
  validate({ params: subjectIdParam }),
  getSubjectRoster,
);
