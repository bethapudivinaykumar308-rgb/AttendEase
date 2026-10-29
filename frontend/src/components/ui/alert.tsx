import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

const alertVariants = cva('relative flex w-full gap-3 rounded-lg border p-4 text-sm', {
  variants: {
    variant: {
      info: 'border-primary/25 bg-primary-soft text-foreground',
      success: 'border-success/25 bg-success-soft text-foreground',
      warning: 'border-warning/30 bg-warning-soft text-foreground',
      destructive: 'border-destructive/25 bg-destructive-soft text-foreground',
    },
  },
  defaultVariants: { variant: 'info' },
});

const icons = {
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  destructive: XCircle,
};

const iconColors = {
  info: 'text-primary',
  success: 'text-success',
  warning: 'text-warning',
  destructive: 'text-destructive',
};

export interface AlertProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof alertVariants> {
  title?: string;
}

const Alert = React.forwardRef<HTMLDivElement, AlertProps>(
  ({ className, variant = 'info', title, children, ...props }, ref) => {
    const Icon = icons[variant ?? 'info'];
    return (
      <div ref={ref} className={cn(alertVariants({ variant }), className)} {...props}>
        <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', iconColors[variant ?? 'info'])} />
        <div className="min-w-0 flex-1">
          {title ? <p className="mb-1 font-semibold">{title}</p> : null}
          <div className="text-muted-foreground [&_p]:leading-relaxed">{children}</div>
        </div>
      </div>
    );
  },
);
Alert.displayName = 'Alert';

export { Alert, alertVariants };
