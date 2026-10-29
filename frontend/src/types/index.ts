export type Role = 'ADMIN' | 'FACULTY' | 'STUDENT';

export type AttendanceStatus = 'PRESENT' | 'ABSENT' | 'LATE' | 'ON_LEAVE';

export interface User {
  id: number;
  name: string;
  email: string;
  role: Role;
  isActive: boolean;
  createdAt: string;
  student?: StudentProfile | null;
  faculty?: FacultyProfile | null;
}

export interface Department {
  id: number;
  departmentName: string;
  departmentCode: string;
  createdAt?: string;
  _count?: { students: number; faculty: number; subjects: number };
}

export interface AcademicYear {
  id: number;
  yearName: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
  _count?: { semesters: number; subjects: number; sessions: number };
}

export interface Semester {
  id: number;
  semesterNumber: number;
  academicYearId: number;
  startDate: string;
  endDate: string;
  isActive: boolean;
  academicYear?: { id: number; yearName: string };
  _count?: { students: number; subjects: number };
}

export interface Subject {
  id: number;
  subjectCode: string;
  subjectName: string;
  departmentId: number;
  semesterId: number;
  academicYearId: number;
  credits: number;
  isActive: boolean;
  department?: { id: number; departmentName: string; departmentCode: string };
  semester?: { id: number; semesterNumber: number; academicYear?: { id: number; yearName: string } };
  academicYear?: { id: number; yearName: string };
  sections?: Section[];
  assignments?: Assignment[];
  _count?: { enrollments: number; assignments: number; sessions: number };
}

export interface Section {
  id: number;
  subjectId: number;
  section: string;
  academicYearId: number;
  subject?: { id: number; subjectCode: string; subjectName: string };
  academicYear?: { id: number; yearName: string };
  assignments?: Assignment[];
  _count?: { enrollments: number; assignments: number; sessions: number };
}

export interface StudentProfile {
  id: number;
  rollNumber: string;
  section: string;
  admissionYear: number;
  department: { id: number; departmentName: string; departmentCode: string };
  semester: { id: number; semesterNumber: number; academicYear: { id: number; yearName: string } };
}

export interface FacultyProfile {
  id: number;
  facultyId: string;
  designation: string;
  department: { id: number; departmentName: string; departmentCode: string };
}

export interface Student {
  id: number;
  rollNumber: string;
  departmentId: number;
  semesterId: number;
  section: string;
  admissionYear: number;
  user: { id: number; name: string; email: string; isActive: boolean; createdAt: string };
  department: { id: number; departmentName: string; departmentCode: string };
  semester: {
    id: number;
    semesterNumber: number;
    academicYear: { id: number; yearName: string };
  };
  enrollments?: Enrollment[];
  summary?: PercentageSummary;
  subjectSummaries?: SubjectSummary[];
}

export interface Faculty {
  id: number;
  facultyId: string;
  departmentId: number;
  designation: string;
  user: { id: number; name: string; email: string; isActive: boolean; createdAt: string };
  department: { id: number; departmentName: string; departmentCode: string };
  assignments?: Assignment[];
  sessionCount?: number;
  _count?: { assignments: number };
}

export interface Assignment {
  id: number;
  facultyId: number;
  subjectId: number;
  sectionId: number;
  academicYearId: number;
  faculty?: {
    id: number;
    facultyId: string;
    user: { id: number; name: string; email: string };
  };
  subject?: { id: number; subjectCode: string; subjectName: string; credits: number };
  section?: { id: number; section: string };
  academicYear?: { id: number; yearName: string };
  _count?: { sessions: number };
  sessionCount?: number;
}

export interface Enrollment {
  id: number;
  studentId: number;
  subjectId: number;
  academicYearId: number;
  sectionId: number | null;
  createdAt: string;
  student?: {
    id: number;
    rollNumber: string;
    section: string;
    user: { id: number; name: string; email: string };
  };
  subject?: { id: number; subjectCode: string; subjectName: string };
  section?: { id: number; section: string } | null;
  academicYear?: { id: number; yearName: string };
}

export interface RosterStudent {
  studentId: number;
  rollNumber: string;
  name: string;
  email: string;
  section: string;
  isActive: boolean;
  enrollmentId?: number;
  attendanceStatus?: AttendanceStatus | null;
  remarks?: string | null;
  recordId?: number | null;
  markedBy?: string | null;
  markedAt?: string | null;
}

export interface StatusSummary {
  present: number;
  absent: number;
  late: number;
  onLeave: number;
  unmarked?: number;
}

