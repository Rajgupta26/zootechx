import type { Metadata } from 'next';
import { KeyRound, ShieldAlert } from 'lucide-react';
import { prisma } from '@/lib/db';
import { requirePagePermission, isSudoActive } from '@/lib/session';
import { can } from '@/lib/rbac';
import { PageHeader } from '@/components/layout/app-shell';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { VaultList } from './vault-list';
import { NewCredentialDialog } from './new-credential';

export const metadata: Metadata = { title: 'Credentials vault' };

export default async function VaultPage() {
  const user = await requirePagePermission('credential', 'read');

  // Secret material is deliberately excluded from this query — it only ever
  // leaves the database through revealSecretAction, one record at a time.
  const credentials = await prisma.credential.findMany({
    where: { deletedAt: null },
    orderBy: [{ sensitivity: 'desc' }, { name: 'asc' }],
    select: {
      id: true, name: true, description: true, category: true,
      environment: true, username: true, url: true, sensitivity: true,
      createdAt: true, rotatedAt: true, expiresAt: true,
      owner: { select: { name: true } },
      _count: { select: { accessLogs: true } },
    },
  });

  // Per-record grants let a developer see exactly one staging secret.
  const grantedIds = new Set(
    (user.grants ?? [])
      .filter((g) => g.startsWith('credential:reveal:'))
      .map((g) => g.split(':')[2])
  );

  const canReveal = can(user, 'credential', 'reveal');
  const canCreate = can(user, 'credential', 'create');

  return (
    <>
      <PageHeader
        title="Credentials vault"
        subtitle="AES-256-GCM encrypted. Every reveal and copy is logged against your account."
        action={canCreate ? <NewCredentialDialog /> : undefined}
      />

      <Card className="mb-5 border-warning/40 bg-warning/5">
        <CardContent className="flex items-start gap-3 p-4">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          <div className="text-sm">
            <p className="font-medium">Secrets are audited</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Revealing or copying a secret records your identity, IP address and browser.
              Production keys marked <strong>Critical</strong> additionally require you to
              re-enter your password.
            </p>
          </div>
        </CardContent>
      </Card>

      {credentials.length === 0 ? (
        <Card>
          <EmptyState
            icon={KeyRound}
            title="Vault is empty"
            description="Store API keys and environment secrets here instead of in a shared document."
            action={canCreate ? <NewCredentialDialog /> : undefined}
          />
        </Card>
      ) : (
        <VaultList
          credentials={credentials.map((c) => ({
            ...c,
            createdAt: c.createdAt.toISOString(),
            rotatedAt: c.rotatedAt?.toISOString() ?? null,
            expiresAt: c.expiresAt?.toISOString() ?? null,
            canReveal: canReveal || grantedIds.has(c.id),
          }))}
          sudoActive={isSudoActive(user)}
        />
      )}
    </>
  );
}
