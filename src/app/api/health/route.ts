import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * Liveness and readiness for whatever is watching the deployment.
 *
 * "The process is up" is not the same as "the app works" — a container with a
 * dead database connection answers every page with a 500 while still passing a
 * plain TCP check. So this touches the database and reports 503 when it cannot.
 *
 * Deliberately says nothing about the database beyond reachable: an unauth'd
 * endpoint should not name the host, the version or the error.
 */
export async function GET() {
  const startedAt = Date.now();

  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    return NextResponse.json(
      { status: 'unhealthy', database: 'unreachable' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  return NextResponse.json(
    { status: 'ok', database: 'ok', latencyMs: Date.now() - startedAt },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
