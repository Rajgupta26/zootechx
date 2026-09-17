import { describe, it, expect } from 'vitest';
import { inspectEnv } from '@/lib/env';

/**
 * The app is deliberately forgiving in development — every provider falls back
 * to a mock and every secret loads lazily, so a fresh checkout runs with no
 * accounts at all. These check that the same forgiveness cannot follow it into
 * production, where a missing key means silent data loss rather than a nudge.
 */
const good = {
  AUTH_SECRET: 'a'.repeat(44),
  VAULT_MASTER_KEY: Buffer.alloc(32, 7).toString('base64'),
  DATABASE_URL: 'postgresql://user:pass@db.internal.example.com:5432/xcc',
  NEXT_PUBLIC_APP_URL: 'https://crm.zootechx.com',
  CRON_SECRET: 'cron-secret',
  STORAGE_PROVIDER: 's3',
  PAYMENTS_PROVIDER: 'razorpay',
  EMAIL_PROVIDER: 'sendgrid',
  WHATSAPP_PROVIDER: 'meta',
};

const errorsFor = (overrides: Record<string, string | undefined>) =>
  inspectEnv({ ...good, ...overrides }).errors;

describe('environment check', () => {
  it('passes a fully configured deployment', () => {
    const { errors, warnings } = inspectEnv(good);
    expect(errors).toEqual([]);
    expect(warnings).toEqual([]);
  });

  it('refuses a session secret short enough to guess', () => {
    expect(errorsFor({ AUTH_SECRET: 'hunter2' })).toHaveLength(1);
    expect(errorsFor({ AUTH_SECRET: undefined })).toHaveLength(1);
  });

  it('refuses a vault key that is not exactly 32 bytes', () => {
    expect(errorsFor({ VAULT_MASTER_KEY: undefined })).toHaveLength(1);
    expect(errorsFor({ VAULT_MASTER_KEY: 'not-base64!!' })).toHaveLength(1);
    expect(errorsFor({ VAULT_MASTER_KEY: Buffer.alloc(16).toString('base64') })).toHaveLength(1);
    expect(errorsFor({ VAULT_MASTER_KEY: Buffer.alloc(32).toString('base64') })).toHaveLength(0);
  });

  it('refuses a deployment still pointed at a development database', () => {
    for (const host of ['localhost', '127.0.0.1', '0.0.0.0']) {
      const errors = errorsFor({ DATABASE_URL: `postgresql://p:p@${host}:5432/postgres` });
      expect(errors, host).toHaveLength(1);
      expect(errors[0]).toContain('not a production database');
    }
  });

  it('refuses to send clients links it cannot make https', () => {
    expect(errorsFor({ NEXT_PUBLIC_APP_URL: 'http://crm.zootechx.com' })).toHaveLength(1);
    expect(errorsFor({ NEXT_PUBLIC_APP_URL: undefined })).toHaveLength(1);
  });

  it('collects every problem at once rather than stopping at the first', () => {
    expect(
      errorsFor({ AUTH_SECRET: '', VAULT_MASTER_KEY: '', NEXT_PUBLIC_APP_URL: '' })
    ).toHaveLength(3);
  });

  it('warns rather than blocks when a provider is still a mock', () => {
    const { errors, warnings } = inspectEnv({ ...good, EMAIL_PROVIDER: 'mock' });
    expect(errors).toEqual([]);
    expect(warnings.join(' ')).toContain('no client receives anything');
  });

  it('warns that scheduled work is silently off without a cron secret', () => {
    const { warnings } = inspectEnv({ ...good, CRON_SECRET: undefined });
    expect(warnings.join(' ')).toContain('will never run');
  });

  it('warns that local storage loses files on a container host', () => {
    const { warnings } = inspectEnv({ ...good, STORAGE_PROVIDER: 'local' });
    expect(warnings.join(' ')).toContain('lost on the next deploy');
  });
});
