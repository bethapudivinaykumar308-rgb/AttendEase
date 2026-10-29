import { ResourcePage } from '@/components/resource-page';
import { useAcademicOptions } from '@/hooks/use-academic-options';
import type { Semester } from '@/types';

export default function AdminSemestersPage() {
  const options = useAcademicOptions();
  const yearOptions = (options.data?.academicYears ?? []).map((year) => ({
    value: year.id,
    label: year.yearName,
  }));

  return (
    <ResourcePage<Semester>
      config={{
        title: 'Semesters',
        description: 'Split each academic year into semesters that subjects and students follow.',
        breadcrumb: 'Semesters',
        endpoint: '/api/semesters',
        singular: 'semester',
        rowKey: (row) => row.id,
        listQuery: { academicYearId: undefined },
        columns: [
          {
            key: 'semesterNumber',
            header: 'Semester',
            render: (row) => (
              <span className="font-medium text-foreground">
                Semester {row.semesterNumber}
              </span>
            ),
          },
          {
            key: 'academicYear',
            header: 'Academic year',
            render: (row) => row.academicYear?.yearName ?? '—',
          },
          {
            key: 'dates',
            header: 'Duration',
            render: (row) => (
              <span className="text-muted-foreground">
                {row.startDate.slice(0, 10)} → {row.endDate.slice(0, 10)}
              </span>
            ),
          },
          {
            key: 'isActive',
            header: 'Status',
            render: (row) => (
              <span
                className={
                  row.isActive
                    ? 'text-sm font-medium text-success'
                    : 'text-sm font-medium text-muted-foreground'
                }
              >
                {row.isActive ? 'Active' : 'Inactive'}
              </span>
            ),
          },
          {
            key: 'students',
            header: 'Students',
            align: 'right',
            render: (row) => row._count?.students ?? 0,
          },
          {
            key: 'subjects',
            header: 'Subjects',
            align: 'right',
            render: (row) => row._count?.subjects ?? 0,
          },
        ],
        fields: [
          {
            name: 'semesterNumber',
            label: 'Semester number',
            kind: 'number',
            required: true,
          },
          {
            name: 'academicYearId',
            label: 'Academic year',
            kind: 'select',
            required: true,
            options: yearOptions,
          },
          { name: 'startDate', label: 'Start date', kind: 'date', required: true },
          { name: 'endDate', label: 'End date', kind: 'date', required: true },
          { name: 'isActive', label: 'Active', kind: 'switch' },
        ],
        defaults: {
          semesterNumber: 1,
          academicYearId: options.data?.academicYears[0]?.id ?? '',
          startDate: '',
          endDate: '',
          isActive: true,
        },
        toPayload: (values) => ({
          semesterNumber: Number(values.semesterNumber),
          academicYearId: Number(values.academicYearId),
          startDate: String(values.startDate),
          endDate: String(values.endDate),
          isActive: Boolean(values.isActive),
        }),
        fromRow: (row) => ({
          semesterNumber: row.semesterNumber,
          academicYearId: row.academicYearId,
          startDate: row.startDate.slice(0, 10),
          endDate: row.endDate.slice(0, 10),
          isActive: row.isActive,
        }),
      }}
    />
  );
}
