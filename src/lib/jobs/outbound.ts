import type { MessageChannel } from '@prisma/client';
import { prisma } from '@/lib/db';
import { getEmailProvider } from '@/lib/integrations/email';
import { getWhatsAppProvider, normalisePhone } from '@/lib/integrations/whatsapp';
import { getStorageProvider } from '@/lib/integrations/storage';

/**
 * Outbound message queue with exponential backoff.
 *
 * Every email and WhatsApp send is persisted first, then attempted. A failure
 * schedules a retry rather than losing the message; after maxAttempts it goes
 * to DEAD_LETTER for a human to look at. `processOutboundQueue` is driven by
 * the cron route, so this works identically on a VPS and on serverless.
 */

const BACKOFF_MINUTES = [1, 5, 15, 60, 240];

export interface QueueEmailInput {
  to: string;
  subject: string;
  html: string;
  text?: string;
  /** Storage keys of attachments; fetched at send time so the row stays small. */
  attachmentKeys?: Array<{ key: string; filename: string; contentType: string }>;
  invoiceId?: string;
  entity?: string;
  entityId?: string;
}

export interface QueueWhatsAppInput {
  to: string;
  templateName: string;
  bodyParams: string[];
  documentUrl?: string;
  documentFilename?: string;
  invoiceId?: string;
  entity?: string;
  entityId?: string;
}

export async function queueEmail(input: QueueEmailInput) {
  return prisma.outboundMessage.create({
    data: {
      channel: 'EMAIL',
      status: 'QUEUED',
      toAddress: input.to,
      subject: input.subject,
      body: input.html,
      templateVars: input.text ? { text: input.text } : undefined,
      attachments: input.attachmentKeys ?? undefined,
      invoiceId: input.invoiceId,
      entity: input.entity,
      entityId: input.entityId,
      nextAttemptAt: new Date(),
    },
  });
}

export async function queueWhatsApp(input: QueueWhatsAppInput) {
  return prisma.outboundMessage.create({
    data: {
      channel: 'WHATSAPP',
      status: 'QUEUED',
      toAddress: normalisePhone(input.to),
      templateName: input.templateName,
      templateVars: {
        bodyParams: input.bodyParams,
        documentUrl: input.documentUrl,
        documentFilename: input.documentFilename,
      },
      invoiceId: input.invoiceId,
      entity: input.entity,
      entityId: input.entityId,
      nextAttemptAt: new Date(),
    },
  });
}

/** Attempt one queued message. Returns true when it was delivered. */
export async function deliverMessage(messageId: string): Promise<boolean> {
  const message = await prisma.outboundMessage.findUnique({ where: { id: messageId } });
  if (!message || message.status === 'SENT' || message.status === 'DEAD_LETTER') return false;

  await prisma.outboundMessage.update({
    where: { id: messageId },
    data: { status: 'SENDING', attempts: { increment: 1 } },
  });

  try {
    let result: { accepted: boolean; providerMessageId: string; error?: string };

    if (message.channel === 'EMAIL') {
      const storage = getStorageProvider();
      const keys = (message.attachments ?? []) as Array<{
        key: string; filename: string; contentType: string;
      }>;

      const attachments = await Promise.all(
        keys.map(async (a) => ({
          filename: a.filename,
          content: await storage.get(a.key),
          contentType: a.contentType,
        }))
      );

      const vars = (message.templateVars ?? {}) as { text?: string };
      result = await getEmailProvider().send({
        to: message.toAddress,
        subject: message.subject ?? '',
        html: message.body ?? '',
        text: vars.text,
        attachments: attachments.length ? attachments : undefined,
      });
    } else {
      const vars = (message.templateVars ?? {}) as {
        bodyParams?: string[]; documentUrl?: string; documentFilename?: string;
      };
      result = await getWhatsAppProvider().sendTemplate({
        to: message.toAddress,
        templateName: message.templateName ?? '',
        bodyParams: vars.bodyParams ?? [],
        documentUrl: vars.documentUrl,
        documentFilename: vars.documentFilename,
      });
    }

    if (result.accepted) {
      await prisma.outboundMessage.update({
        where: { id: messageId },
        data: {
          status: 'SENT',
          sentAt: new Date(),
          providerMessageId: result.providerMessageId,
          lastError: null,
          nextAttemptAt: null,
        },
      });
      return true;
    }

    await scheduleRetry(messageId, message.attempts + 1, message.maxAttempts, result.error ?? 'Provider rejected the message');
    return false;
  } catch (err) {
    await scheduleRetry(messageId, message.attempts + 1, message.maxAttempts, (err as Error).message);
    return false;
  }
}

async function scheduleRetry(
  messageId: string,
  attempts: number,
  maxAttempts: number,
  error: string
) {
  if (attempts >= maxAttempts) {
    await prisma.outboundMessage.update({
      where: { id: messageId },
      data: { status: 'DEAD_LETTER', lastError: error, nextAttemptAt: null },
    });
    return;
  }

  const delayMinutes = BACKOFF_MINUTES[Math.min(attempts - 1, BACKOFF_MINUTES.length - 1)];
  await prisma.outboundMessage.update({
    where: { id: messageId },
    data: {
      status: 'QUEUED',
      lastError: error,
      nextAttemptAt: new Date(Date.now() + delayMinutes * 60_000),
    },
  });
}

/** Drain due messages. Called by /api/cron/dispatch. */
export async function processOutboundQueue(limit = 25): Promise<{
  processed: number; sent: number; failed: number;
}> {
  const due = await prisma.outboundMessage.findMany({
    where: { status: 'QUEUED', nextAttemptAt: { lte: new Date() } },
    orderBy: { nextAttemptAt: 'asc' },
    take: limit,
    select: { id: true },
  });

  let sent = 0;
  for (const msg of due) {
    if (await deliverMessage(msg.id)) sent += 1;
  }

  return { processed: due.length, sent, failed: due.length - sent };
}
