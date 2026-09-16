'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Loader2, CornerDownLeft } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface SearchHit {
  id: string;
  type: 'lead' | 'client' | 'invoice' | 'project' | 'credential' | 'sow';
  title: string;
  subtitle?: string;
  href: string;
}

const TYPE_LABEL: Record<SearchHit['type'], string> = {
  lead: 'Lead', client: 'Client', invoice: 'Invoice',
  project: 'Project', credential: 'Credential', sow: 'SOW',
};

/**
 * Global search across leads, clients, invoices, projects, SOWs and
 * credentials. Results are permission-filtered server-side.
 */
export function GlobalSearch() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [cursor, setCursor] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Cmd/Ctrl+K focuses search from anywhere.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
      }
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  // Debounced so typing doesn't fire a query per keystroke.
  useEffect(() => {
    if (query.trim().length < 2) {
      setHits([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`, {
          signal: controller.signal,
        });
        const data = (await res.json()) as { results: SearchHit[] };
        setHits(data.results ?? []);
        setCursor(0);
        setOpen(true);
      } catch {
        /* aborted */
      } finally {
        setLoading(false);
      }
    }, 250);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  const go = (hit: SearchHit) => {
    router.push(hit.href);
    setOpen(false);
    setQuery('');
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open || hits.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setCursor((c) => (c + 1) % hits.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setCursor((c) => (c - 1 + hits.length) % hits.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      go(hits[cursor]);
    }
  };

  return (
    <div ref={containerRef} className="relative w-full max-w-md">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        ref={inputRef}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => hits.length && setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder="Search leads, clients, invoices…"
        className="pl-9 pr-16"
      />
      <kbd className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 rounded border bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground sm:block">
        ⌘K
      </kbd>
      {loading && (
        <Loader2 className="absolute right-10 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-muted-foreground" />
      )}

      {open && (
        <div className="absolute left-0 right-0 top-11 z-50 max-h-96 overflow-y-auto scrollbar-thin rounded-lg border bg-popover p-1 shadow-lg">
          {hits.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">
              No matches for “{query}”
            </p>
          ) : (
            hits.map((hit, i) => (
              <button
                key={`${hit.type}-${hit.id}`}
                onClick={() => go(hit)}
                onMouseEnter={() => setCursor(i)}
                className={cn(
                  'flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors',
                  i === cursor ? 'bg-accent' : 'hover:bg-accent/60'
                )}
              >
                <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase text-muted-foreground">
                  {TYPE_LABEL[hit.type]}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block truncate font-medium">{hit.title}</span>
                  {hit.subtitle && (
                    <span className="block truncate text-xs text-muted-foreground">{hit.subtitle}</span>
                  )}
                </span>
                {i === cursor && <CornerDownLeft className="h-3 w-3 shrink-0 text-muted-foreground" />}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
