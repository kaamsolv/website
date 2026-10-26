/**
 * Prints the HOST of the DATABASE_URL in this command's environment — and nothing else — so a runbook can do
 * `$h = (npm run --silent db:host)` without hand-parsing a connection string that may contain special characters
 * in its password. Uses the same URL parser the migration tools use, so what it prints is exactly what `--expect-host`
 * is compared against. Prints "unreadable" (never the string, never a piece of it) when the value can't be parsed or
 * the part that would be printed doesn't look like a hostname, and "unset" when there is none. Special characters in a
 * password must be percent-encoded (@ → %40, # → %23, / → %2F, ? → %3F), as Neon's connection strings already are.
 * Reads no .env file and contacts nothing.
 *
 *   node db/print-host.mts
 */

// An explicit module (no imports to say so), so Node's parser — and `node --check` — treat the file as TypeScript-in-ESM.
export {};

const url = process.env.DATABASE_URL?.trim();
if (!url) {
  console.log('unset');
  process.exit(1);
}
// A real database host is a full name (it has dots), an IP address, or localhost. Anything else is a sign the URL was split
// early — a raw "#", "/" or "?" in the password ends the host part there, and what is left over would be a piece of the
// password. Such a value is never printed.
const looksLikeHost = (host: string) => host.includes('.') || host.includes(':') || host === 'localhost';
try {
  const host = new URL(url).hostname;
  if (!host || !looksLikeHost(host)) throw new Error('not a host');
  console.log(host);
} catch {
  console.log('unreadable');
  process.exit(1);
}
