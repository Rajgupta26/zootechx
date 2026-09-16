'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { ChevronLeft, Zap } from 'lucide-react';
import { NAV_GROUPS } from './nav-config';
import { can, type Action, type Resource } from '@/lib/rbac';
import { cn } from '@/lib/utils';
import type { Role } from '@prisma/client';

/**
 * Seven grouped destinations rather than nineteen flat ones.
 *
 * A group is only shown if the user can reach at least one page inside it, and
 * clicking it opens the first page they are allowed to see — so a Sales user
 * never lands on a permission error by using the menu.
 */
export function Sidebar({
  role,
  grants,
  onNavigate,
}: {
  role: Role;
  grants: string[];
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const actor = { role, grants };

  const groups = NAV_GROUPS.map((group) => ({
    ...group,
    children: group.children.filter((child) =>
      can(actor, child.permission[0] as Resource, child.permission[1] as Action)
    ),
  })).filter((group) => group.children.length > 0);

  return (
    <aside
      className={cn(
        'flex h-full shrink-0 flex-col border-r bg-card transition-[width] duration-200',
        collapsed ? 'w-[68px]' : 'w-56'
      )}
    >
      <div className="flex h-14 items-center gap-2 border-b px-4">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary">
          <Zap className="h-4 w-4 text-primary-foreground" />
        </div>
        {!collapsed && <span className="truncate font-semibold tracking-tight">XCC CRM</span>}
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="ml-auto hidden rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground lg:block"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <ChevronLeft className={cn('h-4 w-4 transition-transform', collapsed && 'rotate-180')} />
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto scrollbar-thin p-3">
        <ul className="space-y-1">
          {groups.map((group) => {
            const active = group.children.some(
              (c) => pathname === c.href || pathname.startsWith(`${c.href}/`)
            );
            const Icon = group.icon;
            // Land on the first page this user is actually allowed to open.
            const target = group.children[0].href;

            return (
              <li key={group.label}>
                <Link
                  href={target}
                  onClick={onNavigate}
                  title={collapsed ? group.label : undefined}
                  className={cn(
                    'flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium transition-colors',
                    active
                      ? 'bg-primary/10 text-primary'
                      : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                    collapsed && 'justify-center'
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {!collapsed && <span className="truncate">{group.label}</span>}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </aside>
  );
}
