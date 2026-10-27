/**
 * The deploy guard (scripts/check-deploy-branch.mts) against real, throwaway git
 * repositories: a bare "GitHub" and a working clone, in the temp folder.
 */

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, test } from 'node:test';
import { checkDeployBranch } from '../scripts/check-deploy-branch.mts';

const root = mkdtempSync(join(tmpdir(), 'kk-guard-'));
after(() => rmSync(root, { recursive: true, force: true }));

let n = 0;
const git = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
function put(cwd: string, file: string, text: string) {
  mkdirSync(dirname(join(cwd, file)), { recursive: true });
  writeFileSync(join(cwd, file), text);
}
function commit(cwd: string, file: string, text: string, msg = 'change') {
  put(cwd, file, text);
  git(cwd, 'add', '-A');
  git(cwd, 'commit', '-q', '-m', msg);
}

/** A "GitHub" with main at one commit, and a clone of it. */
function fixture() {
  const dir = join(root, `case${++n}`);
  const origin = join(dir, 'origin.git');
  const work = join(dir, 'work');
  mkdirSync(dir, { recursive: true });
  git(dir, 'init', '-q', '--bare', '-b', 'main', origin);
  git(dir, 'clone', '-q', origin, work);
  git(work, 'config', 'user.email', 't@example.test');
  git(work, 'config', 'user.name', 'T');
  git(work, 'checkout', '-q', '-b', 'main');
  commit(work, 'app/page.tsx', 'v1', 'first');
  git(work, 'push', '-q', '-u', 'origin', 'main');
  return { origin, work, dir };
}
const check = (cwd: string, extra: { override?: string } = {}) => checkDeployBranch({ cwd, fetch: true, ...extra });

test('main, pushed, clean: allowed', () => {
  const { work } = fixture();
  const r = check(work);
  assert.equal(r.ok, true, r.message);
  assert.match(r.message, /contains origin\/main/);
});

test('files that never ship (CLAUDE.md, AGENTS.md, .claude/, docs, tests) may be dirty or untracked', () => {
  const { work } = fixture();
  commit(work, 'CLAUDE.md', 'a');
  git(work, 'push', '-q', 'origin', 'main');
  put(work, 'CLAUDE.md', 'edited');
  put(work, 'AGENTS.md', 'x');
  put(work, '.claude/settings.json', '{}');
  put(work, 'docs/notes.md', 'x');
  put(work, 'tests/e2e/new.spec.ts', 'x');
  const r = check(work);
  assert.equal(r.ok, true, r.message);
});

test('an old branch that is missing work already on main is refused, and says how much', () => {
  const { work } = fixture();
  git(work, 'checkout', '-q', '-b', 'old');
  git(work, 'push', '-q', '-u', 'origin', 'old');
  git(work, 'checkout', '-q', 'main');
  commit(work, 'app/new.tsx', 'live feature', 'live feature');
  git(work, 'push', '-q', 'origin', 'main');
  git(work, 'checkout', '-q', 'old');
  const r = check(work);
  assert.equal(r.ok, false);
  assert.match(r.message, /old .*missing 1 commit/);
  assert.match(r.message, /remove that work/);
});

test('a feature branch that already contains origin/main and is pushed: allowed', () => {
  const { work } = fixture();
  git(work, 'checkout', '-q', '-b', 'feature');
  commit(work, 'app/feature.tsx', 'f', 'feature');
  git(work, 'push', '-q', '-u', 'origin', 'feature');
  const r = check(work);
  assert.equal(r.ok, true, r.message);
  assert.match(r.message, /feature at /);
});

test('a feature branch is refused once main has moved on without it', () => {
  const { work } = fixture();
  git(work, 'checkout', '-q', '-b', 'feature');
  commit(work, 'app/feature.tsx', 'f', 'feature');
  git(work, 'push', '-q', '-u', 'origin', 'feature');
  git(work, 'checkout', '-q', 'main');
  commit(work, 'app/other.tsx', 'o', 'other work');
  git(work, 'push', '-q', 'origin', 'main');
  git(work, 'checkout', '-q', 'feature');
  assert.equal(check(work).ok, false);
});

test('commits that exist only on this machine are refused', () => {
  const { work } = fixture();
  commit(work, 'app/local-only.tsx', 'x', 'not pushed');
  const r = check(work);
  assert.equal(r.ok, false);
  assert.match(r.message, /not on GitHub/);
  git(work, 'push', '-q', 'origin', 'main');
  assert.equal(check(work).ok, true, 'fine once pushed');
});

test('a detached HEAD on a pushed commit is allowed; on an unpushed one it is not', () => {
  const { work } = fixture();
  git(work, 'checkout', '-q', '--detach');
  assert.equal(check(work).ok, true);
  commit(work, 'app/x.tsx', 'x', 'detached work');
  const r = check(work);
  assert.equal(r.ok, false);
  assert.match(r.message, /detached HEAD/);
});

test('edited, staged or untracked files that would be built are refused, by name', () => {
  const { work } = fixture();
  put(work, 'app/page.tsx', 'edited but not committed');
  let r = check(work);
  assert.equal(r.ok, false);
  assert.match(r.message, /app\/page\.tsx/);
  git(work, 'checkout', '--', 'app/page.tsx');

  put(work, 'next.config.mjs', 'x');
  git(work, 'add', 'next.config.mjs');
  r = check(work);
  assert.equal(r.ok, false);
  assert.match(r.message, /next\.config\.mjs/);
  git(work, 'reset', '-q', '--hard');
  git(work, 'clean', '-fdq');

  put(work, 'app/brand-new.tsx', 'untracked');
  r = check(work);
  assert.equal(r.ok, false);
  assert.match(r.message, /app\/brand-new\.tsx/);
});

test('it fails closed when origin/main cannot be fetched, and says how to deploy deliberately', () => {
  const { work, dir } = fixture();
  git(work, 'remote', 'set-url', 'origin', join(dir, 'does-not-exist.git'));
  const r = check(work);
  assert.equal(r.ok, false);
  assert.match(r.message, /KK_DEPLOY_OVERRIDE/);
});

test('the override needs a reason, prints it, and skips every other check', () => {
  const { work } = fixture();
  commit(work, 'app/local-only.tsx', 'x', 'not pushed');
  put(work, 'app/dirty.tsx', 'x');
  assert.equal(check(work, { override: '' }).ok, false, 'an empty reason does not count');
  assert.equal(check(work, { override: '   ' }).ok, false);
  const r = check(work, { override: 'rolling back to the 21 Oct release' });
  assert.equal(r.ok, true);
  assert.match(r.message, /WARNING.*bypassed.*rolling back to the 21 Oct release/);
});

test('a repo with no origin/main is refused', () => {
  const dir = join(root, `case${++n}`);
  mkdirSync(dir, { recursive: true });
  git(dir, 'init', '-q', '-b', 'main');
  git(dir, 'config', 'user.email', 't@example.test');
  git(dir, 'config', 'user.name', 'T');
  commit(dir, 'app/a.tsx', 'a');
  const r = checkDeployBranch({ cwd: dir, fetch: false });
  assert.equal(r.ok, false);
  assert.match(r.message, /no origin\/main/);
});
