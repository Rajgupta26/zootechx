import { describe, it, expect } from 'vitest';
import { sowSignSchema } from '@/lib/validators';

/**
 * The typed signature is printed on the countersigned contract as the client's
 * mark. It therefore has to be their name — before this rule existed the field
 * accepted any two characters, and proposals were signed with "bdid".
 */
const base = {
  token: 'tok',
  signerName: 'Priya Sharma',
  signerEmail: 'priya@northwind.in',
  consent: true as const,
};

const signatureError = (result: ReturnType<typeof sowSignSchema.safeParse>) =>
  result.success ? null : result.error.flatten().fieldErrors.signature?.[0];

describe('proposal signing', () => {
  it('accepts a signature matching the signer name', () => {
    expect(sowSignSchema.safeParse({ ...base, signature: 'Priya Sharma' }).success).toBe(true);
  });

  it('ignores case, spacing and punctuation', () => {
    for (const signature of ['priya sharma', '  Priya   Sharma ', 'Priya Sharma.', 'PRIYA SHARMA']) {
      expect(sowSignSchema.safeParse({ ...base, signature }).success).toBe(true);
    }
  });

  it('rejects a signature that is not the signer name', () => {
    const result = sowSignSchema.safeParse({ ...base, signature: 'bdid' });
    expect(result.success).toBe(false);
    expect(signatureError(result)).toMatch(/must match/i);
  });

  it('rejects a partial name', () => {
    expect(sowSignSchema.safeParse({ ...base, signature: 'Priya' }).success).toBe(false);
  });

  it('exempts a drawn signature, which arrives as a data URL', () => {
    const drawn = 'data:image/png;base64,iVBORw0KGgo=';
    expect(sowSignSchema.safeParse({ ...base, signature: drawn }).success).toBe(true);
  });

  it('still requires consent', () => {
    const result = sowSignSchema.safeParse({ ...base, consent: false, signature: 'Priya Sharma' });
    expect(result.success).toBe(false);
  });
});
