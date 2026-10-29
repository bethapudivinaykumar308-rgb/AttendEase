import { Link } from 'react-router-dom';
import { Compass } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { roleHome } from '@/lib/navigation';
import { Button } from '@/components/ui/button';

export default function NotFoundPage() {
  const { user } = useAuth();
  const home = user ? roleHome[user.role] : '/login';

  return (
    <div className="grid min-h-screen place-items-center bg-muted px-4">
      <div className="w-full max-w-md rounded-xl border border-border bg-background p-8 text-center shadow-card">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-primary-soft text-primary">
          <Compass className="h-6 w-6" aria-hidden="true" />
        </span>
        <p className="mt-5 text-[13px] font-semibold uppercase tracking-wider text-primary">404</p>
        <h1 className="mt-1 text-lg font-semibold tracking-tight text-foreground">Page not found</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you are looking for does not exist or has been moved.
        </p>
        <Button asChild className="mt-6">
          <Link to={home}>Go to your dashboard</Link>
        </Button>
      </div>
    </div>
  );
}
