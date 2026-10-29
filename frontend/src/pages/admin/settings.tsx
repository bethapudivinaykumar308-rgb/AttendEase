import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Activity, Database, Lock, Server, ShieldCheck, UserCog } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { formatDateTime } from '@/lib/utils';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';

const profileSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(120),
});

const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Current password is required'),
    password: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .regex(/[a-z]/, 'Include a lowercase letter')
      .regex(/[A-Z]/, 'Include an uppercase letter')
      .regex(/[0-9]/, 'Include a number'),
    confirmPassword: z.string().min(1, 'Confirm the new password'),
  })
  .refine((values) => values.password === values.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

interface HealthData {
  status: string;
  database: string;
  uptime: number;
  timestamp: string;
}

export default function AdminSettingsPage() {
  const { user, refresh } = useAuth();
  const { toast } = useToast();

  const health = useQuery({
    queryKey: ['health'],
    queryFn: () => api.get<HealthData>('/api/health'),
    refetchInterval: 30_000,
  });

  const profileForm = useForm<z.infer<typeof profileSchema>>({
    resolver: zodResolver(profileSchema),
    defaultValues: { name: user?.name ?? '' },
  });

  const profileMutation = useMutation({
    mutationFn: (values: z.infer<typeof profileSchema>) => api.put('/api/auth/profile', values),
    onSuccess: async () => {
      toast.success('Profile updated', 'Your display name has been saved.');
      await refresh();
    },
    onError: (error: unknown) => {
      toast.error(
        'Update failed',
        error instanceof ApiError ? error.message : 'Please try again.',
      );
    },
  });

  const passwordForm = useForm<z.infer<typeof passwordSchema>>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { currentPassword: '', password: '', confirmPassword: '' },
  });

  const passwordMutation = useMutation({
    mutationFn: (values: z.infer<typeof passwordSchema>) =>
      api.put('/api/auth/password', {
        currentPassword: values.currentPassword,
        password: values.password,
      }),
    onSuccess: () => {
      toast.success('Password updated', 'Use the new password the next time you sign in.');
      passwordForm.reset();
    },
    onError: (error: unknown) => {
      toast.error(
        'Password change failed',
        error instanceof ApiError ? error.message : 'Please try again.',
      );
    },
  });

  const healthData = health.data;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Settings"
        description="System status, your account and the attendance policy applied to every calculation."
        breadcrumbs={[{ label: 'Admin', to: '/admin' }, { label: 'Settings' }]}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Server className="h-4 w-4 text-primary" />
              System status
            </CardTitle>
            <CardDescription>Live health check against the API and MySQL connection.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between rounded-md border border-border px-3 py-2.5">
              <span className="flex items-center gap-2 text-sm text-foreground">
                <Activity className="h-4 w-4 text-muted-foreground" />
                API service
              </span>
              <Badge
                variant="outline"
                className={
                  healthData?.status === 'ok'
                    ? 'border-success/25 bg-success-soft text-success'
                    : 'border-destructive/25 bg-destructive-soft text-destructive'
                }
              >
                {healthData?.status ?? (health.isError ? 'unreachable' : 'checking…')}
              </Badge>
            </div>
            <div className="flex items-center justify-between rounded-md border border-border px-3 py-2.5">
              <span className="flex items-center gap-2 text-sm text-foreground">
                <Database className="h-4 w-4 text-muted-foreground" />
                MySQL database
              </span>
              <Badge
                variant="outline"
                className={
                  healthData?.database === 'connected'
                    ? 'border-success/25 bg-success-soft text-success'
                    : 'border-destructive/25 bg-destructive-soft text-destructive'
                }
              >
                {healthData?.database ?? 'checking…'}
              </Badge>
            </div>
            <div className="flex items-center justify-between rounded-md border border-border px-3 py-2.5">
              <span className="text-sm text-foreground">Uptime</span>
              <span className="text-sm tabular-nums text-muted-foreground">
                {healthData ? `${Math.floor(healthData.uptime / 60)} min` : '—'}
              </span>
            </div>
            <div className="flex items-center justify-between rounded-md border border-border px-3 py-2.5">
              <span className="text-sm text-foreground">Last checked</span>
              <span className="text-sm text-muted-foreground">
                {healthData ? formatDateTime(healthData.timestamp) : '—'}
              </span>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void health.refetch()}
              isLoading={health.isFetching}
            >
              Refresh status
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldCheck className="h-4 w-4 text-primary" />
              Attendance policy
            </CardTitle>
            <CardDescription>
              Rules applied to every percentage calculation in the system. Configured through
              environment variables on the server.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-center justify-between rounded-md border border-border px-3 py-2.5">
              <span className="text-foreground">Required attendance</span>
              <Badge variant="outline" className="border-primary/25 bg-primary-soft text-primary">
                75%
              </Badge>
            </div>
            <Separator />
            <div>
              <p className="font-medium text-foreground">Counted as attended</p>
              <ul className="mt-1.5 space-y-1 text-muted-foreground">
                <li>• PRESENT — counts towards attendance</li>
                <li>• LATE — counts towards attendance</li>
                <li>• ABSENT — does not count</li>
                <li>• ON_LEAVE — does not count by default</li>
              </ul>
            </div>
            <Separator />
            <div>
              <p className="font-medium text-foreground">Excluded from the denominator</p>
              <ul className="mt-1.5 space-y-1 text-muted-foreground">
                <li>• Cancelled sessions</li>
                <li>• Sessions scheduled in the future</li>
              </ul>
            </div>
            <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
              Percentage = (classes attended ÷ eligible classes conducted) × 100, rounded to two
              decimal places.
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <UserCog className="h-4 w-4 text-primary" />
              Your account
            </CardTitle>
            <CardDescription>
              {user?.email} · {user?.role}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              className="space-y-4"
              onSubmit={profileForm.handleSubmit((values) => profileMutation.mutate(values))}
              noValidate
            >
              <div className="space-y-1.5">
                <Label htmlFor="settings-name">Display name</Label>
                <Input id="settings-name" {...profileForm.register('name')} />
                {profileForm.formState.errors.name && (
                  <p className="text-xs font-medium text-destructive">
                    {profileForm.formState.errors.name.message}
                  </p>
                )}
              </div>
              <Button type="submit" isLoading={profileMutation.isPending}>
                Save name
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Lock className="h-4 w-4 text-primary" />
              Change your password
            </CardTitle>
            <CardDescription>
              Use at least 8 characters with an uppercase letter, a lowercase letter and a number.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              className="space-y-4"
              onSubmit={passwordForm.handleSubmit((values) => passwordMutation.mutate(values))}
              noValidate
            >
              <div className="space-y-1.5">
                <Label htmlFor="currentPassword">Current password</Label>
                <Input
                  id="currentPassword"
                  type="password"
                  autoComplete="current-password"
                  {...passwordForm.register('currentPassword')}
                />
                {passwordForm.formState.errors.currentPassword && (
                  <p className="text-xs font-medium text-destructive">
                    {passwordForm.formState.errors.currentPassword.message}
                  </p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="newPassword">New password</Label>
                <Input
                  id="newPassword"
                  type="password"
                  autoComplete="new-password"
                  {...passwordForm.register('password')}
                />
                {passwordForm.formState.errors.password && (
                  <p className="text-xs font-medium text-destructive">
                    {passwordForm.formState.errors.password.message}
                  </p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="confirmPassword">Confirm new password</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  {...passwordForm.register('confirmPassword')}
                />
                {passwordForm.formState.errors.confirmPassword && (
                  <p className="text-xs font-medium text-destructive">
                    {passwordForm.formState.errors.confirmPassword.message}
                  </p>
                )}
              </div>
              <Button type="submit" isLoading={passwordMutation.isPending}>
                Update password
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
