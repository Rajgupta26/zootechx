/**
 * Logical backup and restore, as JSON.
 *
 * This exists because a database with no backup is one mistaken command away
 * from gone — which is how this project lost its first one. It is a safety
 * net, not a backup strategy: in production the point-in-time backups your
 * database provider offers are the real answer, and this is what you run
 * before a migration or an experiment.
 *
 *   npx tsx scripts/backup.ts export [file]   — write every row to JSON
 *   npx tsx scripts/backup.ts import <file>   — load it into an EMPTY database
 *
 * Import refuses a database that already holds rows. Merging two datasets by
 * primary key is a different job with different failure modes, and guessing at
 * it would be worse than refusing.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { Prisma } from '@prisma/client';
import { prisma } from '../src/lib/db';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Db = typeof prisma | Prisma.TransactionClient;
const delegate = (db: Db, name: string) => (db as any)[name];

/**
 * AuditLog.seq is a BigInt, which JSON cannot hold. It is not decoration —
 * the audit chain is verified in seq order — so it round-trips exactly rather
 * than being coerced to a number and quietly losing precision.
 */
const BIGINT_TAG = '__bigint__';

function replacer(_key: string, value: unknown): unknown {
  return typeof value === 'bigint' ? { [BIGINT_TAG]: value.toString() } : value;
}

function reviver(_key: string, value: unknown): unknown {
  if (value && typeof value === 'object' && BIGINT_TAG in (value as object)) {
    return BigInt((value as Record<string, string>)[BIGINT_TAG]);
  }
  return value;
}

interface Plan {
  /** Parents before children, so every foreign key has something to point at. */
  order: string[];
  /** Columns held back on insert and written in a second pass. */
  deferred: Map<string, string[]>;
}

/**
 * Work out an insert order from the schema itself rather than a hand-kept list
 * that drifts the first time a model is added.
 *
 * Three foreign keys are circular — a user belongs to a client while a client
 * has an account manager, and a credit note points at the invoice it credits.
 * No ordering satisfies those, so the cycle is broken by holding the column
 * back on insert and setting it once both rows exist. All three are nullable,
 * which is what makes that safe.
 */
function planFromSchema(): Plan {
  const models = Prisma.dmmf.datamodel.models;
  const name = (model: string) => model[0].toLowerCase() + model.slice(1);

  const deps = new Map<string, Set<string>>();
  const deferred = new Map<string, string[]>();
  const optionalEdge = new Map<string, string[]>();

  for (const m of models) deps.set(m.name, new Set());

  for (const m of models) {
    for (const f of m.fields) {
      if (f.kind !== 'object' || !f.relationFromFields?.length) continue;
      if (f.type === m.name) {
        // Self-reference: the parent row may come later in the same batch.
        deferred.set(m.name, [...(deferred.get(m.name) ?? []), ...f.relationFromFields]);
        continue;
      }
      deps.get(m.name)!.add(f.type);
      const nullable = m.fields
        .filter((x) => f.relationFromFields!.includes(x.name))
        .every((x) => !x.isRequired);
      if (nullable) optionalEdge.set(`${m.name}->${f.type}`, [...f.relationFromFields]);
    }
  }

  const order: string[] = [];
  const placed = new Set<string>();

  while (placed.size < models.length) {
    const ready = models
      .filter((m) => !placed.has(m.name))
      .filter((m) => [...deps.get(m.name)!].every((d) => placed.has(d)));

    if (ready.length) {
      for (const m of ready) {
        order.push(name(m.name));
        placed.add(m.name);
      }
      continue;
    }

    // Deadlock: everything left is in a cycle. Break it on a nullable edge.
    const stuck = models.filter((m) => !placed.has(m.name));
    const broken = stuck.find((m) =>
      [...deps.get(m.name)!].some((d) => !placed.has(d) && optionalEdge.has(`${m.name}->${d}`))
    );

    if (!broken) {
      throw new Error(
        `Cannot order ${stuck.map((m) => m.name).join(', ')} — a required foreign key is circular.`
      );
    }

    for (const d of [...deps.get(broken.name)!]) {
      const columns = optionalEdge.get(`${broken.name}->${d}`);
      if (!placed.has(d) && columns) {
        deferred.set(broken.name, [...(deferred.get(broken.name) ?? []), ...columns]);
        deps.get(broken.name)!.delete(d);
      }
    }
  }

  return {
    order,
    deferred: new Map([...deferred].map(([model, cols]) => [name(model), [...new Set(cols)]])),
  };
}

