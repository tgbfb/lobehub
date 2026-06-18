import { join } from 'node:path';

import * as dotenv from 'dotenv';
import dotenvExpand from 'dotenv-expand';
import { sql } from 'drizzle-orm';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import { migrate as neonMigrate } from 'drizzle-orm/neon-serverless/migrator';
import { migrate as nodeMigrate } from 'drizzle-orm/node-postgres/migrator';

// @ts-ignore tsgo handle esm import cjs and compatibility issues
import { DB_FAIL_INIT_HINT, DUPLICATE_EMAIL_HINT, PGVECTOR_HINT } from './errorHint';

// Load environment variables in priority order:
// 1. .env (lowest priority)
// 2. .env.[env] (medium priority, overrides .env)
// 3. .env.[env].local (highest priority, overrides previous)
// Use dotenv-expand to support ${var} variable expansion
const env = process.env.NODE_ENV || 'development';
dotenvExpand.expand(dotenv.config()); // Load .env
dotenvExpand.expand(dotenv.config({ override: true, path: `.env.${env}` })); // Load .env.[env] and override
dotenvExpand.expand(dotenv.config({ override: true, path: `.env.${env}.local` })); // Load .env.[env].local and override

const migrationsFolder = join(__dirname, '../../packages/database/migrations');

const isPgSearchRelated = (statements: string[]): boolean =>
  statements.some(
    (s) => s.toLowerCase().includes('pg_search') || s.toLowerCase().includes('using bm25'),
  );

// When the standard migrate() throws because pg_search is blocked by the host
// (e.g. Neon deprecated it on March 19, 2026), the C-level CheckAllowedExtension error
// cannot be caught by PL/pgSQL EXCEPTION handlers — it only surfaces here as a JS exception.
// This runner replicates Drizzle's migrate logic but skips pg_search/BM25 SQL while still
// recording every migration as applied, so all subsequent non-pg_search migrations run.
const runMigrationsWithoutPgSearch = async (db: any) => {
  await db.execute(sql`CREATE SCHEMA IF NOT EXISTS "drizzle"`);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "drizzle"."__drizzle_migrations" (
      id SERIAL PRIMARY KEY,
      hash text NOT NULL,
      created_at bigint
    )
  `);

  const appliedResult = await db.execute(
    sql`SELECT hash FROM "drizzle"."__drizzle_migrations"`,
  );
  const appliedHashes = new Set<string>(
    (appliedResult.rows ?? appliedResult).map((r: { hash: string }) => r.hash),
  );

  const migrations = readMigrationFiles({ migrationsFolder });

  for (const migration of migrations) {
    if (appliedHashes.has(migration.hash)) continue;

    if (isPgSearchRelated(migration.sql)) {
      console.warn(
        `⚠️  Skipping pg_search/BM25 migration — extension unavailable on this server: ${migration.hash}`,
      );
    } else {
      for (const stmt of migration.sql) {
        await db.execute(sql.raw(stmt));
      }
    }

    await db.execute(
      sql`INSERT INTO "drizzle"."__drizzle_migrations" (hash, created_at) VALUES (${migration.hash}, ${migration.folderMillis})`,
    );
  }
};

const runMigrations = async () => {
  const { serverDB } = await import('../../packages/database/src/server');

  const time = Date.now();

  try {
    if (process.env.DATABASE_DRIVER === 'node') {
      await nodeMigrate(serverDB, { migrationsFolder });
    } else {
      await neonMigrate(serverDB, { migrationsFolder });
    }
  } catch (err: unknown) {
    const e = err as { routine?: string; message?: string };

    // pg_search deprecated on Neon for new projects since March 19, 2026.
    // CheckAllowedExtension is a C-level error that bypasses PL/pgSQL exception handlers,
    // so it always surfaces at the JS level. Fall back to a custom runner that skips
    // pg_search/BM25 statements but marks every migration applied to unblock the rest.
    if (
      e.routine === 'CheckAllowedExtension' ||
      e.message?.includes('extension "pg_search" is not available')
    ) {
      console.warn(
        '⚠️  pg_search is not available on this database (deprecated on Neon since March 19, 2026).',
        '\n    BM25 full-text search will be disabled.',
        '\n    Retrying all migrations without pg_search/BM25 statements...',
      );
      await runMigrationsWithoutPgSearch(serverDB);
    } else {
      throw err;
    }
  }

  console.log('✅ database migration pass. use: %s ms', Date.now() - time);

  process.exit(0);
};

const connectionString = process.env.DATABASE_URL;

// only migrate database if the connection string is available
if (connectionString) {
  runMigrations().catch((err) => {
    console.error('❌ Database migrate failed:', err);

    const errMsg = err.message as string;

    const constraint = (err as { constraint?: string })?.constraint;

    if (errMsg.includes('extension "vector" is not available')) {
      console.info(PGVECTOR_HINT);
    } else if (constraint === 'users_email_unique' || errMsg.includes('users_email_unique')) {
      console.info(DUPLICATE_EMAIL_HINT);
    } else if (errMsg.includes(`Cannot read properties of undefined (reading 'migrate')`)) {
      console.info(DB_FAIL_INIT_HINT);
    }

    process.exit(1);
  });
} else {
  console.log('🟢 not find database env or in desktop mode, migration skipped');
}
