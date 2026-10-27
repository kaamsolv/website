/**
 * Guards for the rehearsal tools (db/prepare-rehearsal.mts, scripts/rehearse-payments.mts) — pure and driver-free so
 * they are tested on PGlite and used unchanged against Neon.
 *
 * Why not just "no users": the old check counted `auth_users` only. A copy of production taken before accounts
 * existed has no users but does hold anonymous short links and click data. The rule is about the WHOLE database:
 * every table in every non-system schema must be empty. Only what a migration seeds may hold rows — the plan
 * tables (plans, features, prices), and drizzle's own journal of applied migrations. (The operator's `--non-production` flag remains an
 * attestation; this is the technical backstop for a mistake.)
 *
 * Strict scope: "every non-system schema" means everything except `pg_catalog`, `information_schema`, `pg_toast` and
 * the per-session temporary schemas. A platform schema on a brand-new Neon project that holds rows would be refused
 * and named in the message; whether that happens is unverified until a rehearsal database exists.
 */

/** Seeded by migrations, not customer data: plans and what each plan includes. Schema-qualified. */
export const SEED_TABLES: readonly string[] = ['public.plans', 'public.plan_features', 'public.plan_prices'];
/** drizzle's record of applied migrations: expected to hold rows once anything is migrated. */
export const JOURNAL_TABLE_NAME = 'drizzle.__drizzle_migrations';

/** Runs one SQL text and returns its rows. Neon: `sql.query`; drizzle: `db.execute(sql.raw(text)).rows`. */
export type Query = (text: string) => Promise<Record<string, unknown>[]>;

export type TableRef = { schema: string; name: string; rowSecurity: boolean };
export const qualified = (t: Pick<TableRef, 'schema' | 'name'>) => `${t.schema}.${t.name}`;

const ident = (name: string) => `"${name.replace(/"/g, '""')}"`;

/**
 * Every table (ordinary, partitioned or materialized) in every non-system schema, from the system catalogs. Not
 * `information_schema`: that only shows tables the connecting role owns or holds a privilege on, so a restricted role
 * looking at a populated copy would see none and the database would look empty. `pg_class` lists them all.
 */
export async function listTables(query: Query): Promise<TableRef[]> {
  const rows = await query(
    `select n.nspname as schema_name, c.relname as table_name, c.relrowsecurity as row_security
       from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      where c.relkind in ('r', 'p', 'm')
        and n.nspname not in ('pg_catalog', 'information_schema', 'pg_toast')
        and n.nspname not like 'pg\\_temp\\_%' and n.nspname not like 'pg\\_toast\\_temp\\_%'
      order by n.nspname, c.relname`,
  );
  return rows.map((r) => ({ schema: String(r.schema_name), name: String(r.table_name), rowSecurity: r.row_security === true || r.row_security === 't' }));
}

/** Tables with data in them are what matter; seeds and the journal are expected to. */
const isExpected = (t: TableRef) => SEED_TABLES.includes(qualified(t)) || qualified(t) === JOURNAL_TABLE_NAME;

/**
 * Tables that hold at least one row, with their counts (counts only — never row contents). Empty means the database
 * holds no application data of any kind. It fails CLOSED when emptiness can't be proved: a table this role is not
 * allowed to read, or one with row-level security (whose rows `count(*)` may not all see), is reported as holding data
 * (`rows: -1` means "cannot be verified") rather than assumed empty.
 */
export async function tablesWithData(query: Query): Promise<{ table: string; rows: number }[]> {
  const found: { table: string; rows: number }[] = [];
  for (const t of await listTables(query)) {
    if (isExpected(t)) continue;
    if (t.rowSecurity) {
      found.push({ table: qualified(t), rows: -1 });
      continue;
    }
    try {
      const [row] = await query(`select count(*)::text as n from ${ident(t.schema)}.${ident(t.name)}`);
      const n = Number(row?.n ?? 0);
      if (n > 0) found.push({ table: qualified(t), rows: n });
    } catch (e) {
      const code = (e as { code?: unknown })?.code ?? (e as { cause?: { code?: unknown } })?.cause?.code;
      if (code === '42501') found.push({ table: qualified(t), rows: -1 }); // permission denied: can't prove it is empty
      else throw e;
    }
  }
  return found;
}

/** A readable refusal, or null when the database holds no application data. */
export async function refusalIfNotEmpty(query: Query): Promise<string | null> {
  const used = await tablesWithData(query);
  if (used.length === 0) return null;
  const what = used.map((u) => (u.rows < 0 ? `${u.table}: cannot be verified (no permission, or row-level security)` : `${u.table}: ${u.rows}`)).join(', ');
  return `Refusing: this database already holds application data, or its emptiness cannot be proved (${what}). The rehearsal only runs on an empty, non-production database — never on a copy of real data.`;
}

/**
 * "Brand new": no table anywhere except, at most, an EMPTY drizzle journal. Production has both tables and journal rows.
 * Returns a readable refusal, or null.
 */
export async function refusalIfNotBrandNew(query: Query): Promise<string | null> {
  const tables = (await listTables(query)).filter((t) => qualified(t) !== JOURNAL_TABLE_NAME);
  const journal = (await listTables(query)).find((t) => qualified(t) === JOURNAL_TABLE_NAME);
  let journalRows = 0;
  if (journal) journalRows = Number((await query(`select count(*)::text as n from ${ident(journal.schema)}.${ident(journal.name)}`))[0]?.n ?? 0);
  if (tables.length === 0 && journalRows === 0) return null;
  return `Refusing: this is not a brand-new database (${tables.length} table(s) outside the migration journal${tables.length ? `: ${tables.slice(0, 8).map(qualified).join(', ')}${tables.length > 8 ? ', …' : ''}` : ''}; ${journalRows} migration(s) recorded). Production looks like this. Use a new, empty Neon project.`;
}

// ─── Which errors a concurrency scenario may legitimately see ────────────────────────────────────

export type ErrorVerdict = { expected: boolean; label: string };

/** SQLSTATEs that mean the database itself gave up on a transaction: never "expected" in a rehearsal. */
const CONCURRENCY_FAILURES: Record<string, string> = { '40P01': 'deadlock detected', '40001': 'serialization failure', '55P03': 'lock not available', '57014': 'statement cancelled (timeout)' };

function chainOf(e: unknown): { text: string; code?: string }[] {
  const out: { text: string; code?: string }[] = [];
  for (let cur: unknown = e, i = 0; cur && i < 6; i++) {
    const err = cur as { message?: unknown; code?: unknown; cause?: unknown };
    out.push({ text: String(err.message ?? cur), code: typeof err.code === 'string' ? err.code : undefined });
    cur = err.cause;
  }
  return out;
}

/**
 * Is this error one the ledger is SUPPOSED to raise in the scenario (e.g. `payment_exceeds` when two payments race
 * for the last money)? A deadlock, a serialization failure, a timeout or anything unrecognised is not, and the
 * rehearsal fails on it even if the ledger's totals still reconcile.
 */
export function classifyRehearsalError(e: unknown, allowed: readonly string[]): ErrorVerdict {
  const chain = chainOf(e);
  for (const { code } of chain) {
    if (code && CONCURRENCY_FAILURES[code]) return { expected: false, label: `${CONCURRENCY_FAILURES[code]} [${code}]` };
  }
  for (const { text } of chain) {
    const hit = allowed.find((a) => text.includes(a));
    if (hit) return { expected: true, label: hit };
  }
  return { expected: false, label: chain[chain.length - 1]?.text.slice(0, 160) ?? 'unknown error' };
}
