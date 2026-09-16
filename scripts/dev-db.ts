/**
 * Embedded Postgres for local development.
 *
 * PGlite is Postgres compiled to WebAssembly; the socket server puts it behind
 * a real TCP port speaking the Postgres wire protocol, so Prisma connects with
 * an ordinary postgresql:// URL and neither Prisma nor the app knows the
 * difference.
 *
 * This is a convenience for getting started with zero system installs — it is
 * NOT for production. Two URL parameters are required:
 *   connection_limit=1  PGlite serves one connection at a time.
 *   pgbouncer=true      Disables prepared statements, which PGlite's socket
 *                       server does not scope per session (otherwise Prisma
 *                       fails with 'prepared statement "s0" already exists').
 * Point DATABASE_URL at a real Postgres before deploying.
 *
 *   npm run db:local
 */

import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import path from 'node:path';

const PORT = Number(process.env.PGLITE_PORT ?? 5432);
const DATA_DIR = path.join(process.cwd(), '.pglite');

async function main() {
  console.log('Starting embedded Postgres (PGlite)…');

  const db = await PGlite.create({ dataDir: DATA_DIR });
  const server = new PGLiteSocketServer({ db, port: PORT, host: '127.0.0.1' });

  await server.start();

  console.log(`
  Embedded Postgres is listening on 127.0.0.1:${PORT}
  Data directory: ${DATA_DIR}

  DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:${PORT}/postgres?connection_limit=1&pgbouncer=true"

  Leave this running. In another terminal:
    npm run db:migrate
    npm run db:seed
    npm run dev

  Press Ctrl+C to stop.
`);

  const shutdown = async () => {
    console.log('\nStopping embedded Postgres…');
    await server.stop();
    await db.close();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('Failed to start embedded Postgres:', err);
  process.exit(1);
});
