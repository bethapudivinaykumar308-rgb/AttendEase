import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { CheckCircle2, Copy, Mail } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AuthShell } from './auth-shell';

const forgotSchema = z.object({
  email: z.string().trim().min(1, 'Email is required').email('Enter a valid email address'),
});

type ForgotValues = z.infer<typeof forgotSchema>;

interface ForgotResponse {
  message: string;
  resetToken?: string;
}

export default function ForgotPasswordPage() {
  const { toast } = useToast();
  const [issuedToken, setIssuedToken] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotValues>({
    resolver: zodResolver(forgotSchema),
    defaultValues: { email: '' },
  });

  const onSubmit = async (values: ForgotValues) => {
    try {
      const result = await api.post<ForgotResponse>('/api/auth/forgot-password', { email: values.email });
      setMessage(result.message);
      setIssuedToken(result.resetToken ?? null);
      toast.success('Request received', result.message);
    } catch (error) {
      toast.error(
        'Request failed',
        error instanceof ApiError ? error.message : 'Unable to reach the server. Please try again.',
      );
    }
  };

  return (
    <AuthShell
      title="Forgot your password?"
      description="Enter the email address registered with your account and we will send you reset instructions."
      footer={
        <Link
          to="/login"
          className="text-xs font-medium text-muted-foreground transition-colors hover:text-primary"
        >
          Back to sign in
        </Link>
      }
    >
      {issuedToken ? (
        <div className="space-y-4">
          <div className="flex items-start gap-2.5 rounded-md border border-success/25 bg-success-soft px-3 py-2.5 text-sm text-success">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{message}</span>
          </div>
          <div className="rounded-md border border-border bg-muted px-3 py-3">
            <p className="text-xs font-medium text-muted-foreground">
              Development reset token (not shown in production)
            </p>
            <div className="mt-2 flex items-center gap-2">
              <code className="min-w-0 flex-1 break-all rounded bg-background px-2 py-1.5 font-mono text-[11px] text-foreground">
                {issuedToken}
              </code>
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                onClick={() => {
                  void navigator.clipboard?.writeText(issuedToken);
                  toast.success('Copied', 'Reset token copied to clipboard.');
                }}
                aria-label="Copy reset token"
              >
                <Copy className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
          <Button asChild className="w-full">
            <Link to={`/reset-password?token=${encodeURIComponent(issuedToken)}`}>Continue to reset</Link>
          </Button>
        </div>
      ) : (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          {message && (
            <div className="flex items-start gap-2.5 rounded-md border border-success/25 bg-success-soft px-3 py-2.5 text-sm text-success">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{message}</span>
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="email">Email address</Label>
            <div className="relative">
              <Mail
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="you@college.edu"
                className="pl-9"
                aria-invalid={Boolean(errors.email)}
                {...register('email')}
              />
            </div>
            {errors.email && (
              <p className="text-xs font-medium text-destructive">{errors.email.message}</p>
            )}
          </div>
          <Button type="submit" className="w-full" isLoading={isSubmitting} disabled={isSubmitting}>
            {isSubmitting ? 'Sending…' : 'Send reset link'}
          </Button>
        </form>
      )}
    </AuthShell>
  );
}
