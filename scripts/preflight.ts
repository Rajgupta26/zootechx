/**
 * Is this deployment fit to hold real client data?
 *
 *   npm run preflight
 *
 * Reads only. Exits non-zero when something would actually hurt, so it can sit
 * in a deploy pipeline. The environment half is the same check the app runs at
 * startup; the rest needs the database, which the app cannot reach at boot:
 * whether the schema is current, whether anyone can still sign in with the
 * seeded demo password, and whether invoices would go out under a placeholder
 * company.
 */

import fs from 'node:fs';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
import { inspectEnv } from '../src/lib/env';

const prisma = new PrismaClient({ log: [] });

const DEMO_PASSWORD = 'password123';
const PLACEHOLDER_COMPANY = 'XCC Technologies Private Limited';

interface Finding {
  level: 'blocker' | 'warning';
  text: string;
}

const findings: Finding[] = [];
const blocker = (text: string) => findings.push({ level: 'blocker', text });
const warn = (text: string) => findings.push({ level: 'warning', text });

async function checkDatabase(): Promise<void> {
  try {
    await prisma.$queryRawUnsafe('SELECT 1');
  } catch {
    blocker('Cannot reach the database. Run `npm run db:check` for the reason.');
    return;
  }

  // --- Schema ---
  const dir = path.join(process.cwd(), 'prisma', 'migrations');
  const onDisk = fs.existsSync(dir)
    ? fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory()).length
    : 0;

  const [{ present }] = await prisma.$queryRawUnsafe<Array<{ present: boolean }>>(
    `SELECT to_regclass('public._prisma_migrations') IS NOT NULL AS present`
  );

  if (!present) {
    blocker(`No schema on this database. Run \`npm run db:deploy\` (${onDisk} migrations waiting).`);
    return;
  }

  const rows = await prisma.$queryRawUnsafe<Array<{ finished_at: Date | null }>>(
    'SELECT finished_at FROM "_prisma_migrations"'
  );
  const applied = rows.filter((r) => r.finished_at).length;
  if (applied < onDisk) {
    blocker(`${onDisk - applied} migration(s) not applied here. Run \`npm run db:deploy\`.`);
  }
  if (rows.length > applied) {
    blocker(`${rows.length - applied} migration(s) recorded as failed. Resolve before deploying.`);
  }

  // --- Who can sign in ---
  const users = await prisma.user.findMany({
    where: { deletedAt: null, status: 'ACTIVE' },
    select: { email: true, role: true, passwordHash: true },
  });

  if (users.length === 0) {
    blocker('No active accounts — nobody can sign in. Run `npm run bootstrap`.');
  }

  const demo: string[] = [];
  const passwordless: string[] = [];
  for (const u of users) {
    if (!u.passwordHash) passwordless.push(u.email);
    else if (await bcrypt.compare(DEMO_PASSWORD, u.passwordHash)) demo.push(u.email);
  }

  if (demo.length) {
    blocker(
      `${demo.length} account(s) still use the seeded demo password — ${demo.slice(0, 3).join(', ')}` +
        `${demo.length > 3 ? ` and ${demo.length - 3} more` : ''}. ` +
        'Anyone who has seen this project can sign in as them.'
    );
  }
  if (passwordless.length) {
    warn(`${passwordless.length} active account(s) have no password and cannot sign in.`);
  }

  const admins = users.filter((u) => u.role === 'SUPER_ADMIN').length;
  if (admins === 1) {
    warn('Only one active Super admin. If that account is lost, nobody can reach the vault or settings.');
  }

  // --- What goes out on paper ---
  const company = await prisma.companyProfile.findUnique({ where: { id: 'default' } });
  if (!company) {
    warn('No company profile yet — one is created on first use, with placeholder details.');
  } else {
    if (company.legalName === PLACEHOLDER_COMPANY) {
      blocker('The company profile is still the placeholder. Every invoice would carry the wrong legal entity.');
    }
    if (!company.gstin) {
      blocker('No GSTIN on the company profile. A tax invoice without one is not a tax invoice.');
    }
    if (!company.bankAccountNumber) {
      warn('No bank details on the company profile — invoices go out with nowhere to pay.');
    }
  }

  const clientsWithoutState = await prisma.client.count({
    where: { deletedAt: null, country: 'India', OR: [{ stateCode: null }, { stateCode: '' }] },
  });
  if (clientsWithoutState > 0) {
    warn(
      `${clientsWithoutState} Indian client(s) have no place of supply. Their invoices default to ` +
        'intra-state, which is wrong for anyone outside your own state.'
    );
  }
}

async function main(): Promise<void> {
  const env = inspectEnv();
  env.errors.forEach(blocker);
  env.warnings.forEach(warn);

  await checkDatabase();

  const blockers = findings.filter((f) => f.level === 'blocker');
  const warnings = findings.filter((f) => f.level === 'warning');

  console.log('');
  if (blockers.length) {
    console.log(`✖ ${blockers.length} blocker${blockers.length === 1 ? '' : 's'}\n`);
    blockers.forEach((f, i) => console.log(`  ${i + 1}. ${f.text}\n`));
  }
  if (warnings.length) {
    console.log(`⚠ ${warnings.length} warning${warnings.length === 1 ? '' : 's'}\n`);
    warnings.forEach((f, i) => console.log(`  ${i + 1}. ${f.text}\n`));
  }
  if (!blockers.length && !warnings.length) {
    console.log('✓ Nothing to report. This deployment is fit to hold real client data.\n');
  } else if (!blockers.length) {
    console.log('✓ No blockers. The warnings above are choices, not mistakes.\n');
  }

  process.exitCode = blockers.length ? 1 : 0;
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
