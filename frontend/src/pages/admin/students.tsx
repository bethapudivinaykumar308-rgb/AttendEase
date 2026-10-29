import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Download, Eye, KeyRound, Pencil, Plus, Upload, UserCheck, UserX } from 'lucide-react';
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
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
import type { Student } from '@/types';

const SECTION_OPTIONS = ['A', 'B', 'C', 'D'];

export default function AdminStudentsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const options = useAcademicOptions();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [departmentId, setDepartmentId] = useState('all');
  const [semesterId, setSemesterId] = useState('all');
  const [academicYearId, setAcademicYearId] = useState('all');
  const [section, setSection] = useState('all');
  const [isActive, setIsActive] = useState('all');
  const [pendingDeactivate, setPendingDeactivate] = useState<Student | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importRows, setImportRows] = useState('');
  const [importError, setImportError] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, departmentId, semesterId, academicYearId, section, isActive, pageSize]);

  const listQuery = useQuery({
    queryKey: [
      'admin',
      'students',
      page,
      pageSize,
      debouncedSearch,
      departmentId,
      semesterId,
      academicYearId,
      section,
      isActive,
    ],
    queryFn: () =>
      fetchPaginated<Student>('/api/students', {
        page,
        pageSize,
        search: debouncedSearch || undefined,
        departmentId: departmentId === 'all' ? undefined : Number(departmentId),
        semesterId: semesterId === 'all' ? undefined : Number(semesterId),
        academicYearId: academicYearId === 'all' ? undefined : Number(academicYearId),
        section: section === 'all' ? undefined : section,
        isActive: isActive === 'all' ? undefined : isActive,
      }),
  });

  const invalidate = () =>
    void queryClient.invalidateQueries({ queryKey: ['admin', 'students'] });

  const deactivateMutation = useMutation({
    mutationFn: async (student: Student) => {
      await api.delete(`/api/students/${student.id}`);
      return student;
    },
    onSuccess: (student) => {
      toast.success('Student deactivated', `${student.rollNumber} can no longer sign in.`);
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
    mutationFn: async (student: Student) => {
      await api.post(`/api/students/${student.id}/reactivate`);
      return student;
    },
    onSuccess: (student) => {
      toast.success('Student reactivated', `${student.rollNumber} can sign in again.`);
      invalidate();
    },
    onError: (error: unknown) =>
      toast.error(
        'Reactivation failed',
        error instanceof ApiError ? error.message : 'Unable to reach the server.',
      ),
  });

  const resetPasswordMutation = useMutation({
    mutationFn: async ({ student, password }: { student: Student; password: string }) => {
      await api.post(`/api/students/${student.id}/reset-password`, { password });
      return student;
    },
    onSuccess: (student) => {
      toast.success('Password reset', `A new password was set for ${student.rollNumber}.`);
    },
    onError: (error: unknown) =>
      toast.error(
        'Reset failed',
        error instanceof ApiError ? error.message : 'Unable to reach the server.',
      ),
  });

  const importMutation = useMutation({
    mutationFn: async (rows: unknown[]) =>
      api.post<{
        created: number;
        skipped: number;
        errors: string[];
        defaultPasswordApplied: number;
        defaultPassword: string;
      }>('/api/students/import', { rows }),
    onSuccess: (result) => {
      toast.success(
        'Import finished',
        `${result.created} student(s) created, ${result.skipped} skipped.${
          result.defaultPasswordApplied > 0
            ? ` ${result.defaultPasswordApplied} account(s) use the default password ${result.defaultPassword}.`
            : ''
        }`,
      );
      setImportOpen(false);
      setImportRows('');
      invalidate();
    },
    onError: (error: unknown) => {
      const message =
        error instanceof ApiError ? error.message : 'Unable to reach the server.';
      setImportError(message);
      toast.error('Import failed', message);
    },
  });

  const rows = listQuery.data?.data ?? [];
  const meta = listQuery.data?.meta ?? { page, pageSize, total: 0, totalPages: 1 };

  const sectionOptions = useMemo(
    () =>
      Array.from(
        new Set([
          ...SECTION_OPTIONS,
          ...(options.data?.sections ?? []).map((entry) => entry.section),
        ]),
      ),
    [options.data],
  );

  const columns: DataTableColumn<Student>[] = [
    {
      key: 'rollNumber',
      header: 'Roll number',
      render: (row) => <span className="font-medium text-foreground">{row.rollNumber}</span>,
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
    {
      key: 'semester',
      header: 'Semester',
      render: (row) =>
        row.semester
          ? `Sem ${row.semester.semesterNumber} (${row.semester.academicYear?.yearName ?? '—'})`
          : '—',
    },
    { key: 'section', header: 'Section' },
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
          <Button variant="ghost" size="icon-sm" asChild aria-label={`View ${row.rollNumber}`}>
            <Link to={`/admin/students/${row.id}`}>
              <Eye className="h-3.5 w-3.5" />
            </Link>
          </Button>
          <Button variant="ghost" size="icon-sm" asChild aria-label={`Edit ${row.rollNumber}`}>
            <Link to={`/admin/students/${row.id}/edit`}>
              <Pencil className="h-3.5 w-3.5" />
            </Link>
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Reset password for ${row.rollNumber}`}
            onClick={() => {
              const password = window.prompt(
                `New password for ${row.user.name}. It must be at least 8 characters with an uppercase letter, a lowercase letter and a number.`,
                'Attend@123',
              );
              if (password) resetPasswordMutation.mutate({ student: row, password });
            }}
          >
            <KeyRound className="h-3.5 w-3.5" />
          </Button>
          {row.user.isActive ? (
            <Button
              variant="ghost"
              size="icon-sm"
              className="text-destructive hover:bg-destructive-soft"
              aria-label={`Deactivate ${row.rollNumber}`}
              onClick={() => setPendingDeactivate(row)}
            >
              <UserX className="h-3.5 w-3.5" />
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Reactivate ${row.rollNumber}`}
              onClick={() => reactivateMutation.mutate(row)}
            >
              <UserCheck className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      ),
    },
  ];

  function handleCsvFile(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? '');
      const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
      const header = (lines.shift() ?? '')
        .split(',')
        .map((column) => column.trim().toLowerCase().replace(/\s+/g, ''));
      const rows = lines.map((line) => {
        const cells = line.split(',').map((cell) => cell.trim());
        return header.reduce<Record<string, string>>((acc, column, index) => {
          acc[column] = cells[index] ?? '';
          return acc;
        }, {});
      });
      setImportRows(JSON.stringify(rows, null, 2));
      setImportError(null);
    };
    reader.readAsText(file);
  }

  function handleImport() {
    setImportError(null);
    let parsed: unknown;
    try {
      parsed = JSON.parse(importRows);
    } catch {
      setImportError('The import data is not valid JSON.');
      return;
    }
    if (!Array.isArray(parsed) || parsed.length === 0) {
      setImportError('Add at least one row before importing.');
      return;
    }
    importMutation.mutate(parsed);
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Students"
        description="Every student registered in the institution."
        breadcrumbs={[{ label: 'Admin', to: '/admin' }, { label: 'Students' }]}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              onClick={() =>
                void downloadCsv('/api/students/export', undefined, 'students.csv').catch(() =>
                  toast.error('Export failed', 'The CSV could not be generated.'),
                )
              }
            >
              <Download className="h-4 w-4" />
              Export
            </Button>
            <Button variant="outline" onClick={() => setImportOpen(true)}>
              <Upload className="h-4 w-4" />
              Import
            </Button>
            <Button asChild>
              <Link to="/admin/students/new">
                <Plus className="h-4 w-4" />
                Add student
              </Link>
            </Button>
          </div>
        }
      />

      <FilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search by name, roll number or email…"
        onClear={() => {
          setSearch('');
          setDepartmentId('all');
          setSemesterId('all');
          setAcademicYearId('all');
          setSection('all');
          setIsActive('all');
        }}
      >
        <Select value={departmentId} onValueChange={setDepartmentId}>
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

        <Select value={section} onValueChange={setSection}>
          <SelectTrigger className="w-full sm:w-32">
            <SelectValue placeholder="Section" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All sections</SelectItem>
            {sectionOptions.map((value) => (
              <SelectItem key={value} value={value}>
                Section {value}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={isActive} onValueChange={setIsActive}>
          <SelectTrigger className="w-full sm:w-36">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All students</SelectItem>
            <SelectItem value="true">Active only</SelectItem>
            <SelectItem value="false">Inactive only</SelectItem>
          </SelectContent>
        </Select>
      </FilterBar>

      {listQuery.isError ? (
        <ErrorState
          title="Could not load students"
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
            emptyTitle="No students found"
            emptyDescription="Add a student or relax the filters above."
            emptyAction={
              <Button variant="outline" size="sm" asChild>
                <Link to="/admin/students/new">
                  <Plus className="h-3.5 w-3.5" />
                  Add student
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
        title="Deactivate student?"
        description="The account is deactivated rather than deleted, so historical attendance records stay intact. The student can be reactivated at any time."
        confirmLabel="Deactivate"
        destructive
        isLoading={deactivateMutation.isPending}
        onConfirm={() => {
          if (pendingDeactivate) deactivateMutation.mutate(pendingDeactivate);
        }}
      />

      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Import students</DialogTitle>
            <DialogDescription>
              Upload a CSV with the columns name, email, rollNumber, departmentCode,
              semesterNumber, section and admissionYear. Rows without an account are created with a
              generated password.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            {importError && (
              <div
                role="alert"
                className="rounded-md border border-destructive/25 bg-destructive-soft px-3 py-2 text-sm text-destructive"
              >
                {importError}
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="import-file">CSV file</Label>
              <Input
                id="import-file"
                type="file"
                accept=".csv,text/csv"
                ref={fileInputRef}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) handleCsvFile(file);
                }}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="import-rows">Rows to import (JSON)</Label>
              <textarea
                id="import-rows"
                value={importRows}
                onChange={(event) => setImportRows(event.target.value)}
                rows={10}
                placeholder='[{"name":"Aarav Sharma","email":"aarav@students.attendease.edu","rollNumber":"CSE025001","departmentCode":"CSE","semesterNumber":1,"section":"A","admissionYear":2025}]'
                className="w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-xs shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <p className="text-xs text-muted-foreground">
                Uploading a CSV file fills this field with the parsed rows.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setImportOpen(false)}>
              Cancel
            </Button>
            <Button isLoading={importMutation.isPending} onClick={handleImport}>
              Import students
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
