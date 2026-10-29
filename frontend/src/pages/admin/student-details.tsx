import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Building2, CalendarDays, Layers, Mail, Pencil, Users } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { PageHeader } from '@/components/page-header';
import { DataTable } from '@/components/data-table';
import type { DataTableColumn } from '@/components/data-table';
import { ErrorState, LoadingState } from '@/components/states';
import { PercentageDisplay } from '@/components/attendance-display';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { StatCard } from '@/components/stat-card';
import type { Enrollment, Student, SubjectSummary } from '@/types';

export default function AdminStudentDetailsPage() {
  const { id } = useParams<{ id: string }>();

  const studentQuery = useQuery({
    queryKey: ['admin', 'student', id],
    queryFn: () => api.get<Student>(`/api/students/${id}`),
    enabled: Boolean(id),
  });

  if (studentQuery.isError) {
    return (
      <div className="space-y-5">
        <PageHeader
          title="Student details"
          breadcrumbs={[
            { label: 'Admin', to: '/admin' },
            { label: 'Students', to: '/admin/students' },
            { label: 'Details' },
          ]}
        />
        <ErrorState
          title="Could not load student"
          message={
            studentQuery.error instanceof ApiError
              ? studentQuery.error.message
              : 'Something went wrong while contacting the server.'
          }
          onRetry={() => void studentQuery.refetch()}
        />
      </div>
    );
  }

  if (studentQuery.isLoading || !studentQuery.data) {
    return <LoadingState label="Loading student…" />;
  }

  const student = studentQuery.data;
  const summary = student.summary;
  const subjectSummaries = student.subjectSummaries ?? [];
  const enrollments = student.enrollments ?? [];

  const subjectColumns: DataTableColumn<SubjectSummary>[] = [
    {
      key: 'subjectCode',
      header: 'Code',
      render: (row) => <span className="font-medium text-foreground">{row.subjectCode}</span>,
    },
    { key: 'subjectName', header: 'Subject' },
    {
      key: 'section',
      header: 'Section',
      render: (row) => row.section ?? '—',
    },
    {
      key: 'attended',
      header: 'Attended',
      align: 'right',
      render: (row) => `${row.breakdown.attended} / ${row.breakdown.total}`,
    },
    {
      key: 'percentage',
      header: 'Percentage',
      align: 'right',
      render: (row) => (
        <span
          className={
            row.breakdown.percentage >= 75
              ? 'font-medium text-success'
              : 'font-medium text-destructive'
          }
        >
          {row.breakdown.percentage.toFixed(2)}%
        </span>
      ),
    },
  ];

  const enrollmentColumns: DataTableColumn<Enrollment>[] = [
    {
      key: 'subjectCode',
      header: 'Code',
      render: (row) => <span className="font-medium text-foreground">{row.subject?.subjectCode ?? '—'}</span>,
    },
    { key: 'subjectName', header: 'Subject' },
    {
      key: 'section',
      header: 'Section',
      render: (row) => row.section?.section ?? '—',
    },
    {
      key: 'academicYear',
      header: 'Academic year',
      render: (row) => row.academicYear?.yearName ?? '—',
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title={student.user.name}
        description={`${student.rollNumber} · ${student.department?.departmentName ?? ''}`}
        breadcrumbs={[
          { label: 'Admin', to: '/admin' },
          { label: 'Students', to: '/admin/students' },
          { label: student.rollNumber },
        ]}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" asChild>
              <Link to="/admin/students">
                <ArrowLeft className="h-4 w-4" />
                Back
              </Link>
            </Button>
            <Button asChild>
              <Link to={`/admin/students/${student.id}/edit`}>
                <Pencil className="h-4 w-4" />
                Edit student
              </Link>
            </Button>
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Overall attendance"
          value={`${summary?.percentage.toFixed(2) ?? '0.00'}%`}
          tone={
            (summary?.percentage ?? 0) >= 75
              ? 'success'
              : (summary?.percentage ?? 0) >= 60
                ? 'warning'
                : 'danger'
          }
          hint="Across every eligible class"
        />
        <StatCard
          label="Classes attended"
          value={`${summary?.attended ?? 0} / ${summary?.total ?? 0}`}
          hint="Eligible classes conducted"
        />
        <StatCard
          label="Absences"
          value={summary?.absent ?? 0}
          tone={(summary?.absent ?? 0) > 0 ? 'warning' : 'default'}
          hint={`${summary?.late ?? 0} late · ${summary?.onLeave ?? 0} on leave`}
        />
        <StatCard
          label="Enrolled subjects"
          value={enrollments.length}
          hint="Current academic year"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Student information</CardTitle>
          <CardDescription>Account and enrolment details held in the database.</CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="rounded-lg border border-border px-3 py-2.5">
              <dt className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground">
                <Mail className="h-3.5 w-3.5" aria-hidden="true" />
                Email
              </dt>
              <dd className="mt-1 text-sm font-semibold text-foreground">{student.user.email}</dd>
            </div>
            <div className="rounded-lg border border-border px-3 py-2.5">
              <dt className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground">
                <Building2 className="h-3.5 w-3.5" aria-hidden="true" />
                Department
              </dt>
              <dd className="mt-1 text-sm font-semibold text-foreground">
                {student.department?.departmentName ?? '—'}
              </dd>
            </div>
            <div className="rounded-lg border border-border px-3 py-2.5">
              <dt className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground">
                <Layers className="h-3.5 w-3.5" aria-hidden="true" />
                Semester
              </dt>
              <dd className="mt-1 text-sm font-semibold text-foreground">
                {student.semester
                  ? `Semester ${student.semester.semesterNumber} · ${student.semester.academicYear?.yearName ?? ''}`
                  : '—'}
              </dd>
            </div>
            <div className="rounded-lg border border-border px-3 py-2.5">
              <dt className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground">
                <Users className="h-3.5 w-3.5" aria-hidden="true" />
                Section
              </dt>
              <dd className="mt-1 text-sm font-semibold text-foreground">{student.section}</dd>
            </div>
            <div className="rounded-lg border border-border px-3 py-2.5">
              <dt className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground">
                <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
                Admission year
              </dt>
              <dd className="mt-1 text-sm font-semibold text-foreground">{student.admissionYear}</dd>
            </div>
            <div className="rounded-lg border border-border px-3 py-2.5">
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">Account status</dt>
              <dd className="mt-1">
                <Badge variant={student.user.isActive ? 'success' : 'secondary'}>
                  {student.user.isActive ? 'Active' : 'Inactive'}
                </Badge>
              </dd>
            </div>
          </dl>

          {summary && summary.total > 0 && (
            <div className="mt-5 rounded-lg border border-border bg-muted/40 px-4 py-3">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Overall attendance
              </p>
              <div className="mt-2 flex items-center gap-4">
                <PercentageDisplay value={summary.percentage} />
                <p className="text-sm text-muted-foreground">
                  {summary.attended} of {summary.total} classes attended
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Subject-wise attendance</CardTitle>
          <CardDescription>Attendance percentage for every subject the student is enrolled in.</CardDescription>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={subjectColumns}
            rows={subjectSummaries}
            rowKey={(row) => row.subjectId}
            emptyTitle="No attendance recorded yet"
            emptyDescription="Attendance appears once a faculty member marks a session for this student."
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Enrollments</CardTitle>
          <CardDescription>Subjects this student is registered for.</CardDescription>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={enrollmentColumns}
            rows={enrollments}
            rowKey={(row) => row.id}
            emptyTitle="No enrollments"
            emptyDescription="Enrol this student in a subject from the enrollments screen."
          />
        </CardContent>
      </Card>
    </div>
  );
}
