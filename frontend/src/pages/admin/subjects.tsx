import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { api, ApiError, fetchPaginated } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { useAcademicOptions } from '@/hooks/use-academic-options';
import { PageHeader } from '@/components/page-header';
import { DataTable } from '@/components/data-table';
import type { DataTableColumn } from '@/components/data-table';
import { FilterBar } from '@/components/filters-bar';
import { Pagination } from '@/components/pagination';
import { ErrorState } from '@/components/states';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { Subject } from '@/types';

export default function AdminSubjectsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const options = useAcademicOptions();

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [departmentId, setDepartmentId] = useState('all');
  const [semesterId, setSemesterId] = useState('all');
  const [academicYearId, setAcademicYearId] = useState('all');
  const [pendingDelete, setPendingDelete] = useState<Subject | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, departmentId, semesterId, academicYearId, pageSize]);

  const subjectsQuery = useQuery({
    queryKey: ['admin', 'subjects', page, pageSize, debouncedSearch, departmentId, semesterId, academicYearId],
    queryFn: () =>
      fetchPaginated<Subject>('/api/subjects', {
        page,
        pageSize,
        search: debouncedSearch || undefined,
        departmentId: departmentId === 'all' ? undefined : Number(departmentId),
        semesterId: semesterId === 'all' ? undefined : Number(semesterId),
        academicYearId: academicYearId === 'all' ? undefined : Number(academicYearId),
      }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (subject: Subject) => {
      await api.delete(`/api/subjects/${subject.id}`);
      return subject;
    },
    onSuccess: (subject) => {
      toast.success('Subject removed', `${subject.subjectCode} is no longer active.`);
      setPendingDelete(null);
      void queryClient.invalidateQueries({ queryKey: ['admin', 'subjects'] });
    },
    onError: (error: unknown) => {
      const message =
        error instanceof ApiError ? error.message : 'Unable to reach the server. Please try again.';
      toast.error('Delete failed', message);
    },
  });

  const rows = subjectsQuery.data?.data ?? [];
  const meta = subjectsQuery.data?.meta ?? { page, pageSize, total: 0, totalPages: 1 };

  const columns: DataTableColumn<Subject>[] = [
    {
      key: 'subjectCode',
      header: 'Code',
      render: (row) => <span className="font-medium text-foreground">{row.subjectCode}</span>,
    },
    { key: 'subjectName', header: 'Subject name' },
    {
      key: 'department',
      header: 'Department',
      render: (row) => row.department?.departmentCode ?? '—',
    },
    {
      key: 'semester',
      header: 'Semester',
      render: (row) =>
        row.semester
          ? `Sem ${row.semester.semesterNumber} (${row.semester.academicYear?.yearName ?? '—'})`
          : '—',
    },
    {
      key: 'credits',
      header: 'Credits',
      align: 'right',
      render: (row) => row.credits,
    },
    {
      key: 'counts',
      header: 'Enrolled / Sessions',
      align: 'right',
      render: (row) => `${row._count?.enrollments ?? 0} / ${row._count?.sessions ?? 0}`,
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => (
        <Badge variant={row.isActive ? 'success' : 'secondary'}>
          {row.isActive ? 'Active' : 'Inactive'}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (row) => (
        <div className="flex items-center justify-end gap-1">
          <Button variant="ghost" size="icon-sm" asChild aria-label={`Edit ${row.subjectCode}`}>
            <Link to={`/admin/subjects/${row.id}/edit`}>
              <Pencil className="h-3.5 w-3.5" />
            </Link>
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            className="text-destructive hover:bg-destructive-soft"
            aria-label={`Delete ${row.subjectCode}`}
            onClick={() => setPendingDelete(row)}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Subjects"
        description="Every subject offered in the current academic year."
        breadcrumbs={[{ label: 'Admin', to: '/admin' }, { label: 'Subjects' }]}
        actions={
          <Button asChild>
            <Link to="/admin/subjects/new">
              <Plus className="h-4 w-4" />
              Add subject
            </Link>
          </Button>
        }
      />

      <FilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search by name or code…"
        onClear={() => {
          setSearch('');
          setDepartmentId('all');
          setSemesterId('all');
          setAcademicYearId('all');
        }}
      >
        <Select
          value={departmentId}
          onValueChange={setDepartmentId}
        >
          <SelectTrigger className="w-full sm:w-44">
            <SelectValue placeholder="Department" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All departments</SelectItem>
            {(options.data?.departments ?? []).map((department) => (
              <SelectItem key={department.id} value={String(department.id)}>
                {department.departmentName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={semesterId} onValueChange={setSemesterId}>
          <SelectTrigger className="w-full sm:w-44">
            <SelectValue placeholder="Semester" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All semesters</SelectItem>
            {(options.data?.semesters ?? []).map((semester) => (
              <SelectItem key={semester.id} value={String(semester.id)}>
                Sem {semester.semesterNumber} · {semester.academicYear?.yearName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={academicYearId} onValueChange={setAcademicYearId}>
          <SelectTrigger className="w-full sm:w-40">
            <SelectValue placeholder="Academic year" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All years</SelectItem>
            {(options.data?.academicYears ?? []).map((year) => (
              <SelectItem key={year.id} value={String(year.id)}>
                {year.yearName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FilterBar>

      {subjectsQuery.isError ? (
        <ErrorState
          title="Could not load subjects"
          message={
            subjectsQuery.error instanceof ApiError
              ? subjectsQuery.error.message
              : 'Something went wrong while contacting the server.'
          }
          onRetry={() => void subjectsQuery.refetch()}
        />
      ) : (
        <>
          <DataTable
            columns={columns}
            rows={rows}
            rowKey={(row) => row.id}
            isLoading={subjectsQuery.isLoading}
            emptyTitle="No subjects found"
            emptyDescription="Add the subjects that are taught in this academic year."
            emptyAction={
              <Button variant="outline" size="sm" asChild>
                <Link to="/admin/subjects/new">
                  <Plus className="h-3.5 w-3.5" />
                  Add subject
                </Link>
              </Button>
            }
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

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
        title="Delete subject?"
        description="Subjects that already carry attendance history are deactivated instead of deleted, so historical records are never lost."
        confirmLabel="Delete"
        destructive
        isLoading={deleteMutation.isPending}
        onConfirm={() => {
          if (pendingDelete) deleteMutation.mutate(pendingDelete);
        }}
      />
    </div>
  );
}
