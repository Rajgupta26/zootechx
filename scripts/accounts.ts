/**
 * Account maintenance against whatever DATABASE_URL points at.
 *
 * The seeded demo accounts are real rows with the password `password123`, and
 * the first job on any real deployment is to get rid of them. Doing that by
 * hand in a SQL client is how you miss one, so:
 *
 *   npx tsx scripts/accounts.ts audit          — who can still sign in, and with what
 *   npx tsx scripts/accounts.ts set-password   — set a real password, typed not pasted
 *   npx tsx scripts/accounts.ts suspend <email>
 *
 * The password is read from a prompt rather than argv so it never lands in
 * shell history or a process list.
 */

import bcrypt from 'bcryptjs';
import { prisma } from '../src/lib/db';
import { ask, hidden } from './prompt';

const DEMO_PASSWORD = 'password123';
const BCRYPT_COST = 12;

function where(): string {
  try {
    const url = new URL(process.env.DATABASE_URL ?? '');
    return `${url.hostname}${url.port ? `:${url.port}` : ''}${url.pathname}`;
  } catch {
    return '(DATABASE_URL is not set or is unparseable)';
  }
}

async function audit(): Promise<void> {
  const users = await prisma.user.findMany({
    where: { deletedAt: null },
    select: { name: true, email: true, role: true, status: true, passwordHash: true },
    orderBy: [{ role: 'asc' }, { email: 'asc' }],
  });

  const rows = await Promise.all(
    users.map(async (u) => ({
      name: u.name,
      email: u.email,
      role: u.role,
      status: u.status,
      // passwordHash is nullable: an account can exist without credentials,
      // which means it cannot sign in at all rather than that it is safe.
      password: !u.passwordHash
        ? 'none — cannot sign in'
        : (await bcrypt.compare(DEMO_PASSWORD, u.passwordHash))
          ? 'DEMO — CHANGE IT'
          : 'set',
    }))
  );

  console.log(`\nDatabase: ${where()}\n`);
  console.table(rows);

  const weak = rows.filter((r) => r.password.startsWith('DEMO'));
  if (weak.length) {
    console.error(
      `\n✖ ${weak.length} account${weak.length === 1 ? '' : 's'} still use the seeded demo ` +
        `password. Anyone who has seen this project can sign in as ${weak[0].role}.\n` +
        `  Fix each one:  npx tsx scripts/accounts.ts set-password\n` +
        `  Or suspend it: npx tsx scripts/accounts.ts suspend ${weak[0].email}\n`
    );
    process.exitCode = 1;
  } else {
    console.log('✓ No account is using the seeded demo password.\n');
  }
}

async function setPassword(): Promise<void> {
  {
    console.log(`\nDatabase: ${where()}\n`);
    const email = (await ask('Email: ')).toLowerCase();

    const user = await prisma.user.findFirst({
      where: { email, deletedAt: null },
      select: { id: true, name: true, role: true },
    });
    if (!user) {
      console.error(`\n✖ No active account with that email.\n`);
      process.exitCode = 1;
      return;
    }

    const password = await hidden(`New password for ${user.name} (${user.role}, not shown): `);
    if (password.length < 12) {
      console.error('\n✖ Use at least 12 characters. This account can read every client contract.\n');
      process.exitCode = 1;
      return;
    }
    if (password === DEMO_PASSWORD) {
      console.error('\n✖ That is the seeded demo password.\n');
      process.exitCode = 1;
      return;
    }
    if ((await hidden('Type it again: ')) !== password) {
      console.error('\n✖ They do not match. Nothing changed.\n');
      process.exitCode = 1;
      return;
    }

    await prisma.user.update({
      where: { id: user.id },
      // Any session issued against the old password is no longer trustworthy.
      data: { passwordHash: await bcrypt.hash(password, BCRYPT_COST), sudoUntil: null },
    });

    console.log(`\n✓ Password set for ${email}.\n`);
  }
}

async function suspend(email: string): Promise<void> {
  if (!email) {
    console.error('\n✖ Which account? npx tsx scripts/accounts.ts suspend someone@example.com\n');
    process.exitCode = 1;
    return;
  }

  const user = await prisma.user.findFirst({
    where: { email: email.trim().toLowerCase(), deletedAt: null },
    select: { id: true, name: true, role: true },
  });
  if (!user) {
    console.error('\n✖ No active account with that email.\n');
    process.exitCode = 1;
    return;
  }

  // Suspended rather than deleted: the audit log and every record this person
  // created still point at them, and a deleted row would orphan that history.
  await prisma.user.update({ where: { id: user.id }, data: { status: 'SUSPENDED' } });
  console.log(`\n✓ ${user.name} (${user.role}) is suspended and can no longer sign in.\n`);
}

async function main(): Promise<void> {
  const [command, arg] = process.argv.slice(2);

  switch (command) {
    case 'audit': return audit();
    case 'set-password': return setPassword();
    case 'suspend': return suspend(arg);
    default:
      console.log(
        '\nUsage:\n' +
          '  npx tsx scripts/accounts.ts audit\n' +
          '  npx tsx scripts/accounts.ts set-password\n' +
          '  npx tsx scripts/accounts.ts suspend <email>\n'
      );
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
