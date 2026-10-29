import { Copy, Mail, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';

export interface IssuedCredentials {
  name: string;
  role: 'STUDENT' | 'FACULTY';
  email: string;
  temporaryPassword: string;
}

interface CredentialsDialogProps {
  credentials: IssuedCredentials | null;
  onClose: () => void;
}

/**
 * Shown once, right after the administrator creates an account or issues a new
 * password. The password is never retrievable again.
 */
export function CredentialsDialog({ credentials, onClose }: CredentialsDialogProps) {
  const { toast } = useToast();

  async function copy(label: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      toast.success('Copied', `${label} copied to the clipboard.`);
    } catch {
      toast.error('Copy failed', 'Select the value and copy it manually.');
    }
  }

  const mailto = credentials
    ? `mailto:${encodeURIComponent(credentials.email)}?subject=${encodeURIComponent(
        'Your AttendEase sign-in details',
      )}&body=${encodeURIComponent(
        `Hello ${credentials.name},\n\nYour AttendEase account has been created.\n\nEmail: ${credentials.email}\nTemporary password: ${credentials.temporaryPassword}\n\nSign in and change the password after your first login.\n`,
      )}`
    : '#';

  return (
    <Dialog open={Boolean(credentials)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        {credentials && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-primary" />
                Sign-in credentials issued
              </DialogTitle>
              <DialogDescription>
                Hand these details to {credentials.name}. The password is shown only once and is
                not stored anywhere in readable form.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3">
              <div className="rounded-md border border-border bg-muted/40 px-3 py-2.5">
                <p className="text-xs font-medium text-muted-foreground">Email</p>
                <div className="mt-1 flex items-center gap-2">
                  <code className="min-w-0 flex-1 break-all font-mono text-sm">
                    {credentials.email}
                  </code>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon-sm"
                    aria-label="Copy email"
                    onClick={() => void copy('Email', credentials.email)}
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>

              <div className="rounded-md border border-border bg-muted/40 px-3 py-2.5">
                <p className="text-xs font-medium text-muted-foreground">Temporary password</p>
                <div className="mt-1 flex items-center gap-2">
                  <code className="min-w-0 flex-1 break-all font-mono text-sm">
                    {credentials.temporaryPassword}
                  </code>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon-sm"
                    aria-label="Copy password"
                    onClick={() => void copy('Password', credentials.temporaryPassword)}
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>

              <p className="text-xs text-muted-foreground">
                Ask the {credentials.role === 'STUDENT' ? 'student' : 'faculty member'} to change
                this password from their profile after signing in.
              </p>
            </div>

            <DialogFooter className="sm:justify-between">
              <Button variant="outline" asChild>
                <a href={mailto}>
                  <Mail className="h-4 w-4" />
                  Email details
                </a>
              </Button>
              <Button
                onClick={() => void copy('Credentials', `Email: ${credentials.email}\nPassword: ${credentials.temporaryPassword}`)}
                variant="outline"
              >
                <Copy className="h-4 w-4" />
                Copy both
              </Button>
              <Button onClick={onClose}>Done</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
