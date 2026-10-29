import { useQuery } from '@tanstack/react-query';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  AlertTriangle,
  CalendarCheck2,
  CalendarX2,
  CheckCircle2,
  Clock3,
} from 'lucide-react';
import { AttendanceBadge, PercentageDisplay } from '@/components/attendance-display';
import { PageHeader } from '@/components/page-header';
import { StatCard } from '@/components/stat-card';
import { EmptyState, ErrorState, LoadingState } from '@/components/states';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/hooks/use-auth';
import { api, fetchPaginated } from '@/lib/api';
import { cn, formatDate } from '@/lib/utils';
import type { AttendanceRecord, StudentDashboardData } from '@/types';

const DEFAULT_THRESHOLD = 75;

interface StudentAttendanceResponse {
  records?: AttendanceRecord[];
}

function mostRecentFirst(records: AttendanceRecord[]): AttendanceRecord[] {
  return [...records].sort((a, b) =>
    a.session.attendanceDate === b.session.attendanceDate
      ? b.id - a.id
      : a.session.attendanceDate < b.session.attendanceDate
        ? 1
        : -1,
  );
}

/** One entry per session, so the list shows distinct classes rather than repeats. */
function latestPerSession(records: AttendanceRecord[], limit: number): AttendanceRecord[] {
  const seen = new Set<number>();
  const result: AttendanceRecord[] = [];
  for (const record of mostRecentFirst(records)) {
    if (seen.has(record.attendanceSessionId)) continue;
    seen.add(record.attendanceSessionId);
    result.push(record);
    if (result.length >= limit) break;
  }
  return result;
}

