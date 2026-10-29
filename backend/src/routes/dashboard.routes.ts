import { Router } from 'express';
import { requireRole } from '../middleware/auth.js';
import {
  adminDashboard,
  facultyDashboard,
  studentDashboard,
} from '../controllers/dashboard.controller.js';
import { exportAuditLogs, listAuditLogs } from '../controllers/audit.controller.js';
import { validate } from '../middleware/validate.js';
import { paginationSchema } from '../validators/common.validator.js';

export const dashboardRouter = Router();
dashboardRouter.get('/admin', requireRole('ADMIN'), adminDashboard);
dashboardRouter.get('/faculty', requireRole('FACULTY'), facultyDashboard);
dashboardRouter.get('/student', requireRole('STUDENT'), studentDashboard);

export const auditRouter = Router();
auditRouter.get('/', requireRole('ADMIN'), validate({ query: paginationSchema }), listAuditLogs);
auditRouter.get('/export', requireRole('ADMIN'), exportAuditLogs);
