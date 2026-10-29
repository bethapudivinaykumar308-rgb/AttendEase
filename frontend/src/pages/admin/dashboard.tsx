import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  AlertTriangle,
  BookOpen,
  Building2,
  CalendarCheck,
  ClipboardCheck,
  FileText,
  GraduationCap,
  TrendingUp,
  UsersRound,
} from 'lucide-react';
import { api } from '@/lib/api';
import { formatDate, formatDateTime, percentageTone } from '@/lib/utils';
import { PageHeader } from '@/components/page-header';
import { StatCard } from '@/components/stat-card';
import { ErrorState } from '@/components/states';
import { EmptyState } from '@/components/states';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  ChartCard,
  ChartLegend,
  CHART_COLORS,
  CHART_SERIES,
  chartAxisProps,
  chartGridProps,
} from '@/components/charts';
import type { AdminDashboardData } from '@/types';

export default function AdminDashboardPage() {
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['dashboard', 'admin'],
    queryFn: () => api.get<AdminDashboardData>('/api/dashboard/admin'),
  });

  if (isError) {
    return (
      <div className="space-y-5">
        <PageHeader title="Dashboard" description="Institution-wide attendance analytics." />
        <ErrorState
          title="Could not load the dashboard"
          message={error instanceof Error ? error.message : 'The server did not respond as expected.'}
          onRetry={() => void refetch()}
        />
      </div>
    );
  }

  const stats = data?.stats;
  const trend = data?.trend ?? [];
  const departments = data?.departmentAttendance ?? [];
  const subjects = (data?.subjectAttendance ?? []).slice(0, 10);
  const belowThreshold = data?.belowThreshold ?? [];
  const recentSessions = data?.recentSessions ?? [];
  const recentUsers = data?.recentUsers ?? [];
  const recentAuditLogs = data?.recentAuditLogs ?? [];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Dashboard"
        description="Institution-wide attendance health, computed live from the attendance records."
        breadcrumbs={[{ label: 'Admin' }]}
        actions={
          <>
            <Button variant="outline" asChild>
              <Link to="/admin/attendance">
                <ClipboardCheck className="h-4 w-4" />
                Attendance overview
              </Link>
            </Button>
            <Button asChild>
              <Link to="/admin/reports">
                <FileText className="h-4 w-4" />
                Generate reports
              </Link>
            </Button>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Total students"
          value={stats?.totalStudents ?? 0}
          hint={`${stats?.activeStudents ?? 0} active accounts`}
          icon={<GraduationCap className="h-5 w-5" />}
          tone="primary"
        />
        <StatCard
          label="Total faculty"
          value={stats?.totalFaculty ?? 0}
          icon={<UsersRound className="h-5 w-5" />}
          tone="primary"
        />
        <StatCard
          label="Departments"
          value={stats?.totalDepartments ?? 0}
          icon={<Building2 className="h-5 w-5" />}
        />
        <StatCard
          label="Active subjects"
          value={stats?.totalSubjects ?? 0}
          icon={<BookOpen className="h-5 w-5" />}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Attendance sessions"
          value={stats?.totalSessions ?? 0}
          hint="Classes conducted so far"
          icon={<CalendarCheck className="h-5 w-5" />}
        />
        <StatCard
          label="Today's attendance"
          value={stats?.todaySessions ?? 0}
          hint="Sessions conducted today"
          icon={<ClipboardCheck className="h-5 w-5" />}
          tone="primary"
        />
        <StatCard
          label="Average attendance"
          value={`${(stats?.averageAttendance ?? 0).toFixed(2)}%`}
          hint="Present + late over eligible classes"
          icon={<TrendingUp className="h-5 w-5" />}
          tone={(stats?.averageAttendance ?? 0) >= (stats?.threshold ?? 75) ? 'success' : 'warning'}
        />
        <StatCard
          label="Below threshold"
          value={stats?.studentsBelowThreshold ?? 0}
          hint={`Under ${stats?.threshold ?? 75}% attendance`}
          icon={<AlertTriangle className="h-5 w-5" />}
          tone={(stats?.studentsBelowThreshold ?? 0) > 0 ? 'danger' : 'success'}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <ChartCard
          title="Attendance trend"
          description="Daily attendance percentage over the last 30 days."
          action={
            <Badge variant="outline">
              {trend.length} day{trend.length === 1 ? '' : 's'}
            </Badge>
          }
        >
          {trend.length === 0 ? (
            <EmptyState
              title="No sessions in the last week"
              description="Attendance sessions recorded in the last 30 days will appear here."
            />
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trend} margin={{ top: 4, right: 8, bottom: 0, left: -18 }}>
                  <defs>
                    <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={CHART_COLORS.primary} stopOpacity={0.24} />
                      <stop offset="100%" stopColor={CHART_COLORS.primary} stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid {...chartGridProps} />
                  <XAxis dataKey="date" {...chartAxisProps} tickFormatter={(v: string) => v.slice(5)} />
                  <YAxis {...chartAxisProps} domain={[0, 100]} unit="%" />
                  <Tooltip
                    contentStyle={{
                      borderRadius: 8,
                      border: '1px solid #e4e9f0',
                      fontSize: 12,
                      boxShadow: '0 10px 30px -10px rgb(15 23 42 / 0.25)',
                    }}
                    formatter={(value: number) => [`${value}%`, 'Attendance']}
                  />
                  <Area
                    type="monotone"
                    dataKey="percentage"
                    stroke={CHART_COLORS.primary}
                    strokeWidth={2}
                    fill="url(#trendFill)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </ChartCard>

        <ChartCard
          title="Department-wise attendance"
          description="Average attendance percentage per department."
        >
          {departments.length === 0 ? (
            <EmptyState
              title="No attendance data yet"
              description="Department analytics appear once sessions have been recorded."
            />
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={departments} margin={{ top: 4, right: 8, bottom: 0, left: -18 }}>
                  <CartesianGrid {...chartGridProps} />
                  <XAxis dataKey="department" {...chartAxisProps} interval={0} angle={-12} height={44} textAnchor="end" />
                  <YAxis {...chartAxisProps} domain={[0, 100]} unit="%" />
                  <Tooltip
                    cursor={{ fill: 'rgba(37, 99, 235, 0.06)' }}
                    contentStyle={{
                      borderRadius: 8,
                      border: '1px solid #e4e9f0',
                      fontSize: 12,
                    }}
                    formatter={(value: number) => [`${value}%`, 'Attendance']}
                  />
                  <Bar dataKey="percentage" radius={[6, 6, 0, 0]} maxBarSize={48}>
                    {departments.map((entry) => (
                      <Cell
                        key={entry.department}
                        fill={
                          entry.percentage >= 75
                            ? CHART_COLORS.success
                            : entry.percentage >= 60
                              ? CHART_COLORS.warning
                              : CHART_COLORS.destructive
                        }
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </ChartCard>
      </div>

      <ChartCard
        title="Subject-wise attendance"
        description="Ten subjects with the highest recorded attendance."
        action={
          <Button variant="ghost" size="sm" asChild>
            <Link to="/admin/subjects">Manage subjects</Link>
          </Button>
        }
      >
        {subjects.length === 0 ? (
          <EmptyState
            title="No subject data yet"
            description="Subject analytics appear once attendance sessions have been recorded."
          />
        ) : (
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={subjects} margin={{ top: 4, right: 8, bottom: 0, left: -18 }}>
                <CartesianGrid {...chartGridProps} />
                <XAxis dataKey="subjectCode" {...chartAxisProps} interval={0} angle={-12} height={44} textAnchor="end" />
                <YAxis {...chartAxisProps} domain={[0, 100]} unit="%" />
                <Tooltip
                  cursor={{ fill: 'rgba(37, 99, 235, 0.06)' }}
                  contentStyle={{ borderRadius: 8, border: '1px solid #e4e9f0', fontSize: 12 }}
                  formatter={(value: number, name: string) => [
                    `${value}%`,
                    name === 'percentage' ? 'Attendance' : name,
                  ]}
                />
                <Bar dataKey="percentage" radius={[6, 6, 0, 0]} maxBarSize={48}>
                  {subjects.map((entry) => (
                    <Cell
                      key={entry.subjectId}
                      fill={
                        entry.percentage >= 75
                          ? CHART_COLORS.success
                          : entry.percentage >= 60
                            ? CHART_COLORS.warning
                            : CHART_COLORS.destructive
                      }
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </ChartCard>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Recent attendance activity</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {recentSessions.length === 0 ? (
              <p className="text-sm text-muted-foreground">No sessions recorded yet.</p>
            ) : (
              recentSessions.map((session) => (
                <div key={session.id} className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">
                      {session.subject.subjectCode} · Section {session.section}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {session.subject.subjectName} · {formatDate(session.attendanceDate)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <span className="rounded bg-success-soft px-1.5 py-0.5 text-[11px] font-medium text-success">
                      {session.summary.present} P
                    </span>
                    <span className="rounded bg-destructive-soft px-1.5 py-0.5 text-[11px] font-medium text-destructive">
                      {session.summary.absent} A
                    </span>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Students below threshold</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {belowThreshold.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Every active student is at or above the threshold.
              </p>
            ) : (
              belowThreshold.map((student) => (
                <div key={student.studentId} className="space-y-1.5">
                  <div className="flex items-center justify-between gap-3">
                    <Link
                      to={`/admin/students/${student.studentId}`}
                      className="truncate text-sm font-medium text-foreground hover:text-primary"
                    >
                      {student.name}
                    </Link>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {student.rollNumber}
                    </span>
                    <span
                      className={`shrink-0 text-sm font-semibold ${
                        percentageTone(student.percentage, stats?.threshold ?? 75) === 'danger'
                          ? 'text-destructive'
                          : 'text-warning'
                      }`}
                    >
                      {student.percentage.toFixed(1)}%
                    </span>
                  </div>
                  <Progress
                    value={student.percentage}
                    className="h-1.5"
                    indicatorClassName={
                      percentageTone(student.percentage, stats?.threshold ?? 75) === 'danger'
                        ? 'bg-destructive'
                        : 'bg-warning'
                    }
                  />
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Recent registrations</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {recentUsers.length === 0 ? (
              <p className="text-sm text-muted-foreground">No accounts registered yet.</p>
            ) : (
              recentUsers.map((user) => (
                <div key={user.id} className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">{user.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{user.email}</p>
                  </div>
                  <Badge variant="outline">{user.role}</Badge>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Recent audit activity</CardTitle>
        </CardHeader>
        <CardContent>
          {recentAuditLogs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No audit entries yet.</p>
          ) : (
            <ul className="divide-y divide-border">
              {recentAuditLogs.map((log) => (
                <li key={log.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm text-foreground">
                      <span className="font-medium">{log.action}</span>
                      <span className="text-muted-foreground"> · {log.entityType}</span>
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {log.user?.name ?? 'System'} · {formatDateTime(log.createdAt)}
                    </p>
                  </div>
                  <Badge variant="secondary" className="shrink-0">
                    {log.entityType}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
