import { describe, it, expect, beforeAll } from 'vitest';
import { randomBytes } from 'node:crypto';
import {
  encryptSecret, decryptSecret, maskSecret,
  hmacSha256, timingSafeEqual, sha256, generateToken,
} from '@/lib/crypto';

beforeAll(() => {
  process.env.VAULT_MASTER_KEY = randomBytes(32).toString('base64');
  process.env.VAULT_PREVIOUS_KEYS = '';
});

describe('vault encryption', () => {
  it('round-trips a secret', () => {
    const secret = 'EXAMPLE-ONLY-abcdef1234567890';
    const encrypted = encryptSecret(secret);
    expect(encrypted.ciphertext).not.toContain('EXAMPLE-ONLY');
    expect(decryptSecret(encrypted)).toBe(secret);
  });

  it('produces a different ciphertext each time (unique IV)', () => {
    const a = encryptSecret('same-secret');
    const b = encryptSecret('same-secret');
    expect(a.ciphertext).not.toBe(b.ciphertext);
    expect(a.iv).not.toBe(b.iv);
    expect(decryptSecret(a)).toBe(decryptSecret(b));
  });

  it('refuses to decrypt tampered ciphertext', () => {
    const encrypted = encryptSecret('sensitive');
    const buf = Buffer.from(encrypted.ciphertext, 'base64');
    buf[0] ^= 0xff;
    expect(() =>
      decryptSecret({ ...encrypted, ciphertext: buf.toString('base64') })
    ).toThrow(/Unable to decrypt/);
  });

  it('refuses to decrypt with a tampered auth tag', () => {
    const encrypted = encryptSecret('sensitive');
    const tag = Buffer.from(encrypted.authTag, 'base64');
    tag[0] ^= 0xff;
    expect(() =>
      decryptSecret({ ...encrypted, authTag: tag.toString('base64') })
    ).toThrow();
  });

  it('handles unicode and long secrets', () => {
    const secret = '🔐 ' + 'x'.repeat(5000) + ' — ключ';
    expect(decryptSecret(encryptSecret(secret))).toBe(secret);
  });

  it('rejects a master key of the wrong length', () => {
    const original = process.env.VAULT_MASTER_KEY;
    process.env.VAULT_MASTER_KEY = Buffer.from('too-short').toString('base64');
    expect(() => encryptSecret('x')).toThrow(/32 bytes/);
    process.env.VAULT_MASTER_KEY = original;
  });
});

describe('key rotation', () => {
  it('still decrypts data written under a retired key', () => {
    const oldKey = process.env.VAULT_MASTER_KEY!;
    const encryptedWithOld = encryptSecret('written-before-rotation');

    // Rotate: a new key becomes current, the old one moves to previous.
    process.env.VAULT_MASTER_KEY = randomBytes(32).toString('base64');
    process.env.VAULT_PREVIOUS_KEYS = oldKey;

    expect(decryptSecret(encryptedWithOld)).toBe('written-before-rotation');
    // And new writes work under the new key.
    expect(decryptSecret(encryptSecret('written-after'))).toBe('written-after');
  });
});

describe('masking and helpers', () => {
  it('masks a secret without revealing the middle', () => {
    const masked = maskSecret('EXAMPLE-ONLY-abcdefghijklmnop');
    expect(masked.startsWith('EXA')).toBe(true);
    expect(masked.endsWith('nop')).toBe(true);
    expect(masked).not.toContain('abcdefghijkl');
  });

  it('fully masks short secrets', () => {
    expect(maskSecret('abc')).toBe('••••');
  });

  it('produces url-safe tokens of the expected entropy', () => {
    const token = generateToken(24);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(token.length).toBeGreaterThanOrEqual(32);
    expect(generateToken(24)).not.toBe(token);
  });

  it('compares signatures in constant time', () => {
    const sig = hmacSha256('payload', 'secret');
    expect(timingSafeEqual(sig, hmacSha256('payload', 'secret'))).toBe(true);
    expect(timingSafeEqual(sig, hmacSha256('payload', 'wrong'))).toBe(false);
    expect(timingSafeEqual(sig, 'short')).toBe(false);
  });

  it('hashes deterministically', () => {
    expect(sha256('abc')).toBe(sha256('abc'));
    expect(sha256('abc')).not.toBe(sha256('abd'));
  });
});
