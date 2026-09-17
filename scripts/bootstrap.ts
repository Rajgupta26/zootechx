/**
 * Create the first account on an empty database.
 *
 * A clean install has no users, which means nobody can sign in, which means
 * there is no way in through the app itself. This is the way in — and it
 * refuses once even one account exists, so it cannot be used later to quietly
 * add an administrator to a running system.
 *
 *   npx tsx scripts/bootstrap.ts
 *
 * The password is typed at a prompt, not passed as an argument: arguments end
 * up in shell history and in the process list.
 */

import { stdin } from 'node:process';
import bcrypt from 'bcryptjs';
import { prisma } from '../src/lib/db';
import { audit } from '../src/lib/audit';
import { ask, hidden } from './prompt';

const BCRYPT_COST = 12;
export const MIN_PASSWORD_LENGTH = 12;
const DEMO_PASSWORD = 'password123';

export interface FirstAdmin {
  name: string;
  email: string;
  password: string;
}

/**
 * Everything that can be judged without touching the database, so the rules
 * are testable and the prompt loop stays about prompting.
 */
export function validateFirstAdmin(input: FirstAdmin): string[] {
  const problems: string[] = [];

  if (input.name.trim().length < 2) {
    problems.push('Give a real name — it is printed on proposals and audit entries.');
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(input.email.trim())) {
    problems.push('That is not a valid email address. It is the sign-in identifier.');
  }
  if (input.password.length < MIN_PASSWORD_LENGTH) {
    problems.push(
      `Use at least ${MIN_PASSWORD_LENGTH} characters. This account can read every ` +
        'client contract and reveal every stored credential.'
    );
  }
  if (input.password === DEMO_PASSWORD) {
    problems.push('That is the seeded demo password. Choose something else.');
  }

  return problems;
}

export type BootstrapResult =
  | { ok: true; user: { id: string; name: string; email: string } }
  | { ok: false; problems: string[] };

export async function createFirstAdmin(input: FirstAdmin): Promise<BootstrapResult> {
  const existing = await prisma.user.count();
  if (existing > 0) {
    return {
      ok: false,
      problems: [
        `This database already has ${existing} account${existing === 1 ? '' : 's'}. ` +
          'Bootstrap only runs on an empty database — add people through Admin → Team, ' +
          'where it is authorised and written to the audit log.',
      ],
    };
  }

  const problems = validateFirstAdmin(input);
  if (problems.length) return { ok: false, problems };

  const user = await prisma.user.create({
    data: {
      name: input.name.trim(),
      email: input.email.trim().toLowerCase(),
      passwordHash: await bcrypt.hash(input.password, BCRYPT_COST),
      role: 'SUPER_ADMIN',
      status: 'ACTIVE',
    },
    select: { id: true, name: true, email: true, role: true },
  });

  await audit({
    actorId: user.id,
    actorEmail: user.email,
    actorRole: user.role,
    action: 'user.bootstrap',
    entity: 'user',
    entityId: user.id,
    summary: `First administrator created on an empty database: ${user.email}`,
  });

  return { ok: true, user };
}

// ---------------------------------------------------------------- prompting

function target(): string {
  try {
    const url = new URL(process.env.DATABASE_URL ?? '');
    return `${url.hostname}${url.port ? `:${url.port}` : ''}${url.pathname}`;
  } catch {
    return '(DATABASE_URL is not set or is unparseable)';
  }
}

async function main(): Promise<void> {
  // Without a terminal the prompts resolve to nothing and the script would
  // exit 0 having created no account — success by every outward sign.
  if (!stdin.isTTY) {
    console.error(
      '\n✖ Run this in a terminal. It asks for a password, which it will not ' +
        'read from a pipe or a CI job.\n'
    );
    process.exitCode = 1;
    return;
  }

  console.log(`\nCreating the first administrator.\nDatabase: ${target()}\n`);

  const name = await ask('Full name: ');
  const email = await ask('Email: ');

  const password = await hidden(`Password (${MIN_PASSWORD_LENGTH}+ characters, not shown): `);
  if ((await hidden('Type it again: ')) !== password) {
    console.error('\n✖ They do not match. Nothing was created.\n');
    process.exitCode = 1;
    return;
  }

  const result = await createFirstAdmin({ name, email, password });

  if (!result.ok) {
    console.error(`\n✖ ${result.problems.join('\n✖ ')}\n`);
    process.exitCode = 1;
    return;
  }

  console.log(
    `\n✓ ${result.user.name} — ${result.user.email} — Super admin\n\n` +
      '  Sign in, then:\n' +
      '    1. Settings → Company — legal name, GSTIN, address and bank details.\n' +
      '       Invoices are unusable until this is real; a placeholder is created\n' +
      '       on first read and it says XCC Technologies Private Limited.\n' +
      '    2. Admin → Team — add the rest of the people, each with their own\n' +
      '       account and role. Shared logins have no audit trail.\n'
  );
}

// Only prompt when run directly, so the exported functions can be tested.
if (process.argv[1]?.endsWith('bootstrap.ts')) {
  main()
    .catch((err) => {
      console.error(err);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
