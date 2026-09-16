/**
 * Money arithmetic in integer minor units (paise / cents).
 *
 * Every monetary calculation in this codebase goes through here. Floating point
 * is never used for money: 0.1 + 0.2 !== 0.3 is a rounding error in a display,
 * but in a GST invoice it is a compliance defect.
 */

export type Minor = bigint;

export const MINOR_PER_MAJOR = 100n;

/** Parse a user-supplied amount ("1,20,000.50", 120000.5, "120000.50") into paise. */
export function toMinor(value: string | number): Minor {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('Amount is not a finite number');
    return BigInt(Math.round(value * 100));
  }

  const cleaned = value.replace(/[,\s₹$]/g, '').trim();
  if (cleaned === '') return 0n;
  if (!/^-?\d*(\.\d*)?$/.test(cleaned)) {
    throw new Error(`Invalid amount: ${value}`);
  }

  const negative = cleaned.startsWith('-');
  const unsigned = negative ? cleaned.slice(1) : cleaned;
  const [whole = '0', frac = ''] = unsigned.split('.');
  // Round half-up on the third decimal rather than truncating.
  const paddedFrac = (frac + '000').slice(0, 3);
  const twoDigits = BigInt(paddedFrac.slice(0, 2) || '0');
  const thirdDigit = Number(paddedFrac[2] ?? '0');
  let minor = BigInt(whole || '0') * MINOR_PER_MAJOR + twoDigits;
  if (thirdDigit >= 5) minor += 1n;
  return negative ? -minor : minor;
}

/** Convert paise back to a decimal string with exactly two places. */
export function toDecimalString(minor: Minor): string {
  const negative = minor < 0n;
  const abs = negative ? -minor : minor;
  const whole = abs / MINOR_PER_MAJOR;
  const frac = abs % MINOR_PER_MAJOR;
  return `${negative ? '-' : ''}${whole}.${frac.toString().padStart(2, '0')}`;
}

export function toNumber(minor: Minor): number {
  return Number(toDecimalString(minor));
}

/**
 * Multiply by a percentage rate (e.g. 18, 18.5, 2.75) with half-up rounding.
 * Rates carry up to 3 decimals, so we scale by 1000 before dividing.
 */
export function percentOf(minor: Minor, ratePercent: number): Minor {
  const scaledRate = BigInt(Math.round(ratePercent * 1000));
  return divideRoundHalfUp(minor * scaledRate, 100_000n);
}

/**
 * Back-calculate the taxable value from a gross amount.
 * gross = taxable * (1 + rate/100)  =>  taxable = gross * 100000 / (100000 + rate*1000)
 */
export function extractBase(gross: Minor, ratePercent: number): Minor {
  const scaledRate = BigInt(Math.round(ratePercent * 1000));
  return divideRoundHalfUp(gross * 100_000n, 100_000n + scaledRate);
}

/** Integer division with half-up rounding, sign-aware. */
export function divideRoundHalfUp(numerator: bigint, denominator: bigint): bigint {
  if (denominator === 0n) throw new Error('Division by zero');
  const negative = numerator < 0n !== denominator < 0n;
  const absNum = numerator < 0n ? -numerator : numerator;
  const absDen = denominator < 0n ? -denominator : denominator;
  const quotient = absNum / absDen;
  const remainder = absNum % absDen;
  const rounded = remainder * 2n >= absDen ? quotient + 1n : quotient;
  return negative ? -rounded : rounded;
}

/**
 * Split a tax amount into two equal halves (CGST/SGST) without losing a paisa.
 * The odd paisa goes to CGST, matching common accounting-software behaviour.
 */
export function splitHalves(minor: Minor): [Minor, Minor] {
  const half = minor / 2n;
  const remainder = minor - half * 2n;
  return [half + remainder, half];
}

/** Round to the nearest whole rupee. Returns the rounded value and the delta. */
export function roundToRupee(minor: Minor): { rounded: Minor; roundOff: Minor } {
  const rounded = divideRoundHalfUp(minor, MINOR_PER_MAJOR) * MINOR_PER_MAJOR;
  return { rounded, roundOff: rounded - minor };
}

