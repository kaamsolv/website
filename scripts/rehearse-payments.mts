/**
 * Rehearsal of the payment ledger under concurrency — NOT part of `npm test`, and never for production.
 *
 *   npx tsx scripts/rehearse-payments.mts --local [--rounds N]
 *       Self-check on in-memory PGlite. PGlite runs one statement at a time, so this proves the script's own logic and
 *       the ledger's invariants, NOT concurrent behaviour. Safe anywhere.
 *
 *   DATABASE_URL=<a dedicated NON-PRODUCTION Neon database> npx tsx scripts/rehearse-payments.mts --expect-host <host> --non-production [--rounds N]
 *       Fires requests that are released together (separate HTTP requests, so separate transactions) at that database
 *       through the app's own `recordPayment` / `voidPayment` code, then checks the ledger's invariants.
 *
 * Safety rails for the Neon mode (all must hold or it refuses before writing anything):
 *   • DATABASE_URL must be set in that command's environment (no .env file is read), --expect-host must match its host
 *     (the refusal does not say what the host is), and --non-production states that you know this is not production
 *     (host only is ever printed; every error is one line scrubbed of the connection string and password);
 *   • the WHOLE database must be empty: every table in every non-system schema has no rows — only the seeded plans and
 *     drizzle's migration journal may — so it cannot be a copy of production or of anyone's data. Create it as a
 *     brand-new empty database, never as a data copy of production;
 *   • migration 0010 must be applied;
 *   • it only ever writes rows for one synthetic user it creates itself, and deletes that user (cascading) at the end.
 *
 * What it does, per round (default 10 rounds on Neon, 2 locally; --rounds 1..200): a start barrier releases every request
 * of a scenario together; then 20 payments race for an invoice that can take 10, one idempotency key is sent 10 times,
 * two payments race for the last money, a void races a new payment, and an invoice edit lowering the total races a payment.
 * After every scenario, for every invoice: amount_paid = the sum of its non-voided payments, never above the total,
 * status 'paid' exactly when covered. At the end: a ledger sweep, an audit-trail count, and — failing the run on its own —
 * ANY unexpected error: a deadlock, a serialization failure, a timeout, a payment refused for any reason other than
 * "more than is owed", or an error nobody expected, even when every total reconciles.
 *
 * What the overlap numbers mean: for each scenario it records how many requests it made, and how often every request was
 * in flight at the same moment (measured in this process: all started before the first finished). That is a NECESSARY
 * condition for a race, not proof of one — it cannot see inside the database, and on PGlite the engine serialises
 * everything. It is reported as "requests in flight together", never as "a race occurred".
 *
 * --inject-fault <database-error|deadlock-code|refused-payment> (only with --local) adds one extra request in round 1 that
 * fails in that way while leaving every total correct — used by the test that proves the run fails on an unexpected error.
 */

import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { sql } from 'drizzle-orm';
import { recordPayment, voidPayment } from '../db/payments.ts';
import { StopRun, argValue, installSafeErrorOutput, redact } from '../db/atomic-migration.ts';
import { classifyRehearsalError, refusalIfNotEmpty } from '../db/rehearsal-guard.ts';
import type { Db } from '../db/links.ts';

installSafeErrorOutput(); // any error that escapes prints one scrubbed line, never Node's dump of the error object

const args = process.argv.slice(2);
const local = args.includes('--local');
const stop = (m: string): never => {
  console.error(redact(m, process.env.DATABASE_URL));
  throw new StopRun(1); // not process.exit(): it can be reached after the database was contacted (see installSafeErrorOutput)
};

const rawRounds = argValue(args, '--rounds');
if (rawRounds !== undefined && !/^\d{1,3}$/.test(rawRounds)) stop('--rounds must be a whole number from 1 to 200.');
const rounds = rawRounds === undefined ? (local ? 2 : 10) : Number(rawRounds);
if (rounds < 1 || rounds > 200) stop('--rounds must be a whole number from 1 to 200.');

