import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BookOpen, GraduationCap, Layers, Users } from 'lucide-react';
import { AttendanceBadge, PercentageDisplay } from '@/components/attendance-display';
import { DataTable } from '@/components/data-table';
import type { DataTableColumn } from '@/components/data-table';
import { PageHeader } from '@/components/page-header';
import { EmptyState, ErrorState, LoadingState } from '@/components/states';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useAuth } from '@/hooks/use-auth';
import { api, fetchPaginated } from '@/lib/api';
import { cn, formatDate, formatDateTime } from '@/lib/utils';
import type {
  AttendanceRecord,
  MonthlySummary,
  PercentageSummary,
  SubjectSummary,
} from '@/types';

const REQUIREMENT_PERCENT = 75;
const RECORDS_PAGE_SIZE = 100;

interface StudentAttendanceResponse {
  overall?: PercentageSummary | null;
  summary?: PercentageSummary | null;
  subjects?: SubjectSummary[];
  records?: AttendanceRecord[];
  monthly?: MonthlySummary[];
}

interface StudentAttendanceBundle {
  overall: PercentageSummary | null;
  subjects: SubjectSummary[];
  monthly: MonthlySummary[];
  records: AttendanceRecord[];
}

async function fetchAllRecords(studentId: number): Promise<AttendanceRecord[]> {
  const records: AttendanceRecord[] = [];
  let page = 1;

  for (;;) {
    const result = await fetchPaginated<AttendanceRecord>('/api/attendance/records', {
      studentId,
      page,
      pageSize: RECORDS_PAGE_SIZE,
    });
    records.push(...result.data);
    if (result.data.length === 0 || page >= result.meta.totalPages) break;
    page += 1;
  }

  return records;
}

async function loadAttendance(studentId: number): Promise<StudentAttendanceBundle> {
  const response = await api
    .get<StudentAttendanceResponse>(`/api/attendance/student/${studentId}`)
    .catch(async (error: unknown) => {
      const records = await fetchAllRecords(studentId).catch(() => null);
      if (!records) throw error;
      return { overall: null, subjects: [], monthly: [], records } as StudentAttendanceResponse;
    });

  return {
    overall: response.overall ?? response.summary ?? null,
    subjects: response.subjects ?? [],
    monthly: response.monthly ?? [],
    records: Array.isArray(response.records) ? response.records : await fetchAllRecords(studentId),
  };
}

