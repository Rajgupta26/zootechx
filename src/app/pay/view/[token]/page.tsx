import type { Metadata } from 'next';
import { AlertCircle, Download, ExternalLink } from 'lucide-react';
import { prisma } from '@/lib/db';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/status-badge';
import { formatMoney, amountInWords, toMinor } from '@/lib/billing/money';
import { formatDate } from '@/lib/utils';

export const metadata: Metadata = { title: 'Invoice', robots: { index: false } };

/**
 * Public, tokenised invoice view. No login required — the token is the
 * credential, and it expires.
 */
export default async function PublicInvoiceView({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const link = await prisma.shareLink.findUnique({
    where: { token },
    include: { invoice: { include: { items: { orderBy: { position: 'asc' } } } } },
  });

  const invalid =
    !link || link.kind !== 'INVOICE' || !link.invoice || link.revokedAt || link.expiresAt < new Date();

  if (invalid) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-muted/30 px-6">
        <div className="w-full max-w-md rounded-xl border bg-card p-8 text-center">
          <AlertCircle className="mx-auto mb-3 h-6 w-6 text-muted-foreground" />
          <h1 className="text-lg font-semibold">Link unavailable</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            This invoice link has expired or been withdrawn. Please contact us for a fresh copy.
          </p>
        </div>
      </main>
    );
  }

  const invoice = link.invoice!;
  const company = invoice.companySnapshot as Record<string, string>;

  await prisma.shareLink
    .update({
      where: { id: link.id },
      data: { viewCount: { increment: 1 }, lastViewedAt: new Date() },
    })
    .catch(() => undefined);

  const payable = Number(invoice.balanceDue) > 0 && Boolean(invoice.paymentLinkUrl);

  return (
    <main className="min-h-screen bg-muted/30 py-8">
      <div className="mx-auto max-w-2xl px-4 sm:px-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">{invoice.number}</h1>
            <p className="text-sm text-muted-foreground">
              From {company?.tradeName || company?.legalName}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge status={invoice.status} />
            {payable && (
              <Button asChild>
                <a href={invoice.paymentLinkUrl!} target="_blank" rel="noreferrer">
                  Pay now
                  <ExternalLink />
                </a>
              </Button>
            )}
          </div>
        </div>

        <div className="rounded-xl border bg-card p-6">
          <div className="mb-5 grid gap-4 border-b pb-5 sm:grid-cols-2">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Billed to
              </p>
              <p className="mt-1 font-medium">{invoice.clientLegalName || invoice.clientName}</p>
              {invoice.billingAddress && (
                <p className="whitespace-pre-line text-xs text-muted-foreground">
                  {invoice.billingAddress}
                </p>
              )}
              {invoice.clientGstin && (
                <p className="mt-1 text-xs">GSTIN: {invoice.clientGstin}</p>
              )}
            </div>
            <div className="sm:text-right">
              <p className="text-xs text-muted-foreground">
                Issued {formatDate(invoice.issueDate)}
              </p>
              <p className="text-xs text-muted-foreground">Due {formatDate(invoice.dueDate)}</p>
            </div>
          </div>

          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="pb-2 font-medium">Description</th>
                <th className="pb-2 text-right font-medium">Amount</th>
              </tr>
            </thead>
            <tbody>
              {invoice.items.map((item) => (
                <tr key={item.id} className="border-b last:border-0">
                  <td className="py-2.5">{item.description}</td>
                  <td className="py-2.5 text-right tabular">
                    {formatMoney(item.amount.toString(), invoice.currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="mt-4 space-y-1.5 text-sm">
            <Row label="Taxable value" value={formatMoney(invoice.subTotal.toString(), invoice.currency)} />
            {Number(invoice.cgst) > 0 && (
              <>
                <Row label={`CGST @ ${(Number(invoice.gstRate) / 2).toFixed(2)}%`} value={formatMoney(invoice.cgst.toString(), invoice.currency)} />
                <Row label={`SGST @ ${(Number(invoice.gstRate) / 2).toFixed(2)}%`} value={formatMoney(invoice.sgst.toString(), invoice.currency)} />
              </>
            )}
            {Number(invoice.igst) > 0 && (
              <Row label={`IGST @ ${Number(invoice.gstRate).toFixed(2)}%`} value={formatMoney(invoice.igst.toString(), invoice.currency)} />
            )}
            <div className="flex items-center justify-between border-t pt-2 font-semibold">
              <span>Total</span>
              <span className="text-lg tabular">
                {formatMoney(invoice.total.toString(), invoice.currency)}
              </span>
            </div>
            {Number(invoice.amountPaid) > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Balance due</span>
                <span className="font-medium tabular">
                  {formatMoney(invoice.balanceDue.toString(), invoice.currency)}
                </span>
              </div>
            )}
          </div>

          <p className="mt-4 rounded-lg bg-muted/50 p-3 text-xs">
            {amountInWords(toMinor(invoice.total.toString()), invoice.currency)}
          </p>
        </div>

        <p className="mt-4 text-center text-xs text-muted-foreground">
          This link expires on {formatDate(link!.expiresAt)}.
        </p>
      </div>
    </main>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-muted-foreground">
      <span className="text-xs">{label}</span>
      <span className="tabular">{value}</span>
    </div>
  );
}
