import type { Metadata } from 'next';
import { AlertCircle, Ban, Clock, FileText } from 'lucide-react';
import { resolveSowToken } from '@/server/actions/sow';
import { formatMoney } from '@/lib/billing/money';
import { formatDate, formatDateTime } from '@/lib/utils';
import { SignForm } from './sign-form';

export const metadata: Metadata = { title: 'Review & sign', robots: { index: false } };

const FAILURE_COPY = {
  not_found: {
    icon: AlertCircle,
    title: 'Link not found',
    body: 'This signing link is not valid. Please check the URL, or ask your contact to resend it.',
  },
  expired: {
    icon: Clock,
    title: 'Link expired',
    body: 'For security, signing links expire after 30 days. Ask your contact to send a fresh one.',
  },
  revoked: {
    icon: Ban,
    title: 'Link revoked',
    body: 'This link has been withdrawn. Please contact us if you still need to review this document.',
  },
} as const;

/**
 * Public SOW review and signing page.
 * No session required — access is entirely by the tokenised link.
 */
export default async function SignPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const result = await resolveSowToken(token);

  if (!result.ok) {
    const copy = FAILURE_COPY[result.reason];
    const Icon = copy.icon;
    return (
      <main className="flex min-h-screen items-center justify-center bg-muted/30 px-6">
        <div className="w-full max-w-md rounded-xl border bg-card p-8 text-center">
          <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-muted">
            <Icon className="h-5 w-5 text-muted-foreground" />
          </div>
          <h1 className="text-lg font-semibold">{copy.title}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{copy.body}</p>
        </div>
      </main>
    );
  }

  const { sow, expiresAt } = result;
  const signed = sow.status === 'SIGNED' && sow.signature;

  return (
    <main className="min-h-screen bg-muted/30 pb-16">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-6 py-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary">
            <FileText className="h-4 w-4 text-primary-foreground" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">Statement of Work</p>
            <p className="truncate text-xs text-muted-foreground">
              {sow.number} · {sow.client.legalName || sow.client.name}
            </p>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-6 py-8">
        {signed && (
          <div className="mb-6 rounded-lg border border-success/40 bg-success/5 p-4">
            <p className="text-sm font-medium text-success">This SOW has been signed.</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Signed by {sow.signature!.signerName} ({sow.signature!.signerEmail}) on{' '}
              {formatDateTime(sow.signature!.signedAt)} from IP {sow.signature!.ipAddress}.
            </p>
          </div>
        )}

        <article className="rounded-xl border bg-card p-6 sm:p-8">
          <div className="mb-6 flex flex-col gap-3 border-b pb-6 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <h1 className="text-xl font-semibold tracking-tight">{sow.title}</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {sow.startDate ? `From ${formatDate(sow.startDate)}` : 'Start date to be confirmed'}
                {sow.endDate ? ` to ${formatDate(sow.endDate)}` : ''}
              </p>
            </div>
            <div className="shrink-0 sm:text-right">
              <p className="text-xs text-muted-foreground">Total value</p>
              <p className="text-xl font-semibold tabular">
                {formatMoney(sow.value.toString(), sow.currency)}
              </p>
            </div>
          </div>

          <Section title="Scope of work" body={sow.scope} />
          {sow.deliverables && <Section title="Deliverables" body={sow.deliverables} />}
          {sow.timeline && <Section title="Timeline" body={sow.timeline} />}
          {sow.assumptions && <Section title="Assumptions" body={sow.assumptions} />}
          {sow.outOfScope && <Section title="Out of scope" body={sow.outOfScope} />}
          {sow.paymentTerms && <Section title="Payment terms" body={sow.paymentTerms} />}

          {sow.milestones.length > 0 && (
            <section className="mt-6">
              <h2 className="mb-2 text-sm font-semibold">Payment milestones</h2>
              <div className="overflow-x-auto scrollbar-thin rounded-lg border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="px-3 py-2 font-medium">Milestone</th>
                      <th className="px-3 py-2 text-right font-medium">Share</th>
                      <th className="px-3 py-2 text-right font-medium">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sow.milestones.map((m) => (
                      <tr key={m.id} className="border-t">
                        <td className="px-3 py-2">
                          <p className="font-medium">{m.title}</p>
                          {m.description && (
                            <p className="text-xs text-muted-foreground">{m.description}</p>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right tabular">
                          {Number(m.percentage).toFixed(0)}%
                        </td>
                        <td className="px-3 py-2 text-right font-medium tabular">
                          {formatMoney(m.amount.toString(), sow.currency)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </article>

        {!signed && (
          <>
            <SignForm token={token} sowNumber={sow.number} />
            <p className="mt-4 text-center text-xs text-muted-foreground">
              This link expires on {formatDate(expiresAt)}.
            </p>
          </>
        )}
      </div>
    </main>
  );
}

function Section({ title, body }: { title: string; body: string }) {
  return (
    <section className="mt-6 first:mt-0">
      <h2 className="mb-1.5 text-sm font-semibold">{title}</h2>
      <div className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">{body}</div>
    </section>
  );
}
