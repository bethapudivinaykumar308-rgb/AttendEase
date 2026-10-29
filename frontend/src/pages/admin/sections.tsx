import { ResourcePage } from '@/components/resource-page';
import { useAcademicOptions } from '@/hooks/use-academic-options';
import type { Section } from '@/types';

export default function AdminSectionsPage() {
  const options = useAcademicOptions();
  const subjectCodeById = new Map(
    (options.data?.subjects ?? []).map((subject) => [subject.id, subject.subjectCode]),
  );

  const subjectOptions = (options.data?.subjects ?? []).map((subject) => ({
    value: subject.id,
    label: `${subject.subjectCode} — ${subject.subjectName}`,
  }));

  const yearOptions = (options.data?.academicYears ?? []).map((year) => ({
    value: year.id,
    label: year.yearName,
  }));

  const sectionOptions = (options.data?.sections ?? []).map((section) => ({
    value: section.id,
    label: `Section ${section.section} · ${subjectCodeById.get(section.subjectId) ?? 'Subject'}`,
  }));

  return (
    <ResourcePage<Section>
      config={{
        title: 'Sections',
        description: 'Create the class sections that subjects are offered in.',
        breadcrumb: 'Sections',
        endpoint: '/api/sections',
        singular: 'section',
        rowKey: (row) => row.id,
        columns: [
          {
            key: 'section',
            header: 'Section',
            render: (row) => (
              <span className="font-medium text-foreground">Section {row.section}</span>
            ),
          },
          {
            key: 'subject',
            header: 'Subject',
            render: (row) => (
              <span>
                <span className="font-medium text-foreground">
                  {row.subject?.subjectCode ?? '—'}
                </span>
                <span className="ml-2 text-muted-foreground">
                  {row.subject?.subjectName ?? ''}
                </span>
              </span>
            ),
          },
          {
            key: 'academicYear',
            header: 'Academic year',
            render: (row) => row.academicYear?.yearName ?? '—',
          },
          {
            key: 'enrollments',
            header: 'Enrolled',
            align: 'right',
            render: (row) => row._count?.enrollments ?? 0,
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
            name: 'subjectId',
            label: 'Subject',
            kind: 'select',
            required: true,
            options: subjectOptions,
            colSpan: 2,
          },
          {
            name: 'section',
            label: 'Section name',
            kind: 'text',
            required: true,
            placeholder: 'A',
            hint: 'A single letter or short code, e.g. A or B.',
          },
          {
            name: 'academicYearId',
            label: 'Academic year',
            kind: 'select',
            required: true,
            options: yearOptions,
          },
        ],
        defaults: {
          subjectId: options.data?.subjects[0]?.id ?? '',
          section: 'A',
          academicYearId: options.data?.academicYears[0]?.id ?? '',
        },
        toPayload: (values) => ({
          subjectId: Number(values.subjectId),
          section: String(values.section).trim().toUpperCase(),
          academicYearId: Number(values.academicYearId),
        }),
        fromRow: (row) => ({
          subjectId: row.subjectId,
          section: row.section,
          academicYearId: row.academicYearId,
        }),
      }}
    />
  );
}
