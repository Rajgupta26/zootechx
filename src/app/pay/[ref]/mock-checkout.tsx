'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CreditCard, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatMoney } from '@/lib/billing/money';

/**
 * Simulates a successful capture by posting a webhook-shaped payload to the
 * mock provider's own webhook endpoint — exercising the real reconciliation
 * path (idempotency ledger included) rather than writing to the DB directly.
 */
export function MockCheckout({
  invoiceId, reference, amount, currency, invoiceNumber,
}: {
  invoiceId: string;
  reference: string;
  amount: string;
  currency: 'INR' | 'USD';
  invoiceNumber: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pay = async () => {
    setLoading(true);
    setError(null);

    const amountMinor = Math.round(Number(amount.replace(/[,\s]/g, '')) * 100);

    try {
      const res = await fetch('/api/webhooks/razorpay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-mock-provider': 'mock' },
        body: JSON.stringify({
          id: `mock_evt_${reference}_${Date.now()}`,
          event: 'payment.captured',
          payment: {
            id: `mock_pay_${reference}`,
            order_id: reference,
            amount: amountMinor,
            currency,
            notes: { invoiceId },
          },
        }),
      });

      if (!res.ok) throw new Error(`Gateway returned ${res.status}`);

      router.push(`/pay/success?invoice=${encodeURIComponent(invoiceNumber)}`);
    } catch (err) {
      setError((err as Error).message);
      setLoading(false);
    }
  };

  return (
    <>
      {error && (
        <p className="mb-3 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
          {error}
        </p>
      )}

      <Button onClick={pay} className="w-full" size="lg" disabled={loading}>
        {loading ? <Loader2 className="animate-spin" /> : <CreditCard />}
        Pay {formatMoney(amount, currency)}
      </Button>

      <p className="mt-3 text-center text-xs text-muted-foreground">
        Demo gateway — no card details are collected and no money moves. Configure
        <code className="mx-1 rounded bg-muted px-1 py-0.5">PAYMENTS_PROVIDER</code>
        for Razorpay or Stripe.
      </p>
    </>
  );
}
