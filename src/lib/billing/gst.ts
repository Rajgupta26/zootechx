/**
 * GST / tax engine.
 *
 * This is the module that turns the two fields of the quick-invoice modal
 * (client + total amount) into a legally-shaped Indian tax invoice.
 *
 * Decisions encoded here:
 *  - Entered amount is EXCLUSIVE of GST by default (project decision).
 *  - Place of supply vs company state decides CGST+SGST (intra) or IGST (inter).
 *  - Non-Indian clients are zero-rated exports when the company holds an LUT.
 *  - TDS u/s 194J is computed on the taxable value, NOT on the GST-inclusive
 *    total (CBDT Circular 23/2017). This is what makes AR reconcile.
 */

import {
  type Minor,
  extractBase,
  percentOf,
  roundToRupee,
  splitHalves,
  toMinor,
} from './money';

export type TaxTreatment =
  | 'INTRA_STATE'
  | 'INTER_STATE'
  | 'EXPORT_LUT'
  | 'EXPORT_WITH_TAX'
  | 'EXEMPT';

export type AmountBasis = 'EXCLUSIVE' | 'INCLUSIVE';

export interface TaxContext {
  /** Company's GST state code, e.g. "27". */
  companyStateCode: string;
  companyCountry?: string;
  /** Client's place of supply state code. Null for unregistered/unknown. */
  clientStateCode?: string | null;
  clientCountry?: string | null;
  /** Company holds a Letter of Undertaking, so exports are zero-rated. */
  exportUnderLut?: boolean;
  /** Explicit override, e.g. for SEZ clients. */
  override?: TaxTreatment | null;
}

export interface TaxInput {
  /** Raw value from the modal. */
  amount: string | number;
  basis: AmountBasis;
  gstRate: number;
  discount?: string | number;
  treatment: TaxTreatment;
  /** Apply TDS deduction to compute the expected receipt. */
  applyTds?: boolean;
  tdsRate?: number;
  /** Round the payable total to the nearest rupee and record the delta. */
  roundOffEnabled?: boolean;
}

export interface TaxBreakdown {
  enteredAmount: Minor;
  /** Taxable value after discount. */
  subTotal: Minor;
  discount: Minor;
  gstRate: number;
  cgst: Minor;
  sgst: Minor;
  igst: Minor;
  taxTotal: Minor;
  roundOff: Minor;
  /** Amount payable by the client. */
  total: Minor;
  tdsRate: number;
  tdsAmount: Minor;
  /** What actually lands in the bank: total - TDS. */
  netReceivable: Minor;
  treatment: TaxTreatment;
  basis: AmountBasis;
}

/**
 * Derive the tax treatment from company and client geography.
 * An explicit override always wins.
 */
export function resolveTaxTreatment(ctx: TaxContext): TaxTreatment {
  if (ctx.override) return ctx.override;

  const companyCountry = (ctx.companyCountry ?? 'India').trim().toLowerCase();
  const clientCountry = (ctx.clientCountry ?? 'India').trim().toLowerCase();

  if (clientCountry !== companyCountry) {
    return ctx.exportUnderLut ? 'EXPORT_LUT' : 'EXPORT_WITH_TAX';
  }

  const company = normaliseStateCode(ctx.companyStateCode);
  const client = normaliseStateCode(ctx.clientStateCode);

  // Unknown place of supply falls back to intra-state, which is the safe
  // assumption for an unregistered local client (B2C).
  if (!client) return 'INTRA_STATE';
  return client === company ? 'INTRA_STATE' : 'INTER_STATE';
}

function normaliseStateCode(code?: string | null): string | null {
  if (!code) return null;
  const digits = code.replace(/\D/g, '');
  if (!digits) return null;
  return digits.padStart(2, '0').slice(0, 2);
}

/** The effective GST rate for a treatment — exports under LUT are zero-rated. */
export function effectiveGstRate(treatment: TaxTreatment, configuredRate: number): number {
  switch (treatment) {
    case 'EXPORT_LUT':
    case 'EXEMPT':
      return 0;
    default:
      return configuredRate;
  }
}

/**
 * The core calculation. Pure, synchronous, and fully unit-testable.
 */
