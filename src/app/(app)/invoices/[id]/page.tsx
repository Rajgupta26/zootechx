import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  ArrowLeft, Building2, Calendar, Download, ExternalLink, FileText, Lock,
} from 'lucide-react';
import { prisma } from '@/lib/db';
import { requirePermission } from '@/lib/session';
import { scopeFilter, can } from '@/lib/rbac';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/status-badge';
import { Separator } from '@/components/ui/misc';
import { formatMoney, amountInWords, toMinor } from '@/lib/billing/money';
import { treatmentLabel, type TaxTreatment } from '@/lib/billing/gst';
import { formatDate, formatDateTime } from '@/lib/utils';
import { InvoiceActions } from './actions-panel';

export const metadata: Metadata = { title: 'Invoice' };

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requirePermission('invoice', 'read');
  const { id } = await params;

  const invoice = await prisma.invoice.findFirst({
    where: { id, ...scopeFilter(user, 'invoice') },
    include: {
      items: { orderBy: { position: 'asc' } },
      payments: { orderBy: { createdAt: 'desc' } },
      client: { select: { id: true, name: true } },
      createdBy: { select: { name: true } },
      sow: { select: { id: true, number: true, title: true } },
      project: { select: { id: true, name: true } },
      messages: { orderBy: { createdAt: 'desc' }, take: 6 },
      creditNotes: { select: { id: true, number: true, total: true, currency: true } },
    },
  });

  if (!invoice) notFound();

  const company = invoice.companySnapshot as Record<string, any>;
  const isIntra = invoice.taxTreatment === 'INTRA_STATE';
  const canSend = can(user, 'invoice', 'send');
  const canRecordPayment = can(user, 'payment', 'create');
  const canApprove = can(user, 'invoice', 'approve');

  return (
    <>
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <Button variant="ghost" size="sm" className="-ml-2 mb-2" asChild>
            <Link href="/invoices">
              <ArrowLeft />
              Invoices
            </Link>
          </Button>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">{invoice.number}</h1>
            <StatusBadge status={invoice.status} />
            {invoice.isLocked && (
              <Badge variant="muted">
                <Lock className="mr-1 h-3 w-3" />
                Locked
              </Badge>
            )}
            {invoice.kind === 'CREDIT_NOTE' && <Badge variant="destructive">Credit note</Badge>}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {invoice.clientName} · issued {formatDate(invoice.issueDate)} · due {formatDate(invoice.dueDate)}
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Button variant="outline" asChild>
            <a href={`/api/invoices/${invoice.id}/pdf`} target="_blank" rel="noreferrer">
              <Download />
              PDF
            </a>
          </Button>
          <InvoiceActions
            invoice={{
              id: invoice.id,
              number: invoice.number,
              status: invoice.status,
              isLocked: invoice.isLocked,
              kind: invoice.kind,
              currency: invoice.currency,
              balanceDue: invoice.balanceDue.toString(),
              total: invoice.total.toString(),
              clientEmail: invoice.clientEmail,
              clientPhone: invoice.clientPhone,
              paymentLinkUrl: invoice.paymentLinkUrl,
            }}
            permissions={{ canSend, canRecordPayment, canApprove }}
          />
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        {/* Invoice document */}
        <div className="space-y-5 lg:col-span-2">
          <Card>
            <CardContent className="p-5 sm:p-6">
              {/* Header */}
              <div className="flex flex-col gap-4 sm:flex-row sm:justify-between">
                <div>
                  <p className="text-base font-semibold text-primary">
                    {company?.tradeName || company?.legalName}
                  </p>
                  <p className="text-sm">{company?.legalName}</p>
                  <p className="whitespace-pre-line text-xs text-muted-foreground">{company?.address}</p>
                  {company?.gstin && (
                    <p className="mt-1.5 text-xs">
                      <span className="font-medium">GSTIN:</span> {company.gstin}
                    </p>
                  )}
                </div>
                <div className="sm:text-right">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    {invoice.kind === 'CREDIT_NOTE' ? 'Credit Note' : 'Tax Invoice'}
                  </p>
                  <p className="text-lg font-semibold">{invoice.number}</p>
                  <p className="text-xs text-muted-foreground">FY {invoice.fyLabel}</p>
                </div>
              </div>

              <Separator className="my-5" />

              {/* Parties */}
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Bill to
                  </p>
                  <p className="font-medium">{invoice.clientLegalName || invoice.clientName}</p>
                  {invoice.billingAddress && (
                    <p className="whitespace-pre-line text-xs text-muted-foreground">
                      {invoice.billingAddress}
                    </p>
                  )}
                  {invoice.clientGstin && (
                    <p className="mt-1 text-xs">
                      <span className="font-medium">GSTIN:</span> {invoice.clientGstin}
                    </p>
                  )}
                </div>
                <div className="rounded-lg bg-muted/40 p-3 text-xs">
                  <Detail label="Place of supply" value={invoice.placeOfSupply ?? '—'} />
                  <Detail label="SAC code" value={invoice.sacCode ?? '—'} />
                  <Detail label="Currency" value={invoice.currency} />
                  <Detail
                    label="Amount basis"
                    value={invoice.amountBasis === 'EXCLUSIVE' ? 'Excl. GST' : 'Incl. GST'}
                  />
                  <p className="mt-2 text-[11px] leading-snug text-muted-foreground">
                    {treatmentLabel(invoice.taxTreatment as TaxTreatment)}
                  </p>
                </div>
              </div>

              <Separator className="my-5" />

              {/* Items */}
              <div className="overflow-x-auto scrollbar-thin">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="pb-2 font-medium">Description</th>
                      <th className="pb-2 font-medium">SAC</th>
                      <th className="pb-2 text-right font-medium">Qty</th>
                      <th className="pb-2 text-right font-medium">Rate</th>
                      <th className="pb-2 text-right font-medium">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoice.items.map((item) => (
                      <tr key={item.id} className="border-b last:border-0">
                        <td className="py-2.5">{item.description}</td>
                        <td className="py-2.5 text-muted-foreground">{item.sacCode ?? '—'}</td>
                        <td className="py-2.5 text-right tabular">{Number(item.quantity).toFixed(2)}</td>
                        <td className="py-2.5 text-right tabular">
                          {formatMoney(item.unitPrice.toString(), invoice.currency)}
                        </td>
                        <td className="py-2.5 text-right font-medium tabular">
                          {formatMoney(item.amount.toString(), invoice.currency)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Totals */}
              <div className="mt-5 flex justify-end">
                <div className="w-full max-w-xs space-y-1.5 text-sm">
                  <TotalRow label="Taxable value" value={formatMoney(invoice.subTotal.toString(), invoice.currency)} />
                  {Number(invoice.discount) > 0 && (
                    <TotalRow label="Discount" value={`− ${formatMoney(invoice.discount.toString(), invoice.currency)}`} muted />
                  )}
                  {isIntra && Number(invoice.cgst) > 0 && (
                    <>
                      <TotalRow label={`CGST @ ${(Number(invoice.gstRate) / 2).toFixed(2)}%`} value={formatMoney(invoice.cgst.toString(), invoice.currency)} muted />
                      <TotalRow label={`SGST @ ${(Number(invoice.gstRate) / 2).toFixed(2)}%`} value={formatMoney(invoice.sgst.toString(), invoice.currency)} muted />
                    </>
                  )}
                  {Number(invoice.igst) > 0 && (
                    <TotalRow label={`IGST @ ${Number(invoice.gstRate).toFixed(2)}%`} value={formatMoney(invoice.igst.toString(), invoice.currency)} muted />
                  )}
                  {Number(invoice.gstRate) === 0 && (
                    <TotalRow label="GST (zero-rated)" value={formatMoney(0, invoice.currency)} muted />
                  )}
                  {Math.abs(Number(invoice.roundOff)) > 0.001 && (
                    <TotalRow label="Round off" value={formatMoney(invoice.roundOff.toString(), invoice.currency)} muted />
                  )}

                  <Separator className="my-2" />
                  <div className="flex items-center justify-between font-semibold">
                    <span>Total</span>
                    <span className="text-lg tabular">
                      {formatMoney(invoice.total.toString(), invoice.currency)}
                    </span>
                  </div>

                  {Number(invoice.tdsAmount) > 0 && (
                    <>
                      <TotalRow
                        label={`Less TDS @ ${Number(invoice.tdsRate).toFixed(2)}% (194J)`}
                        value={`− ${formatMoney(invoice.tdsAmount.toString(), invoice.currency)}`}
                        muted
                      />
                      <div className="flex items-center justify-between border-t pt-1.5 text-sm font-medium">
                        <span>Net receivable</span>
                        <span className="tabular">
                          {formatMoney(invoice.netReceivable.toString(), invoice.currency)}
                        </span>
                      </div>
                    </>
                  )}

                  {Number(invoice.amountPaid) > 0 && (
                    <>
                      <TotalRow label="Received" value={`− ${formatMoney(invoice.amountPaid.toString(), invoice.currency)}`} muted />
                      <div className="flex items-center justify-between font-medium">
                        <span>Balance due</span>
                        <span className="tabular">
                          {formatMoney(invoice.balanceDue.toString(), invoice.currency)}
                        </span>
                      </div>
                    </>
                  )}
                </div>
              </div>

              <div className="mt-5 rounded-lg border-l-2 border-primary bg-muted/40 p-3">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Amount in words</p>
                <p className="text-sm font-medium">
                  {amountInWords(toMinor(invoice.total.toString()), invoice.currency)}
                </p>
              </div>

              {invoice.terms && (
                <div className="mt-4">
                  <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Terms
                  </p>
                  <p className="text-xs text-muted-foreground">{invoice.terms}</p>
                </div>
              )}
              {invoice.notes && (
                <div className="mt-3">
                  <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Notes
                  </p>
                  <p className="text-xs text-muted-foreground">{invoice.notes}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Payments */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Payments</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {invoice.payments.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  No payments recorded yet.
                </p>
              ) : (
                <ul className="divide-y">
                  {invoice.payments.map((p) => (
                    <li key={p.id} className="flex flex-wrap items-center gap-3 py-2.5">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium tabular">
                          {formatMoney(p.amount.toString(), p.currency)}
                          {Number(p.tdsDeducted) > 0 && (
                            <span className="ml-2 text-xs font-normal text-muted-foreground">
                              + {formatMoney(p.tdsDeducted.toString(), p.currency)} TDS
                            </span>
                          )}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {p.method.replace(/_/g, ' ')}
                          {p.reference ? ` · ${p.reference}` : ''}
                          {p.gatewayPaymentId ? ` · ${p.gatewayPaymentId}` : ''}
                        </p>
                      </div>
                      <StatusBadge status={p.status} />
                      <span className="text-xs text-muted-foreground">
                        {p.paidAt ? formatDate(p.paidAt) : formatDate(p.createdAt)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 pt-0 text-sm">
              <SideRow icon={Building2} label="Client">
                {invoice.client ? (
                  <Link href={`/clients/${invoice.client.id}`} className="hover:underline">
                    {invoice.clientName}
                  </Link>
                ) : (
                  invoice.clientName
                )}
              </SideRow>
              <SideRow icon={Calendar} label="Issued">{formatDate(invoice.issueDate)}</SideRow>
              <SideRow icon={Calendar} label="Due">{formatDate(invoice.dueDate)}</SideRow>
              {invoice.sentAt && (
                <SideRow icon={Calendar} label="Sent">{formatDateTime(invoice.sentAt)}</SideRow>
              )}
              {invoice.paidAt && (
                <SideRow icon={Calendar} label="Paid">{formatDateTime(invoice.paidAt)}</SideRow>
              )}
              {invoice.createdBy && (
                <SideRow icon={FileText} label="Created by">{invoice.createdBy.name}</SideRow>
              )}
              {invoice.sow && (
                <SideRow icon={FileText} label="SOW">
                  <Link href={`/sows/${invoice.sow.id}`} className="hover:underline">
                    {invoice.sow.number}
                  </Link>
                </SideRow>
              )}
              {invoice.project && (
                <SideRow icon={FileText} label="Project">
                  <Link href={`/projects/${invoice.project.id}`} className="hover:underline">
                    {invoice.project.name}
                  </Link>
                </SideRow>
              )}
            </CardContent>
          </Card>

          {invoice.paymentLinkUrl && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Payment link</CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <p className="break-all text-xs text-muted-foreground">{invoice.paymentLinkUrl}</p>
                {invoice.paymentLinkExpiresAt && (
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    Expires {formatDate(invoice.paymentLinkExpiresAt)}
                  </p>
                )}
                <Button variant="outline" size="sm" className="mt-3 w-full" asChild>
                  <a href={invoice.paymentLinkUrl} target="_blank" rel="noreferrer">
                    <ExternalLink />
                    Open
                  </a>
                </Button>
              </CardContent>
            </Card>
          )}

          {invoice.creditNotes.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Credit notes</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 pt-0">
                {invoice.creditNotes.map((cn) => (
                  <Link
                    key={cn.id}
                    href={`/invoices/${cn.id}`}
                    className="flex items-center justify-between rounded-md border p-2.5 text-sm transition-colors hover:bg-accent/50"
                  >
                    <span className="font-medium">{cn.number}</span>
                    <span className="tabular">{formatMoney(cn.total.toString(), cn.currency)}</span>
                  </Link>
                ))}
              </CardContent>
            </Card>
          )}

          {invoice.messages.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Delivery log</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2.5 pt-0">
                {invoice.messages.map((m) => (
                  <div key={m.id} className="flex items-start gap-2 text-xs">
                    <StatusBadge status={m.status} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate">
                        {m.channel === 'EMAIL' ? 'Email' : 'WhatsApp'} → {m.toAddress}
                      </p>
                      <p className="text-muted-foreground">
                        {m.sentAt ? formatDateTime(m.sentAt) : `${m.attempts} attempt(s)`}
                      </p>
                      {m.lastError && (
                        <p className="mt-0.5 break-words text-destructive">{m.lastError}</p>
                      )}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-0.5">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

function TotalRow({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className={`flex items-center justify-between ${muted ? 'text-muted-foreground' : ''}`}>
      <span className="text-xs">{label}</span>
      <span className="tabular">{value}</span>
    </div>
  );
}

function SideRow({
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
