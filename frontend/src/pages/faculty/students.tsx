import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { GraduationCap, Search } from 'lucide-react';
import { api, fetchPaginated } from '@/lib/api';
import { useAuth } from '@/hooks/use-auth';
import { PageHeader } from '@/components/page-header';
import { DataTable } from '@/components/data-table';
import type { DataTableColumn } from '@/components/data-table';
import { EmptyState, ErrorState } from '@/components/states';
import { FilterBar } from '@/components/filters-bar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { Assignment, RosterStudent } from '@/types';

interface TeachingStudent {
  studentId: number;
  rollNumber: string;
  name: string;
  email: string;
  section: string;
  isActive: boolean;
  subjects: string[];
}

export default function FacultyStudentsPage() {
  const { user } = useAuth();
  const facultyId = user?.faculty?.id;

  const [search, setSearch] = useState('');
  const [subjectFilter, setSubjectFilter] = useState<string>('all');

  const assignmentsQuery = useQuery({
    queryKey: ['faculty', 'assignments', 'all', facultyId],
    queryFn: () =>
      fetchPaginated<Assignment>('/api/assignments', {
        facultyId,
        page: 1,
        pageSize: 100,
      }),
    enabled: facultyId !== undefined,
  });

  const assignments = assignmentsQuery.data?.data ?? [];
  const assignmentKey = assignments.map((a) => `${a.subjectId}:${a.sectionId}`).join(',');

  const rosterQuery = useQuery({
    queryKey: ['faculty', 'student-rosters', assignmentKey],
    enabled: assignments.length > 0,
    queryFn: async () => {
      const entries = await Promise.all(
        assignments.map(async (assignment) => {
          const roster = await api.get<RosterStudent[]>(
            `/api/enrollments/subject/${assignment.subjectId}`,
            { sectionId: assignment.sectionId },
          );
          return [assignment, roster] as const;
        }),
      );

      const merged = new Map<number, TeachingStudent>();
      for (const [assignment, roster] of entries) {
        const subjectLabel = assignment.subject
          ? `${assignment.subject.subjectCode} (${assignment.section?.section ?? '—'})`
          : '—';
        for (const student of roster) {
          const existing = merged.get(student.studentId);
          if (existing) {
            if (!existing.subjects.includes(subjectLabel)) {
              existing.subjects.push(subjectLabel);
            }
            continue;
          }
          merged.set(student.studentId, {
            studentId: student.studentId,
            rollNumber: student.rollNumber,
            name: student.name,
            email: student.email,
            section: student.section,
            isActive: student.isActive,
            subjects: [subjectLabel],
          });
        }
      }
      return [...merged.values()].sort((a, b) =>
        a.rollNumber.localeCompare(b.rollNumber, undefined, { numeric: true }),
      );
    },
  });

  const subjectOptions = useMemo(() => {
    const map = new Map<number, { label: string; code: string }>();
    for (const assignment of assignments) {
      if (!assignment.subject) continue;
      map.set(assignment.subjectId, {
        code: assignment.subject.subjectCode,
        label: `${assignment.subject.subjectCode} · ${assignment.subject.subjectName}`,
      });
    }
    return [...map.entries()];
  }, [assignments]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (rosterQuery.data ?? []).filter((student) => {
      if (subjectFilter !== 'all') {
        const subjectId = Number(subjectFilter);
        const assignment = assignments.find((a) => a.subjectId === subjectId);
        if (!assignment) return false;
        const label = `${assignment.subject?.subjectCode ?? ''} (${assignment.section?.section ?? ''})`;
        if (!student.subjects.includes(label)) return false;
      }
      if (!term) return true;
      return (
        student.name.toLowerCase().includes(term) ||
        student.rollNumber.toLowerCase().includes(term)
      );
    });
  }, [rosterQuery.data, search, subjectFilter, assignments]);

  const columns: DataTableColumn<TeachingStudent>[] = [
    {
      key: 'rollNumber',
      header: 'Roll number',
      render: (row) => (
        <span className="font-medium text-foreground">{row.rollNumber}</span>
      ),
    },
    {
      key: 'name',
      header: 'Name',
      render: (row) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-foreground">{row.name}</p>
          <p className="truncate text-xs text-muted-foreground">{row.email}</p>
        </div>
      ),
    },
    {
      key: 'section',
      header: 'Section',
      render: (row) => row.section,
    },
    {
      key: 'subjects',
      header: 'Subjects',
      render: (row) => (
        <div className="flex flex-wrap gap-1.5">
          {row.subjects.map((subject) => (
            <Badge key={subject} variant="secondary">
              {subject}
            </Badge>
          ))}
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) =>
        row.isActive ? (
          <Badge variant="success">Active</Badge>
        ) : (
          <Badge variant="outline" className="text-muted-foreground">
            Inactive
          </Badge>
        ),
    },
  ];

  const hasAssignments = assignments.length > 0;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Student list"
        description="Students enrolled in the subjects and sections you are assigned to teach."
        breadcrumbs={[{ label: 'Faculty', to: '/faculty' }, { label: 'Student list' }]}
      />

      {assignmentsQuery.isError ? (
        <ErrorState
          title="Could not load your students"
          message={
            assignmentsQuery.error instanceof Error
              ? assignmentsQuery.error.message
              : 'Something went wrong while contacting the server.'
          }
          onRetry={() => void assignmentsQuery.refetch()}
        />
      ) : !hasAssignments && !assignmentsQuery.isLoading ? (
        <EmptyState
          title="No subjects assigned yet"
          description="You are not assigned to any subject or section, so there are no students to list. Once an administrator assigns you to a subject and section, the enrolled students appear here."
          icon={<GraduationCap className="h-5 w-5" />}
        />
      ) : (
        <>
          <FilterBar
            search={search}
            onSearchChange={setSearch}
            searchPlaceholder="Search by name or roll number…"
          >
            <div className="w-full sm:w-72">
              <Select value={subjectFilter} onValueChange={setSubjectFilter}>
                <SelectTrigger aria-label="Filter by subject">
                  <SelectValue placeholder="All subjects" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All subjects</SelectItem>
                  {subjectOptions.map(([id, subject]) => (
                    <SelectItem key={id} value={String(id)}>
                      {subject.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {(search || subjectFilter !== 'all') && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSearch('');
                  setSubjectFilter('all');
                }}
              >
                <Search className="h-3.5 w-3.5" />
                Clear filters
              </Button>
            )}
          </FilterBar>

          <DataTable
            columns={columns}
            rows={filtered}
            rowKey={(row) => row.studentId}
            isLoading={assignmentsQuery.isLoading || rosterQuery.isLoading}
            emptyTitle="No students found"
            emptyDescription={
              search || subjectFilter !== 'all'
                ? 'No student matches the current search or subject filter.'
                : 'Nobody is enrolled in your classes yet.'
            }
          />

          <p className="text-sm text-muted-foreground">
            Showing {filtered.length} of {rosterQuery.data?.length ?? 0} students
          </p>
        </>
      )}
    </div>
  );
}
