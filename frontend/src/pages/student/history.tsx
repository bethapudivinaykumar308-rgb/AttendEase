import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download } from 'lucide-react';
import { AttendanceBadge } from '@/components/attendance-display';
import { DataTable } from '@/components/data-table';
import type { DataTableColumn } from '@/components/data-table';
import { FilterBar } from '@/components/filters-bar';
import { PageHeader } from '@/components/page-header';
import { Pagination } from '@/components/pagination';
import { ErrorState, LoadingState } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
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
  AttendanceStatus,
  MonthlySummary,
  PercentageSummary,
  SubjectSummary,
} from '@/types';

const RECORDS_PAGE_SIZE = 100;

const STATUS_OPTIONS: { value: AttendanceStatus; label: string }[] = [
  { value: 'PRESENT', label: 'Present' },
  { value: 'ABSENT', label: 'Absent' },
  { value: 'LATE', label: 'Late' },
  { value: 'ON_LEAVE', label: 'On leave' },
];

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

export default function StudentHistoryPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const studentId = user?.student?.id ?? null;

  const [search, setSearch] = useState('');
  const [subjectId, setSubjectId] = useState('all');
  const [status, setStatus] = useState<'all' | AttendanceStatus>('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [isExporting, setIsExporting] = useState(false);

  const historyQuery = useQuery({
    queryKey: ['student-history', studentId],
    queryFn: async (): Promise<StudentAttendanceBundle> => {
      if (!studentId) return { overall: null, subjects: [], monthly: [], records: [] };
      return loadAttendance(studentId);
    },
    enabled: Boolean(studentId),
  });

  const subjects = historyQuery.data?.subjects ?? [];
  const records = useMemo(
    () =>
      [...(historyQuery.data?.records ?? [])].sort((a, b) =>
        a.session.attendanceDate === b.session.attendanceDate
          ? b.id - a.id
          : a.session.attendanceDate < b.session.attendanceDate
            ? 1
            : -1,
      ),
    [historyQuery.data?.records],
  );

  const filteredRecords = useMemo(() => {
    const term = search.trim().toLowerCase();

    return records.filter((record) => {
      if (subjectId !== 'all' && record.session.subject.id !== Number(subjectId)) return false;
      if (status !== 'all' && record.attendanceStatus !== status) return false;
      if (startDate && record.session.attendanceDate < startDate) return false;
      if (endDate && record.session.attendanceDate > endDate) return false;
      if (term) {
        const haystack = `${record.session.subject.subjectName} ${record.session.subject.subjectCode}`;
        if (!haystack.toLowerCase().includes(term)) return false;
      }
      return true;
    });
  }, [records, search, subjectId, status, startDate, endDate]);

  const totalPages = Math.max(1, Math.ceil(filteredRecords.length / pageSize));
  const pageRecords = filteredRecords.slice((page - 1) * pageSize, page * pageSize);

  const resetFilters = () => {
    setSearch('');
    setSubjectId('all');
    setStatus('all');
    setStartDate('');
    setEndDate('');
    setPage(1);
  };

  const hasFilters =
    search !== '' ||
    subjectId !== 'all' ||
    status !== 'all' ||
    startDate !== '' ||
    endDate !== '';

  const columns: DataTableColumn<AttendanceRecord>[] = useMemo(
    () => [
      { key: 'date', header: 'Date', render: (row) => formatDate(row.session.attendanceDate) },
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
      { key: 'remarks', header: 'Remarks', render: (row) => row.remarks ?? '—' },
      { key: 'markedAt', header: 'Marked at', render: (row) => formatDateTime(row.markedAt) },
    ],
    [],
  );

  const handleExport = async () => {
    setIsExporting(true);
    try {
      await downloadCsv('/api/reports/export', { reportType: 'subject-wise' });
      toast.success('Export ready', 'Your attendance history CSV has been downloaded.');
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
        title="Attendance History"
        description="Every session recorded against your account, with client-side filters."
        breadcrumbs={[
          { label: 'Student', to: '/student' },
          { label: 'Attendance History' },
        ]}
        actions={
          <Button variant="outline" onClick={() => void handleExport()} isLoading={isExporting}>
            <Download className="h-4 w-4" />
            Export CSV
          </Button>
        }
      />

      {historyQuery.isError ? (
        <ErrorState
          title="Could not load your attendance history"
          message={
            historyQuery.error instanceof Error
              ? historyQuery.error.message
              : 'Something went wrong while contacting the server.'
          }
          onRetry={() => void historyQuery.refetch()}
        />
      ) : historyQuery.isLoading ? (
        <LoadingState label="Loading your attendance history…" />
      ) : (
        <>
          <Card>
            <CardContent className="space-y-4">
              <FilterBar
                search={search}
                onSearchChange={(value) => {
                  setSearch(value);
                  setPage(1);
                }}
                searchPlaceholder="Search subject name…"
                onClear={hasFilters ? resetFilters : undefined}
              >
                <div className="w-full sm:w-56">
                  <Label htmlFor="history-subject" className="mb-1.5 block">
                    Subject
                  </Label>
                  <Select
                    value={subjectId}
                    onValueChange={(value) => {
                      setSubjectId(value);
                      setPage(1);
                    }}
                  >
                    <SelectTrigger id="history-subject">
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

                <div className="w-full sm:w-44">
                  <Label htmlFor="history-status" className="mb-1.5 block">
                    Status
                  </Label>
                  <Select
                    value={status}
                    onValueChange={(value) => {
                      setStatus(value as 'all' | AttendanceStatus);
                      setPage(1);
                    }}
                  >
                    <SelectTrigger id="history-status">
                      <SelectValue placeholder="All statuses" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All statuses</SelectItem>
                      {STATUS_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="w-full sm:w-40">
                  <Label htmlFor="history-start" className="mb-1.5 block">
                    From
                  </Label>
                  <Input
                    id="history-start"
                    type="date"
                    value={startDate}
                    onChange={(event) => {
                      setStartDate(event.target.value);
                      setPage(1);
                    }}
                  />
                </div>

                <div className="w-full sm:w-40">
                  <Label htmlFor="history-end" className="mb-1.5 block">
                    To
                  </Label>
                  <Input
                    id="history-end"
                    type="date"
                    value={endDate}
                    onChange={(event) => {
                      setEndDate(event.target.value);
                      setPage(1);
                    }}
                  />
                </div>
              </FilterBar>

              <p className="text-sm text-muted-foreground">
                Showing <span className="font-medium text-foreground">{filteredRecords.length}</span>{' '}
                of <span className="font-medium text-foreground">{records.length}</span> records
              </p>
            </CardContent>
          </Card>

          <DataTable
            columns={columns}
            rows={pageRecords}
            rowKey={(row) => row.id}
            emptyTitle="No matching records"
            emptyDescription="Adjust the filters above to widen your search."
          />

          {filteredRecords.length > 0 && (
            <Pagination
              page={Math.min(page, totalPages)}
              pageSize={pageSize}
              total={filteredRecords.length}
              totalPages={totalPages}
              onPageChange={setPage}
              onPageSizeChange={(size) => {
                setPageSize(size);
                setPage(1);
              }}
            />
          )}
        </>
      )}
    </div>
  );
}
