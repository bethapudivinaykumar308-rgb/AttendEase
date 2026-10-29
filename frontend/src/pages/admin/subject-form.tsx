import { useEffect } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Save } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { useAcademicOptions } from '@/hooks/use-academic-options';
import { PageHeader } from '@/components/page-header';
import { LoadingState } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
import type { Subject } from '@/types';

const subjectSchema = z.object({
  subjectCode: z
    .string()
    .trim()
    .min(2, 'Subject code is required')
    .max(40, 'Subject code must be 40 characters or fewer'),
  subjectName: z
    .string()
    .trim()
    .min(2, 'Subject name is required')
    .max(160, 'Subject name must be 160 characters or fewer'),
  departmentId: z.number({ invalid_type_error: 'Select a department' }).int().positive(),
  semesterId: z.number({ invalid_type_error: 'Select a semester' }).int().positive(),
  academicYearId: z.number({ invalid_type_error: 'Select an academic year' }).int().positive(),
  credits: z
    .number({ invalid_type_error: 'Enter the number of credits' })
    .int()
    .min(0, 'Credits cannot be negative')
    .max(20, 'Credits cannot be more than 20'),
  isActive: z.boolean().optional(),
});

type SubjectFormValues = z.infer<typeof subjectSchema>;

export default function AdminSubjectFormPage() {
  const { id } = useParams<{ id: string }>();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const { toast } = useToast();
  const options = useAcademicOptions();

  const subjectQuery = useQuery({
    queryKey: ['admin', 'subject', id],
    queryFn: () => api.get<Subject>(`/api/subjects/${id}`),
    enabled: isEdit,
  });

  const form = useForm<SubjectFormValues>({
    resolver: zodResolver(subjectSchema),
    defaultValues: {
      subjectCode: '',
      subjectName: '',
      departmentId: 0,
      semesterId: 0,
      academicYearId: 0,
      credits: 3,
      isActive: true,
    },
  });

  useEffect(() => {
    const subject = subjectQuery.data;
    if (!subject) return;
    form.reset({
      subjectCode: subject.subjectCode,
      subjectName: subject.subjectName,
      departmentId: subject.departmentId,
      semesterId: subject.semesterId,
      academicYearId: subject.academicYearId,
      credits: subject.credits,
      isActive: subject.isActive,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subjectQuery.data]);

  async function onSubmit(values: SubjectFormValues) {
    const payload = {
      subjectCode: values.subjectCode.trim().toUpperCase(),
      subjectName: values.subjectName.trim(),
      departmentId: values.departmentId,
      semesterId: values.semesterId,
      academicYearId: values.academicYearId,
      credits: values.credits,
      isActive: values.isActive ?? true,
    };

    try {
      if (isEdit) {
        await api.put(`/api/subjects/${id}`, payload);
        toast.success('Subject updated', 'The subject record has been saved.');
      } else {
        await api.post('/api/subjects', payload);
        toast.success('Subject created', 'The subject is ready for sections and assignments.');
      }
      navigate('/admin/subjects');
    } catch (error) {
      const message =
        error instanceof ApiError ? error.message : 'Unable to reach the server. Please try again.';
      toast.error(isEdit ? 'Update failed' : 'Create failed', message);
    }
  }

  if (isEdit && subjectQuery.isLoading) {
    return <LoadingState label="Loading subject…" />;
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title={isEdit ? 'Edit subject' : 'Add subject'}
        description={
          isEdit
            ? 'Update the subject details. Existing sessions keep their history.'
            : 'Create a subject, then offer it in one or more sections.'
        }
        breadcrumbs={[
          { label: 'Admin', to: '/admin' },
          { label: 'Subjects', to: '/admin/subjects' },
          { label: isEdit ? 'Edit' : 'Add' },
        ]}
        actions={
          <Button variant="outline" onClick={() => navigate('/admin/subjects')}>
            <ArrowLeft className="h-4 w-4" />
            Back to subjects
          </Button>
        }
      />

      <Card className="max-w-3xl">
        <CardHeader>
          <CardTitle className="text-base">Subject details</CardTitle>
          <CardDescription>
            The subject code is unique across the institution and is stored in upper case.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)} noValidate>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="subjectCode">
                  Subject code<span className="ml-0.5 text-destructive">*</span>
                </Label>
                <Input
                  id="subjectCode"
                  placeholder="CSE101"
                  aria-invalid={Boolean(form.formState.errors.subjectCode)}
                  {...form.register('subjectCode')}
                />
                {form.formState.errors.subjectCode && (
                  <p className="text-xs font-medium text-destructive">
                    {form.formState.errors.subjectCode.message}
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="credits">
                  Credits<span className="ml-0.5 text-destructive">*</span>
                </Label>
                <Input
                  id="credits"
                  type="number"
                  aria-invalid={Boolean(form.formState.errors.credits)}
                  {...form.register('credits', { valueAsNumber: true })}
                />
                {form.formState.errors.credits && (
                  <p className="text-xs font-medium text-destructive">
                    {form.formState.errors.credits.message}
                  </p>
                )}
              </div>

              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="subjectName">
                  Subject name<span className="ml-0.5 text-destructive">*</span>
                </Label>
                <Input
                  id="subjectName"
                  placeholder="Programming Fundamentals"
                  aria-invalid={Boolean(form.formState.errors.subjectName)}
                  {...form.register('subjectName')}
                />
                {form.formState.errors.subjectName && (
                  <p className="text-xs font-medium text-destructive">
                    {form.formState.errors.subjectName.message}
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="departmentId">
                  Department<span className="ml-0.5 text-destructive">*</span>
                </Label>
                <Controller
                  control={form.control}
                  name="departmentId"
                  render={({ field }) => (
                    <Select
                      value={field.value ? String(field.value) : ''}
                      onValueChange={(value) => field.onChange(Number(value))}
                    >
                      <SelectTrigger id="departmentId">
                        <SelectValue placeholder="Select a department" />
                      </SelectTrigger>
                      <SelectContent>
                        {(options.data?.departments ?? []).map((department) => (
                          <SelectItem key={department.id} value={String(department.id)}>
                            {department.departmentName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                {form.formState.errors.departmentId && (
                  <p className="text-xs font-medium text-destructive">
                    {form.formState.errors.departmentId.message}
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="semesterId">
                  Semester<span className="ml-0.5 text-destructive">*</span>
                </Label>
                <Controller
                  control={form.control}
                  name="semesterId"
                  render={({ field }) => (
                    <Select
                      value={field.value ? String(field.value) : ''}
                      onValueChange={(value) => field.onChange(Number(value))}
                    >
                      <SelectTrigger id="semesterId">
                        <SelectValue placeholder="Select a semester" />
                      </SelectTrigger>
                      <SelectContent>
                        {(options.data?.semesters ?? []).map((semester) => (
                          <SelectItem key={semester.id} value={String(semester.id)}>
                            Sem {semester.semesterNumber} · {semester.academicYear?.yearName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                {form.formState.errors.semesterId && (
                  <p className="text-xs font-medium text-destructive">
                    {form.formState.errors.semesterId.message}
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="academicYearId">
                  Academic year<span className="ml-0.5 text-destructive">*</span>
                </Label>
                <Controller
                  control={form.control}
                  name="academicYearId"
                  render={({ field }) => (
                    <Select
                      value={field.value ? String(field.value) : ''}
                      onValueChange={(value) => field.onChange(Number(value))}
                    >
                      <SelectTrigger id="academicYearId">
                        <SelectValue placeholder="Select an academic year" />
                      </SelectTrigger>
                      <SelectContent>
                        {(options.data?.academicYears ?? []).map((year) => (
                          <SelectItem key={year.id} value={String(year.id)}>
                            {year.yearName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                {form.formState.errors.academicYearId && (
                  <p className="text-xs font-medium text-destructive">
                    {form.formState.errors.academicYearId.message}
                  </p>
                )}
              </div>

              <div className="flex items-center justify-between rounded-md border border-border px-3 py-2 sm:col-span-2">
                <div>
                  <Label htmlFor="isActive">Active</Label>
                  <p className="text-xs text-muted-foreground">
                    Inactive subjects stay in historical reports but cannot be assigned.
                  </p>
                </div>
                <Controller
                  control={form.control}
                  name="isActive"
                  render={({ field }) => (
                    <Switch
                      id="isActive"
                      checked={field.value ?? true}
                      onCheckedChange={field.onChange}
                    />
                  )}
                />
              </div>
            </div>

            <Button
              type="submit"
              isLoading={form.formState.isSubmitting}
              disabled={form.formState.isSubmitting}
            >
              <Save className="h-4 w-4" />
              {isEdit ? 'Save changes' : 'Create subject'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
