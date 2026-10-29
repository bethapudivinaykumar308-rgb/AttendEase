import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CalendarCheck2, CalendarX2, CheckCircle2, Clock3, Download, Timer } from 'lucide-react';
import { AttendanceBadge, PercentageDisplay } from '@/components/attendance-display';
import { DataTable } from '@/components/data-table';
import type { DataTableColumn } from '@/components/data-table';
import { PageHeader } from '@/components/page-header';
import { Pagination } from '@/components/pagination';
import { StatCard } from '@/components/stat-card';
import { ErrorState, LoadingState } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { api, downloadCsv, fetchPaginated } from '@/lib/api';
import { formatDate, formatDateTime } from '@/lib/utils';
import type {
  AttendanceRecord,
  MonthlySummary,
  PercentageSummary,
  SubjectSummary,
} from '@/types';

const DEFAULT_THRESHOLD = 75;
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

/** Reads every attendance record of the signed-in student, page by page. */
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

/**
 * Loads the student summary. The dedicated endpoint embeds the record list on
 * some deployments; when it does not, the records endpoint is used instead.
 */
async function loadAttendance(studentId: number): Promise<StudentAttendanceBundle> {
  const response = await api
    .get<StudentAttendanceResponse>(`/api/attendance/student/${studentId}`)
    .catch(async (error: unknown) => {
      const records = await fetchAllRecords(studentId).catch(() => null);
      if (!records) throw error;
      return { overall: null, subjects: [], monthly: [], records } as StudentAttendanceResponse;
    });

  const overall = response.overall ?? response.summary ?? null;
  const subjects = response.subjects ?? [];
  const monthly = response.monthly ?? [];
  const records = Array.isArray(response.records)
    ? response.records
    : await fetchAllRecords(studentId);

  return { overall, subjects, monthly, records };
}

