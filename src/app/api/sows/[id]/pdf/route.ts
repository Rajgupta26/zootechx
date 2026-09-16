import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/session';
import { can, scopeFilter } from '@/lib/rbac';
import { renderSowPdf } from '@/lib/pdf/sow-pdf';
import { getCompanyProfile } from '@/lib/billing/invoice-service';
import { sowSections } from '@/lib/sow/render-signed';
import { getStorageProvider } from '@/lib/integrations/storage';

export const dynamic = 'force-dynamic';

/** Render a proposal in the house Statement of Work template. */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user || !can(user, 'sow', 'read')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const sow = await prisma.sow.findFirst({
    where: { id, ...scopeFilter(user, 'sow') },
    include: { client: true, signature: true, createdBy: { select: { name: true } } },
  });
  if (!sow) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const company = await getCompanyProfile();

  const sections = sowSections(sow);

  const buffer = await renderSowPdf({
    number: sow.number,
    title: sow.title,
    clientName: sow.client.name,
    clientLegalName: sow.client.legalName,
    currency: sow.currency,
    value: sow.value.toString(),
    issueDate: sow.createdAt,
    sections,
    company: {
      legalName: company.legalName,
      tradeName: company.tradeName,
      address: [company.addressLine1, company.addressLine2, `${company.city}, ${company.stateName} ${company.postalCode}`]
        .filter(Boolean).join(', '),
      email: company.email,
      phone: company.phone,
    },
    signatoryName: company.bankAccountName ?? sow.createdBy?.name ?? '',
    signature: sow.signature
      ? {
          signerName: sow.signature.signerName,
          signerTitle: sow.signature.signerTitle,
          signatureData: sow.signature.signatureData,
          signedAt: sow.signature.signedAt,
          ipAddress: sow.signature.ipAddress,
        }
      : null,
  });

  // Cache the countersigned copy the first time anyone downloads it. Signing
  // already attempts this, but rendering there is best-effort so a failure
  // cannot invalidate an accepted signature — this is the backstop.
  if (sow.signature && !sow.signedPdfKey) {
    const key = `proposals/${sow.createdAt.getFullYear()}/${sow.number.replace(/[^\w-]/g, '_')}-signed.pdf`;
    try {
      await getStorageProvider().put(key, buffer, 'application/pdf');
      await prisma.sow.update({ where: { id: sow.id }, data: { signedPdfKey: key } });
    } catch {
      // A storage failure must not block the download.
    }
  }

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${sow.number.replace(/\//g, '-')}.pdf"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
