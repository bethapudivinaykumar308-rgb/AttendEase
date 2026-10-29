import { ResourcePage } from '@/components/resource-page';
import type { Department } from '@/types';

export default function AdminDepartmentsPage() {
  return (
    <ResourcePage<Department>
      config={{
        title: 'Departments',
        description: 'Group students, faculty and subjects into academic departments.',
        breadcrumb: 'Departments',
        endpoint: '/api/departments',
        singular: 'department',
        rowKey: (row) => row.id,
        columns: [
          {
            key: 'departmentCode',
            header: 'Code',
            render: (row) => (
              <span className="font-medium text-foreground">{row.departmentCode}</span>
            ),
          },
          { key: 'departmentName', header: 'Department name' },
          {
            key: 'students',
            header: 'Students',
            align: 'right',
            render: (row) => row._count?.students ?? 0,
          },
          {
            key: 'faculty',
            header: 'Faculty',
            align: 'right',
            render: (row) => row._count?.faculty ?? 0,
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
            name: 'departmentName',
            label: 'Department name',
            kind: 'text',
            required: true,
            colSpan: 2,
            placeholder: 'Computer Science & Engineering',
          },
          {
            name: 'departmentCode',
            label: 'Code',
            kind: 'text',
            required: true,
            placeholder: 'CSE',
            hint: 'Short unique code, stored in upper case.',
          },
        ],
        defaults: { departmentName: '', departmentCode: '' },
        toPayload: (values) => ({
          departmentName: String(values.departmentName).trim(),
          departmentCode: String(values.departmentCode).trim().toUpperCase(),
        }),
        fromRow: (row) => ({
          departmentName: row.departmentName,
          departmentCode: row.departmentCode,
        }),
      }}
    />
  );
}
