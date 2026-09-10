/**
 * Turning a thrown value into one useful log line.
 *
 * Framework-free (no `next/*`, no DOM), like the other `app/lib` helpers.
 *
 * Two hazards this exists to handle, both learned the hard way while debugging
 * the first Preview deployment:
 *
 *   1. **The explanation hides on `cause`.** Drizzle wraps a driver failure in
 *      a generic `Failed query: …` error and puts the part that matters — the
 *      Postgres code and message — on `cause`. Logging only the top-level
 *      error says a query failed but never why.
 *   2. **Log viewers truncate from the end.** Drizzle's message embeds the
 *      entire SQL statement and its params, and the stack repeats it. Emit
 *      that first and the platform cuts the entry off before reaching
 *      `relation "links" does not exist [code 42P01]` — the one line worth
 *      having. So: root cause first, wrappers next, stack frames last, and
 *      every message capped.
 */

const MAX_MESSAGE = 300;
const MAX_FRAMES = 8;
const MAX_CHAIN = 5;

/** One error on its own: `Name: message [code X]`, message capped. */
function describeError(err: Error): string {
  const code = (err as { code?: unknown }).code;
  const message =
    err.message.length > MAX_MESSAGE ? `${err.message.slice(0, MAX_MESSAGE)}…` : err.message;
  return `${err.name}: ${message}${code == null ? '' : ` [code ${String(code)}]`}`;
}

/**
 * Flatten an error and its `cause` chain, **root cause first**.
 *
 * Capping each message also keeps a long destination URL from being logged in
 * full, which suits the "destination host only" logging rule in
 * docs/products/url-shortener.md §7.
 */
export function errorDetail(err: unknown): string {
  if (!(err instanceof Error)) return String(err);

  const chain: Error[] = [];
  for (let cur: unknown = err; cur instanceof Error && chain.length < MAX_CHAIN; cur = cur.cause) {
    chain.push(cur);
  }

  const lines = [describeError(chain[chain.length - 1])];
  for (let i = chain.length - 2; i >= 0; i -= 1) {
    lines.push(`  wrapped by ← ${describeError(chain[i])}`);
  }

  // Frames only — a stack's first line just repeats the message we already have.
  const frames = err.stack
    ?.split('\n')
    .filter((line) => line.trimStart().startsWith('at '))
    .slice(0, MAX_FRAMES);
  if (frames?.length) lines.push(...frames);

  return lines.join('\n');
}

/**
 * A driver error can quote the connection string it failed on, password and
 * all. Scrub it before anything reaches the logs.
 */
export function redactSecrets(value: string): string {
  return value.replace(/postgres(ql)?:\/\/\S*/gi, 'postgresql://[redacted]');
}

/** Convenience: the two together, in the order every caller wants them. */
export function formatErrorForLog(err: unknown): string {
  return redactSecrets(errorDetail(err));
}
