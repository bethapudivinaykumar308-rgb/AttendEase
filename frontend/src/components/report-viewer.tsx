import { Download, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import type { ReportResult } from '@/types';

interface ReportViewerProps {
  report: ReportResult | null;
  isLoading?: boolean;
  onExportCsv?: () => void;
  onPrint?: () => void;
  emptyMessage?: string;
}

export function ReportViewer({
  report,
  isLoading,
  onExportCsv,
  onPrint,
  emptyMessage = 'No data matches the selected filters.',
}: ReportViewerProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Preparing report</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {Array.from({ length: 8 }).map((_, index) => (
            <div key={index} className="h-8 w-full animate-pulse rounded bg-muted" />
          ))}
        </CardContent>
      </Card>
    );
  }

  if (!report) {
    return (
      <Card>
        <CardContent className="py-14 text-center">
          <p className="text-sm text-muted-foreground">{emptyMessage}</p>
        </CardContent>
      </Card>
    );
  }

  const summaryEntries = Object.entries(report.summary ?? {});

  return (
    <div className="space-y-4">
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-foreground">{report.title}</h2>
          <p className="text-xs text-muted-foreground">
            {report.rows.length} row{report.rows.length === 1 ? '' : 's'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {onPrint && (
            <Button variant="outline" size="sm" onClick={onPrint}>
              <Printer className="h-3.5 w-3.5" />
              Print
            </Button>
          )}
          {onExportCsv && (
            <Button variant="outline" size="sm" onClick={onExportCsv}>
              <Download className="h-3.5 w-3.5" />
              Export CSV
            </Button>
          )}
        </div>
      </div>

      {summaryEntries.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {summaryEntries.map(([key, value]) => (
            <div key={key} className="rounded-lg border border-border bg-card px-4 py-3">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                {key.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase())}
              </p>
              <p className="mt-1 text-lg font-semibold text-foreground">{String(value)}</p>
            </div>
          ))}
        </div>
      )}

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        {report.rows.length === 0 ? (
          <p className="px-4 py-12 text-center text-sm text-muted-foreground">{emptyMessage}</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50 hover:bg-muted/50">
                  {report.columns.map((column) => (
                    <TableHead
                      key={column.key}
                      className={cn(
                        column.align === 'right' && 'text-right',
                        column.align === 'center' && 'text-center',
                      )}
                    >
                      {column.label}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.rows.map((row, index) => (
                  <TableRow key={index}>
                    {report.columns.map((column) => (
                      <TableCell
                        key={column.key}
                        className={cn(
                          'whitespace-nowrap',
                          column.align === 'right' && 'text-right',
                          column.align === 'center' && 'text-center',
                        )}
                      >
                        {row[column.key] === null || row[column.key] === undefined
                          ? '—'
                          : String(row[column.key])}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}
