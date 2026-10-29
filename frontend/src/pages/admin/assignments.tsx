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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { Assignment, Faculty, Section } from '@/types';

export default function AdminAssignmentsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const options = useAcademicOptions();

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [facultyId, setFacultyId] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [sectionId, setSectionId] = useState('');
  const [academicYearId, setAcademicYearId] = useState('');
  const [pendingDelete, setPendingDelete] = useState<Assignment | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, pageSize]);

  const listQuery = useQuery({
    queryKey: ['admin', 'assignments', page, pageSize, debouncedSearch],
    queryFn: () =>
      fetchPaginated<Assignment>('/api/assignments', {
        page,
        pageSize,
        search: debouncedSearch || undefined,
      }),
  });

  const facultyQuery = useQuery({
    queryKey: ['admin', 'faculty', 'all'],
    queryFn: () => fetchPaginated<Faculty>('/api/faculty', { page: 1, pageSize: 100 }),
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
        label: `Section ${section.section} · ${
          section.subject?.subjectCode ?? 'Subject'
        }`,
      }));
  }, [sectionsQuery.data, subjectId]);

  const createMutation = useMutation({
    mutationFn: async () => {
      await api.post('/api/assignments', {
        facultyId: Number(facultyId),
        subjectId: Number(subjectId),
        sectionId: Number(sectionId),
        academicYearId: Number(academicYearId),
      });
    },
    onSuccess: () => {
      toast.success('Assignment created', 'The faculty member can now mark attendance.');
      setDialogOpen(false);
      setFacultyId('');
      setSubjectId('');
      setSectionId('');
      setAcademicYearId('');
      void queryClient.invalidateQueries({ queryKey: ['admin', 'assignments'] });
    },
    onError: (error: unknown) => {
      const message =
        error instanceof ApiError ? error.message : 'Unable to reach the server.';
      setFormError(message);
      toast.error('Could not create assignment', message);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (assignment: Assignment) => {
      await api.delete(`/api/assignments/${assignment.id}`);
      return assignment;
    },
    onSuccess: () => {
      toast.success('Assignment removed', 'The teaching assignment has been removed.');
      setPendingDelete(null);
      void queryClient.invalidateQueries({ queryKey: ['admin', 'assignments'] });
    },
    onError: (error: unknown) =>
      toast.error(
        'Could not remove assignment',
        error instanceof ApiError ? error.message : 'Unable to reach the server.',
      ),
  });

  const rows = listQuery.data?.data ?? [];
  const meta = listQuery.data?.meta ?? { page, pageSize, total: 0, totalPages: 1 };

  const columns: DataTableColumn<Assignment>[] = [
    {
      key: 'faculty',
      header: 'Faculty',
      render: (row) => (
        <span>
          <span className="font-medium text-foreground">{row.faculty?.facultyId ?? '—'}</span>
          <span className="ml-2 text-xs text-muted-foreground">
            {row.faculty?.user?.name ?? ''}
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
      render: (row) => row.section?.section ?? '—',
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
          aria-label="Remove assignment"
          onClick={() => setPendingDelete(row)}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      ),
    },
  ];

  function openCreate() {
    setFacultyId('');
    setSubjectId('');
    setSectionId('');
    setAcademicYearId(String(options.data?.academicYears[0]?.id ?? ''));
    setFormError(null);
    setDialogOpen(true);
  }

  function handleCreate() {
    if (!facultyId || !subjectId || !sectionId || !academicYearId) {
      setFormError('Select a faculty member, subject, section and academic year.');
      return;
    }
    setFormError(null);
    createMutation.mutate();
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Teaching assignments"
        description="Connect faculty members to the subjects and sections they teach."
        breadcrumbs={[{ label: 'Admin', to: '/admin' }, { label: 'Assignments' }]}
        actions={
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" />
            Add assignment
          </Button>
        }
      />

      <FilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search by faculty or subject…"
      />

      {listQuery.isError ? (
        <ErrorState
          title="Could not load assignments"
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
            emptyTitle="No assignments found"
            emptyDescription="Assign a faculty member to a subject and section to get started."
            emptyAction={
              <Button variant="outline" size="sm" onClick={openCreate}>
                <Plus className="h-3.5 w-3.5" />
                Add assignment
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
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add teaching assignment</DialogTitle>
            <DialogDescription>
              The faculty member gains access to mark attendance for this subject and section.
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

            <div className="space-y-1.5">
              <Label htmlFor="assignment-faculty">Faculty member</Label>
              <Select value={facultyId} onValueChange={setFacultyId}>
                <SelectTrigger id="assignment-faculty">
                  <SelectValue placeholder="Select a faculty member" />
                </SelectTrigger>
                <SelectContent>
                  {(facultyQuery.data?.data ?? []).map((faculty) => (
                    <SelectItem key={faculty.id} value={String(faculty.id)}>
                      {faculty.facultyId} · {faculty.user.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="assignment-subject">Subject</Label>
              <Select
                value={subjectId}
                onValueChange={(value) => {
                  setSubjectId(value);
                  setSectionId('');
                }}
              >
                <SelectTrigger id="assignment-subject">
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
              <Label htmlFor="assignment-section">Section</Label>
              <Select value={sectionId} onValueChange={setSectionId} disabled={!subjectId}>
                <SelectTrigger id="assignment-section">
                  <SelectValue placeholder="Select a section" />
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

            <div className="space-y-1.5">
              <Label htmlFor="assignment-year">Academic year</Label>
              <Select value={academicYearId} onValueChange={setAcademicYearId}>
                <SelectTrigger id="assignment-year">
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

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button isLoading={createMutation.isPending} onClick={handleCreate}>
              Create assignment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
        title="Remove assignment?"
        description="The faculty member loses access to mark attendance for this subject and section. Sessions that were already marked are kept."
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
