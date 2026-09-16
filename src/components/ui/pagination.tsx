'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from './button';

/**
 * Server-side pagination control. Pushes `?page=` and lets the server component
 * re-query — the full result set is never sent to the browser.
 */
export function Pagination({
  page,
  pageCount,
  total,
  pageSize = 20,
}: {
  page: number;
  pageCount: number;
  total: number;
  pageSize?: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  if (total === 0) return null;

  const goTo = (next: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('page', String(next));
    router.push(`${pathname}?${params.toString()}`);
  };

  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <div className="flex flex-col items-center justify-between gap-3 border-t px-1 py-3 sm:flex-row">
      <p className="text-xs text-muted-foreground">
        Showing <span className="font-medium text-foreground tabular">{from}</span>–
        <span className="font-medium text-foreground tabular">{to}</span> of{' '}
        <span className="font-medium text-foreground tabular">{total}</span>
      </p>
      <div className="flex items-center gap-1">
        <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => goTo(page - 1)}>
          <ChevronLeft className="h-4 w-4" />
          Previous
        </Button>
        <span className="px-3 text-xs text-muted-foreground tabular">
          {page} / {pageCount}
        </span>
        <Button variant="outline" size="sm" disabled={page >= pageCount} onClick={() => goTo(page + 1)}>
          Next
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
