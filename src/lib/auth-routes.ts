/**
 * Auth route constants, with no imports.
 *
 * These are needed on both sides: `session.ts` redirects here from the server,
 * and the notification bell navigates here from the browser when its polling
 * turns up a dead session. `session.ts` itself cannot be the shared home —
 * importing it from a client component would pull Prisma and Auth.js into the
 * browser bundle.
 */

/**
 * Clears a session cookie whose user can no longer be resolved, then lands on
 * /login?expired=1. See src/app/api/auth/invalidate/route.ts for why bouncing
 * straight to /login loops instead.
 */
export const INVALIDATE_SESSION_URL = '/api/auth/invalidate';
