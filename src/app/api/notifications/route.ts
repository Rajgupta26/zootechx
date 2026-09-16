import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';
import { getNotifications, markRead, unreadCount } from '@/lib/notifications';

export const dynamic = 'force-dynamic';

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const [items, unread] = await Promise.all([
    getNotifications(user.id, 20),
    unreadCount(user.id),
  ]);

  return NextResponse.json({ items, unread });
}

/** Mark all (or one, via ?id=) as read. */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const id = new URL(req.url).searchParams.get('id') ?? undefined;
  await markRead(user.id, id);
  return NextResponse.json({ ok: true });
}
