/**
 * Runs once when the server starts, before the first request is served.
 * Next calls this for each runtime; the environment check reads Node APIs, so
 * it only runs on the Node runtime and not on the edge copy of middleware.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { assertEnv } = await import('@/lib/env');
  assertEnv();
}
