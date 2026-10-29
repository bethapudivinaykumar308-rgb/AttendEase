import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export const CHART_COLORS = {
  primary: '#2563eb',
  success: '#16a34a',
  destructive: '#dc2626',
  warning: '#ea580c',
  info: '#2563eb',
  muted: '#94a3b8',
  grid: '#e4e9f0',
  axis: '#64748b',
} as const;

export const CHART_SERIES = [
  { key: 'present', label: 'Present', color: CHART_COLORS.success },
  { key: 'absent', label: 'Absent', color: CHART_COLORS.destructive },
  { key: 'late', label: 'Late', color: CHART_COLORS.warning },
  { key: 'onLeave', label: 'On leave', color: CHART_COLORS.info },
] as const;

export const chartAxisProps = {
  stroke: CHART_COLORS.axis,
  fontSize: 11,
  tickLine: false,
  axisLine: false,
} as const;

export const chartGridProps = {
  stroke: CHART_COLORS.grid,
  strokeDasharray: '3 3',
  vertical: false,
} as const;

interface ChartCardProps {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}

export function ChartCard({
  title,
  description,
  action,
  children,
  className,
  bodyClassName,
}: ChartCardProps) {
  return (
    <div className={cn('rounded-lg border border-border bg-card', className)}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-5 py-3.5">
        <div>
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
        </div>
        {action}
      </div>
      <div className={cn('p-5', bodyClassName)}>{children}</div>
    </div>
  );
}

export function ChartLegend({ items }: { items: ReadonlyArray<{ label: string; color: string }> }) {
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: item.color }} />
          {item.label}
        </li>
      ))}
    </ul>
  );
}
