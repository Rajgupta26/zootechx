import crypto from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { getStorageProvider } from '@/lib/integrations/storage';

export const dynamic = 'force-dynamic';

const CONTENT_TYPES: Record<string, string> = {
  pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg',
  jpeg: 'image/jpeg', webp: 'image/webp', svg: 'image/svg+xml',
  csv: 'text/csv', json: 'application/json',
};

/**
 * Serve a stored object.
 *
 * Two ways in: a signed URL (used by WhatsApp, which fetches the document
 * anonymously), or an authenticated session. Anything else is refused.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ key: string }> }
) {
  const { key: rawKey } = await params;
  const key = decodeURIComponent(rawKey);

  const expires = req.nextUrl.searchParams.get('expires');
  const sig = req.nextUrl.searchParams.get('sig');

  let authorised = false;

  if (expires && sig) {
    const expiry = Number(expires);
    if (Number.isFinite(expiry) && expiry > Date.now()) {
      const secret = process.env.AUTH_SECRET ?? 'dev-secret';
      const expected = crypto.createHmac('sha256', secret).update(`${key}:${expires}`).digest('hex');
      const a = Buffer.from(sig);
      const b = Buffer.from(expected);
      authorised = a.length === b.length && crypto.timingSafeEqual(a, b);
    }
  }

  if (!authorised) {
    authorised = Boolean(await getCurrentUser());
  }

  if (!authorised) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
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
