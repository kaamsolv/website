/**
 * One-off production database setup for the URL Shortener — run by the owner:
 *
 *   node db/setup-production.mjs
 *
 * 1. Asks for the Neon connection string (input hidden, never printed or saved
 *    to disk — only the host is shown).
 * 2. Applies db/migrations/ to that database (`db/migrate.mts`).
 * 3. Stores it as the `DATABASE_URL` secret on the `kaamsolv` Cloudflare Worker.
 * 4. Generates a random `KK_IP_HASH_SALT` and stores it as a Worker secret
 *    (skip with --keep-salt to leave an existing salt alone).
 *
 * Needs `wrangler login` first. Uses only Node built-ins.
 */

import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import readline from 'node:readline';

const REPO = resolve(import.meta.dirname, '..');
// Main checkout: its wrangler.jsonc names the production `kaamsolv` Worker.
const MAIN = resolve(REPO, '..', 'KaamSolv');
const keepSalt = process.argv.includes('--keep-salt');

function ask(question, { hidden = false } = {}) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  if (hidden) {
    rl._writeToOutput = (s) => {
      if (s.startsWith(question)) rl.output.write(question);
      else if (s.includes('\n') || s.includes('\r')) rl.output.write('\n');
      else rl.output.write('*');
    };
  }
  return new Promise((done) =>
    rl.question(question, (answer) => {
      rl.close();
      done(answer.trim());
    }),
  );
}

function run(command, args, { cwd, env, input, shell = false } = {}) {
  return new Promise((done) => {
    // With a shell, pass one fixed command line (never user input): the shell
    // would otherwise split unquoted paths such as C:\Program Files\….
    const child = spawn(shell ? [command, ...args].join(' ') : command, shell ? [] : args, {
      cwd,
      env: { ...process.env, ...env },
      shell,
      stdio: [input === undefined ? 'inherit' : 'pipe', 'inherit', 'inherit'],
    });
    if (input !== undefined) child.stdin.end(input);
    child.on('close', (code) => done(code ?? 1));
  });
}

function putSecret(name, value) {
  // npx is a .cmd shim on Windows, which needs a shell to start.
  const windows = process.platform === 'win32';
  return run(windows ? 'npx.cmd' : 'npx', ['wrangler', 'secret', 'put', name], {
    cwd: MAIN,
    input: value,
    shell: windows,
  });
}

if (!existsSync(resolve(MAIN, 'wrangler.jsonc'))) {
  console.error(`Can't find the main KaamSolv checkout at ${MAIN}.`);
  process.exit(1);
}

console.log('\nKaamSolv — URL Shortener production database setup\n');
const url = await ask('Paste the Neon connection string (hidden): ', { hidden: true });

let host;
try {
  const parsed = new URL(url);
  if (!/^postgres(ql)?:$/.test(parsed.protocol) || !parsed.password) throw new Error();
  host = parsed.hostname;
} catch {
  console.error('\nThat doesn\'t look like a Postgres connection string (postgresql://user:password@host/db). Nothing was changed.');
  process.exit(1);
}

console.log(`\nDatabase host: ${host}`);
if (!host.endsWith('.neon.tech')) console.log('Note: this is not a neon.tech host.');
if ((await ask('Set up this database for kaamsolv.com? (y/n) ')).toLowerCase() !== 'y') {
  console.log('Stopped. Nothing was changed.');
  process.exit(0);
}

console.log('\n[1/3] Creating tables…');
if ((await run(process.execPath, ['db/migrate.mts'], { cwd: REPO, env: { DATABASE_URL: url } })) !== 0) {
  console.error('\nMigrations failed — see the error above. Cloudflare secrets were not changed.');
  process.exit(1);
}

console.log('\n[2/3] Saving DATABASE_URL to the kaamsolv Worker…');
if ((await putSecret('DATABASE_URL', url)) !== 0) {
  console.error('\nCould not save DATABASE_URL. Is `npx.cmd wrangler login` done?');
  process.exit(1);
}

if (keepSalt) {
  console.log('\n[3/3] Keeping the existing KK_IP_HASH_SALT.');
} else {
  console.log('\n[3/3] Saving a new random KK_IP_HASH_SALT to the kaamsolv Worker…');
  if ((await putSecret('KK_IP_HASH_SALT', randomBytes(32).toString('base64url'))) !== 0) {
    console.error('\nCould not save KK_IP_HASH_SALT.');
    process.exit(1);
  }
}

console.log('\nDone. The database is ready and the Worker has its secrets.');