export interface AttendanceSession {
  id: number;
  subjectId: number;
  facultyId: number;
  academicYearId: number;
  sectionId: number;
  section: string;
  attendanceDate: string;
  startTime: string | null;
  endTime: string | null;
  sessionNumber: number;
  topic: string | null;
  isCancelled: boolean;
  createdAt: string;
  subject: {
    id: number;
    subjectCode: string;
    subjectName: string;
    department?: { id: number; departmentName: string };
  };
  faculty: { id: number; facultyId: string; user: { id: number; name: string } };
  sectionOffering?: { id: number; section: string };
  academicYear?: { id: number; yearName: string };
  summary?: StatusSummary;
  roster?: RosterStudent[];
}

export interface PercentageSummary {
  present: number;
  absent: number;
  late: number;
  onLeave: number;
  total: number;
  attended: number;
  percentage: number;
}

export interface SubjectSummary {
  subjectId: number;
  subjectCode: string;
  subjectName: string;
  credits: number;
  departmentName: string;
  semesterNumber: number | null;
  yearName: string | null;
  section: string | null;
  breakdown: PercentageSummary;
}

export interface MonthlySummary {
  month: string;
  label: string;
  breakdown: PercentageSummary;
}

export interface AttendanceRecord {
  id: number;
  attendanceSessionId: number;
  studentId: number;
  attendanceStatus: AttendanceStatus;
  remarks: string | null;
  markedAt: string;
  session: {
    id: number;
    attendanceDate: string;
    subject: { id: number; subjectCode: string; subjectName: string };
    sectionOffering?: { section: string };
  };
  student: {
    id: number;
    rollNumber: string;
    department: { departmentName: string };
    user: { name: string };
  };
}

export interface ReportColumn {
  key: string;
  label: string;
  align?: 'left' | 'right' | 'center';
}

export interface ReportResult {
  title: string;
  columns: ReportColumn[];
  rows: Record<string, string | number | null>[];
  summary?: Record<string, string | number>;
}

export interface Paginated<T> {
  data: T[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

export interface AcademicOptions {
  departments: { id: number; departmentName: string; departmentCode: string }[];
  academicYears: { id: number; yearName: string; startDate: string; endDate: string; isActive: boolean }[];
  semesters: { id: number; semesterNumber: number; academicYearId: number; academicYear: { yearName: string } }[];
  subjects: { id: number; subjectCode: string; subjectName: string; departmentId: number; semesterId: number }[];
  sections: { id: number; section: string; subjectId: number; academicYearId: number }[];
}

export interface AdminDashboardData {
  stats: {
    totalStudents: number;
    totalFaculty: number;
    totalDepartments: number;
    totalSubjects: number;
    totalSessions: number;
    todaySessions: number;
    activeStudents: number;
    averageAttendance: number;
    studentsBelowThreshold: number;
    threshold: number;
  };
  trend: { date: string; present: number; absent: number; late: number; onLeave: number; percentage: number }[];
  departmentAttendance: { department: string; percentage: number; present: number; absent: number }[];
  subjectAttendance: {
    subjectId: number;
    subjectCode: string;
    subjectName: string;
    percentage: number;
    present: number;
    absent: number;
  }[];
  belowThreshold: { studentId: number; name: string; rollNumber: string; percentage: number }[];
  recentSessions: (AttendanceSession & { summary: StatusSummary })[];
  recentUsers: User[];
  recentAuditLogs: AuditLog[];
}

export interface FacultyDashboardData {
  stats: {
    assignedSubjects: number;
    assignedClasses: number;
    totalStudents: number;
    totalEnrollments: number;
    todaySessions: number;
  };
  assignments: Assignment[];
  assignmentStatistics: {
    assignmentId: number;
    present: number;
    absent: number;
    late: number;
    onLeave: number;
    totalClasses: number;
    totalRecords: number;
    percentage: number;
  }[];
  subjectStatistics: {
    subjectId: number;
    subjectCode: string;
    subjectName: string;
    present: number;
    absent: number;
    late: number;
    onLeave: number;
    totalClasses: number;
    totalRecords: number;
    percentage: number;
  }[];
  recentSessions: (AttendanceSession & { summary: StatusSummary })[];
}

export interface StudentDashboardData {
  overall: PercentageSummary | null;
  subjects: SubjectSummary[];
  monthly: MonthlySummary[];
  alerts: {
    type: string;
    severity: 'critical' | 'warning';
    title: string;
    message: string;
    subjectId: number;
  }[];
  threshold: number;
}

export interface AuditLog {
  id: number;
  userId: number | null;
  action: string;
  entityType: string;
  entityId: string | null;
  details: string | null;
  ipAddress: string | null;
  createdAt: string;
  user?: { id: number; name: string; email: string; role: Role } | null;
}
