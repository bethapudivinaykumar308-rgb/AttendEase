import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CalendarDays, Eye, Users } from 'lucide-react';
import { api, ApiError, fetchPaginated } from '@/lib/api';
import { useAuth } from '@/hooks/use-auth';
import { PageHeader } from '@/components/page-header';
import { DataTable } from '@/components/data-table';
import type { DataTableColumn } from '@/components/data-table';
import { FilterBar } from '@/components/filters-bar';
import { Pagination } from '@/components/pagination';
import { ErrorState } from '@/components/states';
import { AttendanceBadge } from '@/components/attendance-display';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { Assignment, AttendanceSession, RosterStudent } from '@/types';

interface SessionDetail extends AttendanceSession {
  roster: RosterStudent[];
}

export default function FacultyHistoryPage() {
  const { user } = useAuth();
  const facultyId = user?.faculty?.id;

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [subjectId, setSubjectId] = useState('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [rosterTarget, setRosterTarget] = useState<number | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, subjectId, startDate, endDate, pageSize]);

  const assignmentsQuery = useQuery({
    queryKey: ['faculty', 'assignments', facultyId],
    queryFn: () => api.get<Assignment[]>('/api/assignments', { facultyId, pageSize: 100 }),
    enabled: facultyId !== undefined,
  });

  const taughtSubjects = useMemo(() => {
    const assignments = assignmentsQuery.data ?? [];
    const seen = new Map<number, { id: number; subjectCode: string; subjectName: string }>();
    for (const assignment of assignments) {
      if (!assignment.subject) continue;
      seen.set(assignment.subject.id, {
        id: assignment.subject.id,
        subjectCode: assignment.subject.subjectCode,
        subjectName: assignment.subject.subjectName,
      });
    }
    return [...seen.values()];
  }, [assignmentsQuery.data]);

  const listQuery = useQuery({
    queryKey: ['faculty', 'sessions', page, pageSize, debouncedSearch, subjectId, startDate, endDate],
    queryFn: () =>
      fetchPaginated<AttendanceSession>('/api/attendance/sessions', {
        page,
        pageSize,
        search: debouncedSearch || undefined,
        subjectId: subjectId === 'all' ? undefined : Number(subjectId),
        startDate: startDate || undefined,
        endDate: endDate || undefined,
      }),
  });

  const rosterQuery = useQuery({
    queryKey: ['faculty', 'session-roster', rosterTarget],
    queryFn: () => api.get<SessionDetail>(`/api/attendance/sessions/${rosterTarget}`),
    enabled: rosterTarget !== null,
  });

  const rows = listQuery.data?.data ?? [];
  const meta = listQuery.data?.meta ?? { page, pageSize, total: 0, totalPages: 1 };

  const columns: DataTableColumn<AttendanceSession>[] = [
    {
      key: 'attendanceDate',
      header: 'Date',
      render: (row) => (
        <span className="font-medium text-foreground">{row.attendanceDate}</span>
      ),
    },
    {
      key: 'subject',
      header: 'Subject',
      render: (row) => (
        <span>
          <span className="font-medium text-foreground">{row.subject?.subjectCode ?? '—'}</span>
          <span className="ml-2 text-xs text-muted-foreground">
            {row.subject?.subjectName ?? ''}
          </span>
        </span>
      ),
    },
    { key: 'section', header: 'Section' },
    {
      key: 'sessionNumber',
      header: 'Session',
      align: 'right',
      render: (row) => `#${row.sessionNumber}`,
    },
    {
      key: 'topic',
      header: 'Topic',
      render: (row) => (
        <span className="text-muted-foreground">{row.topic ?? '—'}</span>
      ),
    },
    {
      key: 'summary',
      header: 'Summary',
      render: (row) => {
        const summary = row.summary;
        if (!summary) return '—';
        return (
          <span className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-medium text-success">{summary.present} present</span>
            <span className="text-xs font-medium text-destructive">{summary.absent} absent</span>
            {summary.late > 0 && (
              <span className="text-xs font-medium text-warning">{summary.late} late</span>
            )}
            {summary.onLeave > 0 && (
              <span className="text-xs font-medium text-primary">
                {summary.onLeave} on leave
              </span>
            )}
          </span>
        );
      },
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (row) => (
        <Button
          variant="outline"
          size="sm"
          onClick={() => setRosterTarget(row.id)}
          aria-label={`View roster for session ${row.sessionNumber}`}
        >
          <Eye className="h-3.5 w-3.5" />
          Roster
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Attendance history"
        description="Every session you have recorded, with the attendance summary for each class."
        breadcrumbs={[{ label: 'Faculty', to: '/faculty' }, { label: 'History' }]}
      />

      <FilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search by topic or subject…"
        onClear={() => {
          setSearch('');
          setSubjectId('all');
          setStartDate('');
          setEndDate('');
        }}
      >
        <div className="w-full sm:w-48">
          <Select value={subjectId} onValueChange={setSubjectId}>
            <SelectTrigger>
              <SelectValue placeholder="Subject" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All subjects</SelectItem>
              {taughtSubjects.map((subject) => (
                <SelectItem key={subject.id} value={String(subject.id)}>
                  {subject.subjectCode} · {subject.subjectName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="history-start" className="text-xs text-muted-foreground">
            From
          </Label>
          <Input
            id="history-start"
            type="date"
            value={startDate}
            onChange={(event) => setStartDate(event.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="history-end" className="text-xs text-muted-foreground">
            To
          </Label>
          <Input
            id="history-end"
            type="date"
            value={endDate}
            onChange={(event) => setEndDate(event.target.value)}
          />
        </div>
      </FilterBar>

      {listQuery.isError ? (
        <ErrorState
          title="Could not load attendance history"
          message={
            listQuery.error instanceof ApiError
              ? listQuery.error.message
              : 'Something went wrong while contacting the server.'
          }
          onRetry={() => void listQuery.refetch()}
        />
      ) : (
        <>
          <DataTable
            columns={columns}
            rows={rows}
            rowKey={(row) => row.id}
            isLoading={listQuery.isLoading}
            emptyTitle="No sessions recorded yet"
            emptyDescription="Sessions you mark for attendance appear here with a full history."
          />

          <Pagination
            page={meta.page}
            pageSize={meta.pageSize}
            total={meta.total}
            totalPages={meta.totalPages}
            onPageChange={setPage}
            onPageSizeChange={(size) => {
              setPageSize(size);
              setPage(1);
            }}
          />
        </>
      )}

      <Dialog open={rosterTarget !== null} onOpenChange={(open) => {
        if (!open) setRosterTarget(null);
      }}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              {rosterQuery.data
                ? `${rosterQuery.data.subject?.subjectCode ?? 'Session'} · Section ${rosterQuery.data.section ?? '—'}`
                : 'Session roster'}
            </DialogTitle>
            <DialogDescription className="flex flex-wrap items-center gap-3">
              {rosterQuery.data && (
                <>
                  <span className="flex items-center gap-1.5">
                    <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
                    {rosterQuery.data.attendanceDate}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Users className="h-3.5 w-3.5" aria-hidden="true" />
                    {rosterQuery.data.summary?.present ?? 0} present,{' '}
                    {rosterQuery.data.summary?.absent ?? 0} absent
                  </span>
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          {rosterQuery.isLoading ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Loading roster…</p>
          ) : rosterQuery.isError ? (
            <ErrorState
              title="Could not load the roster"
              message={
                rosterQuery.error instanceof ApiError
                  ? rosterQuery.error.message
                  : 'Something went wrong while contacting the server.'
              }
              onRetry={() => void rosterQuery.refetch()}
            />
          ) : (
            <div className="max-h-96 overflow-y-auto rounded-md border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Roll number</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Marked by</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(rosterQuery.data?.roster ?? []).map((student) => (
                    <TableRow key={student.studentId}>
                      <TableCell className="font-medium">{student.rollNumber}</TableCell>
                      <TableCell>{student.name}</TableCell>
                      <TableCell>
                        {student.attendanceStatus ? (
                          <AttendanceBadge status={student.attendanceStatus} />
                        ) : (
                          <span className="text-xs text-muted-foreground">Not marked</span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {student.markedBy ?? '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
