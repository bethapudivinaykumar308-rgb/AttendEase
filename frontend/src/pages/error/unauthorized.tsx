import { Link } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { roleHome } from '@/lib/navigation';
import { Button } from '@/components/ui/button';

export default function UnauthorizedPage() {
  const { user } = useAuth();
  const home = user ? roleHome[user.role] : '/login';

  return (
    <div className="grid min-h-screen place-items-center bg-muted px-4">
      <div className="w-full max-w-md rounded-xl border border-border bg-background p-8 text-center shadow-card">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-warning-soft text-warning">
          <ShieldAlert className="h-6 w-6" aria-hidden="true" />
        </span>
        <h1 className="mt-5 text-lg font-semibold tracking-tight text-foreground">Access denied</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Your account does not have permission to view this page. Contact an administrator if you
          believe this is a mistake.
        </p>
        <div className="mt-6 flex justify-center gap-2">
          <Button asChild>
            <Link to={home}>Back to dashboard</Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/login">Switch account</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
