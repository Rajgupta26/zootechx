import { NextResponse, type NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * Terminate a session whose JWT is still valid but whose user is not.
 *
 * Middleware runs on the edge and cannot reach the database, so it can only
 * trust the JWT. The page layer *can* reach the database, and will refuse a
 * user who has been suspended, soft-deleted, or whose row no longer exists.
 *
 * Without this route those two layers disagree forever: middleware sees a
 * signed-in user and sends /login -> /dashboard, the layout sees no valid user
 * and sends /dashboard -> /login, and the browser gives up with
 * ERR_TOO_MANY_REDIRECTS.
 *
 * This used to call Auth.js's `signOut()`. That is built for Server Actions and
 * Server Components; from a GET route handler Auth.js answers `"Bad request."`
 * with a 400 and leaves the cookie exactly where it was. So the one route whose
 * job was to break the loop did not break it — a suspended user landed on a
 * bare "Bad request." page with their session still live, which is precisely
 * the dead end described above.
 *
 * Clearing the cookie directly needs no CSRF token and no POST: the session is
 * a stateless JWT, so deleting the cookie *is* the sign-out. There is nothing
 * server-side to revoke.
 */

/**
 * Auth.js names the cookie `authjs.session-token`, prefixes it with
 * `__Secure-` over HTTPS, and splits it into `.0`, `.1` … when it outgrows the
 * 4KB cookie limit. Matching on the stem covers every one of those.
 */
const SESSION_COOKIE_STEM = 'authjs.session-token';

export async function GET(req: NextRequest) {
  const response = NextResponse.redirect(new URL('/login?expired=1', req.url));

  for (const cookie of req.cookies.getAll()) {
    if (!cookie.name.includes(SESSION_COOKIE_STEM)) continue;
    // Expire it rather than only deleting it from the request: the browser
    // drops it when it sees a past date on the same path.
    response.cookies.set({
      name: cookie.name,
      value: '',
      path: '/',
      expires: new Date(0),
      httpOnly: true,
      sameSite: 'lax',
      secure: cookie.name.startsWith('__Secure-'),
    });
  }

  return response;
}