export default function StudentSubjectsPage() {
  const { user } = useAuth();
  const studentId = user?.student?.id ?? null;
  const [openSubjectId, setOpenSubjectId] = useState<number | null>(null);

  const attendanceQuery = useQuery({
    queryKey: ['student-subjects', studentId],
    queryFn: async (): Promise<StudentAttendanceBundle> => {
      if (!studentId) return { overall: null, subjects: [], monthly: [], records: [] };
      return loadAttendance(studentId);
    },
    enabled: Boolean(studentId),
  });

  const subjects = attendanceQuery.data?.subjects ?? [];
  const records = attendanceQuery.data?.records ?? [];

  // Weakest subject first so the risky ones are always visible.
  const sortedSubjects = useMemo(
    () =>
      [...subjects].sort(
        (a, b) => a.breakdown.percentage - b.breakdown.percentage || a.subjectCode.localeCompare(b.subjectCode),
      ),
    [subjects],
  );

  const meetingRequirement = subjects.filter(
    (subject) => subject.breakdown.percentage >= REQUIREMENT_PERCENT,
  ).length;

  const openSubject = subjects.find((subject) => subject.subjectId === openSubjectId) ?? null;
  const openSubjectRecords = useMemo(
    () =>
      openSubjectId === null
        ? []
        : records
            .filter((record) => record.session.subject.id === openSubjectId)
            .sort((a, b) =>
              a.session.attendanceDate === b.session.attendanceDate
                ? b.id - a.id
                : a.session.attendanceDate < b.session.attendanceDate
                  ? 1
                  : -1,
            ),
    [records, openSubjectId],
  );

  const recordColumns: DataTableColumn<AttendanceRecord>[] = useMemo(
    () => [
      { key: 'date', header: 'Date', render: (row) => formatDate(row.session.attendanceDate) },
      {
        key: 'section',
        header: 'Section',
        render: (row) => row.session.sectionOffering?.section ?? '—',
      },
      {
        key: 'status',
        header: 'Status',
        render: (row) => <AttendanceBadge status={row.attendanceStatus} />,
      },
      { key: 'remarks', header: 'Remarks', render: (row) => row.remarks ?? '—' },
      { key: 'markedAt', header: 'Marked at', render: (row) => formatDateTime(row.markedAt) },
    ],
    [],
  );

  return (
    <div className="space-y-5">
      <PageHeader
        title="Subject Attendance"
        description="Your attendance percentage in every enrolled subject, weakest first."
        breadcrumbs={[
          { label: 'Student', to: '/student' },
          { label: 'Subject Attendance' },
        ]}
      />

      {attendanceQuery.isError ? (
        <ErrorState
          title="Could not load your subjects"
          message={
            attendanceQuery.error instanceof Error
              ? attendanceQuery.error.message
              : 'Something went wrong while contacting the server.'
          }
          onRetry={() => void attendanceQuery.refetch()}
        />
      ) : attendanceQuery.isLoading ? (
        <LoadingState label="Loading your subjects…" />
      ) : (
        <>
          <div className="rounded-lg border border-border bg-card px-4 py-3">
            <p className="text-sm text-foreground">
              <span className="font-semibold">{meetingRequirement}</span> of{' '}
              <span className="font-semibold">{subjects.length}</span> subjects meet the{' '}
              {REQUIREMENT_PERCENT}% requirement
            </p>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{
                  width: `${
                    subjects.length === 0
                      ? 0
                      : Math.round((meetingRequirement / subjects.length) * 100)
                  }%`,
                }}
              />
            </div>
          </div>

          {sortedSubjects.length === 0 ? (
            <EmptyState
              title="No subjects yet"
              description="You are not enrolled in any subject for this semester."
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {sortedSubjects.map((subject) => {
                const meets = subject.breakdown.percentage >= REQUIREMENT_PERCENT;
                return (
                  <Card
                    key={subject.subjectId}
                    role="button"
                    tabIndex={0}
                    aria-label={`View attendance records for ${subject.subjectName}`}
                    className="cursor-pointer transition-shadow hover:shadow-card-hover"
                    onClick={() => setOpenSubjectId(subject.subjectId)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        setOpenSubjectId(subject.subjectId);
                      }
                    }}
                  >
                    <CardContent className="p-5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                            {subject.subjectCode}
                          </p>
                          <p className="mt-1 truncate text-sm font-semibold text-foreground">
                            {subject.subjectName}
                          </p>
                        </div>
                        <span
                          className={cn(
                            'shrink-0 rounded-full px-2 py-0.5 text-xs font-medium',
                            meets ? 'bg-success-soft text-success' : 'bg-destructive-soft text-destructive',
                          )}
                        >
                          {meets ? 'On track' : 'Below 75%'}
                        </span>
                      </div>

                      <dl className="mt-3 space-y-1.5 text-xs text-muted-foreground">
                        <div className="flex items-center gap-2">
                          <GraduationCap className="h-3.5 w-3.5" aria-hidden="true" />
                          <dd>{subject.departmentName}</dd>
                        </div>
                        <div className="flex items-center gap-2">
                          <Layers className="h-3.5 w-3.5" aria-hidden="true" />
                          <dd>
                            Semester {subject.semesterNumber ?? '—'}
                            {subject.yearName ? ` · ${subject.yearName}` : ''}
                          </dd>
                        </div>
                        <div className="flex items-center gap-2">
                          <Users className="h-3.5 w-3.5" aria-hidden="true" />
                          <dd>Section {subject.section ?? '—'}</dd>
                        </div>
                        <div className="flex items-center gap-2">
                          <BookOpen className="h-3.5 w-3.5" aria-hidden="true" />
                          <dd>{subject.credits} credits</dd>
                        </div>
                      </dl>

                      <dl className="mt-4 grid grid-cols-3 gap-2 border-t border-border pt-3 text-xs sm:grid-cols-3">
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
                        <div>
                          <dt className="text-muted-foreground">On leave</dt>
                          <dd className="mt-0.5 font-semibold text-foreground">
                            {subject.breakdown.onLeave}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-muted-foreground">Total</dt>
                          <dd className="mt-0.5 font-semibold text-foreground">
                            {subject.breakdown.total}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-muted-foreground">Attended</dt>
                          <dd className="mt-0.5 font-semibold text-foreground">
                            {subject.breakdown.attended}
                          </dd>
                        </div>
                      </dl>

                      <div className="mt-4 border-t border-border pt-3">
                        <PercentageDisplay
                          value={subject.breakdown.percentage}
                          threshold={REQUIREMENT_PERCENT}
                        />
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </>
      )}

      <Dialog open={openSubject !== null} onOpenChange={(open) => !open && setOpenSubjectId(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              {openSubject ? `${openSubject.subjectCode} · ${openSubject.subjectName}` : 'Subject'}
            </DialogTitle>
            <DialogDescription>
              {openSubject
                ? `${openSubject.breakdown.attended} of ${openSubject.breakdown.total} classes attended · ${openSubject.breakdown.percentage.toFixed(1)}%`
                : 'Session-wise attendance for this subject.'}
            </DialogDescription>
          </DialogHeader>

          <DataTable
            columns={recordColumns}
            rows={openSubjectRecords}
            rowKey={(row) => row.id}
            emptyTitle="No records for this subject"
            emptyDescription="No sessions have been marked for this subject yet."
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
