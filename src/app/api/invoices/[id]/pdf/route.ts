import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/session';
import { can, scopeFilter } from '@/lib/rbac';
import { renderInvoicePdf } from '@/lib/pdf/invoice-pdf';
import { buildInvoicePdfData } from '@/lib/pdf/build-invoice-data';

export const dynamic = 'force-dynamic';

/**
 * Stream an invoice PDF.
 *
 * Rendered on demand rather than served from storage, so the document always
 * reflects the current payment state — but permission is checked first, and a
 * client-portal user only ever matches their own invoices via scopeFilter.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user || !can(user, 'invoice', 'read')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const invoice = await prisma.invoice.findFirst({
    where: { id, ...scopeFilter(user, 'invoice') },
    include: { items: true },
  });

  if (!invoice) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const buffer = await renderInvoicePdf(buildInvoicePdfData(invoice));
  const filename = `${invoice.number.replace(/\//g, '-')}.pdf`;

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${filename}"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
