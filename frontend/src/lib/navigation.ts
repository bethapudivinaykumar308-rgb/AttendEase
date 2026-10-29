import {
  BookOpen,
  Building2,
  CalendarRange,
  ClipboardCheck,
  ClipboardList,
  FileText,
  GraduationCap,
  History,
  LayoutDashboard,
  Layers,
  Link2,
  ListChecks,
  LogOut,
  ScrollText,
  Settings,
  ShieldCheck,
  TrendingUp,
  UserCircle,
  Users,
  UsersRound,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { Role } from '@/types';

export interface NavItem {
  label: string;
  to: string;
  icon: LucideIcon;
  end?: boolean;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const roleHome: Record<Role, string> = {
  ADMIN: '/admin',
  FACULTY: '/faculty',
  STUDENT: '/student',
};

export const roleLabel: Record<Role, string> = {
  ADMIN: 'Administrator',
  FACULTY: 'Faculty',
  STUDENT: 'Student',
};

export const navigation: Record<Role, NavGroup[]> = {
  ADMIN: [
    {
      label: 'Overview',
      items: [
        { label: 'Dashboard', to: '/admin', icon: LayoutDashboard, end: true },
        { label: 'Attendance', to: '/admin/attendance', icon: ClipboardCheck },
        { label: 'Reports', to: '/admin/reports', icon: FileText },
      ],
    },
    {
      label: 'People',
      items: [
        { label: 'Students', to: '/admin/students', icon: GraduationCap },
        { label: 'Faculty', to: '/admin/faculty', icon: UsersRound },
      ],
    },
    {
      label: 'Academics',
      items: [
        { label: 'Departments', to: '/admin/departments', icon: Building2 },
        { label: 'Academic Years', to: '/admin/academic-years', icon: CalendarRange },
        { label: 'Semesters', to: '/admin/semesters', icon: Layers },
        { label: 'Subjects', to: '/admin/subjects', icon: BookOpen },
        { label: 'Sections', to: '/admin/sections', icon: Users },
        { label: 'Faculty Assignments', to: '/admin/assignments', icon: Link2 },
        { label: 'Enrollments', to: '/admin/enrollments', icon: ListChecks },
      ],
    },
    {
      label: 'System',
      items: [
        { label: 'Audit Logs', to: '/admin/audit-logs', icon: ScrollText },
        { label: 'Settings', to: '/admin/settings', icon: Settings },
      ],
    },
  ],
  FACULTY: [
    {
      label: 'Overview',
      items: [
        { label: 'Dashboard', to: '/faculty', icon: LayoutDashboard, end: true },
        { label: 'My Subjects', to: '/faculty/subjects', icon: BookOpen },
        { label: 'My Classes', to: '/faculty/classes', icon: Users },
        { label: 'Student List', to: '/faculty/students', icon: GraduationCap },
      ],
    },
    {
      label: 'Attendance',
      items: [
        { label: 'Mark Attendance', to: '/faculty/attendance', icon: ClipboardCheck },
        { label: 'Attendance History', to: '/faculty/history', icon: History },
        { label: 'Reports', to: '/faculty/reports', icon: TrendingUp },
      ],
    },
    {
      label: 'Account',
      items: [{ label: 'Profile', to: '/faculty/profile', icon: UserCircle }],
    },
  ],
  STUDENT: [
    {
      label: 'Overview',
      items: [
        { label: 'Dashboard', to: '/student', icon: LayoutDashboard, end: true },
        { label: 'My Attendance', to: '/student/attendance', icon: ClipboardList },
        { label: 'Subject Attendance', to: '/student/subjects', icon: BookOpen },
        { label: 'Attendance History', to: '/student/history', icon: History },
        { label: 'Reports', to: '/student/reports', icon: FileText },
      ],
    },
    {
      label: 'Account',
      items: [{ label: 'Profile', to: '/student/profile', icon: UserCircle }],
    },
  ],
};

export const adminIcons = {
  ShieldCheck,
  LogOut,
};
