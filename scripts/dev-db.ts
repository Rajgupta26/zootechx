/**
 * Local PostgreSQL for development.
 *
 * Runs a real PostgreSQL server from prebuilt binaries — no Homebrew, Docker or
 * admin rights required. It behaves like any other Postgres: multiple
 * concurrent connections, so the dev server, `db:seed` and `db:studio` can all
 * run at the same time.
 *
 * Data lives in ./.pgdata and survives restarts. This is a development
 * convenience; point DATABASE_URL at a managed Postgres before deploying.
 *
 *   npm run db:local
 */

import EmbeddedPostgres from 'embedded-postgres';
import fs from 'node:fs';
import path from 'node:path';

const PORT = Number(process.env.PGDEV_PORT ?? 5432);
const DATA_DIR = path.join(process.cwd(), '.pgdata');
const URL = `postgresql://postgres:postgres@127.0.0.1:${PORT}/postgres`;

async function main() {
  const firstRun = !fs.existsSync(DATA_DIR);

  const pg = new EmbeddedPostgres({
    databaseDir: DATA_DIR,
    user: 'postgres',
    password: 'postgres',
    port: PORT,
    persistent: true,
    // Postgres is chatty on stdout; only surface real problems.
    onLog: (msg: string) => {
      if (/FATAL|PANIC|could not|failed/i.test(msg)) process.stderr.write(msg);
    },
  });

  if (firstRun) {
    console.log('First run — initialising the cluster (one time, ~10s)…');
    await pg.initialise();
  }

  await pg.start();

  console.log(`
  PostgreSQL is listening on 127.0.0.1:${PORT}
  Data directory: ${DATA_DIR}

  DATABASE_URL="${URL}"

  Leave this running. In another terminal:
    npm run db:migrate
    npm run db:seed
    npm run dev

  Press Ctrl+C to stop.
`);

  let stopping = false;
  const shutdown = async (signal: string) => {
    if (stopping) return;
    stopping = true;
    console.log(`\nReceived ${signal} — stopping PostgreSQL…`);
    try {
      await pg.stop();
      console.log('Stopped cleanly.');
    } catch (err) {
      console.error('Shutdown error:', (err as Error).message);
    }
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  // Without this the process exits as soon as start() resolves.
  await new Promise(() => {});
}

main().catch((err) => {
  console.error('\nFailed to start PostgreSQL:', err);
  console.error(
    '\nIf a previous run did not shut down cleanly, remove the data directory ' +
      'and try again:\n  rm -rf .pgdata\n'
  );
  process.exit(1);
});
