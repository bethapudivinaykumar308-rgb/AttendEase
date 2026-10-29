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
import type { Student } from '@/types';

const passwordRule = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .regex(/[a-z]/, 'Password must contain a lowercase letter')
  .regex(/[A-Z]/, 'Password must contain an uppercase letter')
  .regex(/[0-9]/, 'Password must contain a number');

const studentSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'Name must be at least 2 characters')
    .max(120, 'Name must be 120 characters or fewer'),
  email: z.string().trim().email('Enter a valid email address'),
  password: z.string().optional(),
  rollNumber: z.string().trim().min(2, 'Roll number is required').max(40),
  departmentId: z.number({ invalid_type_error: 'Select a department' }).int().positive(),
  semesterId: z.number({ invalid_type_error: 'Select a semester' }).int().positive(),
  section: z.string().trim().min(1, 'Section is required').max(10),
  admissionYear: z
    .number({ invalid_type_error: 'Enter a valid year' })
    .int()
    .min(1990, 'Enter a valid admission year')
    .max(2100, 'Enter a valid admission year'),
  isActive: z.boolean().optional(),
});

type StudentFormValues = z.infer<typeof studentSchema>;

export default function AdminStudentFormPage() {
  const { id } = useParams<{ id: string }>();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const { toast } = useToast();
  const options = useAcademicOptions();

  const studentQuery = useQuery({
    queryKey: ['admin', 'student', id],
    queryFn: () => api.get<Student>(`/api/students/${id}`),
    enabled: isEdit,
  });

  const form = useForm<StudentFormValues>({
    resolver: zodResolver(studentSchema),
    defaultValues: {
      name: '',
      email: '',
      password: '',
      rollNumber: '',
      departmentId: 0,
      semesterId: 0,
      section: 'A',
      admissionYear: new Date().getFullYear(),
      isActive: true,
    },
  });

  useEffect(() => {
    const student = studentQuery.data;
    if (!student) return;
    form.reset({
      name: student.user.name,
      email: student.user.email,
      password: '',
      rollNumber: student.rollNumber,
      departmentId: student.departmentId,
      semesterId: student.semesterId,
      section: student.section,
      admissionYear: student.admissionYear,
      isActive: student.user.isActive,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentQuery.data]);

  async function onSubmit(values: StudentFormValues) {
    if (!isEdit) {
      const parsed = passwordRule.safeParse(values.password ?? '');
      if (!parsed.success) {
        form.setError('password', {
          message: parsed.error.issues[0]?.message ?? 'Enter a valid password',
        });
        return;
      }
    }

    const payload = {
      name: values.name.trim(),
      email: values.email.trim().toLowerCase(),
      rollNumber: values.rollNumber.trim(),
      departmentId: values.departmentId,
      semesterId: values.semesterId,
      section: values.section.trim().toUpperCase(),
      admissionYear: values.admissionYear,
      ...(isEdit ? { isActive: values.isActive ?? true } : { password: values.password }),
    };

    try {
      if (isEdit) {
        await api.put(`/api/students/${id}`, payload);
        toast.success('Student updated', 'The student record has been saved.');
      } else {
        await api.post('/api/students', payload);
        toast.success('Student created', 'The student can now sign in.');
      }
      navigate('/admin/students');
    } catch (error) {
      const message =
        error instanceof ApiError ? error.message : 'Unable to reach the server. Please try again.';
      toast.error(isEdit ? 'Update failed' : 'Create failed', message);
    }
  }

  if (isEdit && studentQuery.isLoading) {
    return <LoadingState label="Loading student…" />;
  }

  const departments = options.data?.departments ?? [];
  const semesters = options.data?.semesters ?? [];

  return (
    <div className="space-y-5">
      <PageHeader
        title={isEdit ? 'Edit student' : 'Add student'}
        description={
          isEdit
            ? 'Update the student’s enrolment details. History is never removed.'
            : 'Register a new student and set up their initial sign-in details.'
        }
        breadcrumbs={[
          { label: 'Admin', to: '/admin' },
          { label: 'Students', to: '/admin/students' },
          { label: isEdit ? 'Edit' : 'Add' },
        ]}
        actions={
          <Button variant="outline" onClick={() => navigate('/admin/students')}>
            <ArrowLeft className="h-4 w-4" />
            Back to students
          </Button>
        }
      />

      <Card className="max-w-3xl">
        <CardHeader>
          <CardTitle className="text-base">Student details</CardTitle>
          <CardDescription>
            {isEdit
              ? 'The email address is the student’s sign-in identity.'
              : 'The student signs in with the email address and password set here.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="space-y-4"
            onSubmit={form.handleSubmit(onSubmit)}
            noValidate
          >
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
                <Label htmlFor="rollNumber">
                  Roll number<span className="ml-0.5 text-destructive">*</span>
                </Label>
                <Input
                  id="rollNumber"
                  aria-invalid={Boolean(form.formState.errors.rollNumber)}
                  {...form.register('rollNumber')}
                />
                {form.formState.errors.rollNumber && (
                  <p className="text-xs font-medium text-destructive">
                    {form.formState.errors.rollNumber.message}
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="section">
                  Section<span className="ml-0.5 text-destructive">*</span>
                </Label>
                <Input
                  id="section"
                  maxLength={10}
                  aria-invalid={Boolean(form.formState.errors.section)}
                  {...form.register('section')}
                />
                {form.formState.errors.section && (
                  <p className="text-xs font-medium text-destructive">
                    {form.formState.errors.section.message}
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
                        {departments.map((department) => (
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
                        {semesters.map((semester) => (
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
                <Label htmlFor="admissionYear">
                  Admission year<span className="ml-0.5 text-destructive">*</span>
                </Label>
                <Input
                  id="admissionYear"
                  type="number"
                  aria-invalid={Boolean(form.formState.errors.admissionYear)}
                  {...form.register('admissionYear', { valueAsNumber: true })}
                />
                {form.formState.errors.admissionYear && (
                  <p className="text-xs font-medium text-destructive">
                    {form.formState.errors.admissionYear.message}
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
                  <p className="text-xs text-muted-foreground">
                    At least 8 characters with an uppercase letter, a lowercase letter and a number.
                  </p>
                </div>
              )}

              {isEdit && (
                <div className="flex items-center justify-between rounded-md border border-border px-3 py-2 sm:col-span-2">
                  <div>
                    <Label htmlFor="isActive">Account active</Label>
                    <p className="text-xs text-muted-foreground">
                      Inactive students cannot sign in, but their attendance history is kept.
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
                Passwords are stored as salted hashes. Use the reset action on the students list to
                issue a new password for an existing account.
              </span>
            </div>

            <Button
              type="submit"
              isLoading={form.formState.isSubmitting}
              disabled={form.formState.isSubmitting}
            >
              <Save className="h-4 w-4" />
              {isEdit ? 'Save changes' : 'Create student'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
