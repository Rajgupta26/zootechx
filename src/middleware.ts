import NextAuth from 'next-auth';
import { NextResponse } from 'next/server';
import { authConfig } from '@/lib/auth.config';

const { auth } = NextAuth(authConfig);

/**
 * Routes reachable without a session.
 *
 * /api/files is here because a client opens an invoice from an email or a
 * WhatsApp message, holding a signed link and no session — the middleware was
 * bouncing those to /login, so that delivery path never worked. The route
 * itself is not open: it verifies the signature, and without one it requires a
 * session that can read the record the object belongs to.
 */
const PUBLIC_PREFIXES = [
  '/login', '/sign', '/pay', '/api/webhooks', '/api/cron', '/api/auth', '/api/files',
];

/** Route prefixes the CLIENT role may reach. Everything else is staff-only. */
const CLIENT_ALLOWED = ['/portal', '/api/portal'];

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const isPublic = PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  if (pathname === '/' ) {
    const role = req.auth?.user?.role;
    if (!role) return NextResponse.redirect(new URL('/login', req.url));
    return NextResponse.redirect(new URL(role === 'CLIENT' ? '/portal' : '/dashboard', req.url));
  }

  if (isPublic) {
    // A signed-in user hitting /login goes to their home instead.
    if (pathname === '/login' && req.auth?.user) {
      const role = req.auth.user.role;
      return NextResponse.redirect(new URL(role === 'CLIENT' ? '/portal' : '/dashboard', req.url));
    }
    return NextResponse.next();
  }

  if (!req.auth?.user) {
    const url = new URL('/login', req.url);
    url.searchParams.set('callbackUrl', pathname);
    return NextResponse.redirect(url);
  }

  const role = req.auth.user.role;

  // Client-portal users are fenced into /portal — this is the boundary that
  // keeps an external account from reaching internal CRM routes.
  if (role === 'CLIENT') {
    const allowed = CLIENT_ALLOWED.some((p) => pathname === p || pathname.startsWith(`${p}/`));
    if (!allowed) return NextResponse.redirect(new URL('/portal', req.url));
  } else if (pathname.startsWith('/portal')) {
    return NextResponse.redirect(new URL('/dashboard', req.url));
  }

  return NextResponse.next();
});

export const config = {
  // Static media must be excluded or the middleware answers with a redirect
  // to /login. The sign-in page's own backdrop is fetched by a visitor who by
  // definition has no session, and a video that 302s to HTML surfaces only as
  // "source not supported", with nothing to say why.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|gif|webp|ico|mp4|webm)$).*)'],
};
