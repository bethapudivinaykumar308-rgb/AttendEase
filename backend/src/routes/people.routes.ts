import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import {
  createStudent,
  deactivateStudent,
  exportStudents,
  getStudent,
  getStudentAttendance,
  importStudents,
  listStudents,
  reactivateStudent,
  resetStudentPassword,
  updateStudent,
} from '../controllers/students.controller.js';
import {
  createFaculty,
  deactivateFaculty,
  exportFaculty,
  getFaculty,
  listFaculty,
  reactivateFaculty,
  resetFacultyPassword,
  updateFaculty,
} from '../controllers/faculty.controller.js';
import {
  assignmentBodySchema,
  createFacultySchema,
  createStudentSchema,
  enrollmentBodySchema,
  facultyListSchema,
  idParam,
  resetPasswordSchema,
  studentListSchema,
  updateFacultySchema,
  updateStudentSchema,
} from '../validators/people.validator.js';

export const studentsRouter = Router();
studentsRouter.get(
  '/',
  requireRole('ADMIN'),
  validate({ query: studentListSchema }),
  listStudents,
);
studentsRouter.get('/export', requireRole('ADMIN'), exportStudents);
studentsRouter.post('/import', requireRole('ADMIN'), importStudents);
studentsRouter.post(
  '/',
  requireRole('ADMIN'),
  validate({ body: createStudentSchema }),
  createStudent,
);
studentsRouter.get(
  '/:id',
  requireAuth,
  validate({ params: idParam }),
  getStudent,
);
studentsRouter.put(
  '/:id',
  requireRole('ADMIN'),
  validate({ params: idParam, body: updateStudentSchema }),
  updateStudent,
);
studentsRouter.delete('/:id', requireRole('ADMIN'), validate({ params: idParam }), deactivateStudent);
studentsRouter.post(
  '/:id/reactivate',
  requireRole('ADMIN'),
  validate({ params: idParam }),
  reactivateStudent,
);
studentsRouter.post(
  '/:id/reset-password',
  requireRole('ADMIN'),
  validate({ params: idParam, body: resetPasswordSchema }),
  resetStudentPassword,
);
studentsRouter.get(
  '/:id/attendance',
  requireAuth,
  validate({ params: idParam }),
  getStudentAttendance,
);

export const facultyRouter = Router();
facultyRouter.get(
  '/',
  requireRole('ADMIN'),
  validate({ query: facultyListSchema }),
  listFaculty,
);
facultyRouter.get('/export', requireRole('ADMIN'), exportFaculty);
facultyRouter.post(
  '/',
  requireRole('ADMIN'),
  validate({ body: createFacultySchema }),
  createFaculty,
);
facultyRouter.get('/:id', requireAuth, validate({ params: idParam }), getFaculty);
facultyRouter.put(
  '/:id',
  requireRole('ADMIN'),
  validate({ params: idParam, body: updateFacultySchema }),
  updateFaculty,
);
facultyRouter.delete('/:id', requireRole('ADMIN'), validate({ params: idParam }), deactivateFaculty);
facultyRouter.post(
  '/:id/reactivate',
  requireRole('ADMIN'),
  validate({ params: idParam }),
  reactivateFaculty,
);
facultyRouter.post(
  '/:id/reset-password',
  requireRole('ADMIN'),
  validate({ params: idParam, body: resetPasswordSchema }),
  resetFacultyPassword,
);
