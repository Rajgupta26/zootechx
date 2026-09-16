import { prisma } from '@/lib/db';
import { audit } from '@/lib/audit';
import { getPaymentProvider } from '@/lib/integrations/payments';
import { getStorageProvider, invoicePdfKey } from '@/lib/integrations/storage';
import { renderInvoicePdf } from '@/lib/pdf/invoice-pdf';
import { buildInvoicePdfData } from '@/lib/pdf/build-invoice-data';
import { queueEmail, queueWhatsApp, processOutboundQueue } from '@/lib/jobs/outbound';
import { notify } from '@/lib/notifications';
import { formatMoney, toMinor } from './money';
import { generateToken } from '@/lib/crypto';
import type { QuickInvoiceActor } from './invoice-service';

/**
 * Invoice dispatch.
 *
 * generatePaymentLink → renderPdf → store → queue email + WhatsApp → mark SENT.
 *
 * Each step is idempotent, so a partially-failed dispatch can be retried from
 * the UI without duplicating a payment link or burning a new invoice number.
 */

const PAYMENT_LINK_VALIDITY_DAYS = 30;

export async function generatePaymentLink(invoiceId: string, force = false) {
  const invoice = await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } });

  if (invoice.paymentLinkUrl && !force) {
    return { url: invoice.paymentLinkUrl, reference: invoice.paymentLinkRef, reused: true };
  }
  if (invoice.kind === 'CREDIT_NOTE') {
    throw new Error('Credit notes are not payable and cannot have a payment link.');
  }

  const provider = getPaymentProvider(invoice.currency);
  const base = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  const expiresAt = new Date(Date.now() + PAYMENT_LINK_VALIDITY_DAYS * 86_400_000);

  // Charge the outstanding balance, not the original total — a partially paid
  // invoice must not offer a link for the full amount.
  const balanceMinor = toMinor(invoice.balanceDue.toString());
  const amountMinor = balanceMinor > 0n ? balanceMinor : toMinor(invoice.total.toString());

  const link = await provider.createPaymentLink({
    invoiceId: invoice.id,
    invoiceNumber: invoice.number,
    amountMinor,
    currency: invoice.currency,
    description: `Invoice ${invoice.number}`,
    customer: {
      name: invoice.clientName,
      email: invoice.clientEmail,
      phone: invoice.clientPhone,
    },
    expiresAt,
    callbackUrl: `${base}/pay/success?invoice=${encodeURIComponent(invoice.number)}`,
  });

  await prisma.invoice.update({
    where: { id: invoiceId },
    data: {
      paymentLinkUrl: link.url,
      paymentLinkProvider: link.provider,
      paymentLinkRef: link.reference,
      paymentLinkExpiresAt: link.expiresAt ?? expiresAt,
    },
  });

  return { url: link.url, reference: link.reference, reused: false };
}

/** Render the PDF and store it. Returns the storage key. */
export async function generateInvoicePdf(invoiceId: string, force = false): Promise<string> {
  const invoice = await prisma.invoice.findUniqueOrThrow({
    where: { id: invoiceId },
    include: { items: true },
  });

  if (invoice.pdfKey && !force) return invoice.pdfKey;

  const buffer = await renderInvoicePdf(buildInvoicePdfData(invoice));
  const key = invoicePdfKey(invoice.number, invoice.issueDate);
  await getStorageProvider().put(key, buffer, 'application/pdf');

  await prisma.invoice.update({
    where: { id: invoiceId },
    data: { pdfKey: key, pdfGeneratedAt: new Date() },
  });

  return key;
}

export interface DispatchOptions {
  sendEmail?: boolean;
  sendWhatsApp?: boolean;
  /** Override the recipient email (defaults to the client's). */
  emailTo?: string;
  whatsAppTo?: string;
  ccEmails?: string[];
  /** Run the queue immediately instead of waiting for the cron tick. */
  deliverNow?: boolean;
}

/**
 * The "Approve & Send" action.
 *
 * Locks the invoice, attaches the PDF and payment link, queues both channels,
 * and creates the pending payment entry the CRM tracks against.
 */
