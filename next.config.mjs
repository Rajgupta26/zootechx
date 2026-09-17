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

export default nextConfig;
