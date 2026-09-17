'use client';

import { useState } from 'react';
import { Menu, X } from 'lucide-react';
import { Sidebar } from './sidebar';
import { GlobalSearch } from './global-search';
import { NotificationBell } from './notification-bell';
import { UserMenu } from './user-menu';
import { ThemeToggle } from './theme-toggle';
import { QuickActions } from './quick-actions';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { Role } from '@prisma/client';

export function AppShell({
  user,
  children,
}: {
  user: { id: string; name: string; email: string; role: Role; grants: string[] };
  children: React.ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    /* Edge to edge. The app used to float on a tinted canvas with a 12px
       inset all round; at desk width that read as a gap someone forgot to
       close rather than as a deliberate frame. */
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Desktop sidebar */}
      <div className="hidden lg:flex">
        <Sidebar role={user.role} grants={user.grants} />
      </div>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          <div className="absolute left-0 top-0 h-full animate-fade-in">
            <Sidebar role={user.role} grants={user.grants} onNavigate={() => setMobileOpen(false)} />
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-4 top-3 text-white hover:bg-white/10 hover:text-white"
            onClick={() => setMobileOpen(false)}
            aria-label="Close menu"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-background">
        {/* Padding matches the main content's, so the search field and the
            avatar line up with the page headline and the cards below them —
            they were 4px adrift. */}
        <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4 sm:px-6">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={() => setMobileOpen(true)}
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </Button>

          <div className="hidden flex-1 sm:block">
            <GlobalSearch />
          </div>
          <div className="flex-1 sm:hidden" />

          <div className="flex items-center gap-1">
            <QuickActions role={user.role} grants={user.grants} />
            <ThemeToggle />
            <NotificationBell />
            <UserMenu name={user.name} email={user.email} role={user.role} />
          </div>
        </header>

        <main className={cn('flex-1 overflow-y-auto scrollbar-thin')}>
          <div className="mx-auto w-full max-w-[1600px] p-4 sm:p-6">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <h1 className="display truncate text-[1.75rem]">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
    </div>
  );
}
