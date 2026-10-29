import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download } from 'lucide-react';
import { ApiError, downloadCsv, fetchPaginated } from '@/lib/api';
import { formatDateTime } from '@/lib/utils';
import { PageHeader } from '@/components/page-header';
import { DataTable } from '@/components/data-table';
import type { DataTableColumn } from '@/components/data-table';
import { FilterBar } from '@/components/filters-bar';
import { Pagination } from '@/components/pagination';
import { ErrorState } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { AuditLog } from '@/types';

const ACTION_TONE: Record<string, 'default' | 'success' | 'warning' | 'danger'> = {
  CREATE: 'success',
  UPDATE: 'default',
  DELETE: 'danger',
  DEACTIVATE: 'warning',
  REACTIVATE: 'success',
  LOGIN: 'default',
  LOGOUT: 'default',
  IMPORT: 'default',
  EXPORT: 'default',
};

export default function AdminAuditLogsPage() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [search, setSearch] = useState('');
  const [action, setAction] = useState<string>('');
  const [entityType, setEntityType] = useState<string>('');
  const [detail, setDetail] = useState<AuditLog | null>(null);

  const query = {
    page,
    pageSize,
    search: search || undefined,
    action: action || undefined,
    entityType: entityType || undefined,
  };

  const listQuery = useQuery({
    queryKey: ['audit-logs', query],
    queryFn: () => fetchPaginated<AuditLog>('/api/audit-logs', query),
  });

  const rows = listQuery.data?.data ?? [];
  const meta = listQuery.data?.meta ?? { page, pageSize, total: 0, totalPages: 1 };

  const columns: DataTableColumn<AuditLog>[] = [
    {
      key: 'createdAt',
      header: 'Timestamp',
      render: (row) => (
        <span className="whitespace-nowrap text-muted-foreground">
          {formatDateTime(row.createdAt)}
        </span>
      ),
    },
    {
      key: 'action',
      header: 'Action',
      render: (row) => (
        <Badge variant="secondary" className="font-mono text-[11px]">
          {row.action}
        </Badge>
      ),
    },
    {
      key: 'user',
      header: 'User',
      render: (row) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-foreground">{row.user?.name ?? 'System'}</p>
          <p className="truncate text-xs text-muted-foreground">{row.user?.role ?? '—'}</p>
        </div>
      ),
    },
    {
      key: 'entityType',
      header: 'Entity',
      render: (row) => (
        <span className="text-muted-foreground">
          {row.entityType}
          {row.entityId ? ` #${row.entityId}` : ''}
        </span>
      ),
    },
    {
      key: 'ipAddress',
      header: 'IP address',
      render: (row) => <span className="font-mono text-xs text-muted-foreground">{row.ipAddress ?? '—'}</span>,
    },
    {
      key: '__actions',
      header: 'Details',
      align: 'right',
      render: (row) => (
        <Button
          variant="ghost"
          size="sm"
          onClick={(event) => {
            event.stopPropagation();
            setDetail(row);
          }}
        >
          View
        </Button>
      ),
    },
  ];

  const resetFilters = () => {
    setSearch('');
    setAction('');
    setEntityType('');
    setPage(1);
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Audit logs"
        description="Every privileged action is recorded with the acting user, the affected entity and the source IP address."
        breadcrumbs={[{ label: 'Admin', to: '/admin' }, { label: 'Audit logs' }]}
        actions={
          <Button
            variant="outline"
            onClick={() =>
              void downloadCsv('/api/audit-logs/export', {
                action: action || undefined,
                entityType: entityType || undefined,
              })
            }
          >
            <Download className="h-4 w-4" />
            Export CSV
          </Button>
        }
      />

      <FilterBar
        search={search}
        onSearchChange={(value) => {
          setSearch(value);
          setPage(1);
        }}
        searchPlaceholder="Search action, entity or user…"
        onClear={resetFilters}
      >
        <div className="w-full sm:w-48">
          <Select
            value={action || 'all'}
            onValueChange={(value) => {
              setAction(value === 'all' ? '' : value);
              setPage(1);
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="All actions" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All actions</SelectItem>
              {[
                'LOGIN',
                'LOGOUT',
                'CREATE',
                'UPDATE',
                'DELETE',
                'DEACTIVATE',
                'REACTIVATE',
                'PASSWORD_CHANGED',
                'PASSWORD_RESET_REQUESTED',
                'PASSWORD_RESET_COMPLETED',
                'PROFILE_UPDATED',
                'ATTENDANCE_SUBMITTED',
                'SESSION_CANCELLED',
                'STUDENT_IMPORTED',
              ].map((option) => (
                <SelectItem key={option} value={option}>
                  {option.replace(/_/g, ' ')}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="w-full sm:w-48">
          <Select
            value={entityType || 'all'}
            onValueChange={(value) => {
              setEntityType(value === 'all' ? '' : value);
              setPage(1);
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="All entities" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All entities</SelectItem>
              {['User', 'Student', 'Faculty', 'Department', 'AcademicYear', 'Semester', 'Subject', 'Section', 'FacultySubject', 'Enrollment', 'AttendanceSession', 'AttendanceRecord'].map(
                (option) => (
                  <SelectItem key={option} value={option}>
                    {option}
                  </SelectItem>
                ),
              )}
            </SelectContent>
          </Select>
        </div>
      </FilterBar>

      {listQuery.isError ? (
        <ErrorState
          title="Could not load audit logs"
          message={
            listQuery.error instanceof ApiError
              ? listQuery.error.message
              : 'Something went wrong while contacting the server.'
          }
          onRetry={() => void listQuery.refetch()}
        />
      ) : (
        <>
          <DataTable
            columns={columns}
            rows={rows}
            rowKey={(row) => row.id}
            isLoading={listQuery.isLoading}
            emptyTitle="No audit entries found"
            emptyDescription="Administrative actions will be recorded here as they happen."
          />

          <Pagination
            page={meta.page}
            pageSize={meta.pageSize}
            total={meta.total}
            totalPages={meta.totalPages}
            onPageChange={setPage}
            onPageSizeChange={(size) => {
              setPageSize(size);
              setPage(1);
            }}
          />
        </>
      )}

      <Dialog open={Boolean(detail)} onOpenChange={(open) => !open && setDetail(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Audit entry #{detail?.id}</DialogTitle>
            <DialogDescription>
              {detail ? `${detail.action} on ${detail.entityType}` : ''}
            </DialogDescription>
          </DialogHeader>
          {detail && (
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Timestamp
                </dt>
                <dd className="mt-1">{formatDateTime(detail.createdAt)}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  User
                </dt>
                <dd className="mt-1">
                  {detail.user?.name ?? 'System'}
                  {detail.user?.email ? ` · ${detail.user.email}` : ''}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Action
                </dt>
                <dd className="mt-1">
                  <Badge variant="secondary">{detail.action}</Badge>
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Entity
                </dt>
                <dd className="mt-1">
                  {detail.entityType} {detail.entityId ? `#${detail.entityId}` : ''}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  IP address
                </dt>
                <dd className="mt-1 font-mono text-xs">{detail.ipAddress ?? '—'}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Details
                </dt>
                <dd className="mt-1 break-words rounded-md bg-muted p-3 font-mono text-xs">
                  {detail.details || '—'}
                </dd>
              </div>
            </dl>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
