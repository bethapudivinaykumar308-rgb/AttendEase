import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import {
  cancelSession,
  createSession,
  getSession,
  getStudentAttendance,
  getSubjectAttendance,
  getTodaySessions,
  listRecords,
  listSessions,
  submitRecords,
  updateRecord,
} from '../controllers/attendance.controller.js';
import {
  createSessionSchema,
  idParam,
  reportQuerySchema,
  sessionListSchema,
  studentIdParam,
  subjectIdParam,
  submitRecordsSchema,
  updateRecordSchema,
} from '../validators/attendance.validator.js';
import { getReportTypes, exportReports, getReports } from '../controllers/reports.controller.js';

export const attendanceRouter = Router();

attendanceRouter.get(
  '/sessions',
  requireAuth,
  validate({ query: sessionListSchema }),
  listSessions,
);
attendanceRouter.get('/sessions/today', requireAuth, getTodaySessions);
attendanceRouter.post(
  '/sessions',
  requireRole('ADMIN', 'FACULTY'),
  validate({ body: createSessionSchema }),
  createSession,
);
attendanceRouter.get('/sessions/:id', requireAuth, validate({ params: idParam }), getSession);
attendanceRouter.post(
  '/sessions/:id/records',
  requireRole('ADMIN', 'FACULTY'),
  validate({ params: idParam, body: submitRecordsSchema }),
  submitRecords,
);
attendanceRouter.post(
  '/sessions/:id/cancel',
  requireRole('ADMIN', 'FACULTY'),
  validate({ params: idParam }),
  cancelSession,
);
attendanceRouter.put(
  '/records/:id',
  requireRole('ADMIN', 'FACULTY'),
  validate({ params: idParam, body: updateRecordSchema }),
  updateRecord,
);
attendanceRouter.get(
  '/records',
  requireAuth,
  validate({ query: sessionListSchema }),
  listRecords,
);
attendanceRouter.get(
  '/student/:studentId',
  requireRole('ADMIN', 'FACULTY', 'STUDENT'),
  validate({ params: studentIdParam }),
  getStudentAttendance,
);
attendanceRouter.get(
  '/subject/:subjectId',
  requireRole('ADMIN', 'FACULTY'),
  validate({ params: subjectIdParam }),
  getSubjectAttendance,
);

export const reportsRouter = Router();

reportsRouter.get('/types', requireAuth, getReportTypes);
reportsRouter.get(
  '/export',
  requireAuth,
  validate({ query: reportQuerySchema }),
  exportReports,
);
reportsRouter.get('/', requireAuth, validate({ query: reportQuerySchema }), getReports);
