import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/session';
import { can, scopeFilter } from '@/lib/rbac';
import { renderSowPdf } from '@/lib/pdf/sow-pdf';
import { getCompanyProfile } from '@/lib/billing/invoice-service';
import type { ParsedSection } from '@/lib/sow/parse';

export const dynamic = 'force-dynamic';

/** Render a proposal onto the company letterhead. */
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

  // Proposals written before the paste feature have no parsed sections; fall
  // back to the individual scope fields so they still render.
  const stored = sow.sections as unknown as ParsedSection[] | null;
  const sections: ParsedSection[] =
    stored?.length
      ? stored
      : [
          { number: 1, title: 'Scope of Work', body: sow.scope.split('\n') },
          ...(sow.deliverables ? [{ number: 2, title: 'Deliverables', body: sow.deliverables.split('\n') }] : []),
          ...(sow.timeline ? [{ number: 3, title: 'Timeline', body: sow.timeline.split('\n') }] : []),
          ...(sow.assumptions ? [{ number: 4, title: 'Assumptions', body: sow.assumptions.split('\n') }] : []),
          ...(sow.outOfScope ? [{ number: 5, title: 'Out of Scope', body: sow.outOfScope.split('\n') }] : []),
          ...(sow.paymentTerms ? [{ number: 6, title: 'Payment Terms', body: sow.paymentTerms.split('\n') }] : []),
        ].map((s) => ({ ...s, number: s.number ?? null }));

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
          signedAt: sow.signature.signedAt,
          ipAddress: sow.signature.ipAddress,
        }
      : null,
  });

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${sow.number.replace(/\//g, '-')}.pdf"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
