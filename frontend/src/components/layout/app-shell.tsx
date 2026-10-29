import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/use-auth';
import { Sidebar } from './sidebar';
import { Topbar } from './topbar';

const TITLES: Record<string, string> = {
  '/admin': 'Dashboard',
  '/admin/attendance': 'Attendance Overview',
  '/admin/reports': 'Attendance Reports',
  '/admin/students': 'Student Management',
  '/admin/students/new': 'Add Student',
  '/admin/faculty': 'Faculty Management',
  '/admin/faculty/new': 'Add Faculty',
  '/admin/departments': 'Department Management',
  '/admin/academic-years': 'Academic Year Management',
  '/admin/semesters': 'Semester Management',
  '/admin/subjects': 'Subject Management',
  '/admin/subjects/new': 'Add Subject',
  '/admin/sections': 'Section Management',
  '/admin/assignments': 'Faculty Assignments',
  '/admin/enrollments': 'Enrollment Management',
  '/admin/audit-logs': 'Audit Logs',
  '/admin/settings': 'Settings',
  '/faculty': 'Dashboard',
  '/faculty/subjects': 'My Subjects',
  '/faculty/classes': 'My Classes',
  '/faculty/students': 'Student List',
  '/faculty/attendance': 'Mark Attendance',
  '/faculty/history': 'Attendance History',
  '/faculty/reports': 'Attendance Reports',
  '/faculty/profile': 'Profile',
  '/student': 'Dashboard',
  '/student/attendance': 'My Attendance',
  '/student/subjects': 'Subject Attendance',
  '/student/history': 'Attendance History',
  '/student/reports': 'Attendance Reports',
  '/student/profile': 'Profile',
};

export function AppShell() {
  const { user } = useAuth();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  if (!user) return null;

  const title = TITLES[location.pathname] ?? 'AttendEase';

  return (
    <div className="min-h-screen bg-muted">
      <Sidebar role={user.role} open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="lg:pl-64">
        <Topbar title={title} onMenuClick={() => setSidebarOpen(true)} />
        <main className="px-4 py-6 sm:px-6 lg:px-8">
          <div className="mx-auto w-full max-w-[1400px] animate-slide-up">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