export function calculateTax(input: TaxInput): TaxBreakdown {
  const treatment = input.treatment;
  const gstRate = effectiveGstRate(treatment, input.gstRate);
  const basis = input.basis;
  const roundOffEnabled = input.roundOffEnabled ?? true;

  const enteredAmount = toMinor(input.amount);
  const discount = toMinor(input.discount ?? 0);

  let subTotal: Minor;
  let taxTotal: Minor;

  if (basis === 'INCLUSIVE') {
    // The entered figure is what the client pays. Work backwards.
    const grossAfterDiscount = enteredAmount - discount;
    subTotal = extractBase(grossAfterDiscount, gstRate);
    taxTotal = grossAfterDiscount - subTotal;
  } else {
    // The entered figure is the fee; tax sits on top.
    subTotal = enteredAmount - discount;
    taxTotal = percentOf(subTotal, gstRate);
  }

  let cgst = 0n;
  let sgst = 0n;
  let igst = 0n;

  switch (treatment) {
    case 'INTRA_STATE': {
      const [c, s] = splitHalves(taxTotal);
      cgst = c;
      sgst = s;
      break;
    }
    case 'INTER_STATE':
    case 'EXPORT_WITH_TAX':
      igst = taxTotal;
      break;
    case 'EXPORT_LUT':
    case 'EXEMPT':
      taxTotal = 0n;
      break;
  }

  const beforeRounding = subTotal + taxTotal;
  const { rounded, roundOff } = roundOffEnabled
    ? roundToRupee(beforeRounding)
    : { rounded: beforeRounding, roundOff: 0n };

  // TDS is deducted by the client on the taxable value, not on the GST.
  const tdsRate = input.applyTds ? (input.tdsRate ?? 0) : 0;
  const tdsAmount = tdsRate > 0 ? percentOf(subTotal, tdsRate) : 0n;

  return {
    enteredAmount,
    subTotal,
    discount,
    gstRate,
    cgst,
    sgst,
    igst,
    taxTotal,
    roundOff,
    total: rounded,
    tdsRate,
    tdsAmount,
    netReceivable: rounded - tdsAmount,
    treatment,
    basis,
  };
}

/** Human-readable label for the invoice PDF and UI. */
export function treatmentLabel(treatment: TaxTreatment): string {
  switch (treatment) {
    case 'INTRA_STATE':
      return 'Intra-state supply (CGST + SGST)';
    case 'INTER_STATE':
      return 'Inter-state supply (IGST)';
    case 'EXPORT_LUT':
      return 'Export of services under LUT — zero rated, no IGST payable';
    case 'EXPORT_WITH_TAX':
      return 'Export of services with IGST paid (refund claimable)';
    case 'EXEMPT':
      return 'Exempt / nil-rated supply';
  }
}

/** GST state code → name, used for place-of-supply display and validation. */
export const GST_STATE_CODES: Record<string, string> = {
  '01': 'Jammu and Kashmir', '02': 'Himachal Pradesh', '03': 'Punjab',
  '04': 'Chandigarh', '05': 'Uttarakhand', '06': 'Haryana', '07': 'Delhi',
  '08': 'Rajasthan', '09': 'Uttar Pradesh', '10': 'Bihar', '11': 'Sikkim',
  '12': 'Arunachal Pradesh', '13': 'Nagaland', '14': 'Manipur', '15': 'Mizoram',
  '16': 'Tripura', '17': 'Meghalaya', '18': 'Assam', '19': 'West Bengal',
  '20': 'Jharkhand', '21': 'Odisha', '22': 'Chhattisgarh', '23': 'Madhya Pradesh',
  '24': 'Gujarat', '26': 'Dadra and Nagar Haveli and Daman and Diu',
  '27': 'Maharashtra', '29': 'Karnataka', '30': 'Goa', '31': 'Lakshadweep',
  '32': 'Kerala', '33': 'Tamil Nadu', '34': 'Puducherry', '35': 'Andaman and Nicobar Islands',
  '36': 'Telangana', '37': 'Andhra Pradesh', '38': 'Ladakh', '97': 'Other Territory',
};

export function stateNameFromCode(code?: string | null): string | null {
  const n = normaliseStateCode(code);
  return n ? (GST_STATE_CODES[n] ?? null) : null;
}

/**
 * Validate a GSTIN and derive its state code.
 * Format: 2 digit state + 10 char PAN + entity number + 'Z' + checksum.
 */
const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

export function isValidGstin(gstin: string): boolean {
  const value = gstin.trim().toUpperCase();
  if (!GSTIN_RE.test(value)) return false;
  if (!GST_STATE_CODES[value.slice(0, 2)]) return false;
  return value[14] === gstinChecksum(value.slice(0, 14));
}

const CHECKSUM_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

function gstinChecksum(first14: string): string {
  let sum = 0;
  for (let i = 0; i < first14.length; i++) {
    const value = CHECKSUM_ALPHABET.indexOf(first14[i]);
    const factor = i % 2 === 0 ? 1 : 2;
    const product = value * factor;
    sum += Math.floor(product / CHECKSUM_ALPHABET.length) + (product % CHECKSUM_ALPHABET.length);
  }
  return CHECKSUM_ALPHABET[(CHECKSUM_ALPHABET.length - (sum % CHECKSUM_ALPHABET.length)) % CHECKSUM_ALPHABET.length];
}

export function stateCodeFromGstin(gstin?: string | null): string | null {
  if (!gstin) return null;
  const code = gstin.trim().slice(0, 2);
  return GST_STATE_CODES[code] ? code : null;
}
