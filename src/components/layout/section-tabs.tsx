'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { findGroupForPath } from './nav-config';
import { can, type Action, type Resource } from '@/lib/rbac';
import { cn } from '@/lib/utils';
import type { Role } from '@prisma/client';

/**
 * The pages inside the current group, as tabs.
 *
 * Rendered once in the shell rather than added to each page, so every grouped
 * route gets it without touching nineteen files. A group with a single page
 * (Dashboard, My tasks) renders nothing.
 */
export function SectionTabs({ role, grants }: { role: Role; grants: string[] }) {
  const pathname = usePathname();
  const group = findGroupForPath(pathname);
  if (!group) return null;

  const actor = { role, grants };
  const tabs = group.children.filter((c) =>
    can(actor, c.permission[0] as Resource, c.permission[1] as Action)
  );
  if (tabs.length < 2) return null;

  const current = tabs.find(
    (t) => pathname === t.href || pathname.startsWith(`${t.href}/`)
  );

  return (
    <div className="mb-5 border-b">
      <nav className="-mb-px flex gap-1 overflow-x-auto scrollbar-thin">
        {tabs.map((tab) => {
          const active = tab.href === current?.href;
          const Icon = tab.icon;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                'flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition-colors',
                active
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {tab.label}
            </Link>
          );
        })}
      </nav>
      {current?.hint && (
        <p className="pb-3 pt-2 text-xs text-muted-foreground">{current.hint}</p>
      )}
    </div>
  );
}
