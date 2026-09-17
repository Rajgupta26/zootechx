import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Building2, Mail, MapPin, Phone, Receipt } from 'lucide-react';
import { prisma } from '@/lib/db';
import { requirePagePermission } from '@/lib/session';
import { can } from '@/lib/rbac';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { StatusBadge } from '@/components/ui/status-badge';
import { Progress } from '@/components/ui/misc';
import { formatMoney, toMinor, toNumber } from '@/lib/billing/money';
import { formatDate } from '@/lib/utils';
import { NewInvoiceButton } from '../../invoices/new-invoice-button';

export const metadata: Metadata = { title: 'Client' };

export default async function ClientDetail({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePagePermission('client', 'read');
  const { id } = await params;

  const client = await prisma.client.findFirst({
    where: { id, deletedAt: null },
    include: {
      accountManager: { select: { name: true } },
      contacts: true,
      projects: { orderBy: { updatedAt: 'desc' }, take: 10 },
      sows: { orderBy: { createdAt: 'desc' }, take: 10 },
      invoices: {
        where: { kind: 'TAX_INVOICE' },
        orderBy: { issueDate: 'desc' },
        take: 12,
        select: {
          id: true, number: true, total: true, balanceDue: true,
          currency: true, status: true, issueDate: true, dueDate: true,
        },
      },
      portalUsers: { select: { id: true, name: true, email: true, lastLoginAt: true } },
    },
  });

  if (!client) notFound();

  const outstanding = toNumber(
    client.invoices
      .filter((i) => ['SENT', 'PARTIALLY_PAID', 'OVERDUE'].includes(i.status))
      .reduce((acc, i) => acc + toMinor(i.balanceDue.toString()), 0n)
  );

  return (
    <>
      <Button variant="ghost" size="sm" className="-ml-2 mb-3" asChild>
        <Link href="/clients">
          <ArrowLeft />
          Clients
        </Link>
      </Button>

      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">{client.name}</h1>
            {client.country !== 'India' && <Badge variant="warning">Export client</Badge>}
            {client.applyTds && <Badge variant="muted">Deducts TDS</Badge>}
          </div>
          {client.legalName && (
            <p className="mt-1 text-sm text-muted-foreground">{client.legalName}</p>
          )}
        </div>
        {can(user, 'invoice', 'create') && <NewInvoiceButton clientId={client.id} />}
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Invoices</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {client.invoices.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">No invoices yet.</p>
              ) : (
                <ul className="divide-y">
                  {client.invoices.map((inv) => (
                    <li key={inv.id}>
                      <Link
                        href={`/invoices/${inv.id}`}
                        className="-mx-2 flex flex-wrap items-center gap-3 rounded-md px-2 py-2.5 transition-colors hover:bg-accent/50"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium">{inv.number}</p>
                          <p className="text-xs text-muted-foreground">
                            Issued {formatDate(inv.issueDate)} · due {formatDate(inv.dueDate)}
                          </p>
                        </div>
                        <StatusBadge status={inv.status} />
                        <span className="w-28 text-right text-sm font-medium tabular">
                          {formatMoney(inv.total.toString(), inv.currency)}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Projects</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {client.projects.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">No projects yet.</p>
              ) : (
                <ul className="space-y-3">
                  {client.projects.map((p) => (
                    <li key={p.id}>
                      <Link href={`/projects/${p.id}`} className="block group">
                        <div className="mb-1.5 flex items-center gap-2">
                          <span className="min-w-0 flex-1 truncate text-sm font-medium group-hover:underline">
                            {p.name}
                          </span>
                          <StatusBadge status={p.status} />
                        </div>
                        <Progress value={p.progressPct} className="h-1.5" />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {client.sows.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Proposals</CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <ul className="divide-y">
                  {client.sows.map((s) => (
                    <li key={s.id}>
                      <Link
                        href={`/sows/${s.id}`}
                        className="-mx-2 flex flex-wrap items-center gap-3 rounded-md px-2 py-2.5 transition-colors hover:bg-accent/50"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{s.title}</p>
                          <p className="text-xs text-muted-foreground">{s.number}</p>
                        </div>
                        <StatusBadge status={s.status} />
                        <span className="text-sm tabular">
                          {formatMoney(s.value.toString(), s.currency)}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Billing details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 pt-0 text-sm">
              <Row icon={Mail} label="Email">{client.email || '—'}</Row>
              {client.phone && <Row icon={Phone} label="Phone">{client.phone}</Row>}
              <Row icon={MapPin} label="State">
                {client.country !== 'India'
                  ? `${client.country} (export)`
                  : (client.stateName ?? 'Not set')}
              </Row>
              <Row icon={Building2} label="GSTIN">
                <span className="font-mono text-xs">{client.gstin ?? 'Not registered'}</span>
              </Row>
              <Row icon={Receipt} label="Payment terms">{client.paymentTermDays} days</Row>
              <Row icon={Receipt} label="Currency">{client.currency}</Row>
              {client.accountManager && (
                <Row icon={Building2} label="Account manager">{client.accountManager.name}</Row>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Outstanding</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <p className="text-2xl font-semibold tabular">
                {formatMoney(outstanding, client.currency)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Across {client.invoices.filter((i) => Number(i.balanceDue) > 0).length} open invoice(s)
              </p>
            </CardContent>
          </Card>

          {client.portalUsers.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Portal access</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 pt-0">
                {client.portalUsers.map((u) => (
                  <div key={u.id} className="text-sm">
                    <p className="font-medium">{u.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {u.email} ·{' '}
                      {u.lastLoginAt ? `last in ${formatDate(u.lastLoginAt)}` : 'never signed in'}
                    </p>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {client.notes && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Notes</CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <p className="whitespace-pre-line text-sm text-muted-foreground">{client.notes}</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}

function Row({
  icon: Icon, label, children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted-foreground">{label}</p>
        <div className="truncate">{children}</div>
      </div>
    </div>
  );
}
