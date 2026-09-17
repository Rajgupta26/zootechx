import { describe, it, expect } from 'vitest';
import { calculateTax, resolveTaxTreatment, effectiveGstRate, treatmentLabel } from '@/lib/billing/gst';
import { quickInvoiceSchema } from '@/lib/validators';

/**
 * "Without GST" on one invoice.
 *
 * The distinction that matters is not whether the tax happens to be zero — an
 * export under LUT is zero too — but which document is being issued. A supply
 * carrying no tax is a bill of supply; a zero-rated export is still a tax
 * invoice. These check that choosing "without GST" reaches EXEMPT, changes
 * nothing else, and never leaks into the client's standing settings.
 */
const india = {
  companyStateCode: '27',
  companyCountry: 'India',
  clientStateCode: '27',
  clientCountry: 'India',
  exportUnderLut: false,
};

describe('issuing without GST', () => {
  it('overrides geography that would otherwise charge CGST + SGST', () => {
    expect(resolveTaxTreatment(india)).toBe('INTRA_STATE');
    expect(resolveTaxTreatment({ ...india, override: 'EXEMPT' })).toBe('EXEMPT');
  });

  it('overrides an inter-state supply too', () => {
    const other = { ...india, clientStateCode: '29' };
    expect(resolveTaxTreatment(other)).toBe('INTER_STATE');
    expect(resolveTaxTreatment({ ...other, override: 'EXEMPT' })).toBe('EXEMPT');
  });

  it('zeroes the rate whatever the company default is', () => {
    expect(effectiveGstRate('EXEMPT', 18)).toBe(0);
    expect(effectiveGstRate('INTRA_STATE', 18)).toBe(18);
  });

  it('charges nothing, and splits nothing', () => {
    const exempt = calculateTax({
      amount: '100000',
      basis: 'EXCLUSIVE',
      gstRate: 18,
      treatment: 'EXEMPT',
      applyTds: false,
      tdsRate: 0,
    });

    expect(exempt.cgst).toBe(0n);
    expect(exempt.sgst).toBe(0n);
    expect(exempt.igst).toBe(0n);
    expect(exempt.taxTotal).toBe(0n);
    expect(exempt.gstRate).toBe(0);
  });

  it('bills the amount entered — no tax means total equals subtotal', () => {
    const exempt = calculateTax({
      amount: '100000',
      basis: 'EXCLUSIVE',
      gstRate: 18,
      treatment: 'EXEMPT',
      applyTds: false,
      tdsRate: 0,
    });
    expect(exempt.subTotal).toBe(exempt.total);
  });

  it('is not the same as an 18% invoice, which is the whole point', () => {
    const shared = {
      amount: '100000',
      basis: 'EXCLUSIVE' as const,
      gstRate: 18,
      applyTds: false,
      tdsRate: 0,
    };
    const taxed = calculateTax({ ...shared, treatment: 'INTRA_STATE' });
    const exempt = calculateTax({ ...shared, treatment: 'EXEMPT' });

    expect(taxed.taxTotal).toBeGreaterThan(0n);
    expect(taxed.total - exempt.total).toBe(taxed.taxTotal);
  });

  it('still deducts TDS, which is income tax and not GST', () => {
    const exempt = calculateTax({
      amount: '100000',
      basis: 'EXCLUSIVE',
      gstRate: 18,
      treatment: 'EXEMPT',
      applyTds: true,
      tdsRate: 10,
    });

    expect(exempt.taxTotal).toBe(0n);
    expect(exempt.tdsAmount).toBeGreaterThan(0n);
    expect(exempt.netReceivable).toBe(exempt.total - exempt.tdsAmount);
  });

  it('leaves an export under LUT alone — zero-rated, but a different document', () => {
    expect(effectiveGstRate('EXPORT_LUT', 18)).toBe(0);
    expect(treatmentLabel('EXPORT_LUT')).toContain('LUT');
    expect(treatmentLabel('EXEMPT')).toContain('Exempt');
  });
});

describe('the quick invoice form', () => {
  const base = { clientName: 'Acme', amount: '100000' };

  it('charges GST unless told otherwise', () => {
    const parsed = quickInvoiceSchema.parse(base);
    expect(parsed.taxTreatment).toBe('AUTO');
  });

  it('accepts the without-GST choice', () => {
    expect(quickInvoiceSchema.parse({ ...base, taxTreatment: 'EXEMPT' }).taxTreatment)
      .toBe('EXEMPT');
  });

  it('refuses a treatment the form does not offer', () => {
    for (const taxTreatment of ['INTRA_STATE', 'EXPORT_LUT', 'NONE', '']) {
      expect(quickInvoiceSchema.safeParse({ ...base, taxTreatment }).success, taxTreatment)
        .toBe(false);
    }
  });
});
