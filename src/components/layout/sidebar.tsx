'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { ChevronLeft, Zap } from 'lucide-react';
import { NAV_SECTIONS } from './nav-config';
import { can, type Action, type Resource } from '@/lib/rbac';
import { cn } from '@/lib/utils';
import type { Role } from '@prisma/client';

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
  const sections = NAV_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter((item) =>
      can(actor, item.permission[0] as Resource, item.permission[1] as Action)
    ),
  })).filter((section) => section.items.length > 0);

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

      <nav className="flex-1 space-y-5 overflow-y-auto scrollbar-thin px-3 py-4">
        {sections.map((section) => (
          <div key={section.heading}>
            {!collapsed && (
              <p className="px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {section.heading}
              </p>
            )}
            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const active =
                  pathname === item.href || pathname.startsWith(`${item.href}/`);
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={onNavigate}
                      title={collapsed ? item.label : undefined}
                      className={cn(
                        'flex items-center gap-2.5 rounded-md px-2 py-2 text-sm font-medium transition-colors',
                        active
                          ? 'bg-primary/10 text-primary'
                          : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                        collapsed && 'justify-center'
                      )}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      {!collapsed && <span className="truncate">{item.label}</span>}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
    </aside>
  );
}
