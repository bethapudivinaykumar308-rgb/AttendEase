import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { cn, percentageTone } from '@/lib/utils';
import type { AttendanceStatus } from '@/types';

const statusConfig: Record<AttendanceStatus, { label: string; className: string; dot: string }> = {
  PRESENT: {
    label: 'Present',
    className: 'border-success/25 bg-success-soft text-success',
    dot: 'bg-success',
  },
  ABSENT: {
    label: 'Absent',
    className: 'border-destructive/25 bg-destructive-soft text-destructive',
    dot: 'bg-destructive',
  },
  LATE: {
    label: 'Late',
    className: 'border-warning/25 bg-warning-soft text-warning',
    dot: 'bg-warning',
  },
  ON_LEAVE: {
    label: 'On Leave',
    className: 'border-info/25 bg-info-soft text-info',
    dot: 'bg-info',
  },
};

export function AttendanceBadge({
  status,
  className,
}: {
  status: AttendanceStatus | null | undefined;
  className?: string;
}) {
  if (!status) {
    return (
      <Badge variant="outline" className={cn('text-muted-foreground', className)}>
        Not marked
      </Badge>
    );
  }
  const config = statusConfig[status];
  return (
    <Badge variant="outline" className={cn(config.className, className)}>
      <span className={cn('h-1.5 w-1.5 rounded-full', config.dot)} />
      {config.label}
    </Badge>
  );
}

export function PercentageDisplay({
  value,
  threshold = 75,
  showBar = true,
  className,
}: {
  value: number;
  threshold?: number;
  showBar?: boolean;
  className?: string;
}) {
  const tone = percentageTone(value, threshold);
  const indicator =
    tone === 'success' ? 'bg-success' : tone === 'warning' ? 'bg-warning' : 'bg-destructive';

  return (
    <div className={cn('min-w-[110px]', className)}>
      <div className="flex items-center justify-between gap-2">
        <span
          className={cn(
            'text-sm font-semibold tabular-nums',
            tone === 'success' && 'text-success',
            tone === 'warning' && 'text-warning',
            tone === 'danger' && 'text-destructive',
          )}
        >
          {value.toFixed(1)}%
        </span>
      </div>
      {showBar && (
        <Progress
          value={Math.min(Math.max(value, 0), 100)}
          className="mt-1 h-1.5"
          indicatorClassName={indicator}
        />
      )}
    </div>
  );
}