const fault = argValue(args, '--inject-fault');
if (args.includes('--inject-fault') && !fault) stop('--inject-fault needs one of: database-error, deadlock-code, refused-payment.');
if (fault && !['database-error', 'deadlock-code', 'refused-payment'].includes(fault)) stop('--inject-fault needs one of: database-error, deadlock-code, refused-payment.');
if (fault && !local) stop('--inject-fault is only for --local self-checks; it is never honoured against a real database.');

// ─── Results, aggregated across rounds ───────────────────────────────────────────────────────────
type Tally = { name: string; passed: number; failed: number; firstFailure?: string };
const tallies = new Map<string, Tally>();
const check = (name: string, ok: boolean, detail: string) => {
  const t = tallies.get(name) ?? { name, passed: 0, failed: 0 };
  tallies.set(name, t);
  if (ok) t.passed++;
  else {
    t.failed++;
    t.firstFailure ??= detail;
    console.log(`FAIL  ${name} — ${detail}`);
  }
};

let db: Db;
let close = async () => {};

if (local) {
  const { makeTestDb } = await import('../test/helpers/test-db.mts');
  ({ db, close } = await makeTestDb());
  console.log('Mode: local PGlite self-check (serial — proves the logic, not concurrency).');
} else {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) stop('Set DATABASE_URL to a dedicated NON-PRODUCTION Neon database, or use --local.');
  let host: string;
  try {
    host = new URL(url as string).hostname;
  } catch {
    host = stop('DATABASE_URL could not be read as a URL.');
  }
  if (argValue(args, '--expect-host') !== host) stop('Refusing: --expect-host is missing or does not match the host in DATABASE_URL. Nothing was contacted.');
  if (!args.includes('--non-production')) stop('Refusing: add --non-production to confirm this database is a dedicated test database, not production. Nothing was contacted.');
  const { drizzle } = await import('drizzle-orm/neon-http');
  db = drizzle(url as string) as unknown as Db;
  console.log(`Mode: Neon — ${host} (requests released together).`);
}
console.log(`Rounds per scenario: ${rounds}${fault ? ` · injected fault: ${fault}` : ''}`);

const rows = async <T,>(q: ReturnType<typeof sql>) => ((await db.execute(q)) as unknown as { rows: T[] }).rows;

// ─── Safety gates ────────────────────────────────────────────────────────────────────────────────
if (!local) {
  const ready = await rows<{ ok: boolean }>(sql`select to_regclass('public.invoice_payments') is not null and exists (select 1 from information_schema.columns where table_name = 'invoices' and column_name = 'amount_paid') as ok`);
  if (!ready[0]?.ok) stop('Refusing: migration 0010 is not applied on this database.');
  const refusal = await refusalIfNotEmpty(async (text) => await rows<Record<string, unknown>>(sql.raw(text)));
  if (refusal) stop(refusal);
}

const [{ id: user }] = await rows<{ id: string }>(sql`insert into auth_users (name, email, email_verified) values ('rehearsal', ${`rehearsal-${randomUUID()}@example.test`}, true) returning id`);

async function invoice(total: number, number: string): Promise<string> {
  const [{ id }] = await rows<{ id: string }>(sql`
    insert into invoices (user_id, number, client_name, currency, total, issue_date, due_date, kind, data)
    values (${user}::uuid, ${number}, 'Rehearsal Client', 'INR', ${total}, current_date - 10, current_date + 10, 'invoice', '{}'::jsonb)
    returning id`);
  return id;
}
const input = (amount: number, key: string = randomUUID(), paidOn = new Date().toISOString().slice(0, 10)) => ({
  amountCents: Math.round(amount * 100),
  paidOn,
  method: 'bank' as const,
  reference: '',
  note: '',
  clientKey: key,
  reconcile: false,
});

