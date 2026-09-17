'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db';
import { audit } from '@/lib/audit';
import { notify } from '@/lib/notifications';
import { requirePermission } from '@/lib/session';
import type { ActionResult } from './billing';

/** The marketing → CRM lead sync. */

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
