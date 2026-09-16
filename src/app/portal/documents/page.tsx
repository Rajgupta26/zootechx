import type { Metadata } from 'next';
import { FileCheck2, FileText } from 'lucide-react';
import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/session';
import { Card, CardContent } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/status-badge';
import { EmptyState } from '@/components/ui/empty-state';
import { formatMoney } from '@/lib/billing/money';
import { formatDate, formatDateTime } from '@/lib/utils';

export const metadata: Metadata = { title: 'Documents' };

export default async function PortalDocuments() {
  const user = await requireAuth();

  const sows = await prisma.sow.findMany({
    where: { clientId: user.clientId!, status: { notIn: ['DRAFT', 'REVOKED'] } },
    orderBy: { createdAt: 'desc' },
    include: {
      signature: true,
      milestones: { orderBy: { position: 'asc' } },
    },
  });

  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Documents</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Statements of work, their scope, and signature records.
        </p>
      </div>

      {sows.length === 0 ? (
        <Card>
          <EmptyState
            icon={FileText}
            title="No documents yet"
            description="Statements of work shared with you will appear here."
          />
        </Card>
      ) : (
        <div className="space-y-4">
          {sows.map((sow) => (
            <Card key={sow.id}>
              <CardContent className="p-5">
                <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="truncate font-semibold">{sow.title}</h2>
                      <StatusBadge status={sow.status} />
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {sow.number}
                      {sow.startDate ? ` · from ${formatDate(sow.startDate)}` : ''}
                    </p>
                  </div>
                  <p className="shrink-0 font-semibold tabular">
                    {formatMoney(sow.value.toString(), sow.currency)}
                  </p>
                </div>

                <p className="line-clamp-3 whitespace-pre-line text-sm text-muted-foreground">
                  {sow.scope}
                </p>

                {sow.milestones.length > 0 && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {sow.milestones.map((m) => (
                      <span
                        key={m.id}
                        className="rounded-full border px-2.5 py-1 text-xs text-muted-foreground"
                      >
                        {m.title} · {Number(m.percentage).toFixed(0)}%
                      </span>
                    ))}
                  </div>
                )}

                {sow.signature && (
                  <div className="mt-4 flex items-start gap-2.5 rounded-lg border border-success/40 bg-success/5 p-3">
                    <FileCheck2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                    <div className="min-w-0 text-xs">
                      <p className="font-medium">
                        Signed by {sow.signature.signerName}
                        {sow.signature.signerTitle ? `, ${sow.signature.signerTitle}` : ''}
                      </p>
                      <p className="text-muted-foreground">
                        {sow.signature.signerEmail} · {formatDateTime(sow.signature.signedAt)} · IP{' '}
                        {sow.signature.ipAddress}
                      </p>
                      <p className="mt-1 break-all font-mono text-[10px] text-muted-foreground">
                        Document hash: {sow.signature.documentHash.slice(0, 32)}…
                      </p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