export default function StudentDashboardPage() {
  const { user } = useAuth();
  const studentId = user?.student?.id ?? null;

  const dashboardQuery = useQuery({
    queryKey: ['student-dashboard'],
    queryFn: () => api.get<StudentDashboardData>('/api/dashboard/student'),
    enabled: Boolean(studentId),
  });

  const recentQuery = useQuery({
    queryKey: ['student-recent-records', studentId],
    queryFn: async (): Promise<AttendanceRecord[]> => {
      if (!studentId) return [];
      const response = await api
        .get<StudentAttendanceResponse>(`/api/attendance/student/${studentId}`)
        .catch(() => null);
      if (response && Array.isArray(response.records)) {
        return latestPerSession(response.records, 5);
      }
      const result = await fetchPaginated<AttendanceRecord>('/api/attendance/records', {
        studentId,
        page: 1,
        pageSize: 20,
      });
      return latestPerSession(result.data, 5);
    },
    enabled: Boolean(studentId),
  });

  const data = dashboardQuery.data;
  const threshold = data?.threshold ?? DEFAULT_THRESHOLD;
  const overall = data?.overall ?? null;
  const subjects = data?.subjects ?? [];
  const monthly = data?.monthly ?? [];
  const alerts = data?.alerts ?? [];
  const recent = recentQuery.data ?? [];

  const chartData = monthly.map((entry) => ({
    label: entry.label,
    percentage: entry.breakdown.percentage,
  }));

  const belowThreshold = overall !== null && overall.percentage < threshold;
  const classesNeeded = (() => {
    if (!belowThreshold || !overall) return 0;
    const attended = overall.attended;
    let total = overall.total;
    let needed = 0;
    while (total > 0 && (attended / total) * 100 < threshold) {
      total += 1;
      needed += 1;
      if (needed > 1000) break;
    }
    return needed;
  })();

  return (
    <div className="space-y-5">
      <PageHeader
        title="My Dashboard"
        description="Your attendance summary, trends and subject-wise performance."
        breadcrumbs={[
          { label: 'Student', to: '/student' },
          { label: 'Dashboard' },
        ]}
      />

      {dashboardQuery.isError ? (
        <ErrorState
          title="Could not load your dashboard"
          message={
            dashboardQuery.error instanceof Error
              ? dashboardQuery.error.message
              : 'Something went wrong while contacting the server.'
          }
          onRetry={() => void dashboardQuery.refetch()}
        />
      ) : dashboardQuery.isLoading || !data ? (
        <LoadingState label="Loading your attendance summary…" />
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-[minmax(0,300px)_1fr]">
            <Card className="border-primary/20">
              <CardContent className="p-6">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Overall attendance
                </p>
                {overall && overall.total > 0 ? (
                  <>
                    <PercentageDisplay
                      value={overall.percentage}
                      threshold={threshold}
                      className="mt-3 [&>span]:text-4xl [&>span]:font-semibold [&>span]:tracking-tight"
                    />
                    <p className="mt-3 text-xs text-muted-foreground">
                      {overall.attended} of {overall.total} classes attended · {threshold}% required
                    </p>
                  </>
                ) : (
                  <p className="mt-3 text-sm text-muted-foreground">
                    No attendance has been recorded yet.
                  </p>
                )}
              </CardContent>
            </Card>

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard
                label="Classes conducted"
                value={overall?.total ?? 0}
                icon={<CalendarCheck2 className="h-5 w-5" />}
                tone="primary"
                hint="Total sessions held for you"
              />
              <StatCard
                label="Classes attended"
                value={overall?.attended ?? 0}
                icon={<CheckCircle2 className="h-5 w-5" />}
                tone="success"
                hint="Present plus late arrivals"
              />
              <StatCard
                label="Absences"
                value={overall?.absent ?? 0}
                icon={<CalendarX2 className="h-5 w-5" />}
                tone="danger"
                hint="Classes you missed"
              />
              <StatCard
                label="Late arrivals"
                value={overall?.late ?? 0}
                icon={<Clock3 className="h-5 w-5" />}
                tone="warning"
                hint="Counted as attended"
              />
            </div>
          </div>

          {belowThreshold && overall && (
            <div
              role="alert"
              className="flex items-start gap-3 rounded-lg border border-warning/25 bg-warning-soft px-4 py-3 text-warning"
            >
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-semibold">Your attendance is below the required threshold</p>
                <p className="mt-0.5 text-sm">
                  You are at {overall.percentage.toFixed(1)}% but {threshold}% is required. Attend{' '}
                  {classesNeeded} more class{classesNeeded === 1 ? '' : 'es'} to reach the
                  requirement.
                </p>
              </div>
            </div>
          )}

          <div className="grid gap-4 lg:grid-cols-[1fr_minmax(0,340px)]">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Monthly attendance</CardTitle>
              </CardHeader>
              <CardContent>
                {chartData.length === 0 ? (
                  <EmptyState
                    title="No monthly data yet"
                    description="Monthly attendance appears once classes have been marked."
                  />
                ) : (
                  <div className="h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={chartData} margin={{ top: 8, right: 12, bottom: 0, left: -18 }}>
                        <defs>
                          <linearGradient id="studentAttendanceFill" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="var(--color-primary)" stopOpacity={0.28} />
                            <stop offset="100%" stopColor="var(--color-primary)" stopOpacity={0.02} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" vertical={false} />
                        <XAxis
                          dataKey="label"
                          tick={{ fill: 'var(--color-muted-foreground)', fontSize: 12 }}
                          tickLine={false}
                          axisLine={false}
                        />
                        <YAxis
                          domain={[0, 100]}
                          tick={{ fill: 'var(--color-muted-foreground)', fontSize: 12 }}
                          tickLine={false}
                          axisLine={false}
                        />
                        <Tooltip
                          formatter={(value) => `${Number(value).toFixed(1)}%`}
                          contentStyle={{
                            borderRadius: '0.5rem',
                            border: '1px solid var(--color-border)',
                            background: 'var(--color-card)',
                            fontSize: '0.75rem',
                          }}
                          labelStyle={{ color: 'var(--color-foreground)', fontWeight: 600 }}
                          itemStyle={{ color: 'var(--color-primary)' }}
                        />
                        <ReferenceLine
                          y={threshold}
                          stroke="var(--color-destructive)"
                          strokeDasharray="4 4"
                          label={{
                            value: `${threshold}%`,
                            position: 'insideTopRight',
                            fill: 'var(--color-destructive)',
                            fontSize: 11,
                          }}
                        />
                        <Area
                          type="monotone"
                          dataKey="percentage"
                          stroke="var(--color-primary)"
                          strokeWidth={2}
                          fill="url(#studentAttendanceFill)"
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Alerts</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {alerts.length === 0 ? (
                  <EmptyState
                    title="No alerts"
                    description="You are on track in every enrolled subject."
                  />
                ) : (
                  alerts.map((alert) => (
                    <div
                      key={`${alert.type}-${alert.subjectId}`}
                      className={cn(
                        'flex items-start gap-3 rounded-lg border px-3 py-2.5',
                        alert.severity === 'critical'
                          ? 'border-destructive/25 bg-destructive-soft'
                          : 'border-warning/25 bg-warning-soft',
                      )}
                    >
                      <AlertTriangle
                        className={cn(
                          'mt-0.5 h-4 w-4 shrink-0',
                          alert.severity === 'critical' ? 'text-destructive' : 'text-warning',
                        )}
                      />
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-foreground">{alert.title}</p>
                        <p className="mt-0.5 text-sm text-muted-foreground">{alert.message}</p>
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>

          <div className="space-y-4">
            <div>
              <h2 className="text-base font-semibold text-foreground">Subject-wise attendance</h2>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Your attendance percentage in every enrolled subject.
              </p>
            </div>

            {subjects.length === 0 ? (
              <EmptyState
                title="No subjects yet"
                description="You are not enrolled in any subject for this semester."
              />
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {subjects.map((subject) => (
                  <Card key={subject.subjectId}>
                    <CardContent className="p-5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                            {subject.subjectCode}
                          </p>
                          <p className="mt-1 truncate text-sm font-semibold text-foreground">
                            {subject.subjectName}
                          </p>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            Section {subject.section ?? '—'}
                          </p>
                        </div>
                        <PercentageDisplay
                          value={subject.breakdown.percentage}
                          threshold={threshold}
                          className="shrink-0"
                        />
                      </div>
                      <dl className="mt-4 grid grid-cols-3 gap-2 border-t border-border pt-3 text-xs">
                        <div>
                          <dt className="text-muted-foreground">Present</dt>
                          <dd className="mt-0.5 font-semibold text-foreground">
                            {subject.breakdown.present}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-muted-foreground">Absent</dt>
                          <dd className="mt-0.5 font-semibold text-foreground">
                            {subject.breakdown.absent}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-muted-foreground">Late</dt>
                          <dd className="mt-0.5 font-semibold text-foreground">
                            {subject.breakdown.late}
                          </dd>
                        </div>
                      </dl>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Recent attendance</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {recentQuery.isLoading ? (
                <LoadingState label="Loading recent attendance…" />
              ) : recent.length === 0 ? (
                <EmptyState
                  title="Nothing recent"
                  description="Your latest attendance records will appear here."
                />
              ) : (
                recent.map((record) => (
                  <div
                    key={record.id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2.5"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">
                        {record.session.subject.subjectName}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {formatDate(record.session.attendanceDate)} ·{' '}
                        {record.session.subject.subjectCode} · Section{' '}
                        {record.session.sectionOffering?.section ?? '—'}
                      </p>
                    </div>
                    <AttendanceBadge status={record.attendanceStatus} />
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
