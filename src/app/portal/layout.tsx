import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Building2 } from 'lucide-react';
import { getCurrentUser, INVALIDATE_SESSION_URL } from '@/lib/session';
import { prisma } from '@/lib/db';
import { UserMenu } from '@/components/layout/user-menu';
import { ThemeToggle } from '@/components/layout/theme-toggle';
import { PortalNav } from './portal-nav';

/**
 * Client portal shell.
 *
 * Separate from the internal app shell on purpose: a client account must never
 * render internal navigation, and middleware fences /portal to the CLIENT role.
 */
export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect(INVALIDATE_SESSION_URL);
  if (user.role !== 'CLIENT') redirect('/dashboard');
  if (!user.clientId) {
    return (
      <div className="flex min-h-screen items-center justify-center px-6">
        <div className="max-w-md rounded-xl border bg-card p-8 text-center">
          <h1 className="text-lg font-semibold">Portal not linked</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            This account is not attached to a client company yet. Please contact your account
            manager.
          </p>
        </div>
      </div>
    );
  }

  const client = await prisma.client.findUnique({
    where: { id: user.clientId },
    select: { name: true },
  });

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="sticky top-0 z-40 border-b bg-card">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4 sm:px-6">
          <Link href="/portal" className="flex min-w-0 items-center gap-2">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary">
              <Building2 className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="truncate font-semibold tracking-tight">{client?.name ?? 'Client portal'}</span>
          </Link>
          <div className="ml-auto flex items-center gap-1">
            <ThemeToggle />
            <UserMenu name={user.name} email={user.email} role={user.role} />
          </div>
        </div>
        <PortalNav />
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">{children}</main>

      <footer className="mx-auto max-w-6xl px-4 pb-8 text-center text-xs text-muted-foreground sm:px-6">
        Questions about anything here? Reply to any email from your account team.
      </footer>
    </div>
  );
}
