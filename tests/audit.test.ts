import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';

/**
 * The audit chain hashes each entry together with the previous hash. The
 * serialisation must be independent of key order, because Postgres JSONB
 * reorders the keys of any object it stores — without this, a chain written
 * with metadata would always read back as broken.
 *
 * This mirrors the implementation in src/lib/audit.ts.
 */
function stableStringify(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) {
    return `[${value.map((v) => (v === undefined ? 'null' : stableStringify(v))).join(',')}]`;
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).filter((k) => record[k] !== undefined).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(record[k])}`).join(',')}}`;
}

const hash = (v: unknown) => createHash('sha256').update(stableStringify(v)).digest('hex');

describe('audit canonical form', () => {
  it('is independent of top-level key order', () => {
    expect(hash({ a: 1, b: 2 })).toBe(hash({ b: 2, a: 1 }));
  });

  it('is independent of nested key order — the JSONB case', () => {
    // Postgres JSONB reorders keys by length, then bytewise. This is exactly
    // what broke the chain before the fix.
    const written = { metadata: { treatment: 'INTRA_STATE', basis: 'EXCLUSIVE', gstRate: 18, entered: 555000, total: 654900 } };
    const readBack = { metadata: { basis: 'EXCLUSIVE', total: 654900, entered: 555000, gstRate: 18, treatment: 'INTRA_STATE' } };
    expect(hash(written)).toBe(hash(readBack));
  });

  it('preserves array order, which is meaningful', () => {
    expect(hash({ items: [1, 2] })).not.toBe(hash({ items: [2, 1] }));
  });

  it('coalesces absent metadata to null before hashing', () => {
    // canonical() normalises the top-level fields with `?? null`, so an entry
    // written without metadata and the same entry read back (where Prisma
    // returns null) hash identically. This is the entry-level guarantee; the
    // serialiser itself keeps undefined and null distinct, tested below.
    const canonical = (e: { summary: string; metadata?: unknown }) =>
      hash({ summary: e.summary, metadata: e.metadata ?? null });

    expect(canonical({ summary: 'Created lead' }))
      .toBe(canonical({ summary: 'Created lead', metadata: null }));
  });

  it('still distinguishes genuinely different content', () => {
    expect(hash({ summary: 'Created XCC/26-27/0001' }))
      .not.toBe(hash({ summary: 'Created XCC/26-27/0002' }));
    expect(hash({ metadata: { total: 654900 } }))
      .not.toBe(hash({ metadata: { total: 654901 } }));
  });

  it('handles nested objects inside arrays', () => {
    expect(hash({ rows: [{ a: 1, b: 2 }] })).toBe(hash({ rows: [{ b: 2, a: 1 }] }));
  });

  it('omits undefined properties, because they are never persisted', () => {
    // A manually recorded payment has no gatewayPaymentId. JSON.stringify drops
    // the key entirely, so the database never holds it — hashing it as null
    // would describe a field that does not exist, and break the chain on read.
    const written = { metadata: { method: 'BANK_TRANSFER', gatewayPaymentId: undefined, balance: 0 } };
    const readBack = { metadata: { balance: 0, method: 'BANK_TRANSFER' } };
    expect(hash(written)).toBe(hash(readBack));
  });

  it('does not conflate an undefined property with an explicit null', () => {
    // An explicit null IS stored, so it must still contribute to the hash.
    expect(hash({ metadata: { ref: undefined } })).not.toBe(hash({ metadata: { ref: null } }));
  });
});
