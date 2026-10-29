import { CalendarCheck } from 'lucide-react';
import { cn } from '@/lib/utils';

interface LogoProps {
  /** `light` renders for the dark sidebar, `dark` renders for light surfaces. */
  tone?: 'light' | 'dark';
  compact?: boolean;
  className?: string;
}

export function Logo({ tone = 'dark', compact = false, className }: LogoProps) {
  const isLight = tone === 'light';

  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <span
        className={cn(
          'grid h-9 w-9 shrink-0 place-items-center rounded-lg',
          isLight ? 'bg-primary text-primary-foreground' : 'bg-primary-soft text-primary',
        )}
      >
        <CalendarCheck className="h-5 w-5" aria-hidden="true" />
      </span>
      {!compact && (
        <span className="flex min-w-0 flex-col leading-none">
          <span
            className={cn(
              'truncate text-[15px] font-semibold tracking-tight',
              isLight ? 'text-white' : 'text-foreground',
            )}
          >
            AttendEase
          </span>
          <span
            className={cn(
              'mt-1 truncate text-[11px] font-medium',
              isLight ? 'text-sidebar-muted' : 'text-muted-foreground',
            )}
          >
            Student Attendance
          </span>
        </span>
      )}
    </div>
  );
}
