'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  Check, Globe, Heart, MessageCircle, MoreHorizontal, Save,
  Send, Share2, ThumbsUp, X,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { StatusBadge } from '@/components/ui/status-badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/misc';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';
import { saveCreativeAction, reviewCreativeAction } from '@/server/actions/marketing';

/**
 * Live ad mockup studio.
 *
 * The preview panes reproduce each platform's real ad chrome — Meta's feed
 * card, Google's search result, LinkedIn's sponsored post — so copy can be
 * checked against the character limits and visual hierarchy that actually
 * apply before anything is pushed live.
 */

type Platform = 'META' | 'GOOGLE' | 'LINKEDIN' | 'YOUTUBE' | 'X';

interface Brand { id: string; name: string; primaryColor: string | null; secondaryColor: string | null }
interface Campaign { id: string; name: string; brandId: string; platform: string }
interface Creative {
  id: string; name: string; brandId: string; campaignId: string | null;
  platform: string; format: string; status: string;
  headline: string | null; primaryText: string | null;
  description: string | null; ctaLabel: string | null;
  destinationUrl: string | null; brandName: string;
  primaryColor: string | null; secondaryColor: string | null;
  campaignName: string | null;
}

/** Real platform limits — the composer warns before the ad is rejected. */
const LIMITS: Record<Platform, { headline: number; primary: number; description: number }> = {
  META: { headline: 40, primary: 125, description: 30 },
  GOOGLE: { headline: 30, primary: 90, description: 90 },
  LINKEDIN: { headline: 70, primary: 150, description: 70 },
  YOUTUBE: { headline: 60, primary: 150, description: 70 },
  X: { headline: 70, primary: 280, description: 70 },
};

