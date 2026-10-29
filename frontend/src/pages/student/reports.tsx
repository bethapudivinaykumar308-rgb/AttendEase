import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FileBarChart, RefreshCw } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { ReportFilters } from '@/components/report-filters';
import type { ReportFilterState } from '@/components/report-filters';
import { ReportViewer } from '@/components/report-viewer';
import { ErrorState } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { api, downloadCsv } from '@/lib/api';
import type { ReportResult } from '@/types';

interface ReportTypeOption {
  value: string;
  label: string;
}

/** Report types a student account is allowed to run. */
const ALLOWED_REPORT_TYPES = [
  'student-wise',
  'subject-wise',
  'class-wise',
  'date-wise',
  'monthly',
  'low-attendance',
];

const FALLBACK_REPORT_TYPES: ReportTypeOption[] = [
  { value: 'student-wise', label: 'Student-wise' },
  { value: 'subject-wise', label: 'Subject-wise' },
  { value: 'class-wise', label: 'Class-wise' },
  { value: 'date-wise', label: 'Date-wise' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'low-attendance', label: 'Low Attendance' },
];

const VISIBLE_FILTERS: Array<keyof ReportFilterState> = [
  'academicYearId',
  'semesterId',
  'subjectId',
  'sectionId',
  'startDate',
  'endDate',
  'threshold',
];

interface AppliedReport {
  reportType: string;
  filters: ReportFilterState;
}

function buildQuery(reportType: string, filters: ReportFilterState) {
  const query: Record<string, string | number | undefined> = { reportType };

  if (filters.academicYearId) query.academicYearId = filters.academicYearId;
  if (filters.semesterId) query.semesterId = filters.semesterId;
  if (filters.subjectId) query.subjectId = filters.subjectId;
  if (filters.sectionId) query.sectionId = filters.sectionId;
  if (filters.startDate) query.startDate = filters.startDate;
  if (filters.endDate) query.endDate = filters.endDate;
  if (filters.threshold) query.threshold = filters.threshold;

  return query;
}

export default function StudentReportsPage() {
  const { toast } = useToast();
  const [reportType, setReportType] = useState(ALLOWED_REPORT_TYPES[0]);
  const [filters, setFilters] = useState<ReportFilterState>({});
  const [applied, setApplied] = useState<AppliedReport | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  const typesQuery = useQuery({
    queryKey: ['report-types'],
    queryFn: () => api.get<ReportTypeOption[]>('/api/reports/types'),
    staleTime: 5 * 60 * 1000,
  });

  const reportTypeOptions = useMemo(() => {
    const available = typesQuery.data ?? [];
    if (available.length === 0) return FALLBACK_REPORT_TYPES;
    return available.filter((option) => ALLOWED_REPORT_TYPES.includes(option.value));
  }, [typesQuery.data]);

  const reportQuery = useQuery({
    queryKey: ['student-report', applied?.reportType, applied?.filters],
    queryFn: () => {
      if (!applied) throw new Error('No report requested');
      return api.get<ReportResult>('/api/reports', buildQuery(applied.reportType, applied.filters));
    },
    enabled: Boolean(applied),
  });

  const handleGenerate = () => {
    setApplied({ reportType, filters });
  };

  const handleExport = async () => {
    if (!applied) {
      toast.warning('Generate a report first', 'The export uses the filters of the current report.');
      return;
    }
    setIsExporting(true);
    try {
      await downloadCsv('/api/reports/export', buildQuery(applied.reportType, applied.filters));
      toast.success('Export ready', 'The report CSV has been downloaded.');
    } catch (error) {
      toast.error(
        'Export failed',
        error instanceof Error ? error.message : 'Unable to download the CSV file.',
      );
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Reports"
        description="Run attendance reports for your own record and export them as CSV."
        breadcrumbs={[
          { label: 'Student', to: '/student' },
          { label: 'Reports' },
        ]}
      />

      <Card>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-[minmax(0,260px)_auto] sm:items-end">
            <div className="space-y-1.5">
              <Label htmlFor="report-type">Report type</Label>
              <Select value={reportType} onValueChange={setReportType}>
                <SelectTrigger id="report-type">
                  <SelectValue placeholder="Select a report" />
                </SelectTrigger>
                <SelectContent>
                  {reportTypeOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button onClick={handleGenerate} isLoading={reportQuery.isFetching}>
              <FileBarChart className="h-4 w-4" />
              Generate report
            </Button>
          </div>

          <ReportFilters value={filters} onChange={setFilters} show={VISIBLE_FILTERS} />
        </CardContent>
      </Card>

      {reportQuery.isError ? (
        <ErrorState
          title="Could not generate the report"
          message={
            reportQuery.error instanceof Error
              ? reportQuery.error.message
              : 'Something went wrong while contacting the server.'
          }
          onRetry={() => void reportQuery.refetch()}
        />
      ) : (
        <ReportViewer
          report={reportQuery.data ?? null}
          isLoading={reportQuery.isFetching && Boolean(applied)}
          onExportCsv={() => void handleExport()}
          onPrint={() => window.print()}
          emptyMessage={
            applied
              ? 'No data matches the selected filters.'
              : 'Select a report type and generate the report to see the results.'
          }
        />
      )}

      {isExporting && (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <RefreshCw className="h-3.5 w-3.5 animate-spin" />
          Preparing your CSV export…
        </p>
      )}
    </div>
  );
}
