import type { Metadata } from 'next';
import { CheckCircle2 } from 'lucide-react';

export const metadata: Metadata = { title: 'Payment received', robots: { index: false } };

export default async function PaymentSuccess({
  searchParams,
}: {
  searchParams: Promise<{ invoice?: string }>;
}) {
  const { invoice } = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30 px-6">
      <div className="w-full max-w-md rounded-xl border bg-card p-8 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-success/10">
          <CheckCircle2 className="h-6 w-6 text-success" />
        </div>
        <h1 className="text-lg font-semibold">Payment received</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {invoice ? (
            <>
              Thank you — invoice <strong>{invoice}</strong> has been paid and your receipt is on
              its way by email.
            </>
          ) : (
            'Thank you. Your payment has been recorded and a receipt is on its way by email.'
          )}
        </p>
        <p className="mt-4 text-xs text-muted-foreground">
          You can close this window.
        </p>
      </div>
    </main>
  );
}