const LOCALE: Record<string, { locale: string; currency: string }> = {
  INR: { locale: 'en-IN', currency: 'INR' },
  USD: { locale: 'en-US', currency: 'USD' },
};

export function formatMoney(
  value: Minor | number | string,
  currency: 'INR' | 'USD' = 'INR',
  opts: { compact?: boolean } = {}
): string {
  const amount =
    typeof value === 'bigint' ? toNumber(value) : typeof value === 'string' ? Number(value) : value;
  const cfg = LOCALE[currency] ?? LOCALE.INR;
  return new Intl.NumberFormat(cfg.locale, {
    style: 'currency',
    currency: cfg.currency,
    minimumFractionDigits: opts.compact ? 0 : 2,
    maximumFractionDigits: opts.compact ? 0 : 2,
    notation: opts.compact ? 'compact' : 'standard',
  }).format(amount);
}

/** "1,18,000.00" style grouping without the symbol. */
export function formatAmount(value: Minor | number | string, currency: 'INR' | 'USD' = 'INR'): string {
  const amount =
    typeof value === 'bigint' ? toNumber(value) : typeof value === 'string' ? Number(value) : value;
  const cfg = LOCALE[currency] ?? LOCALE.INR;
  return new Intl.NumberFormat(cfg.locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
  'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function twoDigits(n: number): string {
  if (n < 20) return ONES[n];
  const t = Math.floor(n / 10);
  const o = n % 10;
  return TENS[t] + (o ? ' ' + ONES[o] : '');
}

/**
 * Amount in words — a legal requirement on Indian tax invoices.
 * Uses the Indian numbering system (lakh/crore) for INR.
 */
export function amountInWords(minor: Minor, currency: 'INR' | 'USD' = 'INR'): string {
  const negative = minor < 0n;
  const abs = negative ? -minor : minor;
  const whole = Number(abs / MINOR_PER_MAJOR);
  const frac = Number(abs % MINOR_PER_MAJOR);

  const words = currency === 'INR' ? indianWords(whole) : westernWords(whole);
  const unit = currency === 'INR' ? 'Rupees' : 'Dollars';
  const subUnit = currency === 'INR' ? 'Paise' : 'Cents';

  let out = `${unit} ${words || 'Zero'}`;
  if (frac > 0) out += ` and ${twoDigits(frac)} ${subUnit}`;
  return `${negative ? 'Minus ' : ''}${out} Only`;
}

function indianWords(n: number): string {
  if (n === 0) return '';
  const parts: string[] = [];
  const crore = Math.floor(n / 10_000_000);
  const lakh = Math.floor((n % 10_000_000) / 100_000);
  const thousand = Math.floor((n % 100_000) / 1000);
  const hundred = Math.floor((n % 1000) / 100);
  const rest = n % 100;

  if (crore) parts.push(`${indianWords(crore)} Crore`);
  if (lakh) parts.push(`${twoDigits(lakh)} Lakh`);
  if (thousand) parts.push(`${twoDigits(thousand)} Thousand`);
  if (hundred) parts.push(`${ONES[hundred]} Hundred`);
  if (rest) parts.push(twoDigits(rest));
  return parts.join(' ').trim();
}

function westernWords(n: number): string {
  if (n === 0) return '';
  const parts: string[] = [];
  const billion = Math.floor(n / 1_000_000_000);
  const million = Math.floor((n % 1_000_000_000) / 1_000_000);
  const thousand = Math.floor((n % 1_000_000) / 1000);
  const rest = n % 1000;

  if (billion) parts.push(`${westernWords(billion)} Billion`);
  if (million) parts.push(`${westernWords(million)} Million`);
  if (thousand) parts.push(`${westernWords(thousand)} Thousand`);
  if (rest) {
    const h = Math.floor(rest / 100);
    const r = rest % 100;
    if (h) parts.push(`${ONES[h]} Hundred`);
    if (r) parts.push(twoDigits(r));
  }
  return parts.join(' ').trim();
}
