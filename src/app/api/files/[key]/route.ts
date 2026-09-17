import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentUser, type CurrentUser } from '@/lib/session';
import { can, scopeFilter } from '@/lib/rbac';
import { getStorageProvider } from '@/lib/integrations/storage';
import { verifyObjectSignature } from '@/lib/integrations/storage/signing';

export const dynamic = 'force-dynamic';

const CONTENT_TYPES: Record<string, string> = {
  pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg',
  jpeg: 'image/jpeg', webp: 'image/webp', svg: 'image/svg+xml',
  csv: 'text/csv', json: 'application/json',
};

/**
 * Serve a stored object.
 *
 * Two ways in: a signed link — which is how a client receives an invoice over
 * email or WhatsApp, with no session — or a session that can read the record
 * the object belongs to.
 *
 * That second check is the point. It used to be "is anyone signed in", and
 * object keys are derived from the invoice number, so they run in sequence:
 * invoices/2026/09/XCC_26-27_0007.pdf, then 0008, then 0009. Anyone with a
 * login could walk the whole range and collect every invoice and signed
 * contract in the business, including from pages their role is refused.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ key: string }> }
) {
  const { key: rawKey } = await params;
  const key = decodeURIComponent(rawKey);

  const signed = verifyObjectSignature(
    key,
    req.nextUrl.searchParams.get('expires'),
    req.nextUrl.searchParams.get('sig')
  );

  if (!signed) {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!(await mayRead(user, key))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  }

  try {
    const buffer = await getStorageProvider().get(key);
    const ext = key.split('.').pop()?.toLowerCase() ?? '';

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': CONTENT_TYPES[ext] ?? 'application/octet-stream',
        'Content-Disposition': `inline; filename="${key.split('/').pop()}"`,
        'Cache-Control': 'private, max-age=300',
      },
    });
  } catch {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
}

/**
 * Resolve the object back to the record that owns it and apply that record's
 * own rules — the same permission and the same scope filter the list pages
 * use, so a client sees their own invoice and nobody else's.
 *
 * An unrecognised prefix is refused rather than served: a new kind of stored
 * object should have to opt in here, not inherit access by default.
 */
async function mayRead(user: CurrentUser, key: string): Promise<boolean> {
  if (key.startsWith('invoices/')) {
    if (!can(user, 'invoice', 'read')) return false;
    const found = await prisma.invoice.findFirst({
      where: { pdfKey: key, ...scopeFilter(user, 'invoice') },
      select: { id: true },
    });
    return Boolean(found);
  }

  if (key.startsWith('proposals/')) {
    if (!can(user, 'sow', 'read')) return false;
    const found = await prisma.sow.findFirst({
      where: { signedPdfKey: key, ...scopeFilter(user, 'sow') },
      select: { id: true },
    });
    return Boolean(found);
  }

  return false;
}
