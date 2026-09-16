'use server';

import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { prisma } from '@/lib/db';
import { audit } from '@/lib/audit';
import { notify } from '@/lib/notifications';
import { generateToken, sha256 } from '@/lib/crypto';
import { requirePermission, requestContext } from '@/lib/session';
import { queueEmail } from '@/lib/jobs/outbound';
import { sowSchema, sowSignSchema } from '@/lib/validators';
import type { ActionResult } from './billing';

/**
 * SOW lifecycle and e-signature.
 *
 * Public links are tokenised, expire after SHARE_LINK_DAYS, and can be revoked
 * by hand. Signing captures name, email, IP, user agent, an explicit consent
 * statement and a SHA-256 of the document content — the hash is what proves
 * *what* was agreed to, since the SOW text could otherwise be edited later.
 */

const SHARE_LINK_DAYS = 30;

function nextNumber(count: number): string {
  return `SOW/${new Date().getFullYear()}/${String(count + 1).padStart(4, '0')}`;
}

/** Canonical string hashed at signing time. */
function documentContent(sow: {
  number: string; title: string; scope: string;
  deliverables: string | null; assumptions: string | null;
  outOfScope: string | null; timeline: string | null;
  paymentTerms: string | null; value: { toString(): string }; currency: string;
}): string {
  return [
    sow.number, sow.title, sow.scope, sow.deliverables ?? '', sow.assumptions ?? '',
    sow.outOfScope ?? '', sow.timeline ?? '', sow.paymentTerms ?? '',
    `${sow.currency} ${sow.value.toString()}`,
  ].join('\n---\n');
}

