import { ResourcePage } from '@/components/resource-page';
import type { AcademicYear } from '@/types';

export default function AdminAcademicYearsPage() {
  return (
    <ResourcePage<AcademicYear>
      config={{
        title: 'Academic years',
        description: 'Define the academic years that sections, subjects and sessions belong to.',
        breadcrumb: 'Academic years',
        endpoint: '/api/academic-years',
        singular: 'academic year',
        rowKey: (row) => row.id,
        columns: [
          {
            key: 'yearName',
            header: 'Year',
            render: (row) => (
              <span className="font-medium text-foreground">{row.yearName}</span>
            ),
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
            key: 'semesters',
            header: 'Semesters',
            align: 'right',
            render: (row) => row._count?.semesters ?? 0,
          },
          {
            key: 'subjects',
            header: 'Subjects',
            align: 'right',
            render: (row) => row._count?.subjects ?? 0,
          },
          {
            key: 'sessions',
            header: 'Sessions',
            align: 'right',
            render: (row) => row._count?.sessions ?? 0,
          },
        ],
        fields: [
          {
            name: 'yearName',
            label: 'Year name',
            kind: 'text',
            required: true,
            placeholder: '2025-26',
          },
          {
            name: 'startDate',
            label: 'Start date',
            kind: 'date',
            required: true,
          },
          {
            name: 'endDate',
            label: 'End date',
            kind: 'date',
            required: true,
          },
          {
            name: 'isActive',
            label: 'Active',
            kind: 'switch',
            hint: 'Only the active year is offered by default when creating records.',
          },
        ],
        defaults: { yearName: '', startDate: '', endDate: '', isActive: true },
        toPayload: (values) => ({
          yearName: String(values.yearName).trim(),
          startDate: String(values.startDate),
          endDate: String(values.endDate),
          isActive: Boolean(values.isActive),
        }),
        fromRow: (row) => ({
          yearName: row.yearName,
          startDate: row.startDate.slice(0, 10),
          endDate: row.endDate.slice(0, 10),
          isActive: row.isActive,
        }),
      }}
    />
  );
}
