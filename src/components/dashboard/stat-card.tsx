import type { LucideIcon } from 'lucide-react';
import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export function StatCard({
  label, value, icon: Icon, hint, trend, tone = 'default',
}: {
  label: string;
  value: string;
  icon: LucideIcon;
  hint?: string;
  trend?: { value: number; label?: string };
  tone?: 'default' | 'success' | 'warning' | 'destructive';
}) {
  const toneClass = {
    default: 'bg-primary/10 text-primary',
    success: 'bg-success/10 text-success',
    warning: 'bg-warning/15 text-warning',
    destructive: 'bg-destructive/10 text-destructive',
  }[tone];

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-muted-foreground">{label}</p>
          <p className="mt-1.5 truncate text-2xl font-semibold tracking-tight tabular">{value}</p>
          {hint && <p className="mt-1 truncate text-xs text-muted-foreground">{hint}</p>}
          {trend && (
            <p
              className={cn(
                'mt-1.5 flex items-center gap-0.5 text-xs font-medium',
                trend.value >= 0 ? 'text-success' : 'text-destructive'
              )}
            >
              {trend.value >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
              {Math.abs(trend.value).toFixed(1)}%
              {trend.label && <span className="font-normal text-muted-foreground"> {trend.label}</span>}
            </p>
          )}
        </div>
        <div className={cn('shrink-0 rounded-lg p-2', toneClass)}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
    </Card>
  );
}