export async function createSowAction(raw: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const parsed = sowSchema.safeParse(raw);
    if (!parsed.success) {
      return { ok: false, error: 'Check the highlighted fields.', fieldErrors: parsed.error.flatten().fieldErrors };
    }

    const user = await requirePermission('sow', 'create');
    const count = await prisma.sow.count();

    const sow = await prisma.sow.create({
      data: {
        number: nextNumber(count),
        title: parsed.data.title,
        clientId: parsed.data.clientId,
        scope: parsed.data.scope,
        deliverables: parsed.data.deliverables,
        assumptions: parsed.data.assumptions,
        outOfScope: parsed.data.outOfScope,
        timeline: parsed.data.timeline,
        paymentTerms: parsed.data.paymentTerms,
        currency: parsed.data.currency,
        value: parsed.data.value.replace(/[,\s]/g, ''),
        startDate: parsed.data.startDate ? new Date(parsed.data.startDate) : null,
        endDate: parsed.data.endDate ? new Date(parsed.data.endDate) : null,
        createdById: user.id,
      },
    });

    await audit({
      actorId: user.id, actorEmail: user.email, actorRole: user.role,
      action: 'sow.create', entity: 'sow', entityId: sow.id,
      summary: `Created ${sow.number} — ${sow.title}`,
    });

    revalidatePath('/sows');
    return { ok: true, data: { id: sow.id } };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

/** Create a tokenised public link and email it to the client. */
export async function shareSowAction(
  sowId: string,
  options: { email?: string; expiryDays?: number } = {}
): Promise<ActionResult<{ url: string; expiresAt: string }>> {
  try {
    const user = await requirePermission('sow', 'send');
    const ctx = await requestContext();

    const sow = await prisma.sow.findUniqueOrThrow({
      where: { id: sowId },
      include: { client: { select: { name: true, email: true } } },
    });

    if (sow.status === 'SIGNED') {
      return { ok: false, error: 'This SOW has already been signed.' };
    }

    const token = generateToken(24);
    const expiresAt = new Date(Date.now() + (options.expiryDays ?? SHARE_LINK_DAYS) * 86_400_000);

    await prisma.shareLink.create({
      data: { token, kind: 'SOW', sowId, createdById: user.id, expiresAt },
    });

    const base = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
    const url = `${base}/sign/${token}`;
    const to = options.email ?? sow.client.email;

    if (to) {
      await queueEmail({
        to,
        subject: `Statement of Work ${sow.number} — ${sow.title}`,
        html: `
          <p>Hi ${sow.client.name},</p>
          <p>Please review and sign the statement of work for <strong>${sow.title}</strong>.</p>
          <p><a href="${url}">Review and sign the SOW</a></p>
          <p style="color:#666;font-size:12px">This link expires on ${expiresAt.toLocaleDateString('en-IN')}.</p>`,
        entity: 'sow',
        entityId: sowId,
      });
    }

    await prisma.sow.update({
      where: { id: sowId },
      data: { status: sow.status === 'DRAFT' ? 'SENT' : sow.status, sentAt: sow.sentAt ?? new Date() },
    });

    await audit({
      actorId: user.id, actorEmail: user.email, actorRole: user.role,
      action: 'sow.share', entity: 'sow', entityId: sowId,
      summary: `Shared ${sow.number} with ${to ?? 'a tokenised link'}, expiring ${expiresAt.toISOString().slice(0, 10)}`,
      metadata: { expiresAt: expiresAt.toISOString() },
      ip: ctx.ip,
    });

    revalidatePath(`/sows/${sowId}`);
    return { ok: true, data: { url, expiresAt: expiresAt.toISOString() } };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

/** Manual revocation — kills every outstanding link for this SOW. */
export async function revokeSowLinksAction(sowId: string): Promise<ActionResult<{ revoked: number }>> {
  try {
    const user = await requirePermission('sow', 'update');
    const ctx = await requestContext();

    const result = await prisma.shareLink.updateMany({
      where: { sowId, revokedAt: null },
      data: { revokedAt: new Date(), revokedById: user.id },
    });

    await prisma.sow.updateMany({
      where: { id: sowId, status: { in: ['SENT', 'VIEWED'] } },
      data: { status: 'REVOKED' },
    });

    await audit({
      actorId: user.id, actorEmail: user.email, actorRole: user.role,
      action: 'sow.revoke', entity: 'sow', entityId: sowId,
      summary: `Revoked ${result.count} share link(s)`,
      ip: ctx.ip,
    });

    revalidatePath(`/sows/${sowId}`);
    return { ok: true, data: { revoked: result.count } };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

/**
 * Public: resolve a token to a viewable SOW.
 * Returns a discriminated reason so the page can distinguish expired from
 * revoked from never-existed, without leaking whether a token was ever valid.
 */
export async function resolveSowToken(token: string) {
  const link = await prisma.shareLink.findUnique({
    where: { token },
    include: {
      sow: {
        include: {
          client: { select: { name: true, legalName: true } },
          milestones: { orderBy: { position: 'asc' } },
          signature: true,
        },
      },
    },
  });

  if (!link || link.kind !== 'SOW' || !link.sow) return { ok: false as const, reason: 'not_found' as const };
  if (link.revokedAt) return { ok: false as const, reason: 'revoked' as const };
  if (link.expiresAt < new Date()) return { ok: false as const, reason: 'expired' as const };

  // Record the view. Fire-and-forget so a tracking failure never blocks access.
  const ctx = await requestContext();
  await prisma.shareLink
    .update({
      where: { id: link.id },
      data: { viewCount: { increment: 1 }, lastViewedAt: new Date(), lastViewedIp: ctx.ip },
    })
    .catch(() => undefined);

  if (link.sow.status === 'SENT') {
    await prisma.sow.update({
      where: { id: link.sow.id },
      data: { status: 'VIEWED', viewedAt: new Date() },
    }).catch(() => undefined);

    await notify({
      type: 'SOW_VIEWED',
      title: `${link.sow.number} was opened`,
      body: `${link.sow.client.name} viewed the SOW.`,
      linkUrl: `/sows/${link.sow.id}`,
      roles: ['SUPER_ADMIN', 'SUB_ADMIN'],
      alsoUserIds: link.sow.createdById ? [link.sow.createdById] : [],
    }).catch(() => undefined);
  }

  return { ok: true as const, sow: link.sow, expiresAt: link.expiresAt };
}

/**
 * Public: capture the e-signature.
 * Stores signer identity, IP, user agent, consent text and the document hash.
 */
export async function signSowAction(raw: unknown): Promise<ActionResult<{ number: string }>> {
  try {
    const parsed = sowSignSchema.safeParse(raw);
    if (!parsed.success) {
      return { ok: false, error: 'Check the highlighted fields.', fieldErrors: parsed.error.flatten().fieldErrors };
    }

    const link = await prisma.shareLink.findUnique({
      where: { token: parsed.data.token },
      include: { sow: { include: { client: true } } },
    });

    if (!link?.sow || link.kind !== 'SOW') return { ok: false, error: 'This link is no longer valid.' };
    if (link.revokedAt) return { ok: false, error: 'This link has been revoked.' };
    if (link.expiresAt < new Date()) return { ok: false, error: 'This link has expired.' };
    if (link.sow.status === 'SIGNED') return { ok: false, error: 'This SOW has already been signed.' };

    const h = await headers();
    const forwarded = h.get('x-forwarded-for');
    const ip = (forwarded ? forwarded.split(',')[0].trim() : h.get('x-real-ip')) ?? 'unknown';
    const userAgent = h.get('user-agent') ?? 'unknown';

    const consentText =
      'I confirm that I am authorised to sign on behalf of the client, that I have read and ' +
      'agree to this Statement of Work, and that this electronic signature is legally binding ' +
      'and has the same effect as a handwritten signature.';

    const documentHash = sha256(documentContent(link.sow));

    const sow = await prisma.$transaction(async (tx) => {
      await tx.sowSignature.create({
        data: {
          sowId: link.sow!.id,
          signerName: parsed.data.signerName,
          signerEmail: parsed.data.signerEmail,
          signerTitle: parsed.data.signerTitle,
          ipAddress: ip,
          userAgent,
          signatureData: parsed.data.signature,
          consentText,
          documentHash,
        },
      });

      const updated = await tx.sow.update({
        where: { id: link.sow!.id },
        data: { status: 'SIGNED', signedAt: new Date() },
      });

      await audit(
        {
          actorEmail: parsed.data.signerEmail,
          action: 'sow.sign',
          entity: 'sow',
          entityId: updated.id,
          summary: `${updated.number} signed by ${parsed.data.signerName} (${parsed.data.signerEmail})`,
          metadata: { ip, documentHash, userAgent },
          ip,
          userAgent,
        },
        tx
      );

      return updated;
    });

    await notify({
      type: 'SOW_SIGNED',
      title: `${sow.number} signed`,
      body: `${parsed.data.signerName} signed on behalf of ${link.sow.client.name}.`,
      linkUrl: `/sows/${sow.id}`,
      roles: ['SUPER_ADMIN', 'SUB_ADMIN'],
      alsoUserIds: sow.createdById ? [sow.createdById] : [],
    });

    revalidatePath(`/sows/${sow.id}`);
    return { ok: true, data: { number: sow.number } };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
