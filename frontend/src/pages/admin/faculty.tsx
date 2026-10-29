import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Download, KeyRound, Pencil, Plus, UserCheck, UserX } from 'lucide-react';
import { api, ApiError, downloadCsv, fetchPaginated } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { useAcademicOptions } from '@/hooks/use-academic-options';
import { PageHeader } from '@/components/page-header';
import { DataTable } from '@/components/data-table';
import type { DataTableColumn } from '@/components/data-table';
import { FilterBar } from '@/components/filters-bar';
import { Pagination } from '@/components/pagination';
import { ErrorState } from '@/components/states';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { CredentialsDialog, type IssuedCredentials } from '@/components/credentials-dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { Faculty } from '@/types';

export default function AdminFacultyPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const options = useAcademicOptions();

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [departmentId, setDepartmentId] = useState('all');
  const [isActive, setIsActive] = useState('all');
  const [pendingDeactivate, setPendingDeactivate] = useState<Faculty | null>(null);
  const [issued, setIssued] = useState<IssuedCredentials | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, departmentId, isActive, pageSize]);

  const listQuery = useQuery({
    queryKey: ['admin', 'faculty', page, pageSize, debouncedSearch, departmentId, isActive],
    queryFn: () =>
      fetchPaginated<Faculty>('/api/faculty', {
        page,
        pageSize,
        search: debouncedSearch || undefined,
        departmentId: departmentId === 'all' ? undefined : Number(departmentId),
        isActive: isActive === 'all' ? undefined : isActive,
      }),
  });

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ['admin', 'faculty'] });

  const deactivateMutation = useMutation({
    mutationFn: async (faculty: Faculty) => {
      await api.delete(`/api/faculty/${faculty.id}`);
      return faculty;
    },
    onSuccess: (faculty) => {
      toast.success('Faculty deactivated', `${faculty.user.name} can no longer sign in.`);
      setPendingDeactivate(null);
      invalidate();
    },
    onError: (error: unknown) =>
      toast.error(
        'Deactivation failed',
        error instanceof ApiError ? error.message : 'Unable to reach the server.',
      ),
  });

  const reactivateMutation = useMutation({
    mutationFn: async (faculty: Faculty) => {
      await api.post(`/api/faculty/${faculty.id}/reactivate`);
      return faculty;
    },
    onSuccess: (faculty) => {
      toast.success('Faculty reactivated', `${faculty.user.name} can sign in again.`);
      invalidate();
    },
    onError: (error: unknown) =>
      toast.error(
        'Reactivation failed',
        error instanceof ApiError ? error.message : 'Unable to reach the server.',
      ),
  });

  const resetPasswordMutation = useMutation({
    mutationFn: async (faculty: Faculty) => {
      const result = await api.post<{ password: string }>(
        `/api/faculty/${faculty.id}/reset-password`,
        {},
      );
      return { faculty, password: result.password };
    },
    onSuccess: ({ faculty, password }) => {
      toast.success('New password issued', `Share it with ${faculty.user.name}.`);
      setIssued({
        name: faculty.user.name,
        role: 'FACULTY',
        email: faculty.user.email,
        temporaryPassword: password,
      });
    },
    onError: (error: unknown) =>
      toast.error(
        'Reset failed',
        error instanceof ApiError ? error.message : 'Unable to reach the server.',
      ),
  });

  const rows = listQuery.data?.data ?? [];
  const meta = listQuery.data?.meta ?? { page, pageSize, total: 0, totalPages: 1 };

  const columns: DataTableColumn<Faculty>[] = [
    {
      key: 'facultyId',
      header: 'Faculty ID',
      render: (row) => <span className="font-medium text-foreground">{row.facultyId}</span>,
    },
    {
      key: 'name',
      header: 'Name',
      render: (row) => (
        <span>
          <span className="font-medium text-foreground">{row.user.name}</span>
          <span className="ml-2 text-xs text-muted-foreground">{row.user.email}</span>
        </span>
      ),
    },
    {
      key: 'department',
      header: 'Department',
      render: (row) => row.department?.departmentCode ?? '—',
    },
    { key: 'designation', header: 'Designation' },
    {
      key: 'assignments',
      header: 'Assignments',
      align: 'right',
      render: (row) => row._count?.assignments ?? 0,
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => (
        <Badge variant={row.user.isActive ? 'success' : 'secondary'}>
          {row.user.isActive ? 'Active' : 'Inactive'}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (row) => (
        <div className="flex items-center justify-end gap-1">
          <Button variant="ghost" size="icon-sm" asChild aria-label={`Edit ${row.facultyId}`}>
            <Link to={`/admin/faculty/${row.id}/edit`}>
              <Pencil className="h-3.5 w-3.5" />
            </Link>
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Reset password for ${row.facultyId}`}
            onClick={() => resetPasswordMutation.mutate(row)}
          >
            <KeyRound className="h-3.5 w-3.5" />
          </Button>
          {row.user.isActive ? (
            <Button
              variant="ghost"
              size="icon-sm"
              className="text-destructive hover:bg-destructive-soft"
              aria-label={`Deactivate ${row.facultyId}`}
              onClick={() => setPendingDeactivate(row)}
            >
              <UserX className="h-3.5 w-3.5" />
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Reactivate ${row.facultyId}`}
              onClick={() => reactivateMutation.mutate(row)}
            >
              <UserCheck className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Faculty"
        description="Teaching staff who can mark attendance and run reports."
        breadcrumbs={[{ label: 'Admin', to: '/admin' }, { label: 'Faculty' }]}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              onClick={() =>
                void downloadCsv('/api/faculty/export', undefined, 'faculty.csv').catch(() =>
                  toast.error('Export failed', 'The CSV could not be generated.'),
                )
              }
            >
              <Download className="h-4 w-4" />
              Export
            </Button>
            <Button asChild>
              <Link to="/admin/faculty/new">
                <Plus className="h-4 w-4" />
                Add faculty
              </Link>
            </Button>
          </div>
        }
      />

      <FilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search by name, ID or email…"
        onClear={() => {
          setSearch('');
          setDepartmentId('all');
          setIsActive('all');
        }}
      >
        <Select value={departmentId} onValueChange={setDepartmentId}>
          <SelectTrigger className="w-full sm:w-48">
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

        <Select value={isActive} onValueChange={setIsActive}>
          <SelectTrigger className="w-full sm:w-36">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All faculty</SelectItem>
            <SelectItem value="true">Active only</SelectItem>
            <SelectItem value="false">Inactive only</SelectItem>
          </SelectContent>
        </Select>
      </FilterBar>

      {listQuery.isError ? (
        <ErrorState
          title="Could not load faculty"
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
            emptyTitle="No faculty found"
            emptyDescription="Add a faculty member or relax the filters above."
            emptyAction={
              <Button variant="outline" size="sm" asChild>
                <Link to="/admin/faculty/new">
                  <Plus className="h-3.5 w-3.5" />
                  Add faculty
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
        open={Boolean(pendingDeactivate)}
        onOpenChange={(open) => {
          if (!open) setPendingDeactivate(null);
        }}
        title="Deactivate faculty member?"
        description="The account is deactivated rather than deleted, so the attendance they marked keeps its history. The account can be reactivated at any time."
        confirmLabel="Deactivate"
        destructive
        isLoading={deactivateMutation.isPending}
        onConfirm={() => {
          if (pendingDeactivate) deactivateMutation.mutate(pendingDeactivate);
        }}
      />

      <CredentialsDialog credentials={issued} onClose={() => setIssued(null)} />
    </div>
  );
}