export async function approveAndSendInvoice(
  invoiceId: string,
  actor: QuickInvoiceActor,
  options: DispatchOptions = {}
) {
  const {
    sendEmail = true,
    sendWhatsApp = true,
    deliverNow = true,
  } = options;

  const invoice = await prisma.invoice.findUniqueOrThrow({
    where: { id: invoiceId },
    include: { items: true, client: true },
  });

  if (invoice.status === 'CANCELLED') {
    throw new Error('This invoice has been cancelled.');
  }

  // 1. Payment link first — the PDF embeds it.
  const link = await generatePaymentLink(invoiceId);

  // 2. PDF (force a re-render so the link appears on it).
  const pdfKey = await generateInvoicePdf(invoiceId, true);

  // 3. A public, expiring link to view the invoice online.
  const shareToken = generateToken(24);
  await prisma.shareLink.create({
    data: {
      token: shareToken,
      kind: 'INVOICE',
      invoiceId,
      createdById: actor.id,
      expiresAt: new Date(Date.now() + 90 * 86_400_000),
    },
  });

  const base = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  const viewUrl = `${base}/pay/view/${shareToken}`;
  const amountLabel = formatMoney(invoice.total.toString(), invoice.currency);
  const dueLabel = invoice.dueDate.toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
  const companyName =
    (invoice.companySnapshot as { tradeName?: string; legalName?: string })?.tradeName ??
    (invoice.companySnapshot as { legalName?: string })?.legalName ??
    'XCC';

  const queued: string[] = [];

  // 4. Email with the PDF attached.
  const emailTo = options.emailTo ?? invoice.clientEmail ?? invoice.client?.email;
  if (sendEmail && emailTo) {
    await queueEmail({
      to: emailTo,
      subject: `Invoice ${invoice.number} from ${companyName} — ${amountLabel}`,
      html: invoiceEmailHtml({
        clientName: invoice.clientName,
        invoiceNumber: invoice.number,
        amount: amountLabel,
        dueDate: dueLabel,
        paymentUrl: link.url,
        viewUrl,
        companyName,
      }),
      text:
        `Hi ${invoice.clientName},\n\nInvoice ${invoice.number} for ${amountLabel} is due on ${dueLabel}.\n\n` +
        `Pay online: ${link.url}\nView invoice: ${viewUrl}\n\n— ${companyName}`,
      attachmentKeys: [
        { key: pdfKey, filename: `${invoice.number.replace(/\//g, '-')}.pdf`, contentType: 'application/pdf' },
      ],
      invoiceId,
      entity: 'invoice',
      entityId: invoiceId,
    });
    queued.push('email');
  }

  // 5. WhatsApp via an approved template (free-form is not permitted for
  //    business-initiated messages — see docs/INTEGRATIONS.md).
  const waTo = options.whatsAppTo ?? invoice.clientPhone ?? invoice.client?.phone;
  if (sendWhatsApp && waTo) {
    await queueWhatsApp({
      to: waTo,
      templateName: process.env.WHATSAPP_TEMPLATE_INVOICE ?? 'invoice_dispatch_v1',
      bodyParams: [invoice.clientName, invoice.number, amountLabel, dueLabel, link.url],
      documentUrl: await getStorageProvider().signedUrl(pdfKey, 7 * 86_400),
      documentFilename: `${invoice.number.replace(/\//g, '-')}.pdf`,
      invoiceId,
      entity: 'invoice',
      entityId: invoiceId,
    });
    queued.push('whatsapp');
  }

  // 6. Lock, mark sent, and open the pending receivable.
  const updated = await prisma.$transaction(async (tx) => {
    const inv = await tx.invoice.update({
      where: { id: invoiceId },
      data: {
        status: invoice.status === 'DRAFT' || invoice.status === 'PENDING_APPROVAL' ? 'SENT' : invoice.status,
        isLocked: true,
        sentAt: invoice.sentAt ?? new Date(),
      },
    });

    // A PENDING payment row makes the receivable visible in the payments
    // ledger before the gateway confirms anything.
    const alreadyPending = await tx.payment.findFirst({
      where: { invoiceId, status: 'PENDING' },
      select: { id: true },
    });
    if (!alreadyPending) {
      await tx.payment.create({
        data: {
          invoiceId,
          clientId: invoice.clientId,
          amount: inv.balanceDue,
          currency: inv.currency,
          fxRate: inv.fxRate,
          method: link.reference?.startsWith('plink') || inv.currency === 'INR' ? 'RAZORPAY' : 'STRIPE',
          status: 'PENDING',
          gatewayOrderId: link.reference ?? undefined,
          notes: 'Awaiting payment against dispatched invoice',
        },
      });
    }

    await audit(
      {
        actorId: actor.id,
        actorEmail: actor.email,
        actorRole: actor.role,
        action: 'invoice.send',
        entity: 'invoice',
        entityId: invoiceId,
        summary: `Sent ${invoice.number} to ${invoice.clientName} via ${queued.join(' + ') || 'no channel'}`,
        metadata: { channels: queued, paymentLink: link.url, amount: invoice.total.toString() },
        ip: actor.ip,
      },
      tx
    );

    return inv;
  });

  await notify({
    type: 'INVOICE_SENT',
    title: `Invoice ${invoice.number} sent`,
    body: `${amountLabel} to ${invoice.clientName}, due ${dueLabel}.`,
    linkUrl: `/invoices/${invoiceId}`,
    roles: ['SUPER_ADMIN', 'SUB_ADMIN'],
    alsoUserIds: actor.id ? [actor.id] : [],
  });

  if (deliverNow) {
    // Best-effort immediate delivery; anything that fails stays queued with a
    // retry already scheduled, so a slow provider never blocks the UI.
    await processOutboundQueue(10).catch(() => undefined);
  }

  return { invoice: updated, paymentUrl: link.url, viewUrl, pdfKey, channels: queued };
}

