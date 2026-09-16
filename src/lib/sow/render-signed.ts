import { prisma } from '@/lib/db';
import { getStorageProvider } from '@/lib/integrations/storage';
import { getCompanyProfile } from '@/lib/billing/invoice-service';
import type { ParsedSection } from './parse';

/**
 * Build the sections a proposal should render as.
 *
 * Pasted proposals keep everything in `sections`; older ones only have the
 * individual scope fields. Both must produce the same document shape, or the
 * signer and the signed PDF disagree about what was agreed.
 */
export function sowSections(sow: {
  scope: string;
  sections: unknown;
  deliverables: string | null;
  timeline: string | null;
  assumptions: string | null;
  outOfScope: string | null;
  paymentTerms: string | null;
}): ParsedSection[] {
  const stored = sow.sections as ParsedSection[] | null;
  if (stored?.length) return stored;

  const fallback: Array<[string, string | null]> = [
    ['Scope of Work', sow.scope],
    ['Deliverables', sow.deliverables],
    ['Timeline', sow.timeline],
    ['Assumptions', sow.assumptions],
    ['Out of Scope', sow.outOfScope],
    ['Payment Terms', sow.paymentTerms],
  ];

  return fallback
    .filter(([, body]) => Boolean(body?.trim()))
    .map(([title, body], i) => ({
      number: i + 1,
      title,
      body: (body ?? '').split('\n'),
    }));
}

/**
 * Render the countersigned proposal and store it.
 *
 * Called once the client signs, so there is a fixed document recording what
 * was agreed — with the signature block filled in and the audit line beneath
 * it. Returns the storage key, or null if rendering failed; a failure here
 * must not invalidate a signature that has already been accepted.
 */
export async function renderAndStoreSignedSow(sowId: string): Promise<string | null> {
  try {
    const sow = await prisma.sow.findUniqueOrThrow({
      where: { id: sowId },
      include: { client: true, signature: true, createdBy: { select: { name: true } } },
    });
    const company = await getCompanyProfile();
    const { renderSowPdf } = await import('@/lib/pdf/sow-pdf');

    const buffer = await renderSowPdf({
      number: sow.number,
      title: sow.title,
      clientName: sow.client.name,
      clientLegalName: sow.client.legalName,
      currency: sow.currency,
      value: sow.value.toString(),
      issueDate: sow.createdAt,
      sections: sowSections(sow),
      company: {
        legalName: company.legalName,
        tradeName: company.tradeName,
        address: [
          company.addressLine1,
          company.addressLine2,
          `${company.city}, ${company.stateName} ${company.postalCode}`,
        ].filter(Boolean).join(', '),
        email: company.email,
        phone: company.phone,
      },
      signatoryName: company.bankAccountName ?? sow.createdBy?.name ?? '',
      signature: sow.signature
        ? {
            signerName: sow.signature.signerName,
            signedAt: sow.signature.signedAt,
            ipAddress: sow.signature.ipAddress,
          }
        : null,
    });

    const year = sow.createdAt.getFullYear();
    const key = `proposals/${year}/${sow.number.replace(/[^\w-]/g, '_')}-signed.pdf`;
    await getStorageProvider().put(key, buffer, 'application/pdf');

    await prisma.sow.update({ where: { id: sowId }, data: { signedPdfKey: key } });
    return key;
  } catch (err) {
    // The signature itself is already recorded and valid; the PDF can be
    // regenerated on demand from the detail page.
    console.error(`Failed to render signed proposal ${sowId}:`, (err as Error).message);
    return null;
  }
}
