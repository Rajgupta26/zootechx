/**
 * Say what database this project is actually talking to, before you do
 * anything to it.
 *
 *   npm run db:check
 *
 * Reads only — it connects, reports, and changes nothing. Passwords are never
 * printed, so the output is safe to paste into a chat when something is wrong.
 */

import fs from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';

/**
 * Its own client, with logging off. The shared singleton prints a red block
 * for every failed query, and "cannot reach the database" is the answer this
 * script exists to give — not a stack trace above it.
 */
const prisma = new PrismaClient({ log: [] });

interface Target {
  label: string;
  host: string;
  database: string;
  ssl: string | null;
  pooled: boolean;
  local: boolean;
}

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '0.0.0.0']);

function describe(label: string, raw: string | undefined): Target | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return {
      label,
      host: url.hostname + (url.port ? `:${url.port}` : ''),
      database: url.pathname.replace(/^\//, '') || '(none)',
      ssl: url.searchParams.get('sslmode'),
      pooled: url.hostname.includes('-pooler'),
      local: LOCAL_HOSTS.has(url.hostname),
    };
  } catch {
    return { label, host: '(unparseable)', database: '?', ssl: null, pooled: false, local: false };
  }
}

async function main(): Promise<void> {
  const app = describe('DATABASE_URL (app)', process.env.DATABASE_URL);
  const direct = describe('DIRECT_URL (migrations)', process.env.DIRECT_URL);

  console.log('');
  for (const t of [app, direct]) {
    if (!t) continue;
    console.log(
      `${t.label.padEnd(26)} ${t.host}/${t.database}` +
        `${t.ssl ? `  ssl=${t.ssl}` : ''}${t.pooled ? '  [pooled]' : ''}`
    );
  }
  console.log('');

  const notes: string[] = [];

  if (!app) {
    console.error('✖ DATABASE_URL is not set.\n');
    process.exitCode = 1;
    return;
  }

  // The pooled/direct split is the one Neon setting people get wrong, and it
  // fails at migration time with an error that reads like a broken migration.
  if (app.pooled && direct?.pooled) {
    notes.push(
      'Both URLs point at the pooled endpoint. Migrations need the direct one — ' +
        'take the same host out of DIRECT_URL without `-pooler`.'
    );
  }
  if (!app.local && !app.pooled && direct && direct.host === app.host) {
    notes.push(
      'DATABASE_URL is not the pooled endpoint. That works, but a serverless ' +
        'deployment will exhaust the connection limit — use the `-pooler` host for the app.'
    );
  }
  if (!app.local && app.ssl !== 'require') {
    notes.push(`DATABASE_URL has no sslmode=require. Traffic to ${app.host} should be encrypted.`);
  }

  const say = (lines: string[]) => {
    if (lines.length) console.log(lines.map((n) => `⚠  ${n}`).join('\n') + '\n');
  };

  let version = '';
  const startedAt = Date.now();
  try {
    const rows = await prisma.$queryRawUnsafe<Array<{ version: string }>>('SELECT version()');
    version = rows[0]?.version ?? '';
  } catch (err) {
    // Prisma's message is a paragraph: the invocation it failed on, a blank
    // line, the actual reason, then a suggestion. The reason is the only part
    // worth showing, so drop the frame around it.
    const detail =
      err instanceof Error
        ? (err.message
            .split('\n')
            .map((l) => l.trim())
            .filter(Boolean)
            .find((l) => !l.startsWith('Invalid `') && !l.startsWith('Please make sure')) ??
          err.message)
        : String(err);
    console.error(`✖ Could not connect.\n  ${detail}\n`);
    // These are derived from the URLs, not the connection, and one of them is
    // usually why it failed.
    say(notes);
    process.exitCode = 1;
    return;
  }

  const latency = Date.now() - startedAt;
  console.log(`✓ Connected in ${latency}ms`);
  console.log(`  ${version.split(' ').slice(0, 2).join(' ')}${version.includes('Neon') ? '  (Neon)' : ''}`);

  // Migrations: what is on disk versus what this database says it has run.
  const dir = path.join(process.cwd(), 'prisma', 'migrations');
  const onDisk = fs.existsSync(dir)
    ? fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory()).length
    : 0;

  // Ask whether the table exists rather than querying it and catching: a
  // failed query is logged by the client before we get to handle it, and a
  // red stack trace under "here is your database" is not a report.
  const [{ present }] = await prisma.$queryRawUnsafe<Array<{ present: boolean }>>(
    `SELECT to_regclass('public._prisma_migrations') IS NOT NULL AS present`
  );

  if (!present) {
    console.log('  Migrations: none — this database has no schema yet.');
    console.log(`              ${onDisk} on disk. Create it with: npm run db:deploy\n`);
    if (notes.length) console.log(notes.map((n) => `⚠  ${n}`).join('\n') + '\n');
    return;
  }

  const rows = await prisma.$queryRawUnsafe<Array<{ finished_at: Date | null }>>(
    'SELECT finished_at FROM "_prisma_migrations"'
  );
  const applied = rows.filter((r) => r.finished_at).length;
  const failed = rows.length - applied;

  console.log(`  Migrations: ${applied}/${onDisk} applied${failed ? `, ${failed} FAILED` : ''}`);
  if (applied < onDisk) {
    notes.push(`${onDisk - applied} migration(s) not applied here. Run: npm run db:deploy`);
  }

  const [users, clients, invoices] = await Promise.all([
    prisma.user.count(),
    prisma.client.count(),
    prisma.invoice.count(),
  ]);
  console.log(`  Rows: ${users} users, ${clients} clients, ${invoices} invoices`);
  if (users === 0) {
    console.log('\n  No accounts yet — nobody can sign in. Create the first one: npm run bootstrap');
  }

  console.log('');
  say(notes);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
