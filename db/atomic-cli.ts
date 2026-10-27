/**
 * The logic of `npm run db:migrate:atomic`, with the database behind an interface — so every path after the safety
 * gates (what the journal says, the dry run, the transaction call, a confirmed rollback, an unknown outcome, a failed
 * read-back) is exercised by test/atomic-cli.test.mts against a fake driver, no Neon connection needed.
 * `db/migrate-atomic.mts` is the thin wrapper that supplies the real Neon driver, the process arguments and the environment.
 *
 * Exit codes:  0 done / dry run / nothing to apply · 1 refused, or the apply failed (see the message for rolled back vs
 * unknown) · 3 the migration WAS applied and committed, but reading the journal back afterwards failed.
 */

import {
  DEFAULT_LOCK_TIMEOUT_MS,
  DEFAULT_STATEMENT_TIMEOUT_MS,
  FAILURE_ADVICE,
  JOURNAL_EXISTS_SQL,
  LOCK_TIMEOUT_RANGE_MS,
  READ_JOURNAL_SQL,
  STATEMENT_TIMEOUT_RANGE_MS,
  applyAtomically,
  argValue,
  classifyFailure,
  describeError,
  describePlan,
  failureHint,
  loadMigrations,
  planPending,
  redact,
  type Statement,
} from './atomic-migration.ts';

/** The two things the runner needs from a database. */
export type Driver = {
  /** A read. Returns the rows. */
  query(text: string): Promise<Record<string, unknown>[]>;
  /** All the statements as ONE transaction. Resolves only if the database confirmed it; rejects otherwise (see `classifyFailure`). */
  transaction(statements: Statement[]): Promise<void>;
};

export type AtomicCliInput = {
  args: string[];
  /** `DATABASE_URL` from the environment of this one command — never read from a file. */
  databaseUrl: string | undefined;
  migrationsFolder: string;
  /** Called only after every gate has passed, so "nothing was contacted" is something a test can check. */
  connect(url: string): Promise<Driver>;
  io: { out(line: string): void; err(line: string): void };
};

function parseTimeout(args: string[], flag: string, fallback: number, [min, max]: readonly [number, number]): { ok: true; value: number } | { ok: false; message: string } {
  const raw = argValue(args, flag);
  if (raw === undefined) return args.includes(flag) ? { ok: false, message: `${flag} needs a number of milliseconds.` } : { ok: true, value: fallback };
  if (!/^\d{1,8}$/.test(raw) || Number(raw) < min || Number(raw) > max) return { ok: false, message: `${flag} must be a whole number of milliseconds from ${min} to ${max}.` };
  return { ok: true, value: Number(raw) };
}

export async function runAtomicCli(input: AtomicCliInput): Promise<number> {
  const { args, databaseUrl: url, io } = input;
  const out = (line: string) => io.out(redact(line, url));
  const err = (line: string) => io.err(redact(line, url));
  const refuse = (message: string) => {
    err(message);
    return 1;
  };

  // ── Gates: nothing is contacted until every one has passed ─────────────────────────────────────
  if (!url) return refuse('DATABASE_URL is not set in the environment of this command. This tool is for Neon databases and reads no .env file; local development uses `npm run db:migrate` (PGlite).');
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    return refuse('DATABASE_URL could not be read as a URL.');
  }
  // The operator names the database they mean, every time. The refusal does not say what the host is: a typed answer
  // that has to be known independently is worth more than one that can be copied out of the error message.
  if (argValue(args, '--expect-host') !== host) return refuse('Refusing: --expect-host is missing or does not match the host in DATABASE_URL. Nothing was contacted.');
  const lock = parseTimeout(args, '--lock-timeout-ms', DEFAULT_LOCK_TIMEOUT_MS, LOCK_TIMEOUT_RANGE_MS);
  if (!lock.ok) return refuse(`Refusing: ${lock.message} Nothing was contacted.`);
  const statement = parseTimeout(args, '--statement-timeout-ms', DEFAULT_STATEMENT_TIMEOUT_MS, STATEMENT_TIMEOUT_RANGE_MS);
  if (!statement.ok) return refuse(`Refusing: ${statement.message} Nothing was contacted.`);

  out(`Target: Neon — ${host}`);
  const driver = await input.connect(url);

  // ── What the database says, and what that means ────────────────────────────────────────────────
  const all = loadMigrations(input.migrationsFolder);
  const present = (await driver.query(JOURNAL_EXISTS_SQL))[0]?.present === true;
  const rows = present ? await driver.query(READ_JOURNAL_SQL) : [];
  const plan = planPending(all, rows.map((r) => ({ hash: String(r.hash), createdAt: Number(r.created_at) })));
  if (!plan.ok) return refuse(`Stopped: ${plan.reason}`);

  out(`Applied in this database: ${plan.applied} of ${all.length}. Pending: ${plan.pending.length}.`);
  for (const note of plan.notes) out(`Note: ${note}`);
  for (const line of describePlan(plan.pending)) out(line);
  out(`Timeouts for the transaction: lock ${lock.value} ms, statement ${statement.value} ms (set locally, undone when it ends; not validated on Neon).`);

  if (plan.pending.length === 0) return 0; // already applied: nothing to do, whatever flags were given
  if (!args.includes('--confirm')) {
    out('\nDry run — nothing was changed. To apply: add --confirm --restore-point-taken');
    return 0;
  }
  if (!args.includes('--restore-point-taken')) return refuse('Refusing to apply: take a Neon restore point (or branch) first, then add --restore-point-taken.');

  // ── The transaction ────────────────────────────────────────────────────────────────────────────
  out('\nApplying in one transaction…');
  let applied: string[];
  try {
    ({ applied } = await applyAtomically(plan.pending, (statements) => driver.transaction(statements), {
      lockTimeoutMs: lock.value,
      statementTimeoutMs: statement.value,
      expectedApplied: plan.applied,
    }));
  } catch (e) {
    err(`The transaction failed — ${describeError(e, url)}`);
    const kind = classifyFailure(e);
    const hint = kind === 'rolled_back' ? failureHint(e) : null; // a specific explanation only when the database itself said so
    if (hint) err(hint);
    for (const line of FAILURE_ADVICE[kind]) err(line);
    return 1;
  }
  out(`Committed: ${applied.join(', ')} (statements and journal rows together).`);

  // ── Read it back. A failure here does NOT mean a rollback: the commit already happened. ─────────
  try {
    const after = await driver.query(READ_JOURNAL_SQL);
    if (after.length !== all.length) {
      err(`The migration was committed, but the journal has ${after.length} rows and ${all.length} were expected. Do not re-run; check the database.`);
      return 3;
    }
    out(`Journal now has ${after.length} rows (expected ${all.length}).`);
    return 0;
  } catch (e) {
    err(`The migration WAS applied and committed (${applied.join(', ')}); it was not rolled back. Reading the journal back afterwards failed — ${describeError(e, url)}`);
    err('Run the dry run (without --confirm) to confirm the state before doing anything else.');
    return 3;
  }
}
