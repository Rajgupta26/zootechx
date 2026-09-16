import type {
  PaymentLinkRequest,
  PaymentLinkResult,
  PaymentProvider,
  WebhookVerification,
} from '../types';
import { hmacSha256, timingSafeEqual } from '@/lib/crypto';

/**
 * Razorpay Payment Links (INR).
 *
 * Uses the REST API directly rather than the SDK to keep the dependency
 * surface small and the request shape visible.
 * Docs: https://razorpay.com/docs/api/payments/payment-links/
 */
export class RazorpayProvider implements PaymentProvider {
  readonly name = 'razorpay';
  readonly supportedCurrencies = ['INR'] as const;

  private readonly keyId = process.env.RAZORPAY_KEY_ID ?? '';
  private readonly keySecret = process.env.RAZORPAY_KEY_SECRET ?? '';
  private readonly webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET ?? '';
  private readonly baseUrl = 'https://api.razorpay.com/v1';

  private authHeader(): string {
    return `Basic ${Buffer.from(`${this.keyId}:${this.keySecret}`).toString('base64')}`;
  }

  async createPaymentLink(req: PaymentLinkRequest): Promise<PaymentLinkResult> {
    if (!this.keyId || !this.keySecret) {
      throw new Error('RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET are not configured.');
    }

    const body = {
      amount: Number(req.amountMinor), // Razorpay wants paise
      currency: req.currency,
      description: req.description.slice(0, 2048),
      customer: {
        name: req.customer.name,
        email: req.customer.email ?? undefined,
        contact: req.customer.phone ?? undefined,
      },
      notify: { sms: false, email: false }, // we dispatch ourselves, with the PDF
      reminder_enable: true,
      expire_by: req.expiresAt ? Math.floor(req.expiresAt.getTime() / 1000) : undefined,
      callback_url: req.callbackUrl,
      callback_method: req.callbackUrl ? 'get' : undefined,
      notes: { invoiceId: req.invoiceId, invoiceNumber: req.invoiceNumber, ...req.notes },
    };

    const res = await fetch(`${this.baseUrl}/payment_links`, {
      method: 'POST',
      headers: { Authorization: this.authHeader(), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Razorpay payment link failed (${res.status}): ${text}`);
    }

    const data = (await res.json()) as { id: string; short_url: string; expire_by?: number };
    return {
      provider: this.name,
      url: data.short_url,
      reference: data.id,
      expiresAt: data.expire_by ? new Date(data.expire_by * 1000) : req.expiresAt,
    };
  }

  async verifyWebhook(rawBody: string, headers: Record<string, string>): Promise<WebhookVerification> {
    const signature = headers['x-razorpay-signature'] ?? '';
    const expected = hmacSha256(rawBody, this.webhookSecret);

    if (!this.webhookSecret || !signature || !timingSafeEqual(signature, expected)) {
      return { valid: false, eventId: '', eventType: '', payload: {}, reason: 'Signature mismatch' };
    }

    const payload = JSON.parse(rawBody) as Record<string, any>;
    const entity = payload.payload?.payment?.entity;

    return {
      valid: true,
      // Razorpay sends x-razorpay-event-id; fall back to the payment id so the
      // idempotency ledger always has a stable key.
      eventId: headers['x-razorpay-event-id'] ?? entity?.id ?? `rzp_${payload.created_at}`,
      eventType: payload.event ?? 'unknown',
      payload,
      payment:
        entity && ['payment.captured', 'payment_link.paid', 'order.paid'].includes(payload.event)
          ? {
              gatewayPaymentId: entity.id,
              gatewayOrderId: entity.order_id,
              amountMinor: BigInt(entity.amount ?? 0),
              currency: (entity.currency ?? 'INR') as 'INR' | 'USD',
              invoiceReference: entity.notes?.invoiceId,
              paidAt: new Date((entity.created_at ?? Date.now() / 1000) * 1000),
            }
          : undefined,
    };
  }

  async refund(gatewayPaymentId: string, amountMinor: bigint) {
    const res = await fetch(`${this.baseUrl}/payments/${gatewayPaymentId}/refund`, {
      method: 'POST',
      headers: { Authorization: this.authHeader(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: Number(amountMinor) }),
    });
    if (!res.ok) throw new Error(`Razorpay refund failed: ${await res.text()}`);
    const data = (await res.json()) as { id: string };
    return { refundId: data.id };
  }
}
