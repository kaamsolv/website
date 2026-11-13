import assert from 'node:assert/strict';
import { test } from 'node:test';
import { APPS, featuredApps } from '../app/lib/apps.ts';
import { TOOLS } from '../app/lib/catalogue.ts';
import { BTN, INPUT, PRIMARY, SECONDARY } from '../app/lib/ui-classes.ts';

test('every featured application stands on live catalogue tools and has a real route', () => {
  const shown = featuredApps();
  assert.deepEqual(shown.map((a) => a.id), ['qr', 'invoice', 'pdf']);
  for (const a of shown) {
    assert.ok(a.href.startsWith('/'), a.name);
    for (const slug of a.needs) assert.equal(TOOLS.find((t) => t.slug === slug)?.status, 'live', `${a.name} needs ${slug}`);
  }
  assert.equal(new Set(APPS.map((a) => a.id)).size, APPS.length, 'unique ids');
});

test('the shared class strings are intact and still re-exported by the account shell', async () => {
  assert.ok(PRIMARY.startsWith(BTN) && SECONDARY.startsWith(BTN));
  assert.match(INPUT, /h-12/);
  const shell = await import('node:fs').then((fs) => fs.readFileSync(new URL('../app/_components/account/account-shell.tsx', import.meta.url), 'utf8'));
  assert.match(shell, /export \{ BTN, PRIMARY, SECONDARY, INPUT \} from '@\/app\/lib\/ui-classes'/);
});
