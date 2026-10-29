import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  AlertCircle,
  BadgeCheck,
  Building2,
  CalendarDays,
  KeyRound,
  Layers,
  Mail,
  Save,
  UserRound,
  Users,
} from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { PercentageDisplay } from '@/components/attendance-display';
import { ErrorState, LoadingState } from '@/components/states';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { api, ApiError } from '@/lib/api';
import { roleLabel } from '@/lib/navigation';
import { initials } from '@/lib/utils';
import type { Student } from '@/types';

const profileSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'Name must be at least 2 characters')
    .max(120, 'Name must be 120 characters or fewer'),
});

type ProfileValues = z.infer<typeof profileSchema>;

const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Current password is required'),
    password: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .regex(/[a-z]/, 'Password must contain a lowercase letter')
      .regex(/[A-Z]/, 'Password must contain an uppercase letter')
      .regex(/[0-9]/, 'Password must contain a number'),
    confirmPassword: z.string().min(1, 'Please confirm your new password'),
  })
  .refine((values) => values.password === values.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

type PasswordValues = z.infer<typeof passwordSchema>;

export default function StudentProfilePage() {
  const { user, refresh } = useAuth();
  const { toast } = useToast();

  const studentId = user?.student?.id ?? null;
  const [profileError, setProfileError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const studentQuery = useQuery({
    queryKey: ['student-record', studentId],
    queryFn: () => api.get<Student>(`/api/students/${studentId}`),
    enabled: Boolean(studentId),
  });

  const profileForm = useForm<ProfileValues>({
    resolver: zodResolver(profileSchema),
    values: { name: user?.name ?? '' },
    defaultValues: { name: user?.name ?? '' },
  });

  const passwordForm = useForm<PasswordValues>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { currentPassword: '', password: '', confirmPassword: '' },
  });

  const student = studentQuery.data;
  const profile = student?.user ?? null;
  const department = student?.department ?? user?.student?.department ?? null;
  const semester = student?.semester ?? user?.student?.semester ?? null;
  const rollNumber = student?.rollNumber ?? user?.student?.rollNumber ?? '—';
  const section = student?.section ?? user?.student?.section ?? '—';
  const admissionYear = student?.admissionYear ?? user?.student?.admissionYear ?? null;

  const onProfileSubmit = async (values: ProfileValues) => {
    setProfileError(null);
    try {
      await api.put('/api/auth/profile', { name: values.name.trim() });
      await refresh();
      toast.success('Profile updated', 'Your display name has been changed.');
    } catch (error) {
      const message =
        error instanceof ApiError ? error.message : 'Unable to reach the server. Please try again.';
      setProfileError(message);
      toast.error('Update failed', message);
    }
  };

  const onPasswordSubmit = async (values: PasswordValues) => {
    setPasswordError(null);
    try {
      await api.put('/api/auth/password', {
        currentPassword: values.currentPassword,
        password: values.password,
      });
      passwordForm.reset();
      toast.success('Password updated', 'Use your new password the next time you sign in.');
    } catch (error) {
      const message =
        error instanceof ApiError ? error.message : 'Unable to reach the server. Please try again.';
      setPasswordError(message);
      toast.error('Password change failed', message);
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="My Profile"
        description="Your account details and the credentials you use to sign in."
        breadcrumbs={[
          { label: 'Student', to: '/student' },
          { label: 'Profile' },
        ]}
      />

      {studentQuery.isError ? (
        <ErrorState
          title="Could not load your profile"
          message={
            studentQuery.error instanceof ApiError
              ? studentQuery.error.message
              : 'Something went wrong while contacting the server.'
          }
          onRetry={() => void studentQuery.refetch()}
        />
      ) : studentQuery.isLoading ? (
        <LoadingState label="Loading your profile…" />
      ) : (
        <>
          <Card>
            <CardContent className="p-6">
              <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
                <Avatar className="h-16 w-16">
                  <AvatarFallback className="h-16 w-16 text-lg">
                    {initials(user?.name ?? 'Student')}
                  </AvatarFallback>
                </Avatar>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-lg font-semibold text-foreground">
                      {profile?.name ?? user?.name ?? 'Student'}
                    </h2>
                    <Badge variant="secondary">{roleLabel[user?.role ?? 'STUDENT']}</Badge>
                    {profile?.isActive === false && <Badge variant="destructive">Inactive</Badge>}
                  </div>
                  <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
                    <Mail className="h-4 w-4" aria-hidden="true" />
                    {profile?.email ?? user?.email ?? '—'}
                  </p>

                  <dl className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <div className="rounded-lg border border-border px-3 py-2.5">
                      <dt className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground">
                        <BadgeCheck className="h-3.5 w-3.5" aria-hidden="true" />
                        Roll number
                      </dt>
                      <dd className="mt-1 text-sm font-semibold text-foreground">{rollNumber}</dd>
                    </div>
                    <div className="rounded-lg border border-border px-3 py-2.5">
                      <dt className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground">
                        <Building2 className="h-3.5 w-3.5" aria-hidden="true" />
                        Department
                      </dt>
                      <dd className="mt-1 text-sm font-semibold text-foreground">
                        {department?.departmentName ?? '—'}
                        {department?.departmentCode ? (
                          <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                            {department.departmentCode}
                          </span>
                        ) : null}
                      </dd>
                    </div>
                    <div className="rounded-lg border border-border px-3 py-2.5">
                      <dt className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground">
                        <Layers className="h-3.5 w-3.5" aria-hidden="true" />
                        Semester
                      </dt>
                      <dd className="mt-1 text-sm font-semibold text-foreground">
                        {semester ? `Semester ${semester.semesterNumber}` : '—'}
                        {semester?.academicYear?.yearName ? (
                          <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                            {semester.academicYear.yearName}
                          </span>
                        ) : null}
                      </dd>
                    </div>
                    <div className="rounded-lg border border-border px-3 py-2.5">
                      <dt className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground">
                        <Users className="h-3.5 w-3.5" aria-hidden="true" />
                        Section
                      </dt>
                      <dd className="mt-1 text-sm font-semibold text-foreground">{section}</dd>
                    </div>
                    <div className="rounded-lg border border-border px-3 py-2.5">
                      <dt className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground">
                        <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
                        Admission year
                      </dt>
                      <dd className="mt-1 text-sm font-semibold text-foreground">
                        {admissionYear ?? '—'}
                      </dd>
                    </div>
                    <div className="rounded-lg border border-border px-3 py-2.5">
                      <dt className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground">
                        <UserRound className="h-3.5 w-3.5" aria-hidden="true" />
                        Role
                      </dt>
                      <dd className="mt-1 text-sm font-semibold text-foreground">
                        {roleLabel[user?.role ?? 'STUDENT']}
                      </dd>
                    </div>
                  </dl>

                  {student?.summary && student.summary.total > 0 && (
                    <div className="mt-5 rounded-lg border border-border bg-muted/40 px-4 py-3">
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Overall attendance
                      </p>
                      <div className="mt-2 flex items-center gap-4">
                        <PercentageDisplay value={student.summary.percentage} />
                        <p className="text-sm text-muted-foreground">
                          {student.summary.attended} of {student.summary.total} classes attended
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-5 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Update profile</CardTitle>
                <CardDescription>
                  Change the name shown across AttendEase. Your roll number and section are managed
                  by your administrator.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form
                  className="space-y-4"
                  onSubmit={profileForm.handleSubmit(onProfileSubmit)}
                  noValidate
                >
                  {profileError && (
                    <div
                      role="alert"
                      className="flex items-start gap-2.5 rounded-md border border-destructive/25 bg-destructive-soft px-3 py-2.5 text-sm text-destructive"
                    >
                      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                      <span>{profileError}</span>
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <Label htmlFor="profile-name">Full name</Label>
                    <Input
                      id="profile-name"
                      autoComplete="name"
                      aria-invalid={Boolean(profileForm.formState.errors.name)}
                      {...profileForm.register('name')}
                    />
                    {profileForm.formState.errors.name && (
                      <p className="text-xs font-medium text-destructive">
                        {profileForm.formState.errors.name.message}
                      </p>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="profile-email">Email address</Label>
                    <Input id="profile-email" value={profile?.email ?? user?.email ?? ''} disabled />
                    <p className="text-xs text-muted-foreground">
                      Your email address is used to sign in and cannot be changed here.
                    </p>
                  </div>

                  <Button
                    type="submit"
                    isLoading={profileForm.formState.isSubmitting}
                    disabled={profileForm.formState.isSubmitting}
                  >
                    <Save className="h-4 w-4" />
                    Save changes
                  </Button>
                </form>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Change password</CardTitle>
                <CardDescription>
                  Use at least 8 characters with an uppercase letter, a lowercase letter and a
                  number.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form
                  className="space-y-4"
                  onSubmit={passwordForm.handleSubmit(onPasswordSubmit)}
                  noValidate
                >
                  {passwordError && (
                    <div
                      role="alert"
                      className="flex items-start gap-2.5 rounded-md border border-destructive/25 bg-destructive-soft px-3 py-2.5 text-sm text-destructive"
                    >
                      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                      <span>{passwordError}</span>
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <Label htmlFor="current-password">Current password</Label>
                    <Input
                      id="current-password"
                      type="password"
                      autoComplete="current-password"
                      aria-invalid={Boolean(passwordForm.formState.errors.currentPassword)}
                      {...passwordForm.register('currentPassword')}
                    />
                    {passwordForm.formState.errors.currentPassword && (
                      <p className="text-xs font-medium text-destructive">
                        {passwordForm.formState.errors.currentPassword.message}
                      </p>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="new-password">New password</Label>
                    <Input
                      id="new-password"
                      type="password"
                      autoComplete="new-password"
                      aria-invalid={Boolean(passwordForm.formState.errors.password)}
                      {...passwordForm.register('password')}
                    />
                    {passwordForm.formState.errors.password && (
                      <p className="text-xs font-medium text-destructive">
                        {passwordForm.formState.errors.password.message}
                      </p>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="confirm-password">Confirm new password</Label>
                    <Input
                      id="confirm-password"
                      type="password"
                      autoComplete="new-password"
                      aria-invalid={Boolean(passwordForm.formState.errors.confirmPassword)}
                      {...passwordForm.register('confirmPassword')}
                    />
                    {passwordForm.formState.errors.confirmPassword && (
                      <p className="text-xs font-medium text-destructive">
                        {passwordForm.formState.errors.confirmPassword.message}
                      </p>
                    )}
                  </div>

                  <Button
                    type="submit"
                    isLoading={passwordForm.formState.isSubmitting}
                    disabled={passwordForm.formState.isSubmitting}
                  >
                    <KeyRound className="h-4 w-4" />
                    Update password
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
