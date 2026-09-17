/**
 * Point this project at a Neon database.
 *
 *   npm run connect:neon
 *
 * Paste the pooled connection string once, at a prompt. The string holds your
 * database password, so it is read with the echo off, never printed back, and
 * never passed as an argument — arguments end up in shell history and in the
 * process list.
 *
 * What it does with it:
 *   - drops `channel_binding=require`, which Prisma enforces and which fails
 *     the connection with an authentication error that names nothing useful
 *   - derives the direct (unpooled) URL that migrations need
 *   - CONNECTS ON BOTH before writing anything, because the direct hostname is
 *     derived by a documented rule that Neon's own docs do not cover for every
 *     hostname shape — so it is checked rather than assumed
 *   - writes DATABASE_URL and DIRECT_URL into .env, keeping a timestamped copy
 *     of the old file
 */

import fs from 'node:fs';
import path from 'node:path';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { PrismaClient } from '@prisma/client';

const ENV_FILE = path.join(process.cwd(), '.env');

/** Reads a line without echoing it. */
async function secret(prompt: string): Promise<string> {
  const rl = createInterface({ input: stdin, output: stdout, terminal: true });
  const asked = rl.question(prompt);
  const iface = rl as unknown as { _writeToOutput: (s: string) => void };
  iface._writeToOutput = (s: string) => {
    if (s.includes(prompt)) stdout.write(prompt);
  };
  const value = await asked;
  rl.close();
  stdout.write('\n');
  return value.trim();
}

/** Everything about a connection string except the part that is a secret. */
function safe(raw: string): string {
  try {
    const url = new URL(raw);
    return `${url.hostname}${url.pathname}${url.search}`;
  } catch {
    return '(unparseable)';
  }
}

function tidy(raw: string): string {
  const url = new URL(raw);
  // Prisma enforces channel binding when asked for it and fails with
  // "server did not use channel binding". sslmode=require already encrypts.
  url.searchParams.delete('channel_binding');
  if (!url.searchParams.has('sslmode')) url.searchParams.set('sslmode', 'require');
  return url.toString();
}

function toDirect(pooled: string): string | null {
  const url = new URL(pooled);
  if (!url.hostname.includes('-pooler')) return null;
  url.hostname = url.hostname.replace('-pooler', '');
  return url.toString();
}

async function connects(url: string): Promise<string | null> {
  const client = new PrismaClient({ log: [], datasources: { db: { url } } });
  try {
    await client.$queryRawUnsafe('SELECT 1');
    return null;
  } catch (err) {
    return err instanceof Error
      ? (err.message
          .split('\n')
          .map((l) => l.trim())
          .filter(Boolean)
          .find((l) => !l.startsWith('Invalid `') && !l.startsWith('Please make sure')) ??
        err.message)
      : String(err);
  } finally {
    await client.$disconnect();
  }
}

/** Replaces a KEY="value" line in place, or appends it if absent. */
function setVar(contents: string, key: string, value: string): string {
  const line = `${key}="${value}"`;
  const pattern = new RegExp(`^${key}=.*$`, 'm');
  return pattern.test(contents) ? contents.replace(pattern, line) : `${contents.trimEnd()}\n${line}\n`;
}

async function main(): Promise<void> {
  if (!stdin.isTTY) {
    console.error('\n✖ Run this in a terminal. It asks for a password.\n');
    process.exitCode = 1;
    return;
  }

  if (!fs.existsSync(ENV_FILE)) {
    console.error('\n✖ No .env file. Copy .env.example to .env first.\n');
    process.exitCode = 1;
    return;
  }

  console.log(
    '\nNeon connection\n\n' +
      '  In the Neon dashboard: Connect → Postgres database → Show password →\n' +
      '  Copy snippet, with Connection pooling ON.\n\n' +
      '  Nothing you paste is printed back or written to your shell history.\n'
  );

  const pasted = await secret('Pooled connection string: ');

  let pooled: string;
  try {
    const url = new URL(pasted);
    if (!url.protocol.startsWith('postgres')) throw new Error('not a postgres url');
    pooled = tidy(pasted);
  } catch {
    console.error('\n✖ That does not look like a Postgres connection string.\n');
    process.exitCode = 1;
    return;
  }

  if (pasted.includes('channel_binding')) {
    console.log('  Dropped channel_binding=require — Prisma enforces it and Neon does not need it.');
  }

  let direct = toDirect(pooled);
  if (!direct) {
    console.log(
      '\n⚠  That string is not the pooled endpoint — its hostname has no `-pooler`.\n' +
        '   The app should use the pooled one. Carrying on with what you gave for both.\n'
    );
    direct = pooled;
  }

  console.log(`\n  App (pooled):        ${safe(pooled)}`);
  console.log(`  Migrations (direct): ${safe(direct)}\n`);

  process.stdout.write('  Testing the pooled connection… ');
  const pooledError = await connects(pooled);
  if (pooledError) {
    console.log('failed');
    console.error(`\n✖ ${pooledError}\n\n  Nothing was written to .env.\n`);
    process.exitCode = 1;
    return;
  }
  console.log('ok');

  process.stdout.write('  Testing the direct connection… ');
  let directError = await connects(direct);
  if (directError) {
    console.log('failed');
    console.log(
      `\n  ${directError}\n\n` +
        '  The direct hostname is derived by removing `-pooler`, which is what Neon\n' +
        '  documents — but your project may name it differently. Go back to the\n' +
        '  dashboard, turn Connection pooling OFF, and copy that string.\n'
    );
    const pastedDirect = await secret('  Direct connection string: ');
    try {
      direct = tidy(pastedDirect);
    } catch {
      console.error('\n✖ That does not look like a Postgres connection string.\n');
      process.exitCode = 1;
      return;
    }
    process.stdout.write('  Testing it… ');
    directError = await connects(direct);
    if (directError) {
      console.log('failed');
      console.error(`\n✖ ${directError}\n\n  Nothing was written to .env.\n`);
      process.exitCode = 1;
      return;
    }
    console.log('ok');
  } else {
    console.log('ok');
  }

  const before = fs.readFileSync(ENV_FILE, 'utf8');
  const backup = `${ENV_FILE}.${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.bak`;
  fs.writeFileSync(backup, before, { mode: 0o600 });

  let after = setVar(before, 'DATABASE_URL', pooled);
  after = setVar(after, 'DIRECT_URL', direct);
  fs.writeFileSync(ENV_FILE, after, { mode: 0o600 });

  console.log(
    `\n✓ .env updated. Previous version kept at ${path.basename(backup)}\n\n` +
      '  Next:\n' +
      '    npm run db:deploy     create the 7 migrations on Neon\n' +
      '    npm run db:check      should say 7/7 applied, 0 users\n' +
      '    npm run bootstrap     create your first account\n\n' +
      '  Then restart the dev server — it reads .env once, at startup.\n'
  );
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
