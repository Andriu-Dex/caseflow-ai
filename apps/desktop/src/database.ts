import { PGlite } from '@electric-sql/pglite';
import { vector } from '@electric-sql/pglite-pgvector';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { applyMigrations } from './migrations.js';

export interface DesktopDatabase {
  url: string;
  stop(): Promise<void>;
}

// DEC-120: PostgreSQL (WASM) with pgvector, persisted in the user's data
// folder and served on loopback only, so the API connects to it exactly as
// it connects to a real server.
// Accepted risk (ADR-005): PGlite's socket has no password authentication,
// so another process on this same machine could connect while the app runs.
// That is the same boundary as the database files in the user's data folder;
// it is never reachable from the network.
export async function startDatabase(options: {
  dataDir: string;
  migrationsDir: string;
  port: number;
}): Promise<DesktopDatabase> {
  const db = await PGlite.create(options.dataDir, { extensions: { vector } });
  await applyMigrations(db, options.migrationsDir);
  const server = new PGLiteSocketServer({
    db,
    host: '127.0.0.1',
    port: options.port,
    // The API's connection pool, multiplexed over the single PGlite session.
    maxConnections: 10,
  });
  await server.start();
  return {
    url: `postgresql://postgres:postgres@127.0.0.1:${options.port}/postgres`,
    async stop() {
      await server.stop();
      await db.close();
    },
  };
}
