import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { ClipboardCheck, Users } from 'lucide-react';
import { api, fetchPaginated } from '@/lib/api';
import { useAuth } from '@/hooks/use-auth';
import { PageHeader } from '@/components/page-header';
import { DataTable } from '@/components/data-table';
import type { DataTableColumn } from '@/components/data-table';
import { FilterBar } from '@/components/filters-bar';
import { Pagination } from '@/components/pagination';
import { EmptyState, ErrorState } from '@/components/states';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import type { Assignment, FacultyDashboardData, RosterStudent } from '@/types';

export default function FacultySubjectsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const facultyId = user?.faculty?.id;

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [rosterTarget, setRosterTarget] = useState<Assignment | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, pageSize]);

  const assignmentsQuery = useQuery({
    queryKey: ['faculty', 'assignments', facultyId, page, pageSize, debouncedSearch],
    queryFn: () =>
      fetchPaginated<Assignment>('/api/assignments', {
        facultyId,
        page,
        pageSize,
        search: debouncedSearch || undefined,
      }),
    enabled: facultyId !== undefined,
  });

  // The dashboard payload carries the per-assignment session counters.
  const dashboardQuery = useQuery({
    queryKey: ['dashboard', 'faculty'],
    queryFn: () => api.get<FacultyDashboardData>('/api/dashboard/faculty'),
  });

  const sessionCountByAssignment = useMemo(() => {
    const map = new Map<number, number>();
    for (const assignment of dashboardQuery.data?.assignments ?? []) {
      map.set(assignment.id, assignment.sessionCount ?? assignment._count?.sessions ?? 0);
    }
    return map;
  }, [dashboardQuery.data]);

  const rosterQuery = useQuery({
    queryKey: ['faculty', 'subject-roster', rosterTarget?.subjectId, rosterTarget?.sectionId],
    queryFn: () =>
      api.get<RosterStudent[]>(`/api/enrollments/subject/${rosterTarget!.subjectId}`, {
        sectionId: rosterTarget!.sectionId,
      }),
    enabled: Boolean(rosterTarget),
  });

  const rows = assignmentsQuery.data?.data ?? [];
  const meta =
    assignmentsQuery.data?.meta ?? { page, pageSize, total: 0, totalPages: 1 };

  const columns: DataTableColumn<Assignment>[] = [
    {
      key: 'subjectCode',
      header: 'Subject code',
      render: (row) => (
        <span className="font-medium text-foreground">{row.subject?.subjectCode ?? '—'}</span>
      ),
    },
    {
      key: 'subjectName',
      header: 'Subject name',
      render: (row) => row.subject?.subjectName ?? '—',
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
      key: 'credits',
      header: 'Credits',
      align: 'right',
      render: (row) => row.subject?.credits ?? '—',
    },
    {
      key: 'sessions',
      header: 'Sessions held',
      align: 'right',
      render: (row) => sessionCountByAssignment.get(row.id) ?? 0,
    },
    {
      key: '__actions',
      header: 'Actions',
      align: 'right',
      render: (row) => (
        <div className="flex items-center justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={(event) => {
              event.stopPropagation();
              setRosterTarget(row);
            }}
          >
            <Users className="h-3.5 w-3.5" />
            View students
          </Button>
          <Button
            size="sm"
            onClick={(event) => {
              event.stopPropagation();
              navigate(`/faculty/attendance?subjectId=${row.subjectId}&sectionId=${row.sectionId}`);
            }}
          >
            <ClipboardCheck className="h-3.5 w-3.5" />
            Mark attendance
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="My subjects"
        description="Every subject and section you are assigned to teach, with the sessions recorded so far."
        breadcrumbs={[{ label: 'Faculty', to: '/faculty' }, { label: 'My subjects' }]}
      />

      <FilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search subject code or name…"
        onClear={() => setSearch('')}
      />

      {assignmentsQuery.isError ? (
        <ErrorState
          title="Could not load your subjects"
          message={
            assignmentsQuery.error instanceof Error
              ? assignmentsQuery.error.message
              : 'Something went wrong while contacting the server.'
          }
          onRetry={() => void assignmentsQuery.refetch()}
        />
      ) : (
        <>
          <DataTable
            columns={columns}
            rows={rows}
            rowKey={(row) => row.id}
            isLoading={assignmentsQuery.isLoading}
            emptyTitle="No subjects assigned"
            emptyDescription="Once an administrator assigns you to a subject and section it will appear here."
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

      <Dialog
        open={Boolean(rosterTarget)}
        onOpenChange={(open) => {
          if (!open) setRosterTarget(null);
        }}
      >
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              {rosterTarget
                ? `${rosterTarget.subject?.subjectCode ?? ''} · ${rosterTarget.subject?.subjectName ?? ''}`
                : 'Students'}
            </DialogTitle>
            <DialogDescription>
              {rosterTarget
                ? `Enrolled students for section ${rosterTarget.section?.section ?? '—'}${
                    rosterTarget.academicYear?.yearName
                      ? ` · ${rosterTarget.academicYear.yearName}`
                      : ''
                  }`
                : ''}
            </DialogDescription>
          </DialogHeader>

          {rosterQuery.isLoading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Loading students…</p>
          ) : rosterQuery.isError ? (
            <ErrorState
              title="Could not load the roster"
              message={
                rosterQuery.error instanceof Error
                  ? rosterQuery.error.message
                  : 'Please try again.'
              }
              onRetry={() => void rosterQuery.refetch()}
            />
          ) : (rosterQuery.data ?? []).length === 0 ? (
            <EmptyState
              title="No students enrolled"
              description="Nobody is enrolled in this subject and section yet."
            />
          ) : (
            <div className="max-h-[60vh] overflow-y-auto rounded-lg border border-border">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50 hover:bg-muted/50">
                    <TableHead>Roll number</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Section</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(rosterQuery.data ?? []).map((student) => (
                    <TableRow key={student.studentId}>
                      <TableCell className="font-medium">{student.rollNumber}</TableCell>
                      <TableCell>
                        <p className="font-medium text-foreground">{student.name}</p>
                        <p className="text-xs text-muted-foreground">{student.email}</p>
                      </TableCell>
                      <TableCell>{student.section}</TableCell>
                      <TableCell>
                        {student.isActive ? (
                          <Badge variant="success">Active</Badge>
                        ) : (
                          <Badge variant="outline" className="text-muted-foreground">
                            Inactive
                          </Badge>
                        )}
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
