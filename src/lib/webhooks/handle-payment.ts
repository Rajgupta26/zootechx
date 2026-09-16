import { prisma } from '@/lib/db';
import { audit } from '@/lib/audit';
import { notify } from '@/lib/notifications';
import { applyPayment } from '@/lib/billing/invoice-service';
import { getProviderByName } from '@/lib/integrations/payments';
import { toDecimalString } from '@/lib/billing/money';

/**
 * Shared, idempotent gateway webhook handler.
 *
 * Idempotency has two layers:
 *   1. WebhookEvent (provider, eventId) is unique — a replayed delivery is
 *      recorded once and short-circuits.
 *   2. Payment.gatewayPaymentId is unique — even if the same payment arrives
 *      under two different event ids, it can only be credited once.
 *
 * A well-formed, verified event always returns 200, because a non-2xx makes the
 * gateway retry indefinitely. Processing failures are stored on the event row.
 */
export async function handlePaymentWebhook(
  providerName: string,
  rawBody: string,
  headers: Record<string, string>
): Promise<{ status: number; body: Record<string, unknown> }> {
  const provider = getProviderByName(providerName);
  const verification = await provider.verifyWebhook(rawBody, headers);

  if (!verification.valid) {
    // A bad signature is not retryable — reject outright.
    return { status: 400, body: { error: verification.reason ?? 'Invalid signature' } };
  }

  // Layer 1: has this exact event already been processed?
  const existing = await prisma.webhookEvent.findUnique({
    where: { provider_eventId: { provider: providerName, eventId: verification.eventId } },
  });
  if (existing?.processedAt) {
    return { status: 200, body: { received: true, duplicate: true } };
  }

  const event =
    existing ??
    (await prisma.webhookEvent.create({
      data: {
        provider: providerName,
        eventId: verification.eventId,
        eventType: verification.eventType,
        payload: verification.payload as never,
      },
    }));

  if (!verification.payment) {
    await prisma.webhookEvent.update({
      where: { id: event.id },
      data: { processedAt: new Date() },
    });
    return { status: 200, body: { received: true, ignored: verification.eventType } };
  }

  try {
    const { gatewayPaymentId, gatewayOrderId, amountMinor, invoiceReference, paidAt } =
      verification.payment;

    // Resolve the invoice: metadata id first, then the stored payment-link ref.
    const invoice = invoiceReference
      ? await prisma.invoice.findUnique({ where: { id: invoiceReference } })
      : gatewayOrderId
        ? await prisma.invoice.findFirst({ where: { paymentLinkRef: gatewayOrderId } })
        : null;

    if (!invoice) {
      await prisma.webhookEvent.update({
        where: { id: event.id },
        data: {
          processedAt: new Date(),
          error: `No invoice matched (ref=${invoiceReference ?? gatewayOrderId ?? 'none'})`,
        },
      });
      // Still 200 — retrying will not make the invoice appear.
      return { status: 200, body: { received: true, matched: false } };
    }

    const amount = toDecimalString(amountMinor);

    // Layer 2: applyPayment is itself idempotent on gatewayPaymentId.
    const result = await applyPayment({
      invoiceId: invoice.id,
      amount,
      method: providerName.toUpperCase() === 'STRIPE' ? 'STRIPE' : 'RAZORPAY',
      gatewayPaymentId,
      gatewayOrderId,
      paidAt,
      notes: `Auto-reconciled from ${providerName} webhook`,
    });

    // Close out the PENDING placeholder created at dispatch time.
    if (!result.duplicate) {
      await prisma.payment.updateMany({
        where: { invoiceId: invoice.id, status: 'PENDING' },
        data: { status: 'SUCCESS', paidAt },
      });

      await audit({
        action: 'payment.webhook',
        entity: 'invoice',
        entityId: invoice.id,
        summary: `${providerName} confirmed ${invoice.currency} ${amount} for ${invoice.number} — now ${result.invoice.status}`,
        metadata: { gatewayPaymentId, eventId: verification.eventId },
      });

      await notify({
        type: 'PAYMENT_RECEIVED',
        title: `Payment received — ${invoice.number}`,
        body: `${invoice.currency} ${amount} from ${invoice.clientName}.`,
        linkUrl: `/invoices/${invoice.id}`,
        roles: ['SUPER_ADMIN', 'SUB_ADMIN'],
        alsoUserIds: invoice.createdById ? [invoice.createdById] : [],
      });
    }

    await prisma.webhookEvent.update({
      where: { id: event.id },
      data: { processedAt: new Date() },
    });

    return {
      status: 200,
      body: { received: true, invoice: invoice.number, status: result.invoice.status },
    };
  } catch (err) {
    await prisma.webhookEvent.update({
      where: { id: event.id },
      data: { error: (err as Error).message },
    });
    // 500 so the gateway retries — internal failure, not bad data.
    return { status: 500, body: { error: 'Processing failed, will retry' } };
  }
}
