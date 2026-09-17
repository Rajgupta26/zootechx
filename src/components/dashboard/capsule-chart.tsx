'use client';

import { useState } from 'react';
import { formatMoney } from '@/lib/billing/money';
import { cn } from '@/lib/utils';

/**
 * Invoiced against collected, as one capsule per month.
 *
 * The capsule is the whole month's billing; the lime fill inside it is the
 * part that actually arrived. So the shape answers the question the business
 * cares about — how much of what we billed has come in — without the reader
 * comparing two bars. A month with nothing billed is drawn as a dashed
 * outline rather than omitted, so the gap in trading is visible.
 */

export interface MonthPoint {
  month: string;
  invoiced: number;
  collected: number;
}

export function CapsuleChart({ data }: { data: MonthPoint[] }) {
  const [active, setActive] = useState<number | null>(null);
  const peak = Math.max(...data.map((d) => d.invoiced), 1);

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center gap-x-5 gap-y-2">
        <Key swatch="bg-foreground" label="Invoiced" />
        <Key swatch="bg-highlight" label="Collected" />
        <p className="ml-auto text-xs text-muted-foreground">Last 12 months</p>
      </div>

      <div className="flex h-56 items-end gap-1.5 sm:gap-2.5">
        {data.map((point, i) => {
          const billed = point.invoiced > 0;
          const height = billed ? Math.max((point.invoiced / peak) * 100, 6) : 100;
          const filled = billed ? Math.min((point.collected / point.invoiced) * 100, 100) : 0;
          const isActive = active === i;

          return (
            <button
              key={point.month + i}
              type="button"
              onMouseEnter={() => setActive(i)}
              onMouseLeave={() => setActive(null)}
              onFocus={() => setActive(i)}
              onBlur={() => setActive(null)}
              className="group relative flex h-full flex-1 flex-col justify-end rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              aria-label={`${point.month}: invoiced ${formatMoney(point.invoiced, 'INR')}, collected ${formatMoney(point.collected, 'INR')}`}
            >
              {/* Value pill, as in the reference — on hover rather than always. */}
              <span
                className={cn(
                  'pointer-events-none absolute inset-x-0 -top-1 z-10 mx-auto w-fit rounded-full bg-foreground px-2 py-1 text-[10px] font-semibold text-background transition-opacity duration-150',
                  isActive && billed ? 'opacity-100' : 'opacity-0'
                )}
              >
                {filled.toFixed(0)}% in
              </span>

              <span
                className={cn(
                  'grow-up relative w-full overflow-hidden rounded-full transition-[filter,transform] duration-200',
                  billed
                    ? 'bg-foreground group-hover:brightness-125'
                    : 'border border-dashed border-muted-foreground/35 bg-transparent',
                  isActive && billed && 'scale-x-105'
                )}
                style={{ height: `${height}%`, animationDelay: `${i * 45}ms` }}
              >
                {billed && (
                  <span
                    className="absolute inset-x-0 bottom-0 rounded-full bg-highlight transition-[height] duration-300"
                    style={{ height: `${filled}%` }}
                  />
                )}
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-2.5 flex gap-1.5 sm:gap-2.5">
        {data.map((point, i) => (
          <p
            key={point.month + i}
            className={cn(
              'flex-1 text-center text-[10px] transition-colors',
              active === i ? 'font-semibold text-foreground' : 'text-muted-foreground'
            )}
          >
            {point.month}
          </p>
        ))}
      </div>

      {/* One readout under the chart rather than a tooltip that covers it. */}
      <div className="mt-4 flex min-h-[2.75rem] items-center gap-6 rounded-lg bg-muted/60 px-4 py-2.5 text-sm">
        {active !== null ? (
          <>
            <span className="font-semibold">{data[active].month}</span>
            <span className="text-muted-foreground">
              Invoiced <span className="tabular font-medium text-foreground">
                {formatMoney(data[active].invoiced, 'INR', { compact: true })}
              </span>
            </span>
            <span className="text-muted-foreground">
              Collected <span className="tabular font-medium text-foreground">
                {formatMoney(data[active].collected, 'INR', { compact: true })}
              </span>
            </span>
          </>
        ) : (
          <span className="text-muted-foreground">Point at a month to see its numbers.</span>
        )}
      </div>
    </div>
  );
}

function Key({ swatch, label }: { swatch: string; label: string }) {
  return (
    <span className="flex items-center gap-2 text-xs font-medium">
      <span className={cn('h-2.5 w-2.5 rounded-full', swatch)} />
      {label}
    </span>
  );
}
