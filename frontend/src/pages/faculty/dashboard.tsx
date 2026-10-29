import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import {
  BookOpen,
  CalendarCheck,
  ClipboardCheck,
  GraduationCap,
  Layers,
} from 'lucide-react';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { PageHeader } from '@/components/page-header';
import { StatCard } from '@/components/stat-card';
import { DataTable } from '@/components/data-table';
import type { DataTableColumn } from '@/components/data-table';
import { EmptyState, ErrorState } from '@/components/states';
import { PercentageDisplay } from '@/components/attendance-display';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { Assignment, FacultyDashboardData, StatusSummary } from '@/types';

type SubjectStat = FacultyDashboardData['subjectStatistics'][number];
type RecentSession = FacultyDashboardData['recentSessions'][number];

function SummaryPills({ summary }: { summary: StatusSummary | undefined }) {
  if (!summary) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="rounded-full bg-success-soft px-2 py-0.5 text-[11px] font-medium text-success">
        {summary.present} present
      </span>
      <span className="rounded-full bg-destructive-soft px-2 py-0.5 text-[11px] font-medium text-destructive">
        {summary.absent} absent
      </span>
      <span className="rounded-full bg-warning-soft px-2 py-0.5 text-[11px] font-medium text-warning">
        {summary.late} late
      </span>
      <span className="rounded-full bg-info-soft px-2 py-0.5 text-[11px] font-medium text-info">
        {summary.onLeave} on leave
      </span>
    </div>
  );
}

export default function FacultyDashboardPage() {
  const navigate = useNavigate();

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['dashboard', 'faculty'],
    queryFn: () => api.get<FacultyDashboardData>('/api/dashboard/faculty'),
  });

  const stats = data?.stats;
  const assignments = data?.assignments ?? [];
  const subjectStatistics = data?.subjectStatistics ?? [];
  const recentSessions = data?.recentSessions ?? [];

  const subjectColumns: DataTableColumn<SubjectStat>[] = [
    {
      key: 'subjectCode',
      header: 'Subject',
      render: (row) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-foreground">{row.subjectName}</p>
          <p className="truncate text-xs text-muted-foreground">{row.subjectCode}</p>
        </div>
      ),
    },
    { key: 'present', header: 'Present', align: 'right', render: (row) => row.present },
    { key: 'absent', header: 'Absent', align: 'right', render: (row) => row.absent },
    { key: 'late', header: 'Late', align: 'right', render: (row) => row.late },
    { key: 'onLeave', header: 'On leave', align: 'right', render: (row) => row.onLeave },
    {
      key: 'totalClasses',
      header: 'Classes held',
      align: 'right',
      render: (row) => row.totalClasses,
    },
    {
      key: 'totalRecords',
      header: 'Marks recorded',
      align: 'right',
      render: (row) => row.totalRecords,
    },
    {
      key: 'percentage',
      header: 'Attendance rate',
      align: 'right',
      render: (row) => <PercentageDisplay value={row.percentage} showBar={false} />,
    },
  ];

  const assignmentColumns: DataTableColumn<Assignment>[] = [
    {
      key: 'subject',
      header: 'Subject',
      render: (row) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-foreground">{row.subject?.subjectName ?? '—'}</p>
          <p className="truncate text-xs text-muted-foreground">{row.subject?.subjectCode ?? '—'}</p>
        </div>
      ),
    },
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
    {
      key: 'sessions',
      header: 'Sessions',
      align: 'right',
      render: (row) => row.sessionCount ?? 0,
    },
    {
      key: '__actions',
      header: 'Actions',
      align: 'right',
      render: (row) => (
        <Button
          size="sm"
          onClick={(event) => {
            event.stopPropagation();
            navigate(
              `/faculty/attendance?subjectId=${row.subjectId}&sectionId=${row.sectionId}`,
            );
          }}
        >
          <ClipboardCheck className="h-3.5 w-3.5" />
          Mark attendance
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Faculty dashboard"
        description="Your teaching load, attendance statistics and the sessions you have recorded recently."
        breadcrumbs={[{ label: 'Faculty' }]}
        actions={
          <>
            <Button variant="outline" asChild>
              <Link to="/faculty/history">
                <CalendarCheck className="h-4 w-4" />
                Attendance history
              </Link>
            </Button>
            <Button asChild>
              <Link to="/faculty/attendance">
                <ClipboardCheck className="h-4 w-4" />
                Mark attendance
              </Link>
            </Button>
          </>
        }
      />

      {isError ? (
        <ErrorState
          title="Could not load your dashboard"
          message={
            error instanceof Error
              ? error.message
              : 'The server did not respond as expected. Please try again.'
          }
          onRetry={() => void refetch()}
        />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Assigned subjects"
              value={stats?.assignedSubjects ?? 0}
              hint="Subject assignments"
              icon={<BookOpen className="h-5 w-5" />}
              tone="primary"
            />
            <StatCard
              label="Assigned classes"
              value={stats?.assignedClasses ?? 0}
              hint="Sections you teach"
              icon={<Layers className="h-5 w-5" />}
              tone="primary"
            />
            <StatCard
              label="Students taught"
              value={stats?.totalStudents ?? 0}
              hint="Enrolled across your subjects"
              icon={<GraduationCap className="h-5 w-5" />}
            />
            <StatCard
              label="Today's sessions"
              value={stats?.todaySessions ?? 0}
              hint="Classes recorded today"
              icon={<CalendarCheck className="h-5 w-5" />}
              tone="success"
            />
          </div>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Subject-wise statistics</CardTitle>
            </CardHeader>
            <CardContent>
              <DataTable
                columns={subjectColumns}
                rows={subjectStatistics}
                rowKey={(row) => row.subjectId}
                isLoading={isLoading}
                emptyTitle="No attendance statistics yet"
                emptyDescription="Statistics appear once you have recorded attendance for one of your subjects."
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">My assignments</CardTitle>
            </CardHeader>
            <CardContent>
              <DataTable
                columns={assignmentColumns}
                rows={assignments}
                rowKey={(row) => row.id}
                isLoading={isLoading}
                emptyTitle="No subjects assigned"
                emptyDescription="An administrator has to assign you to a subject and section before you can mark attendance."
                emptyAction={
                  <Button variant="outline" size="sm" asChild>
                    <Link to="/faculty/subjects">View my subjects</Link>
                  </Button>
                }
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Recent sessions</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <p className="py-6 text-center text-sm text-muted-foreground">Loading sessions…</p>
              ) : recentSessions.length === 0 ? (
                <EmptyState
                  title="No sessions recorded yet"
                  description="Attendance sessions you create will be listed here with a quick summary of the counts."
                  icon={<ClipboardCheck className="h-5 w-5" />}
                  action={
                    <Button size="sm" asChild>
                      <Link to="/faculty/attendance">Mark attendance</Link>
                    </Button>
                  }
                />
              ) : (
                <ul className="divide-y divide-border">
                  {recentSessions.map((session: RecentSession) => (
                    <li
                      key={session.id}
                      className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">
                          {session.subject.subjectCode} · {session.subject.subjectName}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {formatDate(session.attendanceDate)} · Section {session.section} · Session #
                          {session.sessionNumber}
                          {session.topic ? ` · ${session.topic}` : ''}
                        </p>
                      </div>
                      <SummaryPills summary={session.summary} />
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
