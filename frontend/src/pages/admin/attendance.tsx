import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarX2, Download, Eye } from 'lucide-react';
import { api, ApiError, downloadCsv, fetchPaginated } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { useAcademicOptions } from '@/hooks/use-academic-options';
import { formatDate, formatDateTime } from '@/lib/utils';
import { PageHeader } from '@/components/page-header';
import { DataTable } from '@/components/data-table';
import type { DataTableColumn } from '@/components/data-table';
import { FilterBar } from '@/components/filters-bar';
import { Pagination } from '@/components/pagination';
import { ErrorState } from '@/components/states';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { AttendanceBadge } from '@/components/attendance-display';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { AttendanceSession, RosterStudent } from '@/types';

interface SessionRow extends AttendanceSession {
  summary: { present: number; absent: number; late: number; onLeave: number };
}

export default function AdminAttendancePage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: options } = useAcademicOptions();

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [search, setSearch] = useState('');
  const [subjectId, setSubjectId] = useState<number | undefined>();
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [rosterSession, setRosterSession] = useState<SessionRow | null>(null);
  const [pendingCancel, setPendingCancel] = useState<SessionRow | null>(null);

  const query = { page, pageSize, search, subjectId, startDate, endDate };

  const listQuery = useQuery({
    queryKey: ['attendance', 'sessions', 'admin', query],
    queryFn: () => fetchPaginated<SessionRow>('/api/attendance/sessions', query),
  });

  const rosterQuery = useQuery({
    queryKey: ['attendance', 'session', rosterSession?.id],
    queryFn: () =>
      api.get<AttendanceSession & { roster: RosterStudent[] }>(
        `/api/attendance/sessions/${rosterSession!.id}`,
      ),
    enabled: Boolean(rosterSession),
  });

  const cancelMutation = useMutation({
    mutationFn: (session: SessionRow) => api.post(`/api/attendance/sessions/${session.id}/cancel`),
    onSuccess: () => {
      toast.success('Session cancelled', 'The session no longer counts towards attendance.');
      setPendingCancel(null);
      void queryClient.invalidateQueries({ queryKey: ['attendance'] });
    },
    onError: (error: unknown) => {
      toast.error(
        'Could not cancel session',
        error instanceof ApiError ? error.message : 'Please try again.',
      );
    },
  });

  const rows = listQuery.data?.data ?? [];
  const meta = listQuery.data?.meta ?? { page, pageSize, total: 0, totalPages: 1 };

  const columns: DataTableColumn<SessionRow>[] = [
    {
      key: 'attendanceDate',
      header: 'Date',
      render: (row) => <span className="whitespace-nowrap">{formatDate(row.attendanceDate)}</span>,
    },
    {
      key: 'subject',
      header: 'Subject',
      render: (row) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-foreground">{row.subject.subjectName}</p>
          <p className="truncate text-xs text-muted-foreground">{row.subject.subjectCode}</p>
        </div>
      ),
    },
    {
      key: 'section',
      header: 'Section',
      render: (row) => row.section,
    },
    {
      key: 'faculty',
      header: 'Faculty',
      render: (row) => row.faculty?.user?.name ?? '—',
    },
    {
      key: 'sessionNumber',
      header: 'Session',
      align: 'center',
      render: (row) => `#${row.sessionNumber}`,
    },
    {
      key: 'topic',
      header: 'Topic',
      render: (row) => (
        <span className="line-clamp-1 text-muted-foreground">{row.topic || '—'}</span>
      ),
    },
    {
      key: 'summary',
      header: 'Summary',
      render: (row) => (
        <div className="flex items-center gap-1.5">
          <span className="rounded bg-success-soft px-1.5 py-0.5 text-[11px] font-medium text-success">
            {row.summary.present} P
          </span>
          <span className="rounded bg-destructive-soft px-1.5 py-0.5 text-[11px] font-medium text-destructive">
            {row.summary.absent} A
          </span>
          <span className="rounded bg-warning-soft px-1.5 py-0.5 text-[11px] font-medium text-warning">
            {row.summary.late} L
          </span>
        </div>
      ),
    },
    {
      key: 'isCancelled',
      header: 'Status',
      render: (row) =>
        row.isCancelled ? (
          <Badge variant="outline" className="text-muted-foreground">
            Cancelled
          </Badge>
        ) : (
          <Badge variant="outline" className="border-success/25 bg-success-soft text-success">
            Completed
          </Badge>
        ),
    },
    {
      key: '__actions',
      header: 'Actions',
      align: 'right',
      render: (row) => (
        <div className="flex items-center justify-end gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="View roster"
            onClick={(event) => {
              event.stopPropagation();
              setRosterSession(row);
            }}
          >
            <Eye className="h-3.5 w-3.5" />
          </Button>
          {!row.isCancelled && (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Cancel session"
              className="text-destructive hover:bg-destructive-soft"
              onClick={(event) => {
                event.stopPropagation();
                setPendingCancel(row);
              }}
            >
              <CalendarX2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      ),
    },
  ];

  const resetFilters = () => {
    setSearch('');
    setSubjectId(undefined);
    setStartDate('');
    setEndDate('');
    setPage(1);
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Attendance overview"
        description="Every attendance session recorded across the institution, with its status summary."
        breadcrumbs={[{ label: 'Admin', to: '/admin' }, { label: 'Attendance' }]}
        actions={
          <Button
            variant="outline"
            onClick={() =>
              void downloadCsv('/api/reports/export', {
                reportType: 'date-wise',
                subjectId,
                startDate: startDate || undefined,
                endDate: endDate || undefined,
              })
            }
          >
            <Download className="h-4 w-4" />
            Export CSV
          </Button>
        }
      />

      <FilterBar
        search={search}
        onSearchChange={(value) => {
          setSearch(value);
          setPage(1);
        }}
        searchPlaceholder="Search subject or topic…"
        onClear={resetFilters}
      >
        <div className="w-full sm:w-56">
          <Select
            value={subjectId ? String(subjectId) : 'all'}
            onValueChange={(value) => {
              setSubjectId(value === 'all' ? undefined : Number(value));
              setPage(1);
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="All subjects" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All subjects</SelectItem>
              {(options?.subjects ?? []).map((subject) => (
                <SelectItem key={subject.id} value={String(subject.id)}>
                  {subject.subjectCode} · {subject.subjectName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <Label htmlFor="from" className="text-xs text-muted-foreground">
            From
          </Label>
          <Input
            id="from"
            type="date"
            className="h-9 w-[150px]"
            value={startDate}
            onChange={(event) => {
              setStartDate(event.target.value);
              setPage(1);
            }}
          />
        </div>
        <div className="flex items-center gap-2">
          <Label htmlFor="to" className="text-xs text-muted-foreground">
            To
          </Label>
          <Input
            id="to"
            type="date"
            className="h-9 w-[150px]"
            value={endDate}
            onChange={(event) => {
              setEndDate(event.target.value);
              setPage(1);
            }}
          />
        </div>
      </FilterBar>

      {listQuery.isError ? (
        <ErrorState
          title="Could not load sessions"
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
            emptyTitle="No attendance sessions found"
            emptyDescription="Sessions appear here once faculty record attendance."
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

      <Dialog open={Boolean(rosterSession)} onOpenChange={(open) => !open && setRosterSession(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              {rosterSession
                ? `${rosterSession.subject.subjectName} · Section ${rosterSession.section}`
                : 'Session roster'}
            </DialogTitle>
            <DialogDescription>
              {rosterSession
                ? `${formatDate(rosterSession.attendanceDate)} · Session #${rosterSession.sessionNumber}${
                    rosterSession.topic ? ` · ${rosterSession.topic}` : ''
                  }`
                : ''}
            </DialogDescription>
          </DialogHeader>

          {rosterQuery.isLoading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Loading roster…</p>
          ) : (
            <div className="max-h-[60vh] overflow-y-auto rounded-lg border border-border">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50 hover:bg-muted/50">
                    <TableHead>Roll number</TableHead>
                    <TableHead>Student</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Remarks</TableHead>
                    <TableHead>Marked</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(rosterQuery.data?.roster ?? []).map((student) => (
                    <TableRow key={student.studentId}>
                      <TableCell className="font-medium">{student.rollNumber}</TableCell>
                      <TableCell>{student.name}</TableCell>
                      <TableCell>
                        <AttendanceBadge status={student.attendanceStatus} />
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {student.remarks || '—'}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {student.markedBy ? `${student.markedBy} · ${formatDateTime(student.markedAt)}` : '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={Boolean(pendingCancel)}
        onOpenChange={(open) => {
          if (!open) setPendingCancel(null);
        }}
        title="Cancel this attendance session?"
        description="Cancelled sessions stop counting towards attendance percentages. The records are kept for the audit trail."
        confirmLabel="Cancel session"
        destructive
        isLoading={cancelMutation.isPending}
        onConfirm={() => {
          if (pendingCancel) cancelMutation.mutate(pendingCancel);
        }}
      />
    </div>
  );
}
