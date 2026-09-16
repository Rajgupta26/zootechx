import { signOut } from '@/lib/auth';

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
 * Redirecting here breaks the loop by actually clearing the cookie, so the next
 * request is genuinely anonymous and middleware lets /login render.
 */
export async function GET() {
  await signOut({ redirectTo: '/login?expired=1' });
}