// Anything the ledger is not supposed to say in a race — a deadlock, a serialization failure, a timeout, a payment
// refused for any reason other than "more than is owed", an error nobody expected — is recorded and fails the run, even
// if every total reconciles.
const unexpected: string[] = [];
let scenario = '';
let round = 0;
const flag = (what: string) => {
  unexpected.push(`${scenario} (round ${round}): ${what}`);
  console.log(`UNEXPECTED  ${scenario} (round ${round}): ${what}`);
};
const pay = async (id: string, amount: number, key?: string, paidOn?: string) => {
  try {
    const r = await recordPayment(db, user, id, input(amount, key, paidOn));
    if (!r.ok && r.reason !== 'exceeds') flag(`a payment was refused as "${r.reason}"`);
    return r;
  } catch (e) {
    flag(`a payment request failed: ${classifyRehearsalError(e, ['payment_exceeds']).label}`);
    return { ok: false as const, reason: 'not_found' as const };
  }
};
const voided = async (id: string, paymentId: string) => {
  try {
    return await voidPayment(db, user, id, paymentId, 'rehearsal');
  } catch (e) {
    flag(`a void failed: ${classifyRehearsalError(e, []).label}`);
    return { ok: false as const, reason: 'not_found' as const };
  }
};

// ─── Releasing requests together, and measuring whether they overlapped ──────────────────────────
type Overlap = { scenario: string; rounds: number; requests: number; allInFlightTogether: number };
const overlaps = new Map<string, Overlap>();

/**
 * Start every task at the same instant: each one reaches a barrier, and only when all are there is the barrier opened.
 * Records, per call, whether every request had started before any had finished — "in flight together". That is all it
 * can say: it cannot see inside the database.
 */
async function together<T>(tasks: (() => Promise<T>)[]): Promise<T[]> {
  let open!: () => void;
  const barrier = new Promise<void>((resolve) => (open = resolve));
  let waiting = 0;
  const started: number[] = [];
  const ended: number[] = [];
  const running = tasks.map(async (task, i) => {
    if (++waiting === tasks.length) open();
    await barrier;
    started[i] = performance.now();
    try {
      return await task();
    } finally {
      ended[i] = performance.now();
    }
  });
  const results = await Promise.all(running);
  const o = overlaps.get(scenario) ?? { scenario, rounds: 0, requests: 0, allInFlightTogether: 0 };
  overlaps.set(scenario, o);
  o.rounds++;
  o.requests += tasks.length;
  if (Math.max(...started) < Math.min(...ended)) o.allInFlightTogether++;
  return results;
}

/** One extra request that fails in the way --inject-fault asks, leaving every total correct. */
function injectedFault(id: string): (() => Promise<unknown>)[] {
  if (!fault || round !== 1) return [];
  if (fault === 'refused-payment') return [() => pay(id, 1, undefined, '2999-01-01')]; // a real refusal from the ledger: a date in the future
  if (fault === 'database-error')
    return [
      async () => {
        try {
          await db.execute(sql`select 1 / 0`); // a real Postgres error (division by zero, SQLSTATE 22012)
        } catch (e) {
          flag(`an extra request failed: ${classifyRehearsalError(e, []).label}`);
        }
      },
    ];
  return [
    async () => {
      // SYNTHETIC: an error shaped like a database deadlock (SQLSTATE 40P01). It cannot happen on PGlite; this proves the run fails on one.
      const e = Object.assign(new Error('deadlock detected (injected, synthetic)'), { code: '40P01' });
      flag(`an extra request failed: ${classifyRehearsalError(e, ['payment_exceeds']).label}`);
    },
  ];
}

const state = async (id: string) =>
  (await rows<{ total: string; paid: string; status: string; live: string; n: string }>(sql`
    select i.total::text, i.amount_paid::text as paid, i.status::text,
           coalesce((select sum(amount) from invoice_payments p where p.invoice_id = i.id and p.voided_at is null), 0)::text as live,
           (select count(*) from invoice_payments p where p.invoice_id = i.id and p.voided_at is null)::text as n
    from invoices i where i.id = ${id}::uuid`))[0];

