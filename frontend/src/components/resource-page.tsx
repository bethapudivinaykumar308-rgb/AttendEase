import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { api, ApiError, fetchPaginated } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import type { DataTableColumn } from '@/components/data-table';
import { DataTable } from '@/components/data-table';
import { FilterBar } from '@/components/filters-bar';
import { PageHeader } from '@/components/page-header';
import { Pagination } from '@/components/pagination';
import { ErrorState } from '@/components/states';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/input';

export interface ResourceFieldOption {
  value: string | number;
  label: string;
}

export interface ResourceField {
  name: string;
  label: string;
  kind: 'text' | 'number' | 'date' | 'select' | 'switch' | 'textarea';
  placeholder?: string;
  options?: ResourceFieldOption[];
  hint?: string;
  required?: boolean;
  colSpan?: 1 | 2;
}

export interface ResourcePageConfig<T> {
  title: string;
  description: string;
  breadcrumb: string;
  endpoint: string;
  singular: string;
  columns: DataTableColumn<T>[];
  rowKey: (row: T) => string | number;
  fields: ResourceField[];
  defaults: Record<string, string | number | boolean>;
  toPayload: (values: Record<string, string | number | boolean>) => Record<string, unknown>;
  fromRow?: (row: T) => Record<string, string | number | boolean>;
  filterNode?: React.ReactNode;
  listQuery?: Record<string, string | number | undefined>;
  canDelete?: (row: T) => boolean;
  deleteBlockedReason?: string;
}

type FormValues = Record<string, string | number | boolean>;

