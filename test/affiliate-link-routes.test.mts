/**
 * Referral links live at kaamsolv.com/{business}/{code}. A business address that is also a real top-level path would be
 * shadowed (or would shadow a page), so every routable top-level path is read from the real app folder and must be
 * refused as a business address. A new page added tomorrow fails this test until it is reserved.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { checkSlug } from '../app/lib/affiliate/merchant.ts';
import { CONVERTER_SLUGS } from '../app/lib/image/types.ts';

const root = join(import.meta.dirname, '..');
const appDir = join(root, 'app');

/** Top-level path names: folders under app/ (route groups are transparent), plus metadata routes (robots, sitemap, icon). */
function topLevel(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) {
      if (e.name.startsWith('(') && e.name.endsWith(')')) out.push(...topLevel(join(dir, e.name)));
      else if (!e.name.startsWith('_') && !e.name.startsWith('[') && !e.name.startsWith('@')) out.push(e.name);
    } else {
      const m = /^(robots|sitemap|manifest|icon|apple-icon|opengraph-image|twitter-image|favicon)\.(ts|tsx|ico|svg|png|jpg|txt|xml)$/.exec(e.name);
      if (m) out.push(m[1]);
    }
  }
  return out;
}

test('every routable top-level path is refused as a business address', () => {
  const NOT_PAGES = new Set(['components', 'lib']); // code folders, not routes
  const paths = topLevel(appDir).filter((p) => !NOT_PAGES.has(p));
  assert.ok(paths.includes('tools') && paths.includes('affiliate') && paths.includes('api'), 'the scan found the real folders');
  const open: string[] = [];
  for (const p of paths) {
    const slugLike = p.toLowerCase();
    // Names shorter than 3 characters can't be addresses at all (the slug rule needs 3 to 40).
    if (slugLike.length < 3) continue;
    if (checkSlug(slugLike).ok) open.push(slugLike);
  }
  assert.deepEqual(open, [], 'these top-level paths could be taken as a business address');
});

test('every image converter slug is refused as a business address', () => {
  for (const slug of CONVERTER_SLUGS) assert.equal(checkSlug(slug).ok, false, slug);
});

test('a normal business address is still fine', () => {
  for (const slug of ['wandernest-tales', 'riverbank-travel', 'asha-crafts']) assert.equal(checkSlug(slug).ok, true, slug);
  assert.equal(checkSlug('tools').ok, false);
});

test('only one dynamic folder at the app root, so the link route can sit inside it', () => {
  const dynamicAtRoot = readdirSync(appDir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && e.name.startsWith('['))
    .map((e) => e.name);
  assert.deepEqual(dynamicAtRoot, ['[shortCode]']);
  assert.ok(existsSync(join(appDir, '[shortCode]', '[code]', 'route.ts')), 'the referral-link route exists');
  assert.ok(existsSync(join(appDir, '[shortCode]', 'route.ts')), 'the short-link route is untouched');
});