/** The ledger's promises, for one invoice, whatever order things happened in. */
async function invariants(name: string, id: string) {
  const s = await state(id);
  const total = Number(s.total);
  const paid = Number(s.paid);
  const live = Number(s.live);
  const consistent = Math.abs(paid - live) < 0.005 && paid <= total + 0.005 && (s.status === 'paid') === (paid > 0 && paid >= total - 0.005);
  check(`${name}: ledger invariants`, consistent, `round ${round}: total ${total}, amount_paid ${paid}, live payments ${live} (${s.n}), status ${s.status}`);
  return s;
}

try {
  for (round = 1; round <= rounds; round++) {
    // 1 — 20 payments of 100 at once against an invoice that can take 10.
    {
      scenario = '20 payments racing for an invoice that takes 10';
      const id = await invoice(1000, `R-OVERPAY-${round}`);
      const out = await together([...Array.from({ length: 20 }, () => () => pay(id, 100)), ...injectedFault(id)]);
      const mine = out.slice(0, 20) as Awaited<ReturnType<typeof pay>>[];
      const won = mine.filter((r) => r.ok).length;
      const refused = mine.filter((r) => !r.ok && r.reason === 'exceeds').length;
      const s = await invariants(scenario, id);
      check(`${scenario}: exactly 10 accepted, 10 refused as "exceeds"`, won === 10 && refused === 10 && Number(s.paid) === 1000 && s.status === 'paid', `round ${round}: accepted ${won}, exceeds ${refused}, other ${20 - won - refused}`);
    }

    // 2 — one idempotency key, ten requests at once.
    {
      scenario = 'one idempotency key sent 10 times at once';
      const id = await invoice(500, `R-IDEMP-${round}`);
      const key = randomUUID();
      const out = await together(Array.from({ length: 10 }, () => () => pay(id, 50, key)));
      const s = await invariants(scenario, id);
      const originals = out.filter((r) => r.ok && !r.duplicate).length;
      const dupes = out.filter((r) => r.ok && r.duplicate).length;
      check(`${scenario}: exactly one payment recorded, the rest answered as the same payment`, Number(s.n) === 1 && Number(s.paid) === 50 && originals === 1 && dupes === 9, `round ${round}: rows ${s.n}, original ${originals}, duplicates ${dupes}, failures ${10 - originals - dupes}`);
    }

    // 3 — two payments racing for the same last money.
    {
      scenario = 'two payments of 60 racing for a 100 invoice';
      const id = await invoice(100, `R-LAST-${round}`);
      const [a, b] = await together([() => pay(id, 60), () => pay(id, 60)]);
      const s = await invariants(scenario, id);
      check(`${scenario}: one wins, one is refused`, [a, b].filter((r) => r.ok).length === 1 && Number(s.paid) === 60, `round ${round}: results ${[a, b].map((r) => (r.ok ? 'ok' : r.reason)).join(', ')}`);
    }

    // 4 — a void racing a fresh payment on a fully paid invoice.
    {
      scenario = 'a void racing a new payment';
      const id = await invoice(100, `R-VOID-${round}`);
      const first = await pay(id, 100);
      if (!first.ok) throw new Error('setup payment refused');
      const [v, p] = (await together<unknown>([() => voided(id, first.payment.id), () => pay(id, 100)])) as [Awaited<ReturnType<typeof voided>>, Awaited<ReturnType<typeof pay>>];
      const s = await invariants(scenario, id);
      check(`${scenario}: either order is acceptable, never more than the total received`, v.ok && Number(s.paid) <= 100, `round ${round}: void ok=${v.ok}; new payment ${p.ok ? 'accepted' : p.reason}; live ${s.live}`);
    }

    // 5 — lowering the invoice total racing a payment.
    {
      scenario = 'a total lowered while a payment lands';
      const id = await invoice(1000, `R-EDIT-${round}`);
      const base = await pay(id, 600);
      if (!base.ok) throw new Error('setup payment refused');
      const [edit, p] = (await together<unknown>([
        () =>
          db.execute(sql`update invoices set total = 650 where id = ${id}::uuid`).then(
            () => 'edited',
            (e: unknown) => {
              const v = classifyRehearsalError(e, ['invoice_total_below_paid']);
              if (!v.expected) flag(`the edit failed: ${v.label}`);
              return v.label;
            },
          ),
        () => pay(id, 100),
      ])) as [string, Awaited<ReturnType<typeof pay>>];
      const s = await invariants(scenario, id);
      check(`${scenario}: never a total below what was received`, Number(s.total) >= Number(s.paid), `round ${round}: edit ${edit === 'edited' ? 'applied' : 'refused'}, payment ${p.ok ? 'accepted' : 'refused'}, total ${s.total}, received ${s.paid}`);
    }
  }

  scenario = 'after all rounds';
  // Everything this run made, once more.
  const bad = await rows<{ number: string }>(sql`
    select i.number from invoices i
    where i.user_id = ${user}::uuid
      and (i.amount_paid <> coalesce((select sum(p.amount) from invoice_payments p where p.invoice_id = i.id and p.voided_at is null), 0) or i.amount_paid > i.total)`);
  check('final sweep: every invoice reconciles with its ledger', bad.length === 0, bad.length ? `mismatched: ${bad.map((b) => b.number).join(', ')}` : 'all consistent');

  // The audit trail: one entry for every payment recorded, one more for every payment voided — however the races went.
  const [audit] = await rows<{ payments: string; voids: string; events: string }>(sql`
    select (select count(*) from invoice_payments where user_id = ${user}::uuid)::text as payments,
           (select count(*) from invoice_payments where user_id = ${user}::uuid and voided_at is not null)::text as voids,
           (select count(*) from invoice_payment_events where user_id = ${user}::uuid)::text as events`);
  check('audit trail: one entry per payment recorded and per payment voided', Number(audit.events) === Number(audit.payments) + Number(audit.voids), `payments ${audit.payments}, voids ${audit.voids}, entries ${audit.events}`);

  check('no unexpected errors (deadlock, serialization failure, timeout, or a refusal the ledger should not give)', unexpected.length === 0, unexpected.length ? `${unexpected.length}: ${unexpected.slice(0, 5).join('; ')}` : 'none');
} finally {
  await db.execute(sql`delete from auth_users where id = ${user}::uuid`); // cascades to invoices, payments and their audit rows
  await close();
}

// ─── Report ──────────────────────────────────────────────────────────────────────────────────────
console.log('');
for (const t of tallies.values()) {
  const n = t.passed + t.failed;
  console.log(t.failed === 0 ? `PASS  ${t.name} — ${n}/${n}` : `FAIL  ${t.name} — ${t.failed} of ${n} failed (first: ${t.firstFailure})`);
}
console.log('');
let attempts = 0;
for (const o of overlaps.values()) {
  attempts += o.requests;
  console.log(`Overlap  ${o.scenario}: ${o.rounds} rounds, ${o.requests} requests; every request in flight together in ${o.allInFlightTogether} of ${o.rounds} rounds (measured in this process)`);
}
console.log(`Attempts: ${attempts} requests released together across ${rounds} round(s). "In flight together" is necessary for a race, not proof of one${local ? '; on PGlite the engine runs one statement at a time, so nothing here raced inside the database' : ''}.`);

const failed = [...tallies.values()].filter((t) => t.failed > 0);
console.log(`\n${tallies.size - failed.length} of ${tallies.size} checks passed. Synthetic data removed.`);
process.exitCode = failed.length ? 1 : 0; // not process.exit(): see installSafeErrorOutput
