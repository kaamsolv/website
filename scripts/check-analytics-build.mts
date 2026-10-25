/**
 * Pre-deploy check for Google Analytics (docs/ANALYTICS.md). Run by
 * `npm run cf:deploy` between `opennextjs-cloudflare build` and `deploy`.
 *
 * NEXT_PUBLIC_GA_ID is baked into the client bundle at build time, so a deploy
 * made without it quietly ships a site with no analytics. This checks the
 * *built* assets, whatever supplied the ID (the committed .env.production, a
 * shell override, or .env.local), using the same env precedence as `next build`.
 *
 *   ok      the resolved ID is a G-… ID and appears in .open-next/assets/_next/static
 *   fail    no ID, a malformed ID, no build output, or the ID is not in the build
 *   opt-out deliberately deploying without analytics needs BOTH
 *             NEXT_PUBLIC_GA_ID=off   (not empty: PowerShell and cmd delete an empty variable)
 *             KK_ALLOW_NO_ANALYTICS=1
 *           Neither alone is enough, and the flag never skips the check when a real ID is set.
 *           The opt-out also scans the build and fails if any GA ID is still baked in.
 *
 * Run with: tsx scripts/check-analytics-build.mts
 */
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

/** Same shape the app accepts (app/lib/analytics.ts). */
const GA_ID = /^G-[A-Z0-9]+$/i;
/** A GA-ID-shaped string literal in minified client code (the inlined NEXT_PUBLIC_GA_ID). */
const GA_ID_LITERAL = /(["'`])G-[A-Z0-9]{6,}\1/;

export type CheckResult = { ok: boolean; message: string };

function* jsFiles(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) yield* jsFiles(full);
    else if (name.endsWith('.js')) yield full;
  }
}

export function checkAnalyticsBuild(opts: {
  /** The resolved NEXT_PUBLIC_GA_ID (after .env files and shell). */
  id: string | undefined;
  /** KK_ALLOW_NO_ANALYTICS === '1' */
  allowNone: boolean;
  /** .open-next/assets/_next/static */
  staticDir: string;
}): CheckResult {
  const id = (opts.id ?? '').trim();

  if (id.toLowerCase() === 'off') {
    if (!opts.allowNone) {
      return {
        ok: false,
        message: 'NEXT_PUBLIC_GA_ID=off means "no analytics". If that is intended, also set KK_ALLOW_NO_ANALYTICS=1.',
      };
    }
    // Opt-out: prove the build really has no analytics ID (not a stale build made with one).
    if (!existsSync(opts.staticDir)) {
      return { ok: false, message: `No build output at ${opts.staticDir}. Run "npx opennextjs-cloudflare build" first.` };
    }
    let seen = 0;
    for (const file of jsFiles(opts.staticDir)) {
      seen++;
      if (GA_ID_LITERAL.test(readFileSync(file, 'utf8'))) {
        return {
          ok: false,
          message:
            'Analytics opt-out requested, but the built client files still contain a GA Measurement ID. ' +
            'The build is stale or was made without NEXT_PUBLIC_GA_ID=off. Rebuild with the same variables you deploy with.',
        };
      }
    }
    if (seen === 0) {
      return { ok: false, message: `${opts.staticDir} has no JavaScript files. The build output is missing or incomplete; rebuild.` };
    }
    return {
      ok: true,
      message: `WARNING: deploying WITHOUT analytics (NEXT_PUBLIC_GA_ID=off, KK_ALLOW_NO_ANALYTICS=1). No GA ID found in the build (${seen} client files scanned).`,
    };
  }
  if (id === '') {
    return {
      ok: false,
      message:
        'NEXT_PUBLIC_GA_ID is not set, so this build would have no analytics. It normally comes from .env.production. ' +
        'To deploy without analytics on purpose, set NEXT_PUBLIC_GA_ID=off and KK_ALLOW_NO_ANALYTICS=1.',
    };
  }
  if (!GA_ID.test(id)) {
    return { ok: false, message: `NEXT_PUBLIC_GA_ID "${id}" is not a GA4 Measurement ID (expected G-XXXXXXXXXX). The site would ignore it.` };
  }
  if (!existsSync(opts.staticDir)) {
    return { ok: false, message: `No build output at ${opts.staticDir}. Run "npx opennextjs-cloudflare build" first.` };
  }

  let scanned = 0;
  for (const file of jsFiles(opts.staticDir)) {
    scanned++;
    if (readFileSync(file, 'utf8').includes(id)) {
      return { ok: true, message: `Analytics ID ${id} is in the build (${scanned} client files scanned).` };
    }
  }
  return {
    ok: false,
    message:
      scanned === 0
        ? `${opts.staticDir} has no JavaScript files. The build output is missing or incomplete; rebuild.`
        : `Analytics ID ${id} is NOT in the built client files (${scanned} scanned). The build is stale or was made with a different ` +
          'NEXT_PUBLIC_GA_ID. Rebuild with the ID you mean to ship.',
  };
}

async function main(): Promise<void> {
  // Same loader and precedence as `next build` (NODE_ENV=production): shell > .env.production.local
  // > .env.local > .env.production > .env.
  const mod = await import('@next/env');
  const loadEnvConfig = mod.loadEnvConfig ?? (mod as unknown as { default: typeof mod }).default.loadEnvConfig;
  const root = resolve(import.meta.dirname, '..');
  loadEnvConfig(root, false, { info() {}, error: console.error });

  const result = checkAnalyticsBuild({
    id: process.env.NEXT_PUBLIC_GA_ID,
    allowNone: process.env.KK_ALLOW_NO_ANALYTICS === '1',
    staticDir: join(root, '.open-next', 'assets', '_next', 'static'),
  });
  console.log(`${result.ok ? '[analytics check]' : '[analytics check] FAILED:'} ${result.message}`);
  if (!result.ok) {
    console.error('Deploy stopped before "opennextjs-cloudflare deploy". See docs/ANALYTICS.md → Deploy.');
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
