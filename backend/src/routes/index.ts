import { Router } from 'express';
import { prisma } from '../config/prisma.js';
import { asyncHandler } from '../utils/async-handler.js';
import { sendSuccess } from '../utils/response.js';
import { authRouter } from './auth.routes.js';
import {
  academicOptionsRouter,
  academicYearsRouter,
  departmentsRouter,
  sectionsRouter,
  semestersRouter,
  subjectsRouter,
} from './academic.routes.js';
import { facultyRouter, studentsRouter } from './people.routes.js';
import { assignmentsRouter, enrollmentsRouter } from './assignments.routes.js';
import { attendanceRouter, reportsRouter } from './attendance.routes.js';
import { auditRouter, dashboardRouter } from './dashboard.routes.js';

export const apiRouter = Router();

apiRouter.get(
  '/health',
  asyncHandler(async (_req, res) => {
    let database = 'connected';
    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch {
      database = 'unavailable';
    }
    const healthy = database === 'connected';
    res.status(healthy ? 200 : 503).json({
      success: healthy,
      data: {
        status: healthy ? 'ok' : 'degraded',
        database,
        uptime: Math.round(process.uptime()),
        timestamp: new Date().toISOString(),
      },
    });
  }),
);

apiRouter.use('/auth', authRouter);
apiRouter.use('/departments', departmentsRouter);
apiRouter.use('/academic-years', academicYearsRouter);
apiRouter.use('/semesters', semestersRouter);
apiRouter.use('/subjects', subjectsRouter);
apiRouter.use('/sections', sectionsRouter);
apiRouter.use('/academic-options', academicOptionsRouter);
apiRouter.use('/students', studentsRouter);
apiRouter.use('/faculty', facultyRouter);
apiRouter.use('/assignments', assignmentsRouter);
apiRouter.use('/enrollments', enrollmentsRouter);
apiRouter.use('/attendance', attendanceRouter);
apiRouter.use('/reports', reportsRouter);
apiRouter.use('/dashboard', dashboardRouter);
apiRouter.use('/audit-logs', auditRouter);
