/**
 * Pre-deploy guard (docs/infra/deployment.md → "Deploy guard"). Run first by
 * `npm run cf:deploy`, before the slow build.
 *
 * A deploy ships whatever is in this checkout. Twice that quietly removed live
 * features because the checkout lacked work that was already on `main`. This
 * refuses a deploy unless:
 *
 *   1. the checkout contains everything on origin/main (nothing live can be dropped),
 *   2. the commit being shipped is on GitHub (production never runs code that exists only on one machine),
 *   3. nothing that gets built differs from that commit (no uncommitted or untracked app/db/config files).
 *
 * Files that never ship (CLAUDE.md, AGENTS.md, .claude/, docs/, tests) don't count as changes.
 *
 * Deliberate exception (a rollback to an older commit, say): set
 *   KK_DEPLOY_OVERRIDE="why this is intended"
 * The reason is printed and nothing else is checked.
 *
 * Run with: tsx scripts/check-deploy-branch.mts
 */
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export type CheckResult = { ok: boolean; message: string };

/** Paths whose changes can't change what is built and shipped. */
const NOT_SHIPPED = [/^CLAUDE\.md$/, /^AGENTS\.md$/, /^\.claude\//, /^docs\//, /^tests?\//, /^README\.md$/];

function git(cwd: string, args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function gitOk(cwd: string, args: string[]): boolean {
  try {
    execFileSync('git', args, { cwd, stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/** Files that differ from HEAD (tracked changes and untracked files) and would ship. */
export function shippingChanges(cwd: string): string[] {
  const out = execFileSync('git', ['status', '--porcelain=v1', '-z', '--untracked-files=all'], { cwd, encoding: 'utf8' });
  const files: string[] = [];
  const parts = out.split('\0').filter(Boolean);
  for (let i = 0; i < parts.length; i++) {
    const entry = parts[i];
    const status = entry.slice(0, 2);
    files.push(entry.slice(3));
    if (status[0] === 'R' || status[0] === 'C') i++; // renames carry the old path as the next field
  }
  return files.filter((f) => !NOT_SHIPPED.some((rx) => rx.test(f)));
}

/**
 * The checks themselves. `fetch: true` refreshes origin/main first (a deploy
 * must be judged against GitHub as it is now); it fails closed if that can't be done.
 */
export function checkDeployBranch(opts: { cwd: string; fetch: boolean; override?: string }): CheckResult {
  const { cwd } = opts;
  const reason = (opts.override ?? '').trim();
  if (reason) {
    return { ok: true, message: `WARNING: deploy guard bypassed (KK_DEPLOY_OVERRIDE="${reason}"). Nothing was checked.` };
  }

  if (opts.fetch) {
    try {
      git(cwd, ['fetch', '--quiet', 'origin', 'main']);
    } catch {
      return {
        ok: false,
        message:
          "Couldn't fetch origin/main, so I can't tell whether this checkout would drop live work. Check your connection, " +
          'or deploy deliberately with KK_DEPLOY_OVERRIDE="reason".',
      };
    }
  }
  if (!gitOk(cwd, ['rev-parse', '--verify', '--quiet', 'refs/remotes/origin/main'])) {
    return { ok: false, message: 'There is no origin/main to compare with (no "origin" remote, or it has no main branch).' };
  }

  const head = git(cwd, ['rev-parse', '--short', 'HEAD']);
  const branch = gitOk(cwd, ['symbolic-ref', '--quiet', 'HEAD']) ? git(cwd, ['symbolic-ref', '--short', 'HEAD']) : 'a detached HEAD';

  if (!gitOk(cwd, ['merge-base', '--is-ancestor', 'refs/remotes/origin/main', 'HEAD'])) {
    const behind = git(cwd, ['rev-list', '--count', 'HEAD..refs/remotes/origin/main']);
    return {
      ok: false,
      message:
        `${branch} (${head}) is missing ${behind} commit(s) that are on origin/main. Deploying it would remove that work from the live site. ` +
        'Merge origin/main into it (or deploy from main) and try again.',
    };
  }

  const onGitHub = git(cwd, ['branch', '-r', '--contains', 'HEAD']).split('\n').some((l) => l.trim() && !l.includes('->'));
  if (!onGitHub) {
    return {
      ok: false,
      message: `${branch} (${head}) has commits that are not on GitHub. Push first, so the live site never runs code that exists only on this machine.`,
    };
  }

  const changed = shippingChanges(cwd);
  if (changed.length) {
    const shown = changed.slice(0, 8).join(', ') + (changed.length > 8 ? `, … (${changed.length} files)` : '');
    return {
      ok: false,
      message: `Uncommitted or untracked files would be built into this deploy but are not in ${head}: ${shown}. Commit them (and push) or remove them.`,
    };
  }

  return { ok: true, message: `Deploying ${branch} at ${head}: contains origin/main, is on GitHub, and the build tree matches it.` };
}

function main(): void {
  const cwd = resolve(import.meta.dirname, '..');
  const result = checkDeployBranch({ cwd, fetch: true, override: process.env.KK_DEPLOY_OVERRIDE });
  console.log(`${result.ok ? '[deploy guard]' : '[deploy guard] FAILED:'} ${result.message}`);
  if (!result.ok) {
    console.error('Deploy stopped before the build. See docs/infra/deployment.md → Deploy guard.');
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
