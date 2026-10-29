import { useEffect, useState } from 'react';
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
import { CredentialsDialog, type IssuedCredentials } from '@/components/credentials-dialog';
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

interface CreatedStudent extends Student {
  credentials: { email: string; temporaryPassword: string };
}

const studentSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'Name must be at least 2 characters')
    .max(120, 'Name must be 120 characters or fewer'),
  email: z.union([z.literal(''), z.string().trim().email('Enter a valid email address')]),
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
  const [issued, setIssued] = useState<IssuedCredentials | null>(null);

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
    const payload = {
      name: values.name.trim(),
      ...(values.email.trim() ? { email: values.email.trim().toLowerCase() } : {}),
      rollNumber: values.rollNumber.trim(),
      departmentId: values.departmentId,
      semesterId: values.semesterId,
      section: values.section.trim().toUpperCase(),
      admissionYear: values.admissionYear,
      ...(isEdit ? { isActive: values.isActive ?? true } : {}),
    };

    try {
      if (isEdit) {
        await api.put(`/api/students/${id}`, payload);
        toast.success('Student updated', 'The student record has been saved.');
        navigate('/admin/students');
      } else {
        const created = await api.post<CreatedStudent>('/api/students', payload);
        toast.success('Student created', 'Share the generated credentials with the student.');
        setIssued({
          name: values.name.trim(),
          role: 'STUDENT',
          email: created.credentials.email,
          temporaryPassword: created.credentials.temporaryPassword,
        });
      }
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
            : 'Create a student account and hand over the generated sign-in details.'
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
              : 'The student signs in with the generated email address and temporary password.'}
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
                <Label htmlFor="email">Email address</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder="Leave blank to generate"
                  aria-invalid={Boolean(form.formState.errors.email)}
                  {...form.register('email')}
                />
                {form.formState.errors.email ? (
                  <p className="text-xs font-medium text-destructive">
                    {form.formState.errors.email.message}
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    {isEdit
                      ? 'The email address is the sign-in identity.'
                      : '@students.attendease.edu is used when this is left blank.'}
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
                {isEdit
                  ? 'Passwords are stored as salted hashes. Use the key action on the students list to issue a new password.'
                  : 'The temporary password is generated for you and shown once after the account is created. Only an administrator can create accounts or issue new passwords.'}
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

      <CredentialsDialog
        credentials={issued}
        onClose={() => {
          setIssued(null);
          navigate('/admin/students');
        }}
      />
    </div>
  );
}
