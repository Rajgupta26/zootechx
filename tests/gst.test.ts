import { describe, it, expect } from 'vitest';
import {
  calculateTax, resolveTaxTreatment, isValidGstin,
  stateCodeFromGstin, effectiveGstRate,
} from '@/lib/billing/gst';
import {
  toMinor, toDecimalString, amountInWords,
  splitHalves, extractBase, percentOf, roundToRupee,
} from '@/lib/billing/money';
import { fiscalYearFor } from '@/lib/billing/fiscal-year';

/** Read one Decimal field off a breakdown as a fixed-2 string. */
const d = <T extends object>(breakdown: T, key: keyof T) =>
  toDecimalString(breakdown[key] as bigint);

describe('money', () => {
  it('parses amounts without floating-point drift', () => {
    expect(toDecimalString(toMinor('100000'))).toBe('100000.00');
    expect(toDecimalString(toMinor('1,20,000.50'))).toBe('120000.50');
    expect(toDecimalString(toMinor(0.1 + 0.2))).toBe('0.30');
    expect(toDecimalString(toMinor('₹ 99,999.99'))).toBe('99999.99');
  });

  it('rounds the third decimal half-up', () => {
    expect(toDecimalString(toMinor('10.005'))).toBe('10.01');
    expect(toDecimalString(toMinor('10.004'))).toBe('10.00');
  });

  it('splits an odd tax amount without losing a paisa', () => {
    const [cgst, sgst] = splitHalves(toMinor('15.01'));
    expect(cgst + sgst).toBe(toMinor('15.01'));
    expect(toDecimalString(cgst)).toBe('7.51');
    expect(toDecimalString(sgst)).toBe('7.50');
  });

  it('extracts a taxable base from a gross amount', () => {
    // 118000 inclusive of 18% => 100000 taxable
    expect(toDecimalString(extractBase(toMinor('118000'), 18))).toBe('100000.00');
  });

  it('computes percentages with half-up rounding', () => {
    expect(toDecimalString(percentOf(toMinor('100000'), 18))).toBe('18000.00');
    expect(toDecimalString(percentOf(toMinor('1234.56'), 18))).toBe('222.22');
  });

  it('rounds to the nearest rupee and reports the delta', () => {
    const { rounded, roundOff } = roundToRupee(toMinor('118000.49'));
    expect(toDecimalString(rounded)).toBe('118000.00');
    expect(toDecimalString(roundOff)).toBe('-0.49');
  });

  it('writes Indian-format amounts in words', () => {
    expect(amountInWords(toMinor('118000'), 'INR')).toBe(
      'Rupees One Lakh Eighteen Thousand Only'
    );
    expect(amountInWords(toMinor('1250.50'), 'INR')).toBe(
      'Rupees One Thousand Two Hundred Fifty and Fifty Paise Only'
    );
    expect(amountInWords(toMinor('14500'), 'USD')).toBe(
      'Dollars Fourteen Thousand Five Hundred Only'
    );
  });
});

describe('tax treatment resolution', () => {
  const company = { companyStateCode: '27', companyCountry: 'India' };

  it('treats the same state as intra-state', () => {
    expect(resolveTaxTreatment({ ...company, clientStateCode: '27', clientCountry: 'India' }))
      .toBe('INTRA_STATE');
  });

  it('treats a different state as inter-state', () => {
    expect(resolveTaxTreatment({ ...company, clientStateCode: '29', clientCountry: 'India' }))
      .toBe('INTER_STATE');
  });

  it('zero-rates an overseas client when an LUT is held', () => {
    expect(resolveTaxTreatment({
      ...company, clientCountry: 'United States', exportUnderLut: true,
    })).toBe('EXPORT_LUT');
  });

  it('charges IGST on exports when no LUT is held', () => {
    expect(resolveTaxTreatment({
      ...company, clientCountry: 'United States', exportUnderLut: false,
    })).toBe('EXPORT_WITH_TAX');
  });

  it('falls back to intra-state when the place of supply is unknown', () => {
    expect(resolveTaxTreatment({ ...company, clientStateCode: null })).toBe('INTRA_STATE');
  });

  it('honours an explicit override', () => {
    expect(resolveTaxTreatment({
      ...company, clientStateCode: '29', override: 'EXEMPT',
    })).toBe('EXEMPT');
  });

  it('normalises single-digit state codes', () => {
    expect(resolveTaxTreatment({ companyStateCode: '7', clientStateCode: '07' }))
      .toBe('INTRA_STATE');
  });
});

describe('the 2-field engine — exclusive basis', () => {
  it('adds CGST + SGST for an intra-state supply', () => {
    const r = calculateTax({
      amount: '100000', basis: 'EXCLUSIVE', gstRate: 18, treatment: 'INTRA_STATE',
    });
    expect(d(r, 'subTotal')).toBe('100000.00');
    expect(d(r, 'cgst')).toBe('9000.00');
    expect(d(r, 'sgst')).toBe('9000.00');
    expect(d(r, 'igst')).toBe('0.00');
    expect(d(r, 'total')).toBe('118000.00');
  });

  it('adds IGST for an inter-state supply', () => {
    const r = calculateTax({
      amount: '100000', basis: 'EXCLUSIVE', gstRate: 18, treatment: 'INTER_STATE',
    });
    expect(d(r, 'igst')).toBe('18000.00');
    expect(d(r, 'cgst')).toBe('0.00');
    expect(d(r, 'total')).toBe('118000.00');
  });

  it('charges no tax on a zero-rated export', () => {
    const r = calculateTax({
      amount: '14500', basis: 'EXCLUSIVE', gstRate: 18, treatment: 'EXPORT_LUT',
    });
    expect(r.gstRate).toBe(0);
    expect(d(r, 'taxTotal')).toBe('0.00');
    expect(d(r, 'total')).toBe('14500.00');
  });
});

