/**
 * `npm run typecheck` covers only .ts and .tsx (tsconfig.json), so a syntax error in a .mts tool — the migration
 * runner, the rehearsal scripts, the test files — would pass it. This parses every .mts file in the repo with
 * `node --check` (Node's own parser, type stripping included). It checks syntax only; it does not resolve imports or
 * check types, and the tools' behaviour is covered by test/db-tools-safety.test.mts.
 */

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { test } from 'node:test';

const ROOT = resolve(import.meta.dirname, '..');
const SKIP = new Set(['node_modules', '.next', '.open-next', '.git', '.pglite', '.pglite-e2e', '.wrangler', 'test-results', '.claude']);

function mtsFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (e.isDirectory()) return SKIP.has(e.name) ? [] : mtsFiles(join(dir, e.name));
    return e.name.endsWith('.mts') ? [join(dir, e.name)] : [];
  });
}

test('every .mts file in the repo parses', () => {
  const files = mtsFiles(ROOT);
  assert.ok(files.length > 20, `found the repo's .mts files (${files.length})`);
  for (const must of ['db/migrate-atomic.mts', 'db/prepare-rehearsal.mts', 'db/migrate.mts', 'scripts/rehearse-payments.mts', 'test/mts-syntax.test.mts']) {
    assert.ok(files.some((f) => relative(ROOT, f).replace(/\\/g, '/') === must), `${must} is checked`);
  }
  const broken: string[] = [];
  for (const file of files) {
    const r = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8', timeout: 30_000 });
    if (r.status !== 0) broken.push(`${relative(ROOT, file)}: ${(r.stderr.match(/\w*Error: [^\n]*/)?.[0] ?? r.stderr).slice(0, 160)}`);
  }
  assert.deepEqual(broken, [], 'no .mts file has a syntax error');
});

test('every command-line entry point loads — its imports resolve and it reaches its first refusal — with no syntax or module error', () => {
  // Run with an empty environment: each must stop at its own "no DATABASE_URL" refusal, which it can only reach if the
  // whole module graph loaded. (db/migrate.mts is deliberately NOT run: with no DATABASE_URL it would migrate a local database.)
  const entries: [string, string[], RegExp, boolean][] = [
    ['db/migrate-atomic.mts', ['--expect-host', 'x'], /DATABASE_URL is not set/, false],
    ['db/prepare-rehearsal.mts', ['--expect-host', 'x', '--non-production'], /DATABASE_URL is not set/, false],
    ['db/print-host.mts', [], /^unset/, false],
    ['scripts/rehearse-payments.mts', ['--expect-host', 'x', '--non-production'], /Set DATABASE_URL/, true],
  ];
  const env = { PATH: process.env.PATH ?? '', SystemRoot: process.env.SystemRoot ?? '', TEMP: process.env.TEMP ?? '', NODE_NO_WARNINGS: '1' };
  for (const [file, args, expected, viaTsx] of entries) {
    const nodeArgs = viaTsx ? ['--import', import.meta.resolve('tsx'), resolve(ROOT, file), ...args] : [resolve(ROOT, file), ...args];
    const r = spawnSync(process.execPath, nodeArgs, { cwd: ROOT, env, encoding: 'utf8', timeout: 60_000 });
    const text = `${r.stdout}${r.stderr}`;
    assert.ok(!/SyntaxError|ERR_MODULE_NOT_FOUND|ERR_UNSUPPORTED|Cannot find|is not a function/.test(text), `${file} loads: ${text.slice(0, 240)}`);
    assert.match(text.trim(), expected, `${file} reached its first refusal`);
    assert.equal(r.status, 1, file);
  }
});