export function AdStudio({
  brands, campaigns, creatives, canApprove, canEdit,
}: {
  brands: Brand[];
  campaigns: Campaign[];
  creatives: Creative[];
  canApprove: boolean;
  canEdit: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: '', brandId: brands[0]?.id ?? '', campaignId: '',
    platform: 'META' as Platform, format: 'feed', status: 'DRAFT',
    headline: '', primaryText: '', description: '',
    ctaLabel: 'Learn More', destinationUrl: '',
  });

  const brand = brands.find((b) => b.id === form.brandId);
  const limits = LIMITS[form.platform];
  const availableCampaigns = campaigns.filter((c) => c.brandId === form.brandId);

  const pendingReview = useMemo(
    () => creatives.filter((c) => c.status === 'PENDING_REVIEW'),
    [creatives]
  );

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const loadCreative = (c: Creative) => {
    setEditingId(c.id);
    setForm({
      name: c.name, brandId: c.brandId, campaignId: c.campaignId ?? '',
      platform: c.platform as Platform, format: c.format, status: c.status,
      headline: c.headline ?? '', primaryText: c.primaryText ?? '',
      description: c.description ?? '', ctaLabel: c.ctaLabel ?? 'Learn More',
      destinationUrl: c.destinationUrl ?? '',
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const save = (status?: string) => {
    startTransition(async () => {
      const res = await saveCreativeAction(
        {
          ...form,
          status: status ?? form.status,
          campaignId: form.campaignId || undefined,
          destinationUrl: form.destinationUrl || undefined,
        },
        editingId ?? undefined
      );
      if (!res.ok) {
        toast({ title: 'Could not save', description: res.error, variant: 'error' });
        return;
      }
      toast({
        title: status === 'PENDING_REVIEW' ? 'Sent for approval' : 'Creative saved',
        variant: 'success',
      });
      setEditingId(null);
      router.refresh();
    });
  };

  const review = (id: string, approve: boolean) => {
    startTransition(async () => {
      const res = await reviewCreativeAction(id, approve);
      if (!res.ok) {
        toast({ title: 'Action failed', description: res.error, variant: 'error' });
        return;
      }
      toast({ title: approve ? 'Creative approved' : 'Creative rejected', variant: 'success' });
      router.refresh();
    });
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-5 lg:grid-cols-2">
        {/* Composer */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              {editingId ? 'Edit creative' : 'Compose'}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 pt-0">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="ad-name">Creative name</Label>
                <Input
                  id="ad-name" value={form.name}
                  onChange={(e) => set('name', e.target.value)}
                  placeholder="Festive Hamper — Feed 1:1"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Brand</Label>
                <Select value={form.brandId} onValueChange={(v) => set('brandId', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {brands.map((b) => (
                      <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Platform</Label>
                <Select value={form.platform} onValueChange={(v) => set('platform', v as Platform)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="META">Meta (Facebook / Instagram)</SelectItem>
                    <SelectItem value="GOOGLE">Google Search</SelectItem>
                    <SelectItem value="LINKEDIN">LinkedIn</SelectItem>
                    <SelectItem value="YOUTUBE">YouTube</SelectItem>
                    <SelectItem value="X">X</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Campaign</Label>
                <Select value={form.campaignId} onValueChange={(v) => set('campaignId', v)}>
                  <SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger>
                  <SelectContent>
                    {availableCampaigns.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <CountedField
              label="Headline"
              value={form.headline}
              onChange={(v) => set('headline', v)}
              limit={limits.headline}
              placeholder="Organic hampers, delivered fresh"
            />
            <CountedField
              label="Primary text"
              value={form.primaryText}
              onChange={(v) => set('primaryText', v)}
              limit={limits.primary}
              multiline
              placeholder="Hand-picked produce from certified organic farms…"
            />
            <CountedField
              label="Description"
              value={form.description}
              onChange={(v) => set('description', v)}
              limit={limits.description}
              placeholder="Free delivery over ₹999"
            />

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="ad-cta">Call to action</Label>
                <Input id="ad-cta" value={form.ctaLabel} onChange={(e) => set('ctaLabel', e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ad-url">Destination URL</Label>
                <Input
                  id="ad-url" value={form.destinationUrl}
                  onChange={(e) => set('destinationUrl', e.target.value)}
                  placeholder="https://example.com/offer"
                />
              </div>
            </div>

            {canEdit && (
              <div className="flex flex-wrap justify-end gap-2 pt-1">
                {editingId && (
                  <Button variant="ghost" onClick={() => setEditingId(null)}>New creative</Button>
                )}
                <Button variant="outline" onClick={() => save('DRAFT')} loading={pending} disabled={!form.name}>
                  <Save />
                  Save draft
                </Button>
                <Button onClick={() => save('PENDING_REVIEW')} loading={pending} disabled={!form.name}>
                  <Send />
                  Send for approval
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Live preview */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Live preview</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <Tabs value={form.platform} onValueChange={(v) => set('platform', v as Platform)}>
              <TabsList className="w-full">
                <TabsTrigger value="META" className="flex-1">Meta</TabsTrigger>
                <TabsTrigger value="GOOGLE" className="flex-1">Google</TabsTrigger>
                <TabsTrigger value="LINKEDIN" className="flex-1">LinkedIn</TabsTrigger>
              </TabsList>

              <TabsContent value="META">
                <MetaPreview form={form} brand={brand} />
              </TabsContent>
              <TabsContent value="GOOGLE">
                <GooglePreview form={form} brand={brand} />
              </TabsContent>
              <TabsContent value="LINKEDIN">
                <LinkedInPreview form={form} brand={brand} />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>

      {canApprove && pendingReview.length > 0 && (
        <Card className="border-warning/40">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              Awaiting approval ({pendingReview.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 pt-0">
            {pendingReview.map((c) => (
              <div key={c.id} className="flex flex-wrap items-center gap-3 rounded-lg border p-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{c.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {c.brandName} · {c.platform} · {c.headline ?? 'No headline'}
                  </p>
                </div>
                <Button size="sm" variant="ghost" onClick={() => loadCreative(c)}>Preview</Button>
                <Button size="sm" variant="outline" onClick={() => review(c.id, false)} disabled={pending}>
                  <X />
                  Reject
                </Button>
                <Button size="sm" onClick={() => review(c.id, true)} disabled={pending}>
                  <Check />
                  Approve
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Creative library</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {creatives.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No creatives yet. Compose one above.
            </p>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {creatives.map((c) => (
                <button
                  key={c.id}
                  onClick={() => loadCreative(c)}
                  className="rounded-lg border p-3 text-left transition-colors hover:bg-accent/50"
                >
                  <div className="mb-1.5 flex items-start justify-between gap-2">
                    <p className="min-w-0 truncate text-sm font-medium">{c.name}</p>
                    <StatusBadge status={c.status} />
                  </div>
                  <p className="mb-2 line-clamp-2 text-xs text-muted-foreground">
                    {c.headline ?? 'No headline'}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    <Badge variant="muted">{c.platform}</Badge>
                    <Badge variant="muted">{c.format}</Badge>
                  </div>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ---------- Composer field with a live character count ----------

function CountedField({
  label, value, onChange, limit, multiline, placeholder,
}: {
  label: string; value: string; onChange: (v: string) => void;
  limit: number; multiline?: boolean; placeholder?: string;
}) {
  const over = value.length > limit;
  const near = !over && value.length > limit * 0.85;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label>{label}</Label>
        <span
          className={cn(
            'text-xs tabular',
            over ? 'font-medium text-destructive' : near ? 'text-warning' : 'text-muted-foreground'
          )}
        >
          {value.length}/{limit}
        </span>
      </div>
      {multiline ? (
        <Textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={cn(over && 'border-destructive')}
        />
      ) : (
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={cn(over && 'border-destructive')}
        />
      )}
      {over && (
        <p className="text-xs text-destructive">
          Over the platform limit — this text will be truncated in the live ad.
        </p>
      )}
    </div>
  );
}

// ---------- Platform mockups ----------

interface PreviewProps {
  form: {
    headline: string; primaryText: string; description: string;
    ctaLabel: string; destinationUrl: string;
  };
  brand?: Brand;
}

function BrandMark({ brand, size = 'md' }: { brand?: Brand; size?: 'sm' | 'md' }) {
  return (
    <div
      className={cn('shrink-0 rounded-full', size === 'sm' ? 'h-7 w-7' : 'h-9 w-9')}
      style={{
        background: `linear-gradient(135deg, ${brand?.primaryColor ?? '#4F46E5'}, ${brand?.secondaryColor ?? '#0EA5E9'})`,
      }}
    />
  );
}

function MetaPreview({ form, brand }: PreviewProps) {
  return (
    <div className="mx-auto max-w-sm overflow-hidden rounded-lg border bg-card">
      <div className="flex items-center gap-2 p-3">
        <BrandMark brand={brand} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{brand?.name ?? 'Your brand'}</p>
          <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
            Sponsored · <Globe className="h-2.5 w-2.5" />
          </p>
        </div>
        <MoreHorizontal className="h-4 w-4 shrink-0 text-muted-foreground" />
      </div>

      <p className="whitespace-pre-line px-3 pb-3 text-sm">
        {form.primaryText || 'Your primary text appears here — the first two lines are what most people read.'}
      </p>

      <div
        className="flex aspect-square items-center justify-center"
        style={{
          background: `linear-gradient(135deg, ${brand?.primaryColor ?? '#4F46E5'}22, ${brand?.secondaryColor ?? '#0EA5E9'}33)`,
        }}
      >
        <span className="text-xs text-muted-foreground">Creative asset 1:1</span>
      </div>

      <div className="flex items-center gap-3 border-t bg-muted/40 p-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[11px] uppercase text-muted-foreground">
            {form.destinationUrl ? new URL(form.destinationUrl.startsWith('http') ? form.destinationUrl : `https://${form.destinationUrl}`).hostname : 'yoursite.com'}
          </p>
          <p className="truncate text-sm font-semibold">{form.headline || 'Your headline'}</p>
          {form.description && (
            <p className="truncate text-xs text-muted-foreground">{form.description}</p>
          )}
        </div>
        <span className="shrink-0 rounded bg-secondary px-3 py-1.5 text-xs font-medium">
          {form.ctaLabel || 'Learn More'}
        </span>
      </div>

      <div className="flex items-center justify-around border-t px-3 py-2 text-xs text-muted-foreground">
        <span className="flex items-center gap-1"><ThumbsUp className="h-3.5 w-3.5" /> Like</span>
        <span className="flex items-center gap-1"><MessageCircle className="h-3.5 w-3.5" /> Comment</span>
        <span className="flex items-center gap-1"><Share2 className="h-3.5 w-3.5" /> Share</span>
      </div>
    </div>
  );
}

function GooglePreview({ form }: PreviewProps) {
  const host = form.destinationUrl
    ? form.destinationUrl.replace(/^https?:\/\//, '').split('/')[0]
    : 'yoursite.com';

  return (
    <div className="mx-auto max-w-lg rounded-lg border bg-card p-4">
      <div className="mb-1 flex items-center gap-1.5">
        <span className="rounded border px-1 py-0.5 text-[10px] font-bold">Ad</span>
        <span className="text-xs text-muted-foreground">·</span>
        <span className="text-xs text-muted-foreground">{host}</span>
      </div>
      <p className="mb-0.5 text-lg leading-tight text-[#1a0dab] dark:text-[#8ab4f8]">
        {form.headline || 'Your headline appears here'}
      </p>
      <p className="text-sm text-muted-foreground">
        {form.primaryText || 'Your description line shows below the headline and explains the offer.'}
      </p>
      {form.description && (
        <p className="mt-1 text-sm text-muted-foreground">{form.description}</p>
      )}
      <p className="mt-2 text-xs text-[#1a0dab] dark:text-[#8ab4f8]">
        {form.ctaLabel || 'Learn More'} ›
      </p>
    </div>
  );
}

function LinkedInPreview({ form, brand }: PreviewProps) {
  return (
    <div className="mx-auto max-w-sm overflow-hidden rounded-lg border bg-card">
      <div className="flex items-start gap-2 p-3">
        <BrandMark brand={brand} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{brand?.name ?? 'Your brand'}</p>
          <p className="truncate text-[11px] text-muted-foreground">
            12,480 followers
          </p>
          <p className="text-[11px] text-muted-foreground">Promoted</p>
        </div>
      </div>

      <p className="whitespace-pre-line px-3 pb-3 text-sm">
        {form.primaryText || 'Your post copy appears here. LinkedIn truncates after about two lines.'}
      </p>

      <div
        className="flex aspect-[1.91/1] items-center justify-center"
        style={{
          background: `linear-gradient(135deg, ${brand?.primaryColor ?? '#1A365D'}22, ${brand?.secondaryColor ?? '#4299E1'}33)`,
        }}
      >
        <span className="text-xs text-muted-foreground">Creative asset 1.91:1</span>
      </div>

      <div className="flex items-center gap-3 bg-muted/40 p-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{form.headline || 'Your headline'}</p>
          <p className="truncate text-[11px] text-muted-foreground">
            {form.destinationUrl.replace(/^https?:\/\//, '').split('/')[0] || 'yoursite.com'}
          </p>
        </div>
        <span className="shrink-0 rounded-full border border-primary px-3 py-1 text-xs font-semibold text-primary">
          {form.ctaLabel || 'Learn more'}
        </span>
      </div>

      <div className="flex items-center justify-around border-t px-3 py-2 text-xs text-muted-foreground">
        <span className="flex items-center gap-1"><Heart className="h-3.5 w-3.5" /> Like</span>
        <span className="flex items-center gap-1"><MessageCircle className="h-3.5 w-3.5" /> Comment</span>
        <span className="flex items-center gap-1"><Share2 className="h-3.5 w-3.5" /> Repost</span>
      </div>
    </div>
  );
}
