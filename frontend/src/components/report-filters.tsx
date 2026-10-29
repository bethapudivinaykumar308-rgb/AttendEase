import { useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { useAcademicOptions } from '@/hooks/use-academic-options';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export interface ReportFilterState {
  academicYearId?: number;
  semesterId?: number;
  departmentId?: number;
  subjectId?: number;
  sectionId?: number;
  section?: string;
  studentId?: number;
  facultyId?: number;
  startDate?: string;
  endDate?: string;
  status?: string;
  threshold?: number;
}

export const emptyReportFilters: ReportFilterState = {};

interface ReportFiltersProps {
  value: ReportFilterState;
  onChange: (value: ReportFilterState) => void;
  show?: Array<keyof ReportFilterState>;
  hide?: Array<keyof ReportFilterState>;
}

const ALL_FILTERS: Array<keyof ReportFilterState> = [
  'academicYearId',
  'semesterId',
  'departmentId',
  'subjectId',
  'sectionId',
  'section',
  'studentId',
  'facultyId',
  'startDate',
  'endDate',
  'status',
  'threshold',
];

export function ReportFilters({ value, onChange, show, hide }: ReportFiltersProps) {
  const { data: options } = useAcademicOptions();
  const active = show ?? ALL_FILTERS.filter((key) => !(hide ?? []).includes(key));

  const set = <K extends keyof ReportFilterState>(key: K, next: ReportFilterState[K]) => {
    onChange({ ...value, [key]: next });
  };

  const semesters = (options?.semesters ?? []).filter(
    (semester) => !value.academicYearId || semester.academicYearId === value.academicYearId,
  );
  const subjects = (options?.subjects ?? []).filter(
    (subject) => !value.departmentId || subject.departmentId === value.departmentId,
  );
  const sections = (options?.sections ?? []).filter(
    (section) => !value.subjectId || section.subjectId === value.subjectId,
  );

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {active.includes('academicYearId') && (
          <div className="space-y-1.5">
            <Label htmlFor="filter-academicYear">Academic year</Label>
            <Select
              value={value.academicYearId ? String(value.academicYearId) : 'all'}
              onValueChange={(next) =>
                set('academicYearId', next === 'all' ? undefined : Number(next))
              }
            >
              <SelectTrigger id="filter-academicYear">
                <SelectValue placeholder="All years" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All years</SelectItem>
                {(options?.academicYears ?? []).map((year) => (
                  <SelectItem key={year.id} value={String(year.id)}>
                    {year.yearName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {active.includes('semesterId') && (
          <div className="space-y-1.5">
            <Label htmlFor="filter-semester">Semester</Label>
            <Select
              value={value.semesterId ? String(value.semesterId) : 'all'}
              onValueChange={(next) => set('semesterId', next === 'all' ? undefined : Number(next))}
            >
              <SelectTrigger id="filter-semester">
                <SelectValue placeholder="All semesters" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All semesters</SelectItem>
                {semesters.map((semester) => (
                  <SelectItem key={semester.id} value={String(semester.id)}>
                    Semester {semester.semesterNumber} · {semester.academicYear.yearName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {active.includes('departmentId') && (
          <div className="space-y-1.5">
            <Label htmlFor="filter-department">Department</Label>
            <Select
              value={value.departmentId ? String(value.departmentId) : 'all'}
              onValueChange={(next) => set('departmentId', next === 'all' ? undefined : Number(next))}
            >
              <SelectTrigger id="filter-department">
                <SelectValue placeholder="All departments" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All departments</SelectItem>
                {(options?.departments ?? []).map((department) => (
                  <SelectItem key={department.id} value={String(department.id)}>
                    {department.departmentName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {active.includes('subjectId') && (
          <div className="space-y-1.5">
            <Label htmlFor="filter-subject">Subject</Label>
            <Select
              value={value.subjectId ? String(value.subjectId) : 'all'}
              onValueChange={(next) => set('subjectId', next === 'all' ? undefined : Number(next))}
            >
              <SelectTrigger id="filter-subject">
                <SelectValue placeholder="All subjects" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All subjects</SelectItem>
                {subjects.map((subject) => (
                  <SelectItem key={subject.id} value={String(subject.id)}>
                    {subject.subjectCode} · {subject.subjectName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {active.includes('sectionId') && (
          <div className="space-y-1.5">
            <Label htmlFor="filter-sectionOffering">Section offering</Label>
            <Select
              value={value.sectionId ? String(value.sectionId) : 'all'}
              onValueChange={(next) => set('sectionId', next === 'all' ? undefined : Number(next))}
            >
              <SelectTrigger id="filter-sectionOffering">
                <SelectValue placeholder="All sections" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All sections</SelectItem>
                {sections.map((section) => (
                  <SelectItem key={section.id} value={String(section.id)}>
                    Section {section.section}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {active.includes('section') && (
          <div className="space-y-1.5">
            <Label htmlFor="filter-section">Section</Label>
            <Input
              id="filter-section"
              placeholder="e.g. A"
              maxLength={10}
              value={value.section ?? ''}
              onChange={(event) => set('section', event.target.value.toUpperCase())}
            />
          </div>
        )}

        {active.includes('startDate') && (
          <div className="space-y-1.5">
            <Label htmlFor="filter-startDate">From date</Label>
            <Input
              id="filter-startDate"
              type="date"
              value={value.startDate ?? ''}
              onChange={(event) => set('startDate', event.target.value || undefined)}
            />
          </div>
        )}

        {active.includes('endDate') && (
          <div className="space-y-1.5">
            <Label htmlFor="filter-endDate">To date</Label>
            <Input
              id="filter-endDate"
              type="date"
              value={value.endDate ?? ''}
              onChange={(event) => set('endDate', event.target.value || undefined)}
            />
          </div>
        )}

        {active.includes('status') && (
          <div className="space-y-1.5">
            <Label htmlFor="filter-status">Attendance status</Label>
            <Select
              value={value.status ?? 'all'}
              onValueChange={(next) => set('status', next === 'all' ? undefined : next)}
            >
              <SelectTrigger id="filter-status">
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="PRESENT">Present</SelectItem>
                <SelectItem value="ABSENT">Absent</SelectItem>
                <SelectItem value="LATE">Late</SelectItem>
                <SelectItem value="ON_LEAVE">On leave</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}

        {active.includes('threshold') && (
          <div className="space-y-1.5">
            <Label htmlFor="filter-threshold">Threshold %</Label>
            <Input
              id="filter-threshold"
              type="number"
              min={1}
              max={100}
              placeholder="75"
              value={value.threshold ?? ''}
              onChange={(event) =>
                set('threshold', event.target.value ? Number(event.target.value) : undefined)
              }
            />
          </div>
        )}
      </div>

      <div className="mt-4 flex justify-end">
        <Button variant="ghost" size="sm" onClick={() => onChange({})}>
          <RotateCcw className="h-3.5 w-3.5" />
          Clear filters
        </Button>
      </div>
    </div>
  );
}

export function useReportFilters() {
  return useState<ReportFilterState>(emptyReportFilters);
}
