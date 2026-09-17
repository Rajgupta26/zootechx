import Link from 'next/link';
import { MoveUpRight, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * A figure and how far along it is, drawn as segments.
 *
 * The reference uses a segmented battery for quota consumption. Here the
 * segments carry a ratio the business already thinks in — collected out of
 * invoiced, won out of all leads — so the card is read at a glance from across
 * a desk, and the exact figures are still there for anyone who leans in.
 */

const SEGMENTS = 10;

export function BatteryStat({
  label,
  icon: Icon,
  value,
  of,
  percent,
  hint,
  href,
  tone = 'plain',
}: {
  label: string;
  icon: LucideIcon;
  value: string;
  /** The total this figure is a part of, shown small beside it. */
  of?: string;
  percent: number;
  hint?: string;
  href?: string;
  tone?: 'plain' | 'highlight';
}) {
  const lit = Math.round((Math.min(Math.max(percent, 0), 100) / 100) * SEGMENTS);
  const highlight = tone === 'highlight';

  // The highlight surface is a fixed colour in both themes, so everything on
  // it has to be pinned too. Inheriting `foreground` turns the text near-white
  // on lime the moment the theme flips.
  const className = cn(
    'group flex flex-col rounded-card border p-5 transition-shadow',
    highlight
      ? 'border-transparent bg-highlight text-highlight-foreground'
      : 'border-border bg-card',
    href && 'hover:shadow-md'
  );

  const inner = (
    <>
      <div className="flex items-center gap-2.5">
        <span
          className={cn(
            'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
            highlight ? 'bg-highlight-foreground/10' : 'bg-muted'
          )}
        >
          <Icon className="h-4 w-4" />
        </span>
        <span className="truncate text-sm font-semibold">{label}</span>
        {href && (
          <MoveUpRight className="ml-auto h-4 w-4 shrink-0 opacity-40 transition-opacity group-hover:opacity-100" />
        )}
      </div>

      <div className="mt-5 flex flex-wrap items-baseline gap-x-2">
        <span className="display tabular text-[2.6rem]">{value}</span>
        {of && (
          <span className={cn('text-sm', highlight ? 'text-highlight-foreground/60' : 'text-muted-foreground')}>
            / {of}
          </span>
        )}
        <span
          className={cn(
            'ml-auto rounded-full px-2 py-0.5 text-xs font-semibold tabular',
            highlight ? 'bg-highlight-foreground/10' : 'bg-muted'
          )}
        >
          {percent.toFixed(0)}%
        </span>
      </div>

      <div className="mt-auto flex gap-1 pt-5" aria-hidden>
        {Array.from({ length: SEGMENTS }, (_, i) => (
          <span
            key={i}
            className={cn(
              'h-6 flex-1 rounded-full transition-colors',
              i < lit
                ? highlight ? 'bg-highlight-foreground' : 'bg-foreground'
                : highlight
                  ? 'border border-dashed border-highlight-foreground/30'
                  : 'border border-dashed border-muted-foreground/30'
            )}
          />
        ))}
      </div>

      {hint && (
        <p className={cn('mt-3 pt-1 text-xs', highlight ? 'text-highlight-foreground/70' : 'text-muted-foreground')}>
          {hint}
        </p>
      )}
    </>
  );

  return href
    ? <Link href={href} className={className}>{inner}</Link>
    : <div className={className}>{inner}</div>;
}
