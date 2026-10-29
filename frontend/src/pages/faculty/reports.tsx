import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download, Play } from 'lucide-react';
import { api, ApiError, downloadCsv } from '@/lib/api';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { PageHeader } from '@/components/page-header';
import { ReportFilters } from '@/components/report-filters';
import type { ReportFilterState } from '@/components/report-filters';
import { ReportViewer } from '@/components/report-viewer';
import { ErrorState } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { Assignment, ReportResult } from '@/types';

const REPORT_OPTIONS = [
  { value: 'student-wise', label: 'Student-wise attendance' },
  { value: 'subject-wise', label: 'Subject-wise attendance' },
  { value: 'class-wise', label: 'Class-wise attendance' },
  { value: 'date-wise', label: 'Date-wise attendance' },
  { value: 'monthly', label: 'Monthly attendance' },
  { value: 'low-attendance', label: 'Low-attendance students' },
];

export default function FacultyReportsPage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const facultyId = user?.faculty?.id;

  const [reportType, setReportType] = useState('student-wise');
  const [filters, setFilters] = useState<ReportFilterState>({});
  const [applied, setApplied] = useState<{ reportType: string; filters: ReportFilterState } | null>(
    null,
  );

  const assignmentsQuery = useQuery({
    queryKey: ['faculty', 'assignments', facultyId],
    queryFn: () =>
      api.get<Assignment[]>('/api/assignments', { facultyId, pageSize: 100 }),
    enabled: facultyId !== undefined,
  });

  const taughtSubjects = useMemo(() => {
    const assignments = assignmentsQuery.data ?? [];
    const seen = new Map<number, { id: number; subjectCode: string; subjectName: string }>();
    for (const assignment of assignments) {
      if (!assignment.subject) continue;
      seen.set(assignment.subject.id, {
        id: assignment.subject.id,
        subjectCode: assignment.subject.subjectCode,
        subjectName: assignment.subject.subjectName,
      });
    }
    return [...seen.values()];
  }, [assignmentsQuery.data]);

  const query = applied
    ? { reportType: applied.reportType, ...applied.filters }
    : undefined;

  const reportQuery = useQuery({
    queryKey: ['faculty', 'reports', applied?.reportType, applied?.filters],
    queryFn: () => api.get<ReportResult>('/api/reports', query),
    enabled: Boolean(applied),
  });

  async function handleExport() {
    if (!applied) return;
    try {
      await downloadCsv('/api/reports/export', {
        reportType: applied.reportType,
        ...applied.filters,
      });
      toast.success('Export ready', 'The report has been downloaded as a CSV file.');
    } catch (error) {
      toast.error(
        'Export failed',
        error instanceof ApiError ? error.message : 'Please try again.',
      );
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Attendance reports"
        description="Reports for the subjects you teach. Every figure is computed from live attendance records."
        breadcrumbs={[{ label: 'Faculty', to: '/faculty' }, { label: 'Reports' }]}
      />

      <div className="space-y-4 rounded-lg border border-border bg-card p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1.5">
            <Label htmlFor="reportType">Report type</Label>
            <Select value={reportType} onValueChange={setReportType}>
              <SelectTrigger id="reportType">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {REPORT_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="reportSubject">Subject</Label>
            <Select
              value={filters.subjectId ? String(filters.subjectId) : ''}
              onValueChange={(value) =>
                setFilters((current) => ({ ...current, subjectId: Number(value) }))
              }
            >
              <SelectTrigger id="reportSubject">
                <SelectValue placeholder="Select a subject" />
              </SelectTrigger>
              <SelectContent>
                {taughtSubjects.map((subject) => (
                  <SelectItem key={subject.id} value={String(subject.id)}>
                    {subject.subjectCode} · {subject.subjectName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <ReportFilters
          value={filters}
          onChange={setFilters}
          hide={['studentId', 'facultyId', 'subjectId']}
        />

        <div className="flex flex-wrap justify-end gap-2">
          <Button
            onClick={() => setApplied({ reportType, filters })}
            isLoading={reportQuery.isFetching && Boolean(applied)}
          >
            <Play className="h-4 w-4" />
            Generate report
          </Button>
          <Button variant="outline" onClick={() => void handleExport()} disabled={!applied}>
            <Download className="h-4 w-4" />
            Export CSV
          </Button>
        </div>
      </div>

      {reportQuery.isError ? (
        <ErrorState
          title="Could not build the report"
          message={
            reportQuery.error instanceof ApiError
              ? reportQuery.error.message
              : 'Something went wrong while contacting the server.'
          }
          onRetry={() => void reportQuery.refetch()}
        />
      ) : (
        <ReportViewer
          report={reportQuery.data ?? null}
          isLoading={reportQuery.isLoading}
          onExportCsv={() => void handleExport()}
          onPrint={() => window.print()}
          emptyMessage="Select a report type and press Generate report."
        />
      )}
    </div>
  );
}
