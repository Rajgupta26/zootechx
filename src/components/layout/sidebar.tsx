'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { ChevronDown, ChevronLeft, Zap } from 'lucide-react';
import { NAV_GROUPS } from './nav-config';
import { can, type Action, type Resource } from '@/lib/rbac';
import { cn } from '@/lib/utils';
import type { Role } from '@prisma/client';

/**
 * Grouped navigation, with each group opening to show the pages inside it.
 *
 * A group is only shown if the user can reach at least one page inside it, and
 * only its permitted pages are listed — so nobody can navigate their way into
 * a permission error.
 *
 * Every group starts open, so the whole map is visible without clicking
 * anything. Closing one overrides that default for the rest of the session,
 * which is why the state is a sparse record rather than a set: an absent entry
 * means "not decided", not "closed".
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
  const [toggled, setToggled] = useState<Record<string, boolean>>({});
  const actor = { role, grants };

  const onPage = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

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
        collapsed ? 'w-[68px]' : 'w-60'
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
        <ul className="space-y-0.5">
          {groups.map((group) => {
            const Icon = group.icon;
            const active = group.children.some((c) => onPage(c.href));

            // One page inside, or no room to expand: go straight there.
            if (group.children.length === 1 || collapsed) {
              return (
                <li key={group.label}>
                  <Link
                    href={group.children[0].href}
                    onClick={onNavigate}
                    title={collapsed ? group.label : undefined}
                    className={cn(rowClass(active), collapsed && 'justify-center')}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    {!collapsed && <span className="truncate">{group.label}</span>}
                  </Link>
                </li>
              );
            }

            const open = toggled[group.label] ?? true;

            return (
              <li key={group.label}>
                <button
                  type="button"
                  onClick={() => setToggled((t) => ({ ...t, [group.label]: !open }))}
                  aria-expanded={open}
                  className={cn(rowClass(active), 'w-full')}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="truncate">{group.label}</span>
                  <ChevronDown
                    className={cn(
                      'ml-auto h-3.5 w-3.5 shrink-0 transition-transform duration-200',
                      open && 'rotate-180'
                    )}
                  />
                </button>

                {open && (
                  <ul className="ml-[1.4rem] mt-0.5 space-y-0.5 border-l pl-2.5">
                    {group.children.map((child) => {
                      const here = onPage(child.href);
                      return (
                        <li key={child.href}>
                          <Link
                            href={child.href}
                            onClick={onNavigate}
                            title={child.hint}
                            className={cn(
                              'block truncate rounded-md px-2.5 py-1.5 text-sm transition-colors',
                              here
                                ? 'bg-primary/10 font-medium text-primary'
                                : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                            )}
                          >
                            {child.label}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      </nav>
    </aside>
  );
}

function rowClass(active: boolean) {
  return cn(
    'flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium transition-colors',
    active
      ? 'bg-primary/10 text-primary'
      : 'text-muted-foreground hover:bg-accent hover:text-foreground'
  );
}
