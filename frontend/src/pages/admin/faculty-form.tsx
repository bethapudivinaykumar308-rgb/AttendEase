import { useEffect } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AlertCircle, ArrowLeft, Save } from 'lucide-react';
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
import type { Faculty } from '@/types';

const facultySchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'Name must be at least 2 characters')
    .max(120, 'Name must be 120 characters or fewer'),
  email: z.string().trim().email('Enter a valid email address'),
  password: z.string().optional(),
  facultyId: z.string().trim().min(2, 'Faculty ID is required').max(40),
  departmentId: z.number({ invalid_type_error: 'Select a department' }).int().positive(),
  designation: z.string().trim().min(2, 'Designation is required').max(80),
  isActive: z.boolean().optional(),
});

type FacultyFormValues = z.infer<typeof facultySchema>;

export default function AdminFacultyFormPage() {
  const { id } = useParams<{ id: string }>();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const { toast } = useToast();
  const options = useAcademicOptions();

  const facultyQuery = useQuery({
    queryKey: ['admin', 'faculty-record', id],
    queryFn: () => api.get<Faculty>(`/api/faculty/${id}`),
    enabled: isEdit,
  });

  const form = useForm<FacultyFormValues>({
    resolver: zodResolver(facultySchema),
    defaultValues: {
      name: '',
      email: '',
      password: '',
      facultyId: '',
      departmentId: 0,
      designation: '',
      isActive: true,
    },
  });

  useEffect(() => {
    const faculty = facultyQuery.data;
    if (!faculty) return;
    form.reset({
      name: faculty.user.name,
      email: faculty.user.email,
      password: '',
      facultyId: faculty.facultyId,
      departmentId: faculty.departmentId,
      designation: faculty.designation,
      isActive: faculty.user.isActive,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facultyQuery.data]);

  async function onSubmit(values: FacultyFormValues) {
    const payload = {
      name: values.name.trim(),
      email: values.email.trim().toLowerCase(),
      facultyId: values.facultyId.trim(),
      departmentId: values.departmentId,
      designation: values.designation.trim(),
      ...(isEdit ? { isActive: values.isActive ?? true } : { password: values.password }),
    };

    try {
      if (isEdit) {
        await api.put(`/api/faculty/${id}`, payload);
        toast.success('Faculty updated', 'The faculty record has been saved.');
      } else {
        await api.post('/api/faculty', payload);
        toast.success('Faculty created', 'The faculty member can now sign in.');
      }
      navigate('/admin/faculty');
    } catch (error) {
      const message =
        error instanceof ApiError ? error.message : 'Unable to reach the server. Please try again.';
      toast.error(isEdit ? 'Update failed' : 'Create failed', message);
    }
  }

  if (isEdit && facultyQuery.isLoading) {
    return <LoadingState label="Loading faculty member…" />;
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title={isEdit ? 'Edit faculty' : 'Add faculty'}
        description={
          isEdit
            ? 'Update the faculty member’s details.'
            : 'Register a new faculty member and set up their initial sign-in details.'
        }
        breadcrumbs={[
          { label: 'Admin', to: '/admin' },
          { label: 'Faculty', to: '/admin/faculty' },
          { label: isEdit ? 'Edit' : 'Add' },
        ]}
        actions={
          <Button variant="outline" onClick={() => navigate('/admin/faculty')}>
            <ArrowLeft className="h-4 w-4" />
            Back to faculty
          </Button>
        }
      />

      <Card className="max-w-3xl">
        <CardHeader>
          <CardTitle className="text-base">Faculty details</CardTitle>
          <CardDescription>
            Faculty members are assigned to subjects and sections from the assignments screen.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)} noValidate>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="name">
                  Full name<span className="ml-0.5 text-destructive">*</span>
                </Label>
                <Input
                  id="name"
                  autoComplete="name"
                  aria-invalid={Boolean(form.formState.errors.name)}
                  {...form.register('name')}
                />
                {form.formState.errors.name && (
                  <p className="text-xs font-medium text-destructive">
                    {form.formState.errors.name.message}
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="email">
                  Email address<span className="ml-0.5 text-destructive">*</span>
                </Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  aria-invalid={Boolean(form.formState.errors.email)}
                  {...form.register('email')}
                />
                {form.formState.errors.email && (
                  <p className="text-xs font-medium text-destructive">
                    {form.formState.errors.email.message}
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="facultyId">
                  Faculty ID<span className="ml-0.5 text-destructive">*</span>
                </Label>
                <Input
                  id="facultyId"
                  placeholder="FAC-1007"
                  aria-invalid={Boolean(form.formState.errors.facultyId)}
                  {...form.register('facultyId')}
                />
                {form.formState.errors.facultyId && (
                  <p className="text-xs font-medium text-destructive">
                    {form.formState.errors.facultyId.message}
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="designation">
                  Designation<span className="ml-0.5 text-destructive">*</span>
                </Label>
                <Input
                  id="designation"
                  placeholder="Assistant Professor"
                  aria-invalid={Boolean(form.formState.errors.designation)}
                  {...form.register('designation')}
                />
                {form.formState.errors.designation && (
                  <p className="text-xs font-medium text-destructive">
                    {form.formState.errors.designation.message}
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

              {!isEdit && (
                <div className="space-y-1.5">
                  <Label htmlFor="password">
                    Temporary password<span className="ml-0.5 text-destructive">*</span>
                  </Label>
                  <Input
                    id="password"
                    type="password"
                    autoComplete="new-password"
                    aria-invalid={Boolean(form.formState.errors.password)}
                    {...form.register('password')}
                  />
                  {form.formState.errors.password && (
                    <p className="text-xs font-medium text-destructive">
                      {form.formState.errors.password.message}
                    </p>
                  )}
                </div>
              )}

              {isEdit && (
                <div className="flex items-center justify-between rounded-md border border-border px-3 py-2 sm:col-span-2">
                  <div>
                    <Label htmlFor="isActive">Account active</Label>
                    <p className="text-xs text-muted-foreground">
                      Inactive faculty cannot sign in or mark attendance.
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
              )}
            </div>

            <div className="flex items-start gap-2.5 rounded-md border border-border bg-muted/40 px-3 py-2.5 text-xs text-muted-foreground">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                Passwords are stored as salted hashes and are never displayed after they are set.
              </span>
            </div>

            <Button
              type="submit"
              isLoading={form.formState.isSubmitting}
              disabled={form.formState.isSubmitting}
            >
              <Save className="h-4 w-4" />
              {isEdit ? 'Save changes' : 'Create faculty member'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
