import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from '@/components/layout/app-shell';
import { ProtectedRoute } from '@/components/protected-route';
import LoginPage from '@/pages/auth/login';
import ForgotPasswordPage from '@/pages/auth/forgot-password';
import ResetPasswordPage from '@/pages/auth/reset-password';
import UnauthorizedPage from '@/pages/error/unauthorized';
import NotFoundPage from '@/pages/error/not-found';
import AdminDashboardPage from '@/pages/admin/dashboard';
import AdminStudentsPage from '@/pages/admin/students';
import AdminStudentFormPage from '@/pages/admin/student-form';
import AdminStudentDetailsPage from '@/pages/admin/student-details';
import AdminFacultyPage from '@/pages/admin/faculty';
import AdminFacultyFormPage from '@/pages/admin/faculty-form';
import AdminDepartmentsPage from '@/pages/admin/departments';
import AdminAcademicYearsPage from '@/pages/admin/academic-years';
import AdminSemestersPage from '@/pages/admin/semesters';
import AdminSubjectsPage from '@/pages/admin/subjects';
import AdminSubjectFormPage from '@/pages/admin/subject-form';
import AdminSectionsPage from '@/pages/admin/sections';
import AdminAssignmentsPage from '@/pages/admin/assignments';
import AdminEnrollmentsPage from '@/pages/admin/enrollments';
import AdminAttendancePage from '@/pages/admin/attendance';
import AdminReportsPage from '@/pages/admin/reports';
import AdminAuditLogsPage from '@/pages/admin/audit-logs';
import AdminSettingsPage from '@/pages/admin/settings';
import FacultyDashboardPage from '@/pages/faculty/dashboard';
import FacultySubjectsPage from '@/pages/faculty/subjects';
import FacultyClassesPage from '@/pages/faculty/classes';
import FacultyStudentsPage from '@/pages/faculty/students';
import FacultyMarkAttendancePage from '@/pages/faculty/mark-attendance';
import FacultyHistoryPage from '@/pages/faculty/history';
import FacultyReportsPage from '@/pages/faculty/reports';
import FacultyProfilePage from '@/pages/faculty/profile';
import StudentDashboardPage from '@/pages/student/dashboard';
import StudentAttendancePage from '@/pages/student/attendance';
import StudentSubjectsPage from '@/pages/student/subjects';
import StudentHistoryPage from '@/pages/student/history';
import StudentReportsPage from '@/pages/student/reports';
import StudentProfilePage from '@/pages/student/profile';

export function App() {
  return (
    <Routes>
      {/* Public routes */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/unauthorized" element={<UnauthorizedPage />} />
      <Route path="/" element={<Navigate to="/login" replace />} />

      {/* Admin routes */}
      <Route
        element={
          <ProtectedRoute roles={['ADMIN']}>
            <AppShell />
          </ProtectedRoute>
        }
      >
        <Route path="/admin" element={<AdminDashboardPage />} />
        <Route path="/admin/students" element={<AdminStudentsPage />} />
        <Route path="/admin/students/new" element={<AdminStudentFormPage />} />
        <Route path="/admin/students/:id/edit" element={<AdminStudentFormPage />} />
        <Route path="/admin/students/:id" element={<AdminStudentDetailsPage />} />
        <Route path="/admin/faculty" element={<AdminFacultyPage />} />
        <Route path="/admin/faculty/new" element={<AdminFacultyFormPage />} />
        <Route path="/admin/faculty/:id/edit" element={<AdminFacultyFormPage />} />
        <Route path="/admin/departments" element={<AdminDepartmentsPage />} />
        <Route path="/admin/academic-years" element={<AdminAcademicYearsPage />} />
        <Route path="/admin/semesters" element={<AdminSemestersPage />} />
        <Route path="/admin/subjects" element={<AdminSubjectsPage />} />
        <Route path="/admin/subjects/new" element={<AdminSubjectFormPage />} />
        <Route path="/admin/subjects/:id/edit" element={<AdminSubjectFormPage />} />
        <Route path="/admin/sections" element={<AdminSectionsPage />} />
        <Route path="/admin/assignments" element={<AdminAssignmentsPage />} />
        <Route path="/admin/enrollments" element={<AdminEnrollmentsPage />} />
        <Route path="/admin/attendance" element={<AdminAttendancePage />} />
        <Route path="/admin/reports" element={<AdminReportsPage />} />
        <Route path="/admin/audit-logs" element={<AdminAuditLogsPage />} />
        <Route path="/admin/settings" element={<AdminSettingsPage />} />
      </Route>

      {/* Faculty routes */}
      <Route
        element={
          <ProtectedRoute roles={['FACULTY']}>
            <AppShell />
          </ProtectedRoute>
        }
      >
        <Route path="/faculty" element={<FacultyDashboardPage />} />
        <Route path="/faculty/subjects" element={<FacultySubjectsPage />} />
        <Route path="/faculty/classes" element={<FacultyClassesPage />} />
        <Route path="/faculty/students" element={<FacultyStudentsPage />} />
        <Route path="/faculty/attendance" element={<FacultyMarkAttendancePage />} />
        <Route path="/faculty/history" element={<FacultyHistoryPage />} />
        <Route path="/faculty/reports" element={<FacultyReportsPage />} />
        <Route path="/faculty/profile" element={<FacultyProfilePage />} />
      </Route>

      {/* Student routes */}
      <Route
        element={
          <ProtectedRoute roles={['STUDENT']}>
            <AppShell />
          </ProtectedRoute>
        }
      >
        <Route path="/student" element={<StudentDashboardPage />} />
        <Route path="/student/attendance" element={<StudentAttendancePage />} />
        <Route path="/student/subjects" element={<StudentSubjectsPage />} />
        <Route path="/student/history" element={<StudentHistoryPage />} />
        <Route path="/student/reports" element={<StudentReportsPage />} />
        <Route path="/student/profile" element={<StudentProfilePage />} />
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
