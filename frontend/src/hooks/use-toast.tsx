import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

export type ToastVariant = 'success' | 'error' | 'warning' | 'info';

interface Toast {
  id: number;
  title: string;
  description?: string;
  variant: ToastVariant;
}

export interface ToastInput {
  title: string;
  description?: string;
  variant?: ToastVariant;
}

export interface ToastApi {
  (input: ToastInput): void;
  success: (title: string, description?: string) => void;
  error: (title: string, description?: string) => void;
  warning: (title: string, description?: string) => void;
  info: (title: string, description?: string) => void;
}

export interface ToastContextValue {
  toast: ToastApi;
  success: (title: string, description?: string) => void;
  error: (title: string, description?: string) => void;
  warning: (title: string, description?: string) => void;
  info: (title: string, description?: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const variantStyles: Record<ToastVariant, { icon: typeof Info; container: string; iconColor: string }> = {
  success: { icon: CheckCircle2, container: 'border-success/30 bg-success-soft', iconColor: 'text-success' },
  error: { icon: XCircle, container: 'border-destructive/30 bg-destructive-soft', iconColor: 'text-destructive' },
  warning: { icon: AlertTriangle, container: 'border-warning/30 bg-warning-soft', iconColor: 'text-warning' },
  info: { icon: Info, container: 'border-primary/30 bg-primary-soft', iconColor: 'text-primary' },
};

let counter = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((item) => item.id !== id));
  }, []);

  const toast = useCallback(
    ({ title, description, variant = 'info' }: ToastInput) => {
      counter += 1;
      const id = counter;
      setToasts((current) => [...current, { id, title, description, variant }]);
      window.setTimeout(() => dismiss(id), 5000);
    },
    [dismiss],
  );

  const toastApi = useMemo(() => {
    const api = ((input: ToastInput) => toast(input)) as ToastApi;
    api.success = (title, description) => toast({ title, description, variant: 'success' });
    api.error = (title, description) => toast({ title, description, variant: 'error' });
    api.warning = (title, description) => toast({ title, description, variant: 'warning' });
    api.info = (title, description) => toast({ title, description, variant: 'info' });
    return api;
  }, [toast]);

  const value = useMemo<ToastContextValue>(
    () => ({
      toast: toastApi,
      success: toastApi.success,
      error: toastApi.error,
      warning: toastApi.warning,
      info: toastApi.info,
    }),
    [toastApi],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-full max-w-sm flex-col gap-2">
        {toasts.map((item) => {
          const { icon: Icon, container, iconColor } = variantStyles[item.variant];
          return (
            <div
              key={item.id}
              role="status"
              className={cn(
                'pointer-events-auto flex items-start gap-3 rounded-lg border p-3 shadow-card-hover animate-slide-up',
                container,
              )}
            >
              <Icon className={cn('mt-0.5 h-5 w-5 shrink-0', iconColor)} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-foreground">{item.title}</p>
                {item.description ? (
                  <p className="mt-0.5 text-sm text-muted-foreground break-words">{item.description}</p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => dismiss(item.id)}
                className="rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground"
                aria-label="Dismiss notification"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used within a ToastProvider');
  return context;
}
