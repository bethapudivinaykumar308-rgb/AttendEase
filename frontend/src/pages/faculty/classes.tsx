import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { ClipboardCheck, Plus, Users } from 'lucide-react';
import { api, fetchPaginated } from '@/lib/api';
import { useAuth } from '@/hooks/use-auth';
import { PageHeader } from '@/components/page-header';
import { DataTable } from '@/components/data-table';
import type { DataTableColumn } from '@/components/data-table';
import { EmptyState, ErrorState } from '@/components/states';
import { PercentageDisplay } from '@/components/attendance-display';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { Assignment, FacultyDashboardData, RosterStudent } from '@/types';

interface ClassCard {
  assignment: Assignment;
  enrolledCount: number;
  sessionsHeld: number;
  percentage: number;
}

export default function FacultyClassesPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const facultyId = user?.faculty?.id;
  const [rosterTarget, setRosterTarget] = useState<Assignment | null>(null);

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

  const dashboardQuery = useQuery({
    queryKey: ['dashboard', 'faculty'],
    queryFn: () => api.get<FacultyDashboardData>('/api/dashboard/faculty'),
  });

  const assignments = assignmentsQuery.data?.data ?? [];
  const assignmentKey = assignments.map((a) => `${a.subjectId}:${a.sectionId}`).join(',');

  const rosterQuery = useQuery({
    queryKey: ['faculty', 'class-rosters', assignmentKey],
    enabled: assignments.length > 0,
    queryFn: async () => {
      const entries = await Promise.all(
        assignments.map(async (assignment) => {
          const roster = await api.get<RosterStudent[]>(
            `/api/enrollments/subject/${assignment.subjectId}`,
            { sectionId: assignment.sectionId },
          );
          return [assignment.id, roster] as const;
        }),
      );
      return new Map(entries);
    },
  });

  const rosterMap = rosterQuery.data;

  const classCards: ClassCard[] = useMemo(() => {
    const statisticsByAssignment = new Map(
      (dashboardQuery.data?.assignmentStatistics ?? []).map((stat) => [stat.assignmentId, stat]),
    );
    const sessionsByAssignment = new Map(
      (dashboardQuery.data?.assignments ?? []).map((assignment) => [
        assignment.id,
        assignment.sessionCount ?? assignment._count?.sessions ?? 0,
      ]),
    );

    return assignments.map((assignment) => ({
      assignment,
      enrolledCount: rosterMap?.get(assignment.id)?.length ?? 0,
      sessionsHeld: sessionsByAssignment.get(assignment.id) ?? 0,
      percentage: statisticsByAssignment.get(assignment.id)?.percentage ?? 0,
    }));
  }, [assignments, dashboardQuery.data, rosterMap]);

  const rosterQueryTarget = useQuery({
    queryKey: ['faculty', 'class-roster', rosterTarget?.id],
    enabled: Boolean(rosterTarget),
    queryFn: () =>
      api.get<RosterStudent[]>(`/api/enrollments/subject/${rosterTarget!.subjectId}`, {
        sectionId: rosterTarget!.sectionId,
      }),
  });

  const columns: DataTableColumn<ClassCard>[] = [
    {
      key: 'subject',
      header: 'Subject',
      render: (row) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-foreground">
            {row.assignment.subject?.subjectName ?? '—'}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {row.assignment.subject?.subjectCode ?? '—'}
          </p>
        </div>
      ),
    },
    {
      key: 'section',
      header: 'Section',
      render: (row) => row.assignment.section?.section ?? '—',
    },
    {
      key: 'academicYear',
      header: 'Academic year',
      render: (row) => row.assignment.academicYear?.yearName ?? '—',
    },
    {
      key: 'enrolled',
      header: 'Students',
      align: 'right',
      render: (row) => row.enrolledCount,
    },
    {
      key: 'sessions',
      header: 'Sessions held',
      align: 'right',
      render: (row) => row.sessionsHeld,
    },
    {
      key: 'percentage',
      header: 'Attendance',
      align: 'right',
      render: (row) => <PercentageDisplay value={row.percentage} showBar={false} />,
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
              setRosterTarget(row.assignment);
            }}
          >
            <Users className="h-3.5 w-3.5" />
            View students
          </Button>
          <Button
            size="sm"
            onClick={(event) => {
              event.stopPropagation();
              navigate(
                `/faculty/attendance?subjectId=${row.assignment.subjectId}&sectionId=${row.assignment.sectionId}`,
              );
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
        title="My classes"
        description="Each class you take, with the number of enrolled students and the attendance recorded so far."
        breadcrumbs={[{ label: 'Faculty', to: '/faculty' }, { label: 'My classes' }]}
        actions={
          <Button onClick={() => navigate('/faculty/attendance')}>
            <Plus className="h-4 w-4" />
            Create attendance session
          </Button>
        }
      />

      {assignmentsQuery.isError ? (
        <ErrorState
          title="Could not load your classes"
          message={
            assignmentsQuery.error instanceof Error
              ? assignmentsQuery.error.message
              : 'Something went wrong while contacting the server.'
          }
          onRetry={() => void assignmentsQuery.refetch()}
        />
      ) : assignmentsQuery.isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <Card key={index} className="animate-pulse">
              <CardContent className="space-y-3 p-5">
                <div className="h-4 w-2/3 rounded bg-muted" />
                <div className="h-3 w-1/3 rounded bg-muted" />
                <div className="h-8 w-full rounded bg-muted" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : classCards.length === 0 ? (
        <EmptyState
          title="No classes assigned"
          description="You are not assigned to any subject or section yet. Ask an administrator to create a faculty-subject assignment for you."
          icon={<Users className="h-5 w-5" />}
          action={
            <Button size="sm" onClick={() => navigate('/faculty/subjects')}>
              Go to my subjects
            </Button>
          }
        />
      ) : (
        <Tabs defaultValue="cards">
          <TabsList>
            <TabsTrigger value="cards">Cards</TabsTrigger>
            <TabsTrigger value="table">Table</TabsTrigger>
          </TabsList>

          <TabsContent value="cards">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {classCards.map((card) => (
                <Card key={card.assignment.id} className="flex flex-col">
                  <CardContent className="flex flex-1 flex-col gap-4 p-5">
                    <div className="min-w-0">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-foreground">
                            {card.assignment.subject?.subjectName ?? '—'}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {card.assignment.subject?.subjectCode ?? '—'}
                          </p>
                        </div>
                        <Badge variant="outline">
                          Section {card.assignment.section?.section ?? '—'}
                        </Badge>
                      </div>
                      <p className="mt-2 text-xs text-muted-foreground">
                        {card.assignment.academicYear?.yearName ?? '—'} ·{' '}
                        {card.assignment.subject?.credits ?? '—'} credits
                      </p>
                    </div>

                    <dl className="grid grid-cols-3 gap-3 rounded-lg border border-border bg-muted/40 p-3">
                      <div>
                        <dt className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                          Students
                        </dt>
                        <dd className="mt-0.5 text-lg font-semibold text-foreground">
                          {card.enrolledCount}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                          Sessions
                        </dt>
                        <dd className="mt-0.5 text-lg font-semibold text-foreground">
                          {card.sessionsHeld}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                          Attendance
                        </dt>
                        <dd className="mt-1">
                          <PercentageDisplay value={card.percentage} />
                        </dd>
                      </div>
                    </dl>

                    <div className="mt-auto flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1"
                        onClick={() => setRosterTarget(card.assignment)}
                      >
                        <Users className="h-3.5 w-3.5" />
                        View students
                      </Button>
                      <Button
                        size="sm"
                        className="flex-1"
                        onClick={() =>
                          navigate(
                            `/faculty/attendance?subjectId=${card.assignment.subjectId}&sectionId=${card.assignment.sectionId}`,
                          )
                        }
                      >
                        <ClipboardCheck className="h-3.5 w-3.5" />
                        Mark attendance
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="table">
            <DataTable
              columns={columns}
              rows={classCards}
              rowKey={(row) => row.assignment.id}
            />
          </TabsContent>
        </Tabs>
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
                ? `Enrolled students for section ${rosterTarget.section?.section ?? '—'}`
                : ''}
            </DialogDescription>
          </DialogHeader>

          {rosterQueryTarget.isLoading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Loading students…</p>
          ) : (rosterQueryTarget.data ?? []).length === 0 ? (
            <EmptyState
              title="No students enrolled"
              description="Nobody is enrolled in this class yet."
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
                  {(rosterQueryTarget.data ?? []).map((student) => (
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
