import type { Metadata } from 'next';
import { prisma } from '@/lib/db';
import { requirePermission } from '@/lib/session';
import { scopeFilter, can } from '@/lib/rbac';
import { PageHeader } from '@/components/layout/app-shell';
import { AdStudio } from './ad-studio';

export const metadata: Metadata = { title: 'Ad studio' };

export default async function StudioPage() {
  const user = await requirePermission('creative', 'read');

  const [brands, campaigns, creatives] = await Promise.all([
    prisma.brand.findMany({
      where: scopeFilter(user, 'brand'),
      select: { id: true, name: true, primaryColor: true, secondaryColor: true },
      orderBy: { name: 'asc' },
    }),
    prisma.campaign.findMany({
      where: scopeFilter(user, 'campaign'),
      select: { id: true, name: true, brandId: true, platform: true },
      orderBy: { name: 'asc' },
    }),
    prisma.creative.findMany({
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      take: 60,
      include: {
        brand: { select: { name: true, primaryColor: true, secondaryColor: true } },
        campaign: { select: { name: true } },
      },
    }),
  ]);

  return (
    <>
      <PageHeader
        title="Ad studio"
        subtitle="Compose ad copy and preview it exactly as it renders on Meta, Google and LinkedIn."
      />
      <AdStudio
        brands={brands}
        campaigns={campaigns}
        creatives={creatives.map((c) => ({
          id: c.id, name: c.name, brandId: c.brandId,
          campaignId: c.campaignId, platform: c.platform, format: c.format,
          status: c.status, headline: c.headline, primaryText: c.primaryText,
          description: c.description, ctaLabel: c.ctaLabel,
          destinationUrl: c.destinationUrl,
          brandName: c.brand.name,
          primaryColor: c.brand.primaryColor,
          secondaryColor: c.brand.secondaryColor,
          campaignName: c.campaign?.name ?? null,
        }))}
        canApprove={can(user, 'creative', 'approve')}
        canEdit={can(user, 'creative', 'update')}
      />
    </>
  );
}
