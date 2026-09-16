import type { Metadata } from 'next';
import { XCircle } from 'lucide-react';

export const metadata: Metadata = { title: 'Payment cancelled', robots: { index: false } };

export default function PaymentCancelled() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30 px-6">
      <div className="w-full max-w-md rounded-xl border bg-card p-8 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
          <XCircle className="h-6 w-6 text-muted-foreground" />
        </div>
        <h1 className="text-lg font-semibold">Payment cancelled</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Nothing was charged. You can return to the payment link in your invoice email whenever
          you are ready.
        </p>
      </div>
    </main>
  );
}
