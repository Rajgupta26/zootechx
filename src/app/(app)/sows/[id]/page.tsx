import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, FileCheck2, Link2, ShieldCheck } from 'lucide-react';
import { prisma } from '@/lib/db';
import { requirePermission } from '@/lib/session';
import { scopeFilter, can } from '@/lib/rbac';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/status-badge';
import { Badge } from '@/components/ui/badge';
import { formatMoney } from '@/lib/billing/money';
import { formatDate, formatDateTime } from '@/lib/utils';
import { SowActions } from './sow-actions';

export const metadata: Metadata = { title: 'Statement of work' };

export default async function SowDetail({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission('sow', 'read');
  const { id } = await params;

  const sow = await prisma.sow.findFirst({
    where: { id, ...scopeFilter(user, 'sow') },
    include: {
      client: { select: { id: true, name: true, email: true } },
      milestones: { orderBy: { position: 'asc' } },
      signature: true,
      shareLinks: { orderBy: { createdAt: 'desc' } },
      projects: { select: { id: true, name: true, status: true, progressPct: true } },
      invoices: {
        select: { id: true, number: true, total: true, currency: true, status: true },
      },
      createdBy: { select: { name: true } },
    },
  });

  if (!sow) notFound();

  const activeLink = sow.shareLinks.find(
    (l) => !l.revokedAt && l.expiresAt > new Date()
  );
  const base = process.env.NEXT_PUBLIC_APP_URL ?? '';

  return (
    <>
      <Button variant="ghost" size="sm" className="-ml-2 mb-3" asChild>
        <Link href="/sows">
          <ArrowLeft />
          Statements of work
        </Link>
      </Button>

      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">{sow.title}</h1>
            <StatusBadge status={sow.status} />
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {sow.number} ·{' '}
            <Link href={`/clients/${sow.client.id}`} className="hover:underline">
              {sow.client.name}
            </Link>
            {' · '}
            {formatMoney(sow.value.toString(), sow.currency)}
          </p>
        </div>

        <SowActions
          sowId={sow.id}
          status={sow.status}
          clientEmail={sow.client.email}
          hasActiveLink={Boolean(activeLink)}
          permissions={{
            canSend: can(user, 'sow', 'send'),
            canUpdate: can(user, 'sow', 'update'),
          }}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card>
            <CardContent className="space-y-5 p-5 sm:p-6">
              <Section title="Scope of work" body={sow.scope} />
              {sow.deliverables && <Section title="Deliverables" body={sow.deliverables} />}
              {sow.timeline && <Section title="Timeline" body={sow.timeline} />}
              {sow.assumptions && <Section title="Assumptions" body={sow.assumptions} />}
              {sow.outOfScope && <Section title="Out of scope" body={sow.outOfScope} />}
              {sow.paymentTerms && <Section title="Payment terms" body={sow.paymentTerms} />}
            </CardContent>
          </Card>

          {sow.milestones.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Payment milestones</CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <ul className="divide-y">
                  {sow.milestones.map((m) => (
                    <li key={m.id} className="flex flex-wrap items-center gap-3 py-2.5">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">{m.title}</p>
                        {m.dueDate && (
                          <p className="text-xs text-muted-foreground">Due {formatDate(m.dueDate)}</p>
                        )}
                      </div>
                      <Badge variant="muted">{Number(m.percentage).toFixed(0)}%</Badge>
                      <span className="w-28 text-right text-sm font-medium tabular">
                        {formatMoney(m.amount.toString(), sow.currency)}
                      </span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </div>

        <div className="space-y-4">
          {sow.signature ? (
            <Card className="border-success/40">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <FileCheck2 className="h-4 w-4 text-success" />
                  Signature record
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 pt-0 text-sm">
                <Detail label="Signer" value={sow.signature.signerName} />
                {sow.signature.signerTitle && (
                  <Detail label="Title" value={sow.signature.signerTitle} />
                )}
                <Detail label="Email" value={sow.signature.signerEmail} />
                <Detail label="Signed at" value={formatDateTime(sow.signature.signedAt)} />
                <Detail label="IP address" value={sow.signature.ipAddress} />
                <div className="pt-1">
                  <p className="text-xs text-muted-foreground">Document hash (SHA-256)</p>
                  <p className="break-all font-mono text-[10px]">{sow.signature.documentHash}</p>
                </div>
                <p className="rounded-md bg-muted/50 p-2 text-[11px] leading-relaxed text-muted-foreground">
                  {sow.signature.consentText}
                </p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Awaiting signature</CardTitle>
              </CardHeader>
              <CardContent className="pt-0 text-sm text-muted-foreground">
                Share a signing link with the client to capture their e-signature.
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Link2 className="h-4 w-4" />
                Share links
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 pt-0">
              {sow.shareLinks.length === 0 ? (
                <p className="text-sm text-muted-foreground">No links created yet.</p>
              ) : (
                sow.shareLinks.map((link) => {
                  const expired = link.expiresAt < new Date();
                  return (
                    <div key={link.id} className="rounded-md border p-2.5 text-xs">
                      <div className="mb-1 flex items-center justify-between gap-2">
                        {link.revokedAt ? (
                          <Badge variant="destructive">Revoked</Badge>
                        ) : expired ? (
                          <Badge variant="muted">Expired</Badge>
                        ) : (
                          <Badge variant="success">Active</Badge>
                        )}
                        <span className="text-muted-foreground">
                          {link.viewCount} view{link.viewCount === 1 ? '' : 's'}
                        </span>
                      </div>
                      {!link.revokedAt && !expired && (
                        <p className="break-all text-muted-foreground">
                          {base}/sign/{link.token}
                        </p>
                      )}
                      <p className="mt-1 text-muted-foreground">
                        Expires {formatDate(link.expiresAt)}
                        {link.lastViewedAt ? ` · last opened ${formatDate(link.lastViewedAt)}` : ''}
                      </p>
                    </div>
                  );
                })
              )}
              <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
                <ShieldCheck className="mt-0.5 h-3 w-3 shrink-0" />
                Links expire automatically after 30 days and can be revoked at any time.
              </p>
            </CardContent>
          </Card>

          {sow.invoices.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Invoices</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 pt-0">
                {sow.invoices.map((inv) => (
                  <Link
                    key={inv.id}
                    href={`/invoices/${inv.id}`}
                    className="flex items-center justify-between rounded-md border p-2.5 text-sm transition-colors hover:bg-accent/50"
                  >
                    <span className="font-medium">{inv.number}</span>
                    <span className="tabular">{formatMoney(inv.total.toString(), inv.currency)}</span>
                  </Link>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}

function Section({ title, body }: { title: string; body: string }) {
  return (
    <section>
      <h2 className="mb-1.5 text-sm font-semibold">{title}</h2>
      <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">{body}</p>
    </section>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="min-w-0 truncate text-right">{value}</span>
    </div>
  );
}
