/**
 * Shared setup for the standalone db/ scripts (migrate, link-status).
 *
 * Next.js loads .env files for the app, but not for scripts run with plain
 * `node`, so this does the minimum: read `.env.local` then `.env`, never
 * overriding a variable that is already set. No dependency — a tiny hand
 * parser is enough.
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export function loadLocalEnv(): void {
  for (const file of ['.env.local', '.env']) {
    const path = resolve(process.cwd(), file);
    if (!existsSync(path)) continue;
    for (const line of readFileSync(path, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
      if (!m) continue;
      const key = m[1];
      let value = m[2].trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!(key in process.env)) process.env[key] = value;
    }
  }
}

/**
 * Which database a script is about to touch, safe to print: the host only,
 * never the role or password. Scripts show this before doing anything so the
 * operator can see at a glance whether it's a dev branch or production.
 */
export function describeDatabaseTarget(): string {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) return 'local PGlite (.pglite/)';
  try {
    return `Neon — ${new URL(url).hostname}`;
  } catch {
    return 'DATABASE_URL (unparseable — check the value)';
  }
}
