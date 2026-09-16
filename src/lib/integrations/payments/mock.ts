import { randomUUID } from 'node:crypto';
import type {
  PaymentLinkRequest,
  PaymentLinkResult,
  PaymentProvider,
  WebhookVerification,
} from '../types';

/**
 * Mock gateway. Produces a working local payment page (/pay/[ref]) so the whole
 * invoice → link → webhook → PAID flow is exercisable without any account.
 */
export class MockPaymentProvider implements PaymentProvider {
  readonly name = 'mock';
  readonly supportedCurrencies = ['INR', 'USD'] as const;

  async createPaymentLink(req: PaymentLinkRequest): Promise<PaymentLinkResult> {
    const reference = `mock_plink_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
    const base = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
    return {
      provider: this.name,
      url: `${base}/pay/${reference}?invoice=${encodeURIComponent(req.invoiceNumber)}`,
      reference,
      expiresAt: req.expiresAt,
    };
  }

  async verifyWebhook(rawBody: string): Promise<WebhookVerification> {
    const payload = JSON.parse(rawBody) as Record<string, any>;
    const p = payload.payment ?? {};
    return {
      valid: true,
      eventId: payload.id ?? `mock_evt_${randomUUID()}`,
      eventType: payload.event ?? 'payment.captured',
      payload,
      payment: p.id
        ? {
            gatewayPaymentId: p.id,
            gatewayOrderId: p.order_id,
            amountMinor: BigInt(p.amount ?? 0),
            currency: (p.currency ?? 'INR') as 'INR' | 'USD',
            invoiceReference: p.notes?.invoiceId,
            paidAt: new Date(),
          }
        : undefined,
    };
  }

  async refund(gatewayPaymentId: string, amountMinor: bigint) {
    return { refundId: `mock_rfnd_${gatewayPaymentId}_${amountMinor}` };
  }
}
