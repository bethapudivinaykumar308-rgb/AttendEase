import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  AlertCircle,
  CalendarX2,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  Eraser,
  Eye,
  UserCheck,
  UserX,
} from 'lucide-react';
import { api, ApiError, fetchPaginated } from '@/lib/api';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { cn, formatDate, formatDateTime, todayString } from '@/lib/utils';
import { PageHeader } from '@/components/page-header';
import { DataTable } from '@/components/data-table';
import type { DataTableColumn } from '@/components/data-table';
import { FilterBar } from '@/components/filters-bar';
import { EmptyState, ErrorState } from '@/components/states';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { AttendanceBadge } from '@/components/attendance-display';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Alert } from '@/components/ui/alert';
import type { AttendanceSession, AttendanceStatus, RosterStudent, StatusSummary } from '@/types';

interface SessionRow extends AttendanceSession {
  summary: StatusSummary;
}

interface SessionDetail extends AttendanceSession {
  roster: RosterStudent[];
  summary: StatusSummary;
}

interface MarkState {
  status: AttendanceStatus | null;
  remarks: string;
}

const STATUS_ACTIONS: Array<{
  status: AttendanceStatus;
  label: string;
  active: string;
  inactive: string;
}> = [
  {
    status: 'PRESENT',
    label: 'Present',
    active: 'border-success/30 bg-success-soft text-success hover:bg-success-soft',
    inactive: 'border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground',
  },
  {
    status: 'ABSENT',
    label: 'Absent',
    active: 'border-destructive/30 bg-destructive-soft text-destructive hover:bg-destructive-soft',
    inactive: 'border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground',
  },
  {
    status: 'LATE',
    label: 'Late',
    active: 'border-warning/30 bg-warning-soft text-warning hover:bg-warning-soft',
    inactive: 'border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground',
  },
  {
    status: 'ON_LEAVE',
    label: 'On Leave',
    active: 'border-info/30 bg-info-soft text-info hover:bg-info-soft',
    inactive: 'border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground',
  },
];

