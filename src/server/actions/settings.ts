'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db';
import { audit } from '@/lib/audit';
import { requirePermission } from '@/lib/session';
import { companyProfileSchema } from '@/lib/validators';
import { stateNameFromCode, isValidGstin } from '@/lib/billing/gst';
import type { ActionResult } from './billing';

/**
 * Company settings.
 *
 * These values are the defaults the 2-field invoice engine reads: state code
 * (place of supply), GST rate, SAC, prefix, terms and bank details.
 */
export async function updateCompanyProfileAction(raw: unknown): Promise<ActionResult> {
  try {
    const parsed = companyProfileSchema.safeParse(raw);
    if (!parsed.success) {
      return { ok: false, error: 'Check the highlighted fields.', fieldErrors: parsed.error.flatten().fieldErrors };
    }

    const user = await requirePermission('settings', 'update');
    const d = parsed.data;

    if (d.gstin && !isValidGstin(d.gstin)) {
      return {
        ok: false,
        error: 'That GSTIN is not valid — check the format and checksum.',
        fieldErrors: { gstin: ['Invalid GSTIN'] },
      };
    }

    const stateName = stateNameFromCode(d.stateCode);
    if (!stateName) {
      return {
        ok: false,
        error: 'That is not a recognised GST state code.',
        fieldErrors: { stateCode: ['Unknown state code'] },
      };
    }

    await prisma.companyProfile.upsert({
      where: { id: 'default' },
      create: { id: 'default', ...d, gstin: d.gstin || null, website: d.website || null, stateName },
      update: { ...d, gstin: d.gstin || null, website: d.website || null, stateName },
    });

    await audit({
      actorId: user.id, actorEmail: user.email, actorRole: user.role,
      action: 'settings.update', entity: 'company', entityId: 'default',
      summary: 'Updated company profile and billing defaults',
      metadata: {
        stateCode: d.stateCode,
        gstRate: d.defaultGstRate,
        invoicePrefix: d.invoicePrefix,
        amountBasis: d.defaultAmountBasis,
      },
    });

    revalidatePath('/settings');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