describe('the 2-field engine — inclusive basis', () => {
  it('back-calculates the taxable value from a gross amount', () => {
    const r = calculateTax({
      amount: '100000', basis: 'INCLUSIVE', gstRate: 18, treatment: 'INTRA_STATE',
    });
    expect(d(r, 'subTotal')).toBe('84745.76');
    expect(d(r, 'taxTotal')).toBe('15254.24');
    expect(d(r, 'cgst')).toBe('7627.12');
    expect(d(r, 'sgst')).toBe('7627.12');
    expect(d(r, 'total')).toBe('100000.00');
  });

  it('never loses money between the halves', () => {
    const r = calculateTax({
      amount: '99999.99', basis: 'INCLUSIVE', gstRate: 18, treatment: 'INTRA_STATE',
    });
    expect(r.cgst + r.sgst).toBe(r.taxTotal);
    expect(r.subTotal + r.taxTotal + r.roundOff).toBe(r.total);
  });
});

describe('TDS', () => {
  it('computes TDS on the taxable value, not the GST-inclusive total', () => {
    const r = calculateTax({
      amount: '100000', basis: 'EXCLUSIVE', gstRate: 18,
      treatment: 'INTER_STATE', applyTds: true, tdsRate: 10,
    });
    // 10% of 100000 (taxable), NOT of 118000
    expect(d(r, 'tdsAmount')).toBe('10000.00');
    expect(d(r, 'total')).toBe('118000.00');
    expect(d(r, 'netReceivable')).toBe('108000.00');
  });

  it('is zero when not applied', () => {
    const r = calculateTax({
      amount: '100000', basis: 'EXCLUSIVE', gstRate: 18, treatment: 'INTRA_STATE',
    });
    expect(d(r, 'tdsAmount')).toBe('0.00');
    expect(d(r, 'netReceivable')).toBe(d(r, 'total'));
  });
});

describe('discounts and rounding', () => {
  it('applies a discount before tax', () => {
    const r = calculateTax({
      amount: '100000', discount: '10000', basis: 'EXCLUSIVE',
      gstRate: 18, treatment: 'INTRA_STATE',
    });
    expect(d(r, 'subTotal')).toBe('90000.00');
    expect(d(r, 'total')).toBe('106200.00');
  });

  it('rounds the payable total to the nearest rupee', () => {
    const r = calculateTax({
      amount: '1234.56', basis: 'EXCLUSIVE', gstRate: 18, treatment: 'INTRA_STATE',
    });
    // 1234.56 + 222.22 = 1456.78 -> 1457.00
    expect(d(r, 'total')).toBe('1457.00');
    expect(d(r, 'roundOff')).toBe('0.22');
  });

  it('can have rounding disabled', () => {
    const r = calculateTax({
      amount: '1234.56', basis: 'EXCLUSIVE', gstRate: 18,
      treatment: 'INTRA_STATE', roundOffEnabled: false,
    });
    expect(d(r, 'total')).toBe('1456.78');
    expect(d(r, 'roundOff')).toBe('0.00');
  });

  it('keeps the accounting identity for every rate and basis', () => {
    for (const rate of [0, 5, 12, 18, 28]) {
      for (const basis of ['EXCLUSIVE', 'INCLUSIVE'] as const) {
        const r = calculateTax({
          amount: '87654.32', basis, gstRate: rate, treatment: 'INTRA_STATE',
        });
        expect(r.subTotal + r.taxTotal + r.roundOff).toBe(r.total);
        expect(r.cgst + r.sgst).toBe(r.taxTotal);
      }
    }
  });
});

describe('GSTIN validation', () => {
  it('accepts a structurally valid GSTIN', () => {
    // 27AABCX1234M1Z5 — checksum verified by the algorithm itself
    const valid = '27AAPFU0939F1ZV';
    expect(isValidGstin(valid)).toBe(true);
    expect(stateCodeFromGstin(valid)).toBe('27');
  });

  it('rejects malformed or wrong-checksum GSTINs', () => {
    expect(isValidGstin('27AAPFU0939F1ZX')).toBe(false); // bad checksum
    expect(isValidGstin('27AAPFU0939F1Z')).toBe(false);  // too short
    expect(isValidGstin('99AAPFU0939F1ZV')).toBe(false); // invalid state
    expect(isValidGstin('')).toBe(false);
  });
});

describe('effective rate', () => {
  it('zeroes the rate for exempt and LUT exports', () => {
    expect(effectiveGstRate('EXPORT_LUT', 18)).toBe(0);
    expect(effectiveGstRate('EXEMPT', 18)).toBe(0);
    expect(effectiveGstRate('INTRA_STATE', 18)).toBe(18);
    expect(effectiveGstRate('EXPORT_WITH_TAX', 18)).toBe(18);
  });
});

describe('fiscal year', () => {
  it('runs April to March', () => {
    expect(fiscalYearFor(new Date(2026, 3, 1)).label).toBe('26-27');  // 1 Apr 2026
    expect(fiscalYearFor(new Date(2026, 2, 31)).label).toBe('25-26'); // 31 Mar 2026
    expect(fiscalYearFor(new Date(2026, 8, 16)).label).toBe('26-27'); // 16 Sep 2026
    expect(fiscalYearFor(new Date(2027, 0, 5)).label).toBe('26-27');  // 5 Jan 2027
  });
});