export default function StudentAttendancePage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const studentId = user?.student?.id ?? null;

  const [selectedSubjectId, setSelectedSubjectId] = useState<string>('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [isExporting, setIsExporting] = useState(false);

  const attendanceQuery = useQuery({
    queryKey: ['student-attendance', studentId],
    queryFn: async (): Promise<StudentAttendanceBundle> => {
      if (!studentId) return { overall: null, subjects: [], monthly: [], records: [] };
      return loadAttendance(studentId);
    },
    enabled: Boolean(studentId),
  });

  const overall = attendanceQuery.data?.overall ?? null;
  const subjects = attendanceQuery.data?.subjects ?? [];
  const records = attendanceQuery.data?.records ?? [];

  const subjectRecords = useMemo(() => {
    if (selectedSubjectId === 'all') return records;
    const subjectId = Number(selectedSubjectId);
    return records.filter((record) => record.session.subject.id === subjectId);
  }, [records, selectedSubjectId]);

  const totalPages = Math.max(1, Math.ceil(subjectRecords.length / pageSize));
  const pageRecords = subjectRecords.slice((page - 1) * pageSize, page * pageSize);

  const subjectColumns: DataTableColumn<SubjectSummary>[] = useMemo(
    () => [
      { key: 'subjectCode', header: 'Code' },
      { key: 'subjectName', header: 'Subject' },
      { key: 'section', header: 'Section' },
      {
        key: 'present',
        header: 'Present',
        align: 'right',
        render: (row) => row.breakdown.present,
      },
      { key: 'absent', header: 'Absent', align: 'right', render: (row) => row.breakdown.absent },
      { key: 'late', header: 'Late', align: 'right', render: (row) => row.breakdown.late },
      {
        key: 'onLeave',
        header: 'On leave',
        align: 'right',
        render: (row) => row.breakdown.onLeave,
      },
      { key: 'total', header: 'Total', align: 'right', render: (row) => row.breakdown.total },
      {
        key: 'attended',
        header: 'Attended',
        align: 'right',
        render: (row) => row.breakdown.attended,
      },
      {
        key: 'percentage',
        header: 'Percentage',
        align: 'right',
        render: (row) => (
          <PercentageDisplay
            value={row.breakdown.percentage}
            threshold={DEFAULT_THRESHOLD}
            className="ml-auto"
          />
        ),
      },
    ],
    [],
  );

  const recordColumns: DataTableColumn<AttendanceRecord>[] = useMemo(
    () => [
      {
        key: 'date',
        header: 'Date',
        render: (row) => formatDate(row.session.attendanceDate),
      },
      {
        key: 'subject',
        header: 'Subject',
        render: (row) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-foreground">{row.session.subject.subjectName}</p>
            <p className="text-xs text-muted-foreground">{row.session.subject.subjectCode}</p>
          </div>
        ),
      },
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
      {
        key: 'remarks',
        header: 'Remarks',
        render: (row) => row.remarks ?? '—',
      },
      {
        key: 'markedAt',
        header: 'Marked at',
        render: (row) => formatDateTime(row.markedAt),
      },
    ],
    [],
  );

  const handleExport = async () => {
    setIsExporting(true);
    try {
      await downloadCsv('/api/reports/export', { reportType: 'subject-wise' });
      toast.success('Export ready', 'Your attendance CSV has been downloaded.');
    } catch (error) {
      toast.error(
        'Export failed',
        error instanceof Error ? error.message : 'Unable to download the CSV file.',
      );
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="My Attendance"
        description="Your overall standing and the session-by-session record for every subject."
        breadcrumbs={[
          { label: 'Student', to: '/student' },
          { label: 'My Attendance' },
        ]}
        actions={
          <Button variant="outline" onClick={() => void handleExport()} isLoading={isExporting}>
            <Download className="h-4 w-4" />
            Export my attendance CSV
          </Button>
        }
      />

      {attendanceQuery.isError ? (
        <ErrorState
          title="Could not load your attendance"
          message={
            attendanceQuery.error instanceof Error
              ? attendanceQuery.error.message
              : 'Something went wrong while contacting the server.'
          }
          onRetry={() => void attendanceQuery.refetch()}
        />
      ) : attendanceQuery.isLoading ? (
        <LoadingState label="Loading your attendance…" />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
            <StatCard
              label="Classes conducted"
              value={overall?.total ?? 0}
              icon={<CalendarCheck2 className="h-5 w-5" />}
              tone="primary"
            />
            <StatCard
              label="Classes attended"
              value={overall?.attended ?? 0}
              icon={<CheckCircle2 className="h-5 w-5" />}
              tone="success"
            />
            <StatCard
              label="Present"
              value={overall?.present ?? 0}
              icon={<CheckCircle2 className="h-5 w-5" />}
            />
            <StatCard
              label="Absent"
              value={overall?.absent ?? 0}
              icon={<CalendarX2 className="h-5 w-5" />}
              tone="danger"
            />
            <StatCard
              label="Late"
              value={overall?.late ?? 0}
              icon={<Clock3 className="h-5 w-5" />}
              tone="warning"
            />
            <StatCard
              label="On leave"
              value={overall?.onLeave ?? 0}
              icon={<Timer className="h-5 w-5" />}
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Subject-wise attendance</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <DataTable
                columns={subjectColumns}
                rows={subjects}
                rowKey={(row) => row.subjectId}
                emptyTitle="No subjects enrolled"
                emptyDescription="You are not enrolled in any subject for this semester yet."
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row flex-wrap items-center justify-between gap-3">
              <CardTitle className="text-base">Session records</CardTitle>
              <div className="w-full sm:w-72">
                <Label htmlFor="attendance-subject" className="sr-only">
                  Filter by subject
                </Label>
                <Select
                  value={selectedSubjectId}
                  onValueChange={(value) => {
                    setSelectedSubjectId(value);
                    setPage(1);
                  }}
                >
                  <SelectTrigger id="attendance-subject">
                    <SelectValue placeholder="All subjects" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All subjects</SelectItem>
                    {subjects.map((subject) => (
                      <SelectItem key={subject.subjectId} value={String(subject.subjectId)}>
                        {subject.subjectCode} · {subject.subjectName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <DataTable
                columns={recordColumns}
                rows={pageRecords}
                rowKey={(row) => row.id}
                emptyTitle="No attendance records"
                emptyDescription="No sessions have been marked for this selection yet."
              />
              {subjectRecords.length > 0 && (
                <Pagination
                  page={Math.min(page, totalPages)}
                  pageSize={pageSize}
                  total={subjectRecords.length}
                  totalPages={totalPages}
                  onPageChange={setPage}
                  onPageSizeChange={(size) => {
                    setPageSize(size);
                    setPage(1);
                  }}
                />
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
