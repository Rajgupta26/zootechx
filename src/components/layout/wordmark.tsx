import { cn } from '@/lib/utils';

/**
 * The ZootechX wordmark, and the brain glyph from inside it on its own.
 *
 * Two colourways rather than a CSS filter: the artwork is a fixed asset, and
 * the surfaces it sits on are fixed too — ink rail and the sign-in panel take
 * `light`, cream surfaces take `dark`. Both are trimmed to their ink, so the
 * height below is the height you actually see and nothing has to be nudged
 * with negative margins.
 */

const WORDMARK_ASPECT = 1304 / 226;

export function Wordmark({
  tone = 'dark',
  height = 22,
  className,
}: {
  tone?: 'dark' | 'light';
  /** Cap height of the wordmark in pixels. */
  height?: number;
  className?: string;
}) {
  const width = Math.round(height * WORDMARK_ASPECT);
  return (
    // eslint-disable-next-line @next/next/no-img-element -- fixed-size brand asset
    <img
      src={tone === 'light' ? '/brand/wordmark-light.png' : '/brand/wordmark.png'}
      alt="ZootechX"
      width={width}
      height={height}
      className={cn('shrink-0', className)}
      // An explicit cross-axis size, not `w-auto`: in a flex column the
      // default `align-self: stretch` applies whenever the width is auto, and
      // it stretched the wordmark across the whole sign-in panel.
      style={{ width, height }}
    />
  );
}

export function LogoMark({
  tone = 'dark',
  size = 22,
  className,
}: {
  tone?: 'dark' | 'light';
  size?: number;
  className?: string;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- fixed-size brand asset
    <img
      src={tone === 'light' ? '/brand/logo-mark-light.png' : '/brand/logo-mark.png'}
      alt="ZootechX"
      width={size}
      height={size}
      className={className}
      style={{ width: size, height: size }}
    />
  );
}