function defaultFile(): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  return path.join('backups', `xcc-${stamp}.json`);
}

async function exportAll(file: string): Promise<void> {
  const { order } = planFromSchema();
  const data: Record<string, unknown[]> = {};
  let total = 0;

  for (const model of order) {
    const rows = await delegate(prisma, model).findMany();
    data[model] = rows;
    total += rows.length;
  }

  await fs.mkdir(path.dirname(file), { recursive: true });
  // Decimal and Date both serialise to strings Prisma accepts back on import.
  await fs.writeFile(file, JSON.stringify({ takenAt: new Date().toISOString(), data }, replacer, 2));

  const bytes = (await fs.stat(file)).size;
  console.log(`\n✓ ${total} rows across ${order.length} tables → ${file} (${Math.round(bytes / 1024)} KB)`);
  console.log('  Files in storage/ are not included — they are already on disk.\n');
}

async function importAll(file: string): Promise<void> {
  if (!file) {
    console.error('\n✖ Which file? npx tsx scripts/backup.ts import backups/xcc-….json\n');
    process.exitCode = 1;
    return;
  }

  const { order, deferred } = planFromSchema();

  const occupied: string[] = [];
  for (const model of order) {
    if ((await delegate(prisma, model).count()) > 0) occupied.push(model);
  }
  if (occupied.length) {
    console.error(
      `\n✖ The database is not empty — ${occupied.slice(0, 5).join(', ')}` +
        `${occupied.length > 5 ? ` and ${occupied.length - 5} more` : ''} already hold rows.\n\n` +
        '  Restore into an empty database.\n'
    );
    process.exitCode = 1;
    return;
  }

  const parsed = JSON.parse(await fs.readFile(file, 'utf8'), reviver) as {
    takenAt?: string;
    data: Record<string, unknown[]>;
  };

  let total = 0;

  // One transaction for the whole restore. A half-finished one is worse than a
  // failed one: it leaves a database that looks populated and refuses the next
  // import because it is "not empty".
  await prisma.$transaction(
    async (tx) => {
      const secondPass: Array<{ model: string; id: unknown; values: Record<string, unknown> }> = [];

      for (const model of order) {
        const rows = (parsed.data[model] ?? []) as Array<Record<string, unknown>>;
        if (!rows.length) continue;

        const hold = deferred.get(model) ?? [];
        const toInsert = rows.map((row) => {
          if (!hold.length) return row;
          const copy = { ...row };
          const values: Record<string, unknown> = {};
          for (const column of hold) {
            if (copy[column] != null) values[column] = copy[column];
            copy[column] = null;
          }
          if (Object.keys(values).length) secondPass.push({ model, id: row.id, values });
          return copy;
        });

        await delegate(tx, model).createMany({ data: toInsert });
        total += rows.length;
        console.log(`   ${model}: ${rows.length}`);
      }

      for (const { model, id, values } of secondPass) {
        await delegate(tx, model).update({ where: { id }, data: values });
      }
      if (secondPass.length) {
        console.log(`   (${secondPass.length} circular reference${secondPass.length === 1 ? '' : 's'} reconnected)`);
      }

      // Rows carry their original seq values, which leaves Postgres's own
      // counter where it started: the next audit entry would collide on the
      // unique constraint. Move the counter past what was restored.
      if ((parsed.data.auditLog ?? []).length) {
        await tx.$executeRaw(
          Prisma.sql`SELECT setval(
            pg_get_serial_sequence('"AuditLog"', 'seq'),
            COALESCE((SELECT MAX(seq) FROM "AuditLog"), 1)
          )`
        );
      }
    },
    { timeout: 5 * 60_000, maxWait: 30_000 }
  );

  console.log(`\n✓ Restored ${total} rows from ${file}${parsed.takenAt ? ` (taken ${parsed.takenAt})` : ''}\n`);
}

async function main(): Promise<void> {
  const [command, arg] = process.argv.slice(2);

  switch (command) {
    case 'export': return exportAll(arg || defaultFile());
    case 'import': return importAll(arg);
    default:
      console.log(
        '\nUsage:\n' +
          '  npx tsx scripts/backup.ts export [file]   (default: backups/xcc-<timestamp>.json)\n' +
          '  npx tsx scripts/backup.ts import <file>\n'
      );
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
