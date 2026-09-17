/**
 * Startup environment check.
 *
 * Every integration falls back to a mock and every secret has a lazy loader,
 * which is right for development — the app runs on a fresh checkout with no
 * accounts. In production the same forgiveness is a hazard: a deployment with
 * no VAULT_MASTER_KEY boots happily and only fails when someone opens the
 * vault, and a deployment still pointed at a laptop's database boots too.
 *
 * So production is checked once at startup and refuses to come up with a list
 * of everything that is wrong, rather than one failure at a time in the middle
 * of somebody's work. Development only ever prints notes.
 */

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '0.0.0.0']);

function hostOf(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

function decodesTo32Bytes(value: string | undefined): boolean {
  if (!value) return false;
  try {
    return Buffer.from(value, 'base64').length === 32;
  } catch {
    return false;
  }
}

export interface EnvReport {
  errors: string[];
  warnings: string[];
}

export function inspectEnv(env: Record<string, string | undefined> = process.env): EnvReport {
  const errors: string[] = [];
  const warnings: string[] = [];

  // --- Secrets that make the app unsafe or unusable when missing ---

  if (!env.AUTH_SECRET || env.AUTH_SECRET.trim().length < 32) {
    errors.push(
      'AUTH_SECRET is missing or shorter than 32 characters. It signs session ' +
        'tokens and the signed file links clients open without an account. ' +
        'Generate one with: openssl rand -base64 32'
    );
  }

  if (!decodesTo32Bytes(env.VAULT_MASTER_KEY)) {
    errors.push(
      'VAULT_MASTER_KEY is missing or does not decode to 32 bytes. The ' +
        'credentials vault cannot read or write without it. Generate one with: ' +
        'openssl rand -base64 32 — and keep it in a secrets manager, because ' +
        'losing it makes every stored secret permanently unreadable.'
    );
  }

  // --- Where the data lives ---

  const dbHost = hostOf(env.DATABASE_URL);
  if (!env.DATABASE_URL) {
    errors.push('DATABASE_URL is not set.');
  } else if (dbHost && LOCAL_HOSTS.has(dbHost)) {
    errors.push(
      `DATABASE_URL points at ${dbHost}. The bundled development database ` +
        '(npm run db:local) is not a production database — it has no backups, ' +
        'no durability guarantees and disappears with the machine.'
    );
  }

  // --- The pooled/direct split, which fails late and confusingly ---

  const directHost = hostOf(env.DIRECT_URL);
  if (dbHost && !LOCAL_HOSTS.has(dbHost)) {
    if (!env.DATABASE_URL?.includes('sslmode=require')) {
      warnings.push(
        `DATABASE_URL has no sslmode=require. Traffic to ${dbHost} should be encrypted — ` +
          'Neon and most managed providers put it on the string for you.'
      );
    }
    if (dbHost.includes('-pooler') && directHost?.includes('-pooler')) {
      warnings.push(
        'DATABASE_URL and DIRECT_URL both point at the pooled endpoint. Migrations ' +
          'need the direct one: the same host with `-pooler` removed. Left as is, ' +
          '`prisma migrate deploy` fails with prepared-statement errors that read ' +
          'like a broken migration.'
      );
    }
  }

  // --- How the app addresses itself ---

  const appUrl = env.NEXT_PUBLIC_APP_URL;
  if (!appUrl) {
    errors.push(
      'NEXT_PUBLIC_APP_URL is not set. Invoice links, signing links and PDF ' +
        'footers are built from it, so they would go out pointing nowhere.'
    );
  } else if (!appUrl.startsWith('https://')) {
    errors.push(
      `NEXT_PUBLIC_APP_URL is "${appUrl}". Client signing links and invoice ` +
        'payment pages must be https in production.'
    );
  }

  // --- Things that work, but not the way anyone expects ---

  if (!env.CRON_SECRET) {
    warnings.push(
      'CRON_SECRET is not set, so /api/cron/* answers 401 to everything. ' +
        'Overdue flags, dunning reminders, follow-up nudges and recurring ' +
        'retainer invoices will never run.'
    );
  }

  if ((env.STORAGE_PROVIDER ?? 'local').toLowerCase() === 'local') {
    warnings.push(
      'STORAGE_PROVIDER is local. Invoice and contract PDFs are written to the ' +
        'filesystem — fine on a server with a persistent disk, but on a ' +
        'container host every file is lost on the next deploy. Set s3 or r2.'
    );
  }

  const mocked: Array<[string, string]> = [
    [
      'PAYMENTS_PROVIDER',
      'PAYMENTS_PROVIDER is mock. Payment links are generated but no money can ' +
        'be collected, and every invoice can be marked paid from a fake page.',
    ],
    [
      'EMAIL_PROVIDER',
      'EMAIL_PROVIDER is mock. Invoices, proposals and reminders are written to ' +
        'the server log and recorded as sent — no client receives anything.',
    ],
    [
      'WHATSAPP_PROVIDER',
      'WHATSAPP_PROVIDER is mock. Same as email: recorded as sent, delivered ' +
        'nowhere. Note the real provider also needs Meta-approved templates, ' +
        'which take days to be reviewed.',
    ],
  ];

  for (const [variable, message] of mocked) {
    if ((env[variable] ?? 'mock').toLowerCase() === 'mock') warnings.push(message);
  }

  return { errors, warnings };
}

/**
 * Called once from instrumentation.ts when the server starts.
 * Throws in production; in development it prints and carries on.
 */
export function assertEnv(): void {
  const { errors, warnings } = inspectEnv();
  const production = process.env.NODE_ENV === 'production';

  if (warnings.length) {
    const label = production ? '⚠  Production warnings' : 'ℹ  Development notes';
    console.warn(`\n${label}:\n${warnings.map((w) => `   • ${w}`).join('\n')}\n`);
  }

  if (!errors.length) return;

  if (!production) {
    console.warn(
      `ℹ  Not production-ready yet (fine for development):\n${errors
        .map((e) => `   • ${e}`)
        .join('\n')}\n`
    );
    return;
  }

  throw new Error(
    `Refusing to start. ${errors.length} environment problem` +
      `${errors.length === 1 ? '' : 's'}:\n\n` +
      errors.map((e, i) => `  ${i + 1}. ${e}`).join('\n\n') +
      '\n'
  );
}
