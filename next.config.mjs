/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['@react-pdf/renderer', 'bcryptjs'],
  experimental: {
    serverActions: { bodySizeLimit: '10mb' },
    // Lets a page call forbidden() and render forbidden.tsx with a real 403.
    // Without it a refused page throws, and Next answers 500.
    authInterrupts: true,
  },
};

/**
 * Security headers.
 *
 * The app holds a credentials vault and client contracts, so framing is denied
 * outright rather than same-origin: nothing here is meant to be embedded, and
 * clickjacking a "reveal secret" button is the attack that matters.
 *
 * No full Content-Security-Policy yet — Next injects inline bootstrap scripts,
 * so a useful one needs nonce plumbing through the document, and a policy with
 * 'unsafe-inline' would be decoration. frame-ancestors is set because it is
 * the one directive that works standalone and is not covered elsewhere.
 */
const securityHeaders = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()' },
  // Ignored over plain HTTP, so it is safe in development and correct in production.
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
];

nextConfig.headers = async () => [{ source: '/:path*', headers: securityHeaders }];

export default nextConfig;
