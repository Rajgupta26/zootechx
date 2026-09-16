import { redirect } from 'next/navigation';
import { AppShell } from '@/components/layout/app-shell';
import { getCurrentUser, INVALIDATE_SESSION_URL } from '@/lib/session';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  // Clear the cookie rather than redirect to /login, which middleware would
  // bounce straight back here on a stale-but-valid JWT.
  if (!user) redirect(INVALIDATE_SESSION_URL);
  // Client-portal accounts live under /portal and must never render this shell.
  if (user.role === 'CLIENT') redirect('/portal');

  return (
    <AppShell
      user={{
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        grants: user.grants ?? [],
      }}
    >
      {children}
    </AppShell>
  );
}
