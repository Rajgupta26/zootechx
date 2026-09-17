import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, ShieldCheck } from 'lucide-react';
import { requireAuth } from '@/lib/session';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Wordmark } from '@/components/layout/wordmark';
import { ChangePassword } from './change-password';

export const metadata: Metadata = { title: 'Your account' };

const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: 'Super admin',
  SUB_ADMIN: 'Sub admin',
  SALES: 'Sales',
  DEVELOPER: 'Developer',
  MARKETING: 'Marketing',
  CLIENT: 'Client portal',
};

/**
 * Deliberately outside both shells.
 *
 * The staff shell carries a sidebar a portal client must never see, and the
 * portal shell is scoped to one company. This page belongs to whoever is
 * signed in, whichever of the two they are, so it stands on its own.
 */
export default async function AccountPage() {
  const me = await requireAuth();
  const home = me.role === 'CLIENT' ? '/portal' : '/dashboard';

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto w-full max-w-xl px-6 py-10">
        <div className="mb-8 flex items-center justify-between">
          <Wordmark height={22} />
          <Button variant="ghost" size="sm" asChild>
            <Link href={home}>
              <ArrowLeft />
              Back
            </Link>
          </Button>
        </div>

        <h1 className="display text-[1.75rem]">Your account</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          What the audit log records you as, and the password only you should know.
        </p>

        <Card className="mt-6">
          <CardContent className="space-y-2 p-5 text-sm">
            <Row label="Name" value={me.name} />
            <Row label="Email" value={me.email} />
            <div className="flex items-start justify-between gap-3 pt-1">
              <span className="text-xs text-muted-foreground">Role</span>
              <Badge variant="secondary">
                <ShieldCheck className="mr-1 h-3 w-3" />
                {ROLE_LABELS[me.role] ?? me.role}
              </Badge>
            </div>
            <p className="pt-2 text-xs text-muted-foreground">
              Name, email and role are set by an administrator — ask them if any of it is wrong.
            </p>
          </CardContent>
        </Card>

        <Card className="mt-4">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Change your password</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <p className="mb-4 text-xs leading-relaxed text-muted-foreground">
              Accounts here are created with a password an administrator chose, so
              until you change it, it is not only yours. Everything you do is
              recorded against your name.
            </p>
            <ChangePassword />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="min-w-0 truncate text-right">{value}</span>
    </div>
  );
}
