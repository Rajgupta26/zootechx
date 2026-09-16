import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const PAGE_SIZE = 20;

/** Server-side pagination maths, shared by every list view. */
export function paginate(page: number | string | undefined, pageSize = PAGE_SIZE) {
  const current = Math.max(1, Number(page) || 1);
  return { skip: (current - 1) * pageSize, take: pageSize, page: current, pageSize };
}

export function pageCount(total: number, pageSize = PAGE_SIZE): number {
  return Math.max(1, Math.ceil(total / pageSize));
}

export function formatDate(date: Date | string | null | undefined, style: 'short' | 'long' = 'short') {
  if (!date) return '—';
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: style === 'long' ? 'long' : 'short',
    year: 'numeric',
  });
}

export function formatDateTime(date: Date | string | null | undefined) {
  if (!date) return '—';
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

/** "3 days ago", "in 2 hours" — used across follow-up and task lists. */
export function relativeTime(date: Date | string | null | undefined): string {
  if (!date) return '—';
  const d = typeof date === 'string' ? new Date(date) : date;
  const diffMs = d.getTime() - Date.now();
  const abs = Math.abs(diffMs);

  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ['year', 31_536_000_000], ['month', 2_592_000_000], ['day', 86_400_000],
    ['hour', 3_600_000], ['minute', 60_000],
  ];

  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  for (const [unit, ms] of units) {
    if (abs >= ms) return rtf.format(Math.round(diffMs / ms), unit);
  }
  return 'just now';
}

export function initials(name: string): string {
  return name.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('');
}

/** Normalise an email/phone for duplicate detection on leads. */
export function normaliseEmail(email?: string | null): string | null {
  const v = email?.trim().toLowerCase();
  return v || null;
}

export function normalisePhoneDigits(phone?: string | null): string | null {
  const digits = phone?.replace(/\D/g, '') ?? '';
  if (!digits) return null;
  // Compare on the last 10 digits so +91-98… and 098… match.
  return digits.slice(-10);
}

export function slugify(value: string): string {
  return value.toLowerCase().trim().replace(/[^\w\s-]/g, '').replace(/[\s_-]+/g, '-').replace(/^-+|-+$/g, '');
}

/** Serialise Prisma Decimal/BigInt/Date for a client component boundary. */
export function serialise<T>(value: T): T {
  return JSON.parse(
    JSON.stringify(value, (_k, v) => {
      if (typeof v === 'bigint') return v.toString();
      if (v && typeof v === 'object' && 'toFixed' in v && typeof (v as any).toFixed === 'function') {
        return (v as any).toString();
      }
      return v;
    })
  );
}
