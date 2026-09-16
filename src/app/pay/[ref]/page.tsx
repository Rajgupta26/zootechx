import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Lock, ShieldCheck } from 'lucide-react';
import { prisma } from '@/lib/db';
import { formatMoney } from '@/lib/billing/money';
import { formatDate } from '@/lib/utils';
import { MockCheckout } from './mock-checkout';

export const metadata: Metadata = { title: 'Pay invoice', robots: { index: false } };

/**
 * Local stand-in for a hosted gateway checkout.
 *
 * Only reachable when PAYMENTS_PROVIDER=mock. With Razorpay or Stripe
 * configured, the payment link points at their hosted page instead and this
 * route is never generated.
 */
export default async function PayPage({ params }: { params: Promise<{ ref: string }> }) {
  const { ref } = await params;

  const invoice = await prisma.invoice.findFirst({
    where: { paymentLinkRef: ref },
    select: {
      id: true, number: true, clientName: true, total: true, balanceDue: true,
      currency: true, status: true, dueDate: true, paymentLinkExpiresAt: true,
    },
  });

  if (!invoice) notFound();

  const expired =
    invoice.paymentLinkExpiresAt && invoice.paymentLinkExpiresAt < new Date();
  const settled = invoice.status === 'PAID' || Number(invoice.balanceDue) <= 0;

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30 px-6 py-12">
      <div className="w-full max-w-md">
        <div className="rounded-xl border bg-card p-6 sm:p-8">
          <div className="mb-6 text-center">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Payment for</p>
            <h1 className="mt-1 text-lg font-semibold">{invoice.number}</h1>
            <p className="text-sm text-muted-foreground">{invoice.clientName}</p>
          </div>

          <div className="mb-6 rounded-lg bg-muted/50 p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Amount due</span>
              <span className="text-2xl font-semibold tabular">
                {formatMoney(invoice.balanceDue.toString(), invoice.currency)}
              </span>
            </div>
            <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
              <span>Invoice total</span>
              <span className="tabular">{formatMoney(invoice.total.toString(), invoice.currency)}</span>
            </div>
            <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
              <span>Due date</span>
              <span>{formatDate(invoice.dueDate)}</span>
            </div>
          </div>

          {settled ? (
            <div className="rounded-lg border border-success/40 bg-success/5 p-4 text-center">
              <ShieldCheck className="mx-auto mb-2 h-6 w-6 text-success" />
              <p className="text-sm font-medium">This invoice is settled</p>
              <p className="mt-1 text-xs text-muted-foreground">No payment is due. Thank you.</p>
            </div>
          ) : expired ? (
            <div className="rounded-lg border border-warning/40 bg-warning/5 p-4 text-center">
              <p className="text-sm font-medium">This payment link has expired</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Please ask for a refreshed link.
              </p>
            </div>
          ) : (
            <MockCheckout
              invoiceId={invoice.id}
              reference={ref}
              amount={invoice.balanceDue.toString()}
              currency={invoice.currency}
              invoiceNumber={invoice.number}
            />
          )}

          <p className="mt-6 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
            <Lock className="h-3 w-3" />
            Secured payment page
          </p>
        </div>
      </div>
    </main>
  );
}
