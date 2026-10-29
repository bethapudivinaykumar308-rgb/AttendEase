import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
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
import { Checkbox } from '@/components/ui/checkbox';
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
import type { Enrollment, Section, Student } from '@/types';

export default function AdminEnrollmentsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const options = useAcademicOptions();

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [subjectId, setSubjectId] = useState('');
  const [sectionId, setSectionId] = useState('');
  const [academicYearId, setAcademicYearId] = useState('');
  const [studentSearch, setStudentSearch] = useState('');
  const [selectedStudentIds, setSelectedStudentIds] = useState<number[]>([]);
  const [pendingDelete, setPendingDelete] = useState<Enrollment | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, pageSize]);

  const listQuery = useQuery({
    queryKey: ['admin', 'enrollments', page, pageSize, debouncedSearch],
    queryFn: () =>
      fetchPaginated<Enrollment>('/api/enrollments', {
        page,
        pageSize,
        search: debouncedSearch || undefined,
      }),
  });

  const studentsQuery = useQuery({
    queryKey: ['admin', 'students', 'picker'],
    queryFn: () =>
      fetchPaginated<Student>('/api/students', { page: 1, pageSize: 100, isActive: 'true' }),
  });

  const sectionsQuery = useQuery({
    queryKey: ['admin', 'sections', 'all'],
    queryFn: () => fetchPaginated<Section>('/api/sections', { page: 1, pageSize: 100 }),
  });

  const sectionOptions = useMemo(() => {
    const sections = sectionsQuery.data?.data ?? [];
    return sections
      .filter((section) => !subjectId || section.subjectId === Number(subjectId))
      .map((section) => ({
        value: section.id,
        label: `Section ${section.section} · ${section.subject?.subjectCode ?? 'Subject'}`,
      }));
  }, [sectionsQuery.data, subjectId]);

  const visibleStudents = useMemo(() => {
    const students = studentsQuery.data?.data ?? [];
    const term = studentSearch.trim().toLowerCase();
    if (!term) return students;
    return students.filter(
      (student) =>
        student.rollNumber.toLowerCase().includes(term) ||
        student.user.name.toLowerCase().includes(term),
    );
  }, [studentsQuery.data, studentSearch]);

  const createMutation = useMutation({
    mutationFn: async () => {
      await api.post('/api/enrollments', {
        studentIds: selectedStudentIds,
        subjectId: Number(subjectId),
        academicYearId: Number(academicYearId),
        sectionId: sectionId ? Number(sectionId) : undefined,
      });
    },
    onSuccess: () => {
      toast.success(
        'Enrollments created',
        `${selectedStudentIds.length} student(s) enrolled in the subject.`,
      );
      setDialogOpen(false);
      setSelectedStudentIds([]);
      void queryClient.invalidateQueries({ queryKey: ['admin', 'enrollments'] });
    },
    onError: (error: unknown) => {
      const message =
        error instanceof ApiError ? error.message : 'Unable to reach the server.';
      setFormError(message);
      toast.error('Could not create enrollments', message);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (enrollment: Enrollment) => {
      await api.delete(`/api/enrollments/${enrollment.id}`);
      return enrollment;
    },
    onSuccess: () => {
      toast.success('Enrollment removed', 'The student is no longer enrolled in this subject.');
      setPendingDelete(null);
      void queryClient.invalidateQueries({ queryKey: ['admin', 'enrollments'] });
    },
    onError: (error: unknown) =>
      toast.error(
        'Could not remove enrollment',
        error instanceof ApiError ? error.message : 'Unable to reach the server.',
      ),
  });

  const rows = listQuery.data?.data ?? [];
  const meta = listQuery.data?.meta ?? { page, pageSize, total: 0, totalPages: 1 };

  const columns: DataTableColumn<Enrollment>[] = [
    {
      key: 'student',
      header: 'Student',
      render: (row) => (
        <span>
          <span className="font-medium text-foreground">{row.student?.rollNumber ?? '—'}</span>
          <span className="ml-2 text-xs text-muted-foreground">
            {row.student?.user?.name ?? ''}
          </span>
        </span>
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
    {
      key: 'section',
      header: 'Section',
      render: (row) => row.section?.section ?? row.student?.section ?? '—',
    },
    {
      key: 'academicYear',
      header: 'Academic year',
      render: (row) => row.academicYear?.yearName ?? '—',
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (row) => (
        <Button
          variant="ghost"
          size="icon-sm"
          className="text-destructive hover:bg-destructive-soft"
          aria-label="Remove enrollment"
          onClick={() => setPendingDelete(row)}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      ),
    },
  ];

  function openCreate() {
    setSubjectId('');
    setSectionId('');
    setAcademicYearId(String(options.data?.academicYears[0]?.id ?? ''));
    setSelectedStudentIds([]);
    setStudentSearch('');
    setFormError(null);
    setDialogOpen(true);
  }

  function handleCreate() {
    if (!subjectId || !academicYearId) {
      setFormError('Select a subject and an academic year.');
      return;
    }
    if (selectedStudentIds.length === 0) {
      setFormError('Select at least one student to enrol.');
      return;
    }
    setFormError(null);
    createMutation.mutate();
  }

  function toggleStudent(studentId: number) {
    setSelectedStudentIds((current) =>
      current.includes(studentId)
        ? current.filter((id) => id !== studentId)
        : [...current, studentId],
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Enrollments"
        description="Enrol students into the subjects they attend. Only enrolled students can be marked."
        breadcrumbs={[{ label: 'Admin', to: '/admin' }, { label: 'Enrollments' }]}
        actions={
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" />
            Add enrollment
          </Button>
        }
      />

      <FilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search by student or subject…"
      />

      {listQuery.isError ? (
        <ErrorState
          title="Could not load enrollments"
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
            emptyTitle="No enrollments found"
            emptyDescription="Enrol students into a subject so their attendance can be marked."
            emptyAction={
              <Button variant="outline" size="sm" onClick={openCreate}>
                <Plus className="h-3.5 w-3.5" />
                Add enrollment
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

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Add enrollments</DialogTitle>
            <DialogDescription>
              Pick the subject, then select every student who attends it.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {formError && (
              <div
                role="alert"
                className="rounded-md border border-destructive/25 bg-destructive-soft px-3 py-2 text-sm text-destructive"
              >
                {formError}
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="enrollment-subject">Subject</Label>
                <Select
                  value={subjectId}
                  onValueChange={(value) => {
                    setSubjectId(value);
                    setSectionId('');
                  }}
                >
                  <SelectTrigger id="enrollment-subject">
                    <SelectValue placeholder="Select a subject" />
                  </SelectTrigger>
                  <SelectContent>
                    {(options.data?.subjects ?? []).map((subject) => (
                      <SelectItem key={subject.id} value={String(subject.id)}>
                        {subject.subjectCode} · {subject.subjectName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="enrollment-section">Section</Label>
                <Select value={sectionId} onValueChange={setSectionId} disabled={!subjectId}>
                  <SelectTrigger id="enrollment-section">
                    <SelectValue placeholder="Optional" />
                  </SelectTrigger>
                  <SelectContent>
                    {sectionOptions.map((option) => (
                      <SelectItem key={option.value} value={String(option.value)}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="enrollment-year">Academic year</Label>
                <Select value={academicYearId} onValueChange={setAcademicYearId}>
                  <SelectTrigger id="enrollment-year">
                    <SelectValue placeholder="Select an academic year" />
                  </SelectTrigger>
                  <SelectContent>
                    {(options.data?.academicYears ?? []).map((year) => (
                      <SelectItem key={year.id} value={String(year.id)}>
                        {year.yearName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="enrollment-student-search">Students</Label>
              <Input
                id="enrollment-student-search"
                placeholder="Search by name or roll number…"
                value={studentSearch}
                onChange={(event) => setStudentSearch(event.target.value)}
              />
              <div className="mt-2 max-h-64 overflow-y-auto rounded-md border border-border">
                {visibleStudents.length === 0 ? (
                  <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                    No students match that search.
                  </p>
                ) : (
                  visibleStudents.map((student) => (
                    <label
                      key={student.id}
                      className="flex cursor-pointer items-center gap-3 border-b border-border px-3 py-2 last:border-b-0 hover:bg-muted/50"
                    >
                      <Checkbox
                        checked={selectedStudentIds.includes(student.id)}
                        onCheckedChange={() => toggleStudent(student.id)}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-foreground">
                          {student.user.name}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {student.rollNumber} · {student.department?.departmentCode} · Section{' '}
                          {student.section}
                        </span>
                      </span>
                    </label>
                  ))
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {selectedStudentIds.length} student(s) selected.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button isLoading={createMutation.isPending} onClick={handleCreate}>
              Enrol {selectedStudentIds.length || ''} student(s)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
        title="Remove enrollment?"
        description="The student is no longer enrolled in this subject. Attendance that was already marked is kept."
        confirmLabel="Remove"
        destructive
        isLoading={deleteMutation.isPending}
        onConfirm={() => {
          if (pendingDelete) deleteMutation.mutate(pendingDelete);
        }}
      />
    </div>
  );
}