export default function FacultyMarkAttendancePage() {
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const facultyId = user?.faculty?.id;
  const today = todayString();

  const urlSubjectId = searchParams.get('subjectId');
  const urlSectionId = searchParams.get('sectionId');

  const [subjectId, setSubjectId] = useState(urlSubjectId ?? '');
  const [sectionId, setSectionId] = useState(urlSectionId ?? '');
  const [attendanceDate, setAttendanceDate] = useState(today);
  const [sessionNumber, setSessionNumber] = useState('1');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [topic, setTopic] = useState('');

  const [activeSessionId, setActiveSessionId] = useState<number | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [duplicateSessionId, setDuplicateSessionId] = useState<number | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [confirmCancelOpen, setConfirmCancelOpen] = useState(false);

  const [rosterSearch, setRosterSearch] = useState('');
  const [marks, setMarks] = useState<Record<number, MarkState>>({});
  const autoOpenedRef = useRef(false);

  // ---------------------------------------------------------------- assignments
  const assignmentsQuery = useQuery({
    queryKey: ['faculty', 'assignments', 'all', facultyId],
    queryFn: () =>
      fetchPaginated<import('@/types').Assignment>('/api/assignments', {
        facultyId,
        page: 1,
        pageSize: 100,
      }),
    enabled: facultyId !== undefined,
  });

  const assignments = assignmentsQuery.data?.data ?? [];

  const subjectOptions = useMemo(() => {
    const map = new Map<number, { code: string; name: string }>();
    for (const assignment of assignments) {
      if (!assignment.subject) continue;
      map.set(assignment.subject.id, {
        code: assignment.subject.subjectCode,
        name: assignment.subject.subjectName,
      });
    }
    return [...map.entries()];
  }, [assignments]);

  const sectionOptions = useMemo(
    () =>
      assignments
        .filter((assignment) => String(assignment.subjectId) === subjectId)
        .map((assignment) => ({
          id: assignment.sectionId,
          label: `${assignment.section?.section ?? '—'} · ${
            assignment.academicYear?.yearName ?? ''
          }`,
        })),
    [assignments, subjectId],
  );

  // Keep the URL in sync so the screen stays deep-linkable.
  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    if (subjectId) next.set('subjectId', subjectId);
    else next.delete('subjectId');
    if (sectionId) next.set('sectionId', sectionId);
    else next.delete('sectionId');
    if (next.toString() !== searchParams.toString()) {
      setSearchParams(next, { replace: true });
    }
  }, [subjectId, sectionId, searchParams, setSearchParams]);

  // ------------------------------------------------------------- slot sessions
  const slotSessionsQuery = useQuery({
    queryKey: ['faculty', 'slot-sessions', subjectId, sectionId, attendanceDate],
    queryFn: () =>
      fetchPaginated<SessionRow>('/api/attendance/sessions', {
        subjectId: subjectId ? Number(subjectId) : undefined,
        sectionId: sectionId ? Number(sectionId) : undefined,
        date: attendanceDate || undefined,
        page: 1,
        pageSize: 50,
      }),
    enabled: Boolean(subjectId && sectionId && attendanceDate),
  });

  const slotSessions = slotSessionsQuery.data?.data ?? [];

  // Deep link: open today's session for the requested subject/section.
  useEffect(() => {
    if (autoOpenedRef.current) return;
    if (!subjectId || !sectionId) return;
    if (slotSessionsQuery.isLoading) return;
    const match = slotSessions.find(
      (session) =>
        String(session.subjectId) === subjectId &&
        String(session.sectionId) === sectionId &&
        !session.isCancelled,
    );
    if (match) {
      autoOpenedRef.current = true;
      setActiveSessionId(match.id);
    }
  }, [slotSessions, slotSessionsQuery.isLoading, subjectId, sectionId]);

  // ------------------------------------------------------------- session detail
  const sessionQuery = useQuery({
    queryKey: ['faculty', 'session', activeSessionId],
    queryFn: () => api.get<SessionDetail>(`/api/attendance/sessions/${activeSessionId}`),
    enabled: activeSessionId !== null,
  });

  const session = sessionQuery.data;
  const roster = session?.roster ?? [];

  // Seed the local marks from the saved server state.
  useEffect(() => {
    if (!session) return;
    const next: Record<number, MarkState> = {};
    for (const student of roster) {
      next[student.studentId] = {
        status: student.attendanceStatus ?? null,
        remarks: student.remarks ?? '',
      };
    }
    setMarks(next);
  }, [session, roster]);

  const visibleRoster = useMemo(() => {
    const term = rosterSearch.trim().toLowerCase();
    if (!term) return roster;
    return roster.filter(
      (student) =>
        student.name.toLowerCase().includes(term) ||
        student.rollNumber.toLowerCase().includes(term),
    );
  }, [roster, rosterSearch]);

  const summary = useMemo(() => {
    const counts = { present: 0, absent: 0, late: 0, onLeave: 0, unmarked: 0 };
    for (const student of roster) {
      const mark = marks[student.studentId];
      if (!mark || !mark.status) {
        counts.unmarked += 1;
        continue;
      }
      if (mark.status === 'PRESENT') counts.present += 1;
      else if (mark.status === 'ABSENT') counts.absent += 1;
      else if (mark.status === 'LATE') counts.late += 1;
      else counts.onLeave += 1;
    }
    return counts;
  }, [roster, marks]);

  const setStatus = useCallback((studentId: number, status: AttendanceStatus) => {
    setMarks((current) => ({
      ...current,
      [studentId]: {
        status: current[studentId]?.status === status ? null : status,
        remarks: current[studentId]?.remarks ?? '',
      },
    }));
  }, []);

  const setRemarks = useCallback((studentId: number, remarks: string) => {
    setMarks((current) => ({
      ...current,
      [studentId]: {
        status: current[studentId]?.status ?? null,
        remarks,
      },
    }));
  }, []);

  const bulkSet = useCallback(
    (status: AttendanceStatus) => {
      setMarks((current) => {
        const next = { ...current };
        for (const student of roster) {
          next[student.studentId] = {
            status,
            remarks: next[student.studentId]?.remarks ?? '',
          };
        }
        return next;
      });
    },
    [roster],
  );

  const resetMarks = useCallback(() => {
    setMarks((current) => {
      const next: Record<number, MarkState> = {};
      for (const student of roster) {
        next[student.studentId] = { status: null, remarks: '' };
      }
      return next;
    });
  }, [roster]);

  // ------------------------------------------------------------------- actions
  const findExistingSession = useCallback(async (): Promise<number | null> => {
    try {
      const response = await fetchPaginated<SessionRow>('/api/attendance/sessions', {
        subjectId: Number(subjectId),
        sectionId: Number(sectionId),
        date: attendanceDate,
        page: 1,
        pageSize: 50,
      });
      const match = response.data.find(
        (item) => item.sessionNumber === Number(sessionNumber),
      );
      return match?.id ?? null;
    } catch {
      return null;
    }
  }, [subjectId, sectionId, attendanceDate, sessionNumber]);

  const handleCreate = async () => {
    setCreateError(null);
    setDuplicateSessionId(null);

    if (!subjectId || !sectionId) {
      setCreateError('Choose both a subject and a section before creating the session.');
      return;
    }
    const parsedNumber = Number(sessionNumber);
    if (!Number.isInteger(parsedNumber) || parsedNumber < 1 || parsedNumber > 20) {
      setCreateError('Session number must be a whole number between 1 and 20.');
      return;
    }

    setIsCreating(true);
    try {
      const created = await api.post<AttendanceSession>('/api/attendance/sessions', {
        subjectId: Number(subjectId),
        sectionId: Number(sectionId),
        attendanceDate,
        sessionNumber: parsedNumber,
        ...(startTime ? { startTime } : {}),
        ...(endTime ? { endTime } : {}),
        ...(topic.trim() ? { topic: topic.trim() } : {}),
      });
      toast.success('Session created', 'Start marking attendance for your class.');
      setActiveSessionId(created.id);
      setTopic('');
      setStartTime('');
      setEndTime('');
      autoOpenedRef.current = true;
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        const existingId = await findExistingSession();
        setDuplicateSessionId(existingId);
        setCreateError(
          error.message ||
            'A session already exists for this subject, section, date and session number.',
        );
      } else {
        setCreateError(
          error instanceof ApiError
            ? error.message
            : 'Could not reach the server. Please try again.',
        );
      }
    } finally {
      setIsCreating(false);
    }
  };

  const handleSubmit = async () => {
    if (activeSessionId === null) return;
    const records = roster
      .filter((student) => marks[student.studentId]?.status)
      .map((student) => {
        const mark = marks[student.studentId];
        return {
          studentId: student.studentId,
          attendanceStatus: mark.status as AttendanceStatus,
          ...(mark.remarks.trim() ? { remarks: mark.remarks.trim() } : {}),
        };
      });

    if (records.length === 0) {
      toast.error('Nothing to submit', 'Mark at least one student before submitting.');
      return;
    }

    setIsSubmitting(true);
    try {
      await api.post(`/api/attendance/sessions/${activeSessionId}/records`, { records });
      toast.success(
        'Attendance saved',
        `${records.length} student record${records.length === 1 ? '' : 's'} stored.`,
      );
      await sessionQuery.refetch();
      await slotSessionsQuery.refetch();
    } catch (error) {
      toast.error(
        'Could not save attendance',
        error instanceof ApiError ? error.message : 'Please try again.',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = async () => {
    if (activeSessionId === null) return;
    setIsCancelling(true);
    try {
      await api.post(`/api/attendance/sessions/${activeSessionId}/cancel`);
      toast.success(
        'Session cancelled',
        'The session no longer counts towards attendance percentages.',
      );
      setConfirmCancelOpen(false);
      await sessionQuery.refetch();
      await slotSessionsQuery.refetch();
    } catch (error) {
      toast.error(
        'Could not cancel session',
        error instanceof ApiError ? error.message : 'Please try again.',
      );
    } finally {
      setIsCancelling(false);
    }
  };

  const openSession = (id: number) => {
    autoOpenedRef.current = true;
    setActiveSessionId(id);
  };

  // -------------------------------------------------------------------- columns
  const rosterColumns: DataTableColumn<RosterStudent>[] = [
    {
      key: 'rollNumber',
      header: 'Roll number',
      render: (row) => (
        <span className="font-medium text-foreground">{row.rollNumber}</span>
      ),
    },
    {
      key: 'name',
      header: 'Student',
      render: (row) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-foreground">{row.name}</p>
          <p className="truncate text-xs text-muted-foreground">{row.email}</p>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => <AttendanceBadge status={marks[row.studentId]?.status ?? null} />,
    },
    {
      key: 'actions',
      header: 'Mark attendance',
      render: (row) => {
        const current = marks[row.studentId]?.status ?? null;
        return (
          <div className="flex flex-wrap items-center gap-1.5">
            {STATUS_ACTIONS.map((action) => (
              <Button
                key={action.status}
                type="button"
                variant="outline"
                size="sm"
                aria-pressed={current === action.status}
                aria-label={`Mark ${row.name} as ${action.label}`}
                className={cn(
                  current === action.status ? action.active : action.inactive,
                )}
                onClick={() => setStatus(row.studentId, action.status)}
              >
                {action.label}
              </Button>
            ))}
          </div>
        );
      },
    },
    {
      key: 'remarks',
      header: 'Remarks',
      render: (row) => (
        <Input
          className="h-8 min-w-[160px] text-xs"
          placeholder="Optional remark"
          value={marks[row.studentId]?.remarks ?? ''}
          onChange={(event) => setRemarks(row.studentId, event.target.value)}
          aria-label={`Remarks for ${row.name}`}
        />
      ),
    },
    {
      key: 'markedBy',
      header: 'Last marked',
      render: (row) => (
        <span className="whitespace-nowrap text-xs text-muted-foreground">
          {row.markedBy ? `${row.markedBy} · ${formatDateTime(row.markedAt)}` : '—'}
        </span>
      ),
    },
  ];

  const selectedSubject = subjectOptions.find(([id]) => String(id) === subjectId);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Mark attendance"
        description="Create a session for your class, then mark every student present, absent, late or on leave."
        breadcrumbs={[{ label: 'Faculty', to: '/faculty' }, { label: 'Mark attendance' }]}
        actions={
          <Button variant="outline" onClick={() => navigate('/faculty/history')}>
            <Eye className="h-4 w-4" />
            Session history
          </Button>
        }
      />

      {/* ---------------------------------------------------------- Phase A */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Step 1 · Create the session</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {assignmentsQuery.isError ? (
            <ErrorState
              title="Could not load your assignments"
              message={
                assignmentsQuery.error instanceof Error
                  ? assignmentsQuery.error.message
                  : 'Something went wrong while contacting the server.'
              }
              onRetry={() => void assignmentsQuery.refetch()}
            />
          ) : assignments.length === 0 ? (
            <EmptyState
              title="No subjects assigned"
              description="You need a subject and section assignment before you can record attendance."
              action={
                <Button size="sm" onClick={() => navigate('/faculty/subjects')}>
                  Go to my subjects
                </Button>
              }
            />
          ) : (
            <>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                <div className="space-y-1.5">
                  <Label htmlFor="session-subject">Subject</Label>
                  <Select
                    value={subjectId || 'none'}
                    onValueChange={(value) => {
                      if (value === 'none') {
                        setSubjectId('');
                        setSectionId('');
                        return;
                      }
                      setSubjectId(value);
                      const first = assignments.find(
                        (assignment) => String(assignment.subjectId) === value,
                      );
                      setSectionId(first ? String(first.sectionId) : '');
                    }}
                  >
                    <SelectTrigger id="session-subject">
                      <SelectValue placeholder="Select a subject" />
                    </SelectTrigger>
                    <SelectContent>
                      {subjectOptions.map(([id, subject]) => (
                        <SelectItem key={id} value={String(id)}>
                          {subject.code} · {subject.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="session-section">Section</Label>
                  <Select
                    value={sectionId || 'none'}
                    onValueChange={(value) => setSectionId(value === 'none' ? '' : value)}
                    disabled={!subjectId}
                  >
                    <SelectTrigger id="session-section" disabled={!subjectId}>
                      <SelectValue placeholder="Select a section" />
                    </SelectTrigger>
                    <SelectContent>
                      {sectionOptions.map((option) => (
                        <SelectItem key={option.id} value={String(option.id)}>
                          Section {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="session-date">Date</Label>
                  <Input
                    id="session-date"
                    type="date"
                    max={today}
                    value={attendanceDate}
                    onChange={(event) => setAttendanceDate(event.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Future dates are rejected by the server.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="session-number">Session number</Label>
                  <Input
                    id="session-number"
                    type="number"
                    min={1}
                    max={20}
                    value={sessionNumber}
                    onChange={(event) => setSessionNumber(event.target.value)}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="session-start">Start time</Label>
                  <Input
                    id="session-start"
                    type="time"
                    value={startTime}
                    onChange={(event) => setStartTime(event.target.value)}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="session-end">End time</Label>
                  <Input
                    id="session-end"
                    type="time"
                    value={endTime}
                    onChange={(event) => setEndTime(event.target.value)}
                  />
                </div>

                <div className="space-y-1.5 md:col-span-2 xl:col-span-3">
                  <Label htmlFor="session-topic">Topic</Label>
                  <Input
                    id="session-topic"
                    maxLength={200}
                    placeholder="e.g. Unit 2 — Relational algebra"
                    value={topic}
                    onChange={(event) => setTopic(event.target.value)}
                  />
                </div>
              </div>

              {createError && (
                <Alert variant={duplicateSessionId !== null ? 'warning' : 'destructive'}>
                  <p className="font-medium">{createError}</p>
                  {duplicateSessionId !== null && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-2"
                      onClick={() => {
                        openSession(duplicateSessionId);
                        setCreateError(null);
                        setDuplicateSessionId(null);
                      }}
                    >
                      <ClipboardCheck className="h-3.5 w-3.5" />
                      Open the existing session
                    </Button>
                  )}
                </Alert>
              )}

              <div className="flex flex-wrap items-center gap-2">
                <Button onClick={() => void handleCreate()} isLoading={isCreating}>
                  <ClipboardCheck className="h-4 w-4" />
                  Create session
                </Button>
                <span className="text-xs text-muted-foreground">
                  {selectedSubject
                    ? `${selectedSubject[1].code} · ${selectedSubject[1].name}`
                    : 'Select a subject to begin'}
                </span>
              </div>

              {slotSessions.length > 0 && (
                <div className="rounded-lg border border-border bg-muted/40 p-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Sessions already recorded for this date
                  </p>
                  <ul className="mt-2 space-y-1.5">
                    {slotSessions.map((slot) => (
                      <li key={slot.id} className="flex items-center justify-between gap-3">
                        <span className="text-sm text-foreground">
                          Session #{slot.sessionNumber}
                          {slot.topic ? ` · ${slot.topic}` : ''}
                          {slot.isCancelled ? ' · cancelled' : ''}
                        </span>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openSession(slot.id)}
                        >
                          {slot.id === activeSessionId ? 'Open' : 'Open session'}
                        </Button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* ---------------------------------------------------------- Phase B */}
      {activeSessionId !== null && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <CardTitle className="text-sm">Step 2 · Mark the students</CardTitle>
                {session && (
                  <p className="mt-1 text-sm text-muted-foreground">
                    {session.subject.subjectCode} · {session.subject.subjectName} · Section{' '}
                    {session.section} · {formatDate(session.attendanceDate)} · Session #
                    {session.sessionNumber}
                    {session.topic ? ` · ${session.topic}` : ''}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2">
                {session?.isCancelled ? (
                  <Badge variant="outline" className="text-muted-foreground">
                    Cancelled
                  </Badge>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-destructive hover:bg-destructive-soft"
                    onClick={() => setConfirmCancelOpen(true)}
                  >
                    <CalendarX2 className="h-3.5 w-3.5" />
                    Cancel session
                  </Button>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {sessionQuery.isError ? (
              <ErrorState
                title="Could not load the session"
                message={
                  sessionQuery.error instanceof Error
                    ? sessionQuery.error.message
                    : 'Something went wrong while contacting the server.'
                }
                onRetry={() => void sessionQuery.refetch()}
              />
            ) : sessionQuery.isLoading ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Loading the class roster…
              </p>
            ) : roster.length === 0 ? (
              <EmptyState
                title="No students enrolled"
                description="Nobody is enrolled in this subject and section yet, so there is nothing to mark."
                icon={<UserX className="h-5 w-5" />}
              />
            ) : (
              <>
                <FilterBar
                  search={rosterSearch}
                  onSearchChange={setRosterSearch}
                  searchPlaceholder="Search students by name or roll number…"
                >
                  <Button variant="outline" size="sm" onClick={() => bulkSet('PRESENT')}>
                    <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                    Select all present
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => bulkSet('ABSENT')}>
                    <UserX className="h-3.5 w-3.5 text-destructive" />
                    Select all absent
                  </Button>
                  <Button variant="ghost" size="sm" onClick={resetMarks}>
                    <Eraser className="h-3.5 w-3.5" />
                    Reset
                  </Button>
                </FilterBar>

                <DataTable
                  columns={rosterColumns}
                  rows={visibleRoster}
                  rowKey={(row) => row.studentId}
                  emptyTitle="No students match your search"
                  emptyDescription="Try a different name or roll number."
                />

                <div className="grid gap-3 rounded-lg border border-border bg-muted/40 p-4 sm:grid-cols-3 lg:grid-cols-5">
                  <div>
                    <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      Present
                    </p>
                    <p className="mt-0.5 text-xl font-semibold text-success">{summary.present}</p>
                  </div>
                  <div>
                    <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      Absent
                    </p>
                    <p className="mt-0.5 text-xl font-semibold text-destructive">{summary.absent}</p>
                  </div>
                  <div>
                    <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      Late
                    </p>
                    <p className="mt-0.5 text-xl font-semibold text-warning">{summary.late}</p>
                  </div>
                  <div>
                    <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      On leave
                    </p>
                    <p className="mt-0.5 text-xl font-semibold text-info">{summary.onLeave}</p>
                  </div>
                  <div>
                    <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      Unmarked
                    </p>
                    <p className="mt-0.5 text-xl font-semibold text-foreground">{summary.unmarked}</p>
                  </div>
                </div>

                {session?.isCancelled && (
                  <Alert variant="warning" title="This session is cancelled">
                    Cancelled sessions no longer count towards attendance. Create a new session to
                    record attendance again.
                  </Alert>
                )}

                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="flex items-center gap-2 text-xs text-muted-foreground">
                    <AlertCircle className="h-3.5 w-3.5" />
                    Only students with a status are submitted. Re-submitting updates the existing
                    records instead of duplicating them.
                  </p>
                  <Button
                    onClick={() => void handleSubmit()}
                    isLoading={isSubmitting}
                    disabled={session?.isCancelled}
                  >
                    <UserCheck className="h-4 w-4" />
                    Submit attendance
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {activeSessionId === null && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-muted">
              <Clock className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <p className="font-semibold text-foreground">No session open</p>
              <p className="mt-1 max-w-md text-sm text-muted-foreground">
                Create a session above, or open one of the sessions already recorded for this
                subject, section and date.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <ConfirmDialog
        open={confirmCancelOpen}
        onOpenChange={setConfirmCancelOpen}
        title="Cancel this attendance session?"
        description="Cancelled sessions stop counting towards attendance percentages. The records are kept for the audit trail."
        confirmLabel="Cancel session"
        destructive
        isLoading={isCancelling}
        onConfirm={() => void handleCancel()}
      />
    </div>
  );
}
