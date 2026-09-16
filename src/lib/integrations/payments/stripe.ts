import type {
  PaymentLinkRequest,
  PaymentLinkResult,
  PaymentProvider,
  WebhookVerification,
} from '../types';
import { hmacSha256, timingSafeEqual } from '@/lib/crypto';

/**
 * Stripe Checkout Sessions (USD).
 *
 * Used for export invoices. Note that Stripe amounts are in cents and its
 * webhook signature is a timestamped HMAC, not a bare digest.
 */
export class StripeProvider implements PaymentProvider {
  readonly name = 'stripe';
  readonly supportedCurrencies = ['USD', 'INR'] as const;

  private readonly secretKey = process.env.STRIPE_SECRET_KEY ?? '';
  private readonly webhookSecret = process.env.STRIPE_WEBHOOK_SECRET ?? '';
  private readonly baseUrl = 'https://api.stripe.com/v1';

  async createPaymentLink(req: PaymentLinkRequest): Promise<PaymentLinkResult> {
    if (!this.secretKey) throw new Error('STRIPE_SECRET_KEY is not configured.');

    const base = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
    const form = new URLSearchParams({
      mode: 'payment',
      'line_items[0][quantity]': '1',
      'line_items[0][price_data][currency]': req.currency.toLowerCase(),
      'line_items[0][price_data][unit_amount]': String(req.amountMinor),
      'line_items[0][price_data][product_data][name]': `Invoice ${req.invoiceNumber}`,
      'line_items[0][price_data][product_data][description]': req.description.slice(0, 500),
      success_url: req.callbackUrl ?? `${base}/pay/success?invoice=${req.invoiceNumber}`,
      cancel_url: `${base}/pay/cancelled?invoice=${req.invoiceNumber}`,
      'metadata[invoiceId]': req.invoiceId,
      'metadata[invoiceNumber]': req.invoiceNumber,
    });
    if (req.customer.email) form.set('customer_email', req.customer.email);
    if (req.expiresAt) {
      form.set('expires_at', String(Math.floor(req.expiresAt.getTime() / 1000)));
    }

    const res = await fetch(`${this.baseUrl}/checkout/sessions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: form,
    });

    if (!res.ok) throw new Error(`Stripe checkout session failed: ${await res.text()}`);

    const data = (await res.json()) as { id: string; url: string; expires_at?: number };
    return {
      provider: this.name,
      url: data.url,
      reference: data.id,
      expiresAt: data.expires_at ? new Date(data.expires_at * 1000) : req.expiresAt,
    };
  }

  async verifyWebhook(rawBody: string, headers: Record<string, string>): Promise<WebhookVerification> {
    const header = headers['stripe-signature'] ?? '';
    const parts = Object.fromEntries(
      header.split(',').map((kv) => kv.split('=', 2) as [string, string])
    );
    const timestamp = parts.t;
    const signature = parts.v1;

    if (!this.webhookSecret || !timestamp || !signature) {
      return { valid: false, eventId: '', eventType: '', payload: {}, reason: 'Malformed signature header' };
    }

    // Reject replays older than 5 minutes.
    const age = Math.abs(Date.now() / 1000 - Number(timestamp));
    if (age > 300) {
      return { valid: false, eventId: '', eventType: '', payload: {}, reason: 'Timestamp outside tolerance' };
    }

    const expected = hmacSha256(`${timestamp}.${rawBody}`, this.webhookSecret);
    if (!timingSafeEqual(signature, expected)) {
      return { valid: false, eventId: '', eventType: '', payload: {}, reason: 'Signature mismatch' };
    }

    const payload = JSON.parse(rawBody) as Record<string, any>;
    const obj = payload.data?.object ?? {};
    const isPaid =
      payload.type === 'checkout.session.completed' && obj.payment_status === 'paid';

    return {
      valid: true,
      eventId: payload.id,
      eventType: payload.type,
      payload,
      payment: isPaid
        ? {
            gatewayPaymentId: obj.payment_intent ?? obj.id,
            gatewayOrderId: obj.id,
            amountMinor: BigInt(obj.amount_total ?? 0),
            currency: String(obj.currency ?? 'usd').toUpperCase() as 'INR' | 'USD',
            invoiceReference: obj.metadata?.invoiceId,
            paidAt: new Date((payload.created ?? Date.now() / 1000) * 1000),
          }
        : undefined,
    };
  }

  async refund(gatewayPaymentId: string, amountMinor: bigint) {
    const res = await fetch(`${this.baseUrl}/refunds`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        payment_intent: gatewayPaymentId,
        amount: String(amountMinor),
      }),
    });
    if (!res.ok) throw new Error(`Stripe refund failed: ${await res.text()}`);
    const data = (await res.json()) as { id: string };
    return { refundId: data.id };
  }
}