function invoiceEmailHtml(p: {
  clientName: string; invoiceNumber: string; amount: string;
  dueDate: string; paymentUrl: string; viewUrl: string; companyName: string;
}): string {
  return `<!doctype html>
<html><body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.08);">
        <tr><td style="background:#4F46E5;padding:24px 32px;">
          <div style="color:#fff;font-size:18px;font-weight:700;">${escapeHtml(p.companyName)}</div>
          <div style="color:#c7d2fe;font-size:13px;margin-top:2px;">Invoice ${escapeHtml(p.invoiceNumber)}</div>
        </td></tr>
        <tr><td style="padding:32px;">
          <p style="margin:0 0 16px;font-size:15px;color:#18181b;">Hi ${escapeHtml(p.clientName)},</p>
          <p style="margin:0 0 24px;font-size:14px;color:#52525b;line-height:1.6;">
            Please find invoice <strong>${escapeHtml(p.invoiceNumber)}</strong> attached as a PDF.
          </p>
          <table role="presentation" width="100%" style="background:#fafafa;border-radius:8px;padding:16px;margin-bottom:24px;">
            <tr>
              <td style="font-size:13px;color:#71717a;">Amount due</td>
              <td align="right" style="font-size:20px;font-weight:700;color:#18181b;">${escapeHtml(p.amount)}</td>
            </tr>
            <tr>
              <td style="font-size:13px;color:#71717a;padding-top:6px;">Due date</td>
              <td align="right" style="font-size:13px;color:#18181b;padding-top:6px;">${escapeHtml(p.dueDate)}</td>
            </tr>
          </table>
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 20px;">
            <tr><td style="border-radius:8px;background:#4F46E5;">
              <a href="${escapeHtml(p.paymentUrl)}" style="display:inline-block;padding:13px 32px;color:#fff;text-decoration:none;font-size:15px;font-weight:600;">Pay now</a>
            </td></tr>
          </table>
          <p style="margin:0;text-align:center;font-size:13px;">
            <a href="${escapeHtml(p.viewUrl)}" style="color:#4F46E5;text-decoration:none;">View invoice online</a>
          </p>
        </td></tr>
        <tr><td style="padding:20px 32px;background:#fafafa;border-top:1px solid #e4e4e7;">
          <p style="margin:0;font-size:12px;color:#a1a1aa;line-height:1.5;">
            Questions about this invoice? Reply to this email and we'll help.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
