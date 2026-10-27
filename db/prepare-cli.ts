/**
 * The logic of `npm run db:rehearsal:prepare`, with the database behind an interface so every path after the safety
 * gates is tested (test/prepare-cli.test.mts) against a fake driver. `db/prepare-rehearsal.mts` supplies the real thing.
 *
 * Builds, on a brand-new empty NON-PRODUCTION database, the state production is in before the newest migration: migrations
 * 0000 … `--through` (default 0009) applied by drizzle's own statement-by-statement migrator, exactly as production's were.
 * Exit codes: 0 done / dry run · 1 refused or failed.
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { READ_JOURNAL_SQL, argValue, describeError, loadMigrations, migrationsThrough, redact, writeMigrationSubset } from './atomic-migration.ts';
import { refusalIfNotBrandNew, type Query } from './rehearsal-guard.ts';

export type PrepareDriver = {
  query: Query;
  /** Apply the migrations in this folder with drizzle's own migrator. */
  migrate(folder: string): Promise<void>;
  close?(): Promise<void>;
};

export type PrepareInput = {
  args: string[];
  databaseUrl: string | undefined;
  migrationsFolder: string;
  /** `null` means local in-memory PGlite (--local). Called only after every gate has passed. */
  connect(url: string | null): Promise<PrepareDriver>;
  io: { out(line: string): void; err(line: string): void };
};

export async function runPrepareCli(input: PrepareInput): Promise<number> {
  const { args, databaseUrl: url, io } = input;
  const out = (line: string) => io.out(redact(line, url));
  const err = (line: string) => io.err(redact(line, url));
  const refuse = (message: string) => {
    err(message);
    return 1;
  };
  const local = args.includes('--local');

  // ── Gates ──────────────────────────────────────────────────────────────────────────────────────
  const all = loadMigrations(input.migrationsFolder);
  let subset;
  try {
    subset = migrationsThrough(all, argValue(args, '--through') ?? '0009');
  } catch (e) {
    return refuse((e as Error).message);
  }
  if (subset.length >= all.length) return refuse(`--through would apply every migration, leaving nothing for the atomic runner to rehearse. Choose an earlier one.`);

  let target: string | null = null;
  if (local) {
    out('Mode: local PGlite self-check.');
  } else {
    if (!url) return refuse('DATABASE_URL is not set in the environment of this command. This tool reads no .env file. Use --local for a self-check.');
    let host: string;
    try {
      host = new URL(url).hostname;
    } catch {
      return refuse('DATABASE_URL could not be read as a URL.');
    }
    if (argValue(args, '--expect-host') !== host) return refuse('Refusing: --expect-host is missing or does not match the host in DATABASE_URL. Nothing was contacted.');
    if (!args.includes('--non-production')) return refuse('Refusing: add --non-production to confirm this is a brand-new rehearsal database, not production. Nothing was contacted.');
    out(`Target: Neon — ${host}`);
    target = url;
  }

  const driver = await input.connect(target);
  try {
    // The database must be brand new: no table in any schema (an empty migration journal is fine), nothing recorded.
    const notNew = await refusalIfNotBrandNew(driver.query);
    if (notNew) return refuse(notNew);

    out(`Would apply ${subset.length} of ${all.length} migrations with drizzle's own migrator (statement by statement, as production's were): ${subset[0].tag} … ${subset[subset.length - 1].tag}`);
    out(`Left for the atomic runner: ${all.slice(subset.length).map((m) => m.tag).join(', ')}`);
    if (!args.includes('--confirm')) {
      out('\nDry run — nothing was changed. To apply: add --confirm');
      return 0;
    }

    const dir = mkdtempSync(join(tmpdir(), 'kk-rehearsal-'));
    try {
      writeMigrationSubset(input.migrationsFolder, subset.map((m) => m.tag), dir);
      await driver.migrate(dir);
    } catch (e) {
      err(`The migration failed part-way — ${describeError(e, url)}`);
      err('drizzle applies statement by statement, so the database may be half-migrated. This is a throwaway rehearsal database: delete it and create a new one.');
      return 1;
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }

    const after = (await driver.query(READ_JOURNAL_SQL)).length;
    if (after !== subset.length) return refuse(`Unexpected: the journal has ${after} rows, expected ${subset.length}.`);
    out(`Done: ${after} migrations applied and recorded. Next: db:migrate:atomic -- --expect-host <host> (dry run), then the same with --confirm --restore-point-taken.`);
    return 0;
  } finally {
    await driver.close?.();
  }
}