export function ResourcePage<T extends { id: number }>({ config }: { config: ResourcePageConfig<T> }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<T | null>(null);
  const [values, setValues] = useState<FormValues>(config.defaults);
  const [formError, setFormError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<T | null>(null);

  const listKey = ['resource', config.endpoint, page, pageSize, search, config.listQuery];

  const listQuery = useQuery({
    queryKey: listKey,
    queryFn: () =>
      fetchPaginated<T>(config.endpoint, {
        page,
        pageSize,
        search: search || undefined,
        ...(config.listQuery ?? {}),
      }),
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['resource', config.endpoint] });
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = config.toPayload(values);
      if (editing) return api.put(config.endpoint + `/${editing.id}`, payload);
      return api.post(config.endpoint, payload);
    },
    onSuccess: () => {
      toast.success(
        editing ? `${config.singular} updated` : `${config.singular} created`,
        editing
          ? 'Your changes have been saved.'
          : `The ${config.singular} was added successfully.`,
      );
      setDialogOpen(false);
      invalidate();
    },
    onError: (error: unknown) => {
      const message =
        error instanceof ApiError ? error.message : 'Unable to reach the server. Please try again.';
      setFormError(message);
      toast.error('Save failed', message);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (row: T) => api.delete(`${config.endpoint}/${row.id}`),
    onSuccess: () => {
      toast.success(`${config.singular} removed`, `The ${config.singular} has been removed.`);
      setPendingDelete(null);
      invalidate();
    },
    onError: (error: unknown) => {
      const message =
        error instanceof ApiError ? error.message : 'Unable to reach the server. Please try again.';
      toast.error('Delete failed', message);
    },
  });

  const rows = listQuery.data?.data ?? [];
  const meta = listQuery.data?.meta ?? { page, pageSize, total: 0, totalPages: 1 };

  const columns = useMemo<DataTableColumn<T>[]>(
    () => [
      ...config.columns,
      {
        key: '__actions',
        header: 'Actions',
        align: 'right',
        render: (row) => (
          <div className="flex items-center justify-end gap-1">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Edit ${config.singular}`}
              onClick={(event) => {
                event.stopPropagation();
                openEdit(row);
              }}
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Delete ${config.singular}`}
              className="text-destructive hover:bg-destructive-soft"
              onClick={(event) => {
                event.stopPropagation();
                setPendingDelete(row);
              }}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [config],
  );

  function openCreate() {
    setEditing(null);
    setValues(config.defaults);
    setFormError(null);
    setDialogOpen(true);
  }

  function openEdit(row: T) {
    setEditing(row);
    setValues(config.fromRow ? config.fromRow(row) : config.defaults);
    setFormError(null);
    setDialogOpen(true);
  }

  function setField(name: string, value: string | number | boolean) {
    setValues((current) => ({ ...current, [name]: value }));
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const missing = config.fields.find(
      (field) =>
        field.required &&
        field.kind !== 'switch' &&
        (values[field.name] === undefined || values[field.name] === ''),
    );
    if (missing) {
      setFormError(`${missing.label} is required.`);
      return;
    }
    setFormError(null);
    saveMutation.mutate();
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title={config.title}
        description={config.description}
        breadcrumbs={[{ label: 'Admin', to: '/admin' }, { label: config.breadcrumb }]}
        actions={
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" />
            Add {config.singular}
          </Button>
        }
      />

      <FilterBar
        search={search}
        onSearchChange={(value) => {
          setSearch(value);
          setPage(1);
        }}
        searchPlaceholder={`Search ${config.singular}s…`}
        onClear={
          config.filterNode
            ? () => {
                setSearch('');
                setPage(1);
              }
            : undefined
        }
      >
        {config.filterNode}
      </FilterBar>

      {listQuery.isError ? (
        <ErrorState
          title="Could not load records"
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
            rowKey={config.rowKey}
            isLoading={listQuery.isLoading}
            emptyTitle={`No ${config.singular}s found`}
            emptyDescription={`Add your first ${config.singular} or adjust the filters above.`}
            emptyAction={
              <Button variant="outline" size="sm" onClick={openCreate}>
                <Plus className="h-3.5 w-3.5" />
                Add {config.singular}
              </Button>
            }
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

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>
              {editing ? `Edit ${config.singular}` : `Add ${config.singular}`}
            </DialogTitle>
            <DialogDescription>
              {editing
                ? `Update the details of this ${config.singular}.`
                : `Provide the details for the new ${config.singular}.`}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            {formError && (
              <div
                role="alert"
                className="rounded-md border border-destructive/25 bg-destructive-soft px-3 py-2 text-sm text-destructive"
              >
                {formError}
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              {config.fields.map((field) => (
                <div
                  key={field.name}
                  className={cn('space-y-1.5', field.colSpan === 2 && 'sm:col-span-2')}
                >
                  {field.kind === 'switch' ? (
                    <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
                      <Label htmlFor={field.name}>{field.label}</Label>
                      <Switch
                        id={field.name}
                        checked={Boolean(values[field.name])}
                        onCheckedChange={(checked) => setField(field.name, checked)}
                      />
                    </div>
                  ) : (
                    <>
                      <Label htmlFor={field.name}>
                        {field.label}
                        {field.required && <span className="ml-0.5 text-destructive">*</span>}
                      </Label>
                      {field.kind === 'select' ? (
                        <Select
                          value={String(values[field.name] ?? '')}
                          onValueChange={(next) => setField(field.name, next)}
                        >
                          <SelectTrigger id={field.name}>
                            <SelectValue placeholder={`Select ${field.label.toLowerCase()}`} />
                          </SelectTrigger>
                          <SelectContent>
                            {(field.options ?? []).map((option) => (
                              <SelectItem key={String(option.value)} value={String(option.value)}>
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : field.kind === 'textarea' ? (
                        <Textarea
                          id={field.name}
                          value={String(values[field.name] ?? '')}
                          placeholder={field.placeholder}
                          onChange={(event) => setField(field.name, event.target.value)}
                        />
                      ) : (
                        <Input
                          id={field.name}
                          type={field.kind === 'date' ? 'date' : field.kind === 'number' ? 'number' : 'text'}
                          value={String(values[field.name] ?? '')}
                          placeholder={field.placeholder}
                          onChange={(event) =>
                            setField(
                              field.name,
                              field.kind === 'number'
                                ? Number(event.target.value)
                                : event.target.value,
                            )
                          }
                        />
                      )}
                    </>
                  )}
                  {field.hint && <p className="text-xs text-muted-foreground">{field.hint}</p>}
                </div>
              ))}
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" isLoading={saveMutation.isPending}>
                {editing ? 'Save changes' : `Add ${config.singular}`}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
        title={`Delete ${config.singular}?`}
        description={
          config.deleteBlockedReason ??
          `This permanently removes the ${config.singular}. Records that already carry historical data are deactivated instead of deleted.`
        }
        confirmLabel="Delete"
        destructive
        isLoading={deleteMutation.isPending}
        onConfirm={() => {
          if (pendingDelete) deleteMutation.mutate(pendingDelete);
        }}
      />
    </div>
  );
}
