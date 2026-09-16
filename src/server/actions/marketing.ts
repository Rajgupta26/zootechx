'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db';
import { audit } from '@/lib/audit';
import { notify } from '@/lib/notifications';
import { requirePermission } from '@/lib/session';
import { creativeSchema } from '@/lib/validators';
import type { ActionResult } from './billing';

/** Creatives and the marketing → CRM lead sync. */

export async function saveCreativeAction(
  raw: unknown,
  id?: string
): Promise<ActionResult<{ id: string }>> {
  try {
    const parsed = creativeSchema.safeParse(raw);
    if (!parsed.success) {
      return { ok: false, error: 'Check the highlighted fields.', fieldErrors: parsed.error.flatten().fieldErrors };
    }

    await requirePermission('creative', id ? 'update' : 'create');
    const d = parsed.data;

    const data = {
      name: d.name, brandId: d.brandId,
      campaignId: d.campaignId || null,
      platform: d.platform, format: d.format, status: d.status,
      headline: d.headline, primaryText: d.primaryText,
      description: d.description, ctaLabel: d.ctaLabel,
      destinationUrl: d.destinationUrl || null,
      assetUrl: d.assetUrl || null,
    };

    const creative = id
      ? await prisma.creative.update({ where: { id }, data })
      : await prisma.creative.create({ data });

    if (d.status === 'PENDING_REVIEW') {
      await notify({
        type: 'SYSTEM',
        title: `Creative awaiting approval: ${d.name}`,
        linkUrl: '/marketing/studio',
        roles: ['SUPER_ADMIN', 'SUB_ADMIN'],
      });
    }

    revalidatePath('/marketing/studio');
    return { ok: true, data: { id: creative.id } };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function reviewCreativeAction(
  id: string,
  approve: boolean,
  note?: string
): Promise<ActionResult> {
  try {
    const user = await requirePermission('creative', 'approve');

    const creative = await prisma.creative.update({
      where: { id },
      data: {
        status: approve ? 'APPROVED' : 'REJECTED',
        reviewerId: user.id,
        reviewedAt: new Date(),
        reviewNote: note,
      },
    });

    await audit({
      actorId: user.id, actorEmail: user.email, actorRole: user.role,
      action: approve ? 'creative.approve' : 'creative.reject',
      entity: 'creative', entityId: id,
      summary: `${approve ? 'Approved' : 'Rejected'} creative "${creative.name}"`,
      metadata: { note: note ?? null },
    });

    revalidatePath('/marketing/studio');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

/**
 * Sync a lead captured on an ad platform into the CRM.
 *
 * `externalId` is unique on Lead, so a replayed Meta Lead Ads webhook or a
 * repeated manual sync cannot create duplicates.
 */
export async function syncCampaignLeadAction(input: {
  campaignId: string;
  name: string;
  email?: string;
  phone?: string;
  externalId: string;
  requirement?: string;
}): Promise<ActionResult<{ id: string; created: boolean }>> {
  try {
    const user = await requirePermission('lead', 'create');

    const campaign = await prisma.campaign.findUniqueOrThrow({
      where: { id: input.campaignId },
      select: { id: true, name: true, platform: true },
    });

    const existing = await prisma.lead.findUnique({
      where: { externalId: input.externalId },
      select: { id: true },
    });
    if (existing) return { ok: true, data: { id: existing.id, created: false } };

    const sourceByPlatform = {
      META: 'META_ADS', GOOGLE: 'GOOGLE_ADS', LINKEDIN: 'LINKEDIN',
      YOUTUBE: 'GOOGLE_ADS', X: 'OTHER',
    } as const;

    const lead = await prisma.lead.create({
      data: {
        name: input.name,
        email: input.email ?? null,
        phone: input.phone ?? null,
        dedupeEmail: input.email?.toLowerCase() ?? null,
        dedupePhone: input.phone?.replace(/\D/g, '').slice(-10) || null,
        source: sourceByPlatform[campaign.platform],
        sourceDetail: campaign.name,
        campaignId: campaign.id,
        externalId: input.externalId,
        requirement: input.requirement,
        createdById: user.id,
      },
    });

    await prisma.campaign.update({
      where: { id: campaign.id },
      data: { leadsCount: { increment: 1 } },
    });

    await notify({
      type: 'LEAD_SYNCED',
      title: `New lead from ${campaign.name}`,
      body: `${lead.name} came in via ${campaign.platform}.`,
      linkUrl: `/leads/${lead.id}`,
      roles: ['SALES', 'SUB_ADMIN', 'SUPER_ADMIN'],
    });

    await audit({
      actorId: user.id, actorEmail: user.email, actorRole: user.role,
      action: 'lead.sync', entity: 'lead', entityId: lead.id,
      summary: `Synced lead ${lead.name} from ${campaign.platform} campaign "${campaign.name}"`,
    });

    revalidatePath('/leads');
    return { ok: true, data: { id: lead.id, created: true } };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
