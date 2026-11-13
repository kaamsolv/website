/**
 * Small coloured text must reach WCAG AA (4.5:1) on the surfaces it actually sits on, in both themes.
 * Reads the token values straight from app/globals.css so the check follows the real CSS.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const css = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8');

function block(selector: string): Record<string, string> {
  const start = css.indexOf(selector);
  assert.ok(start >= 0, selector);
  const body = css.slice(css.indexOf('{', start) + 1, css.indexOf('\n}', start));
  const out: Record<string, string> = {};
  for (const m of body.matchAll(/--([a-z0-9-]+):\s*(#[0-9A-Fa-f]{6})/g)) out[m[1]] = m[2];
  return out;
}

const light = block(':root {');
const dark = { ...light, ...block('[data-theme="dark"] {') };

const lum = (hex: string) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const ratio = (a: string, b: string) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

// Where small coral and teal text really appears: plain surfaces, the page canvas, the hover wash, and their own tints.
const SURFACES: Record<string, string[]> = {
  coral: ['canvas', 'surface', 'surface-raised', 'wash', 'coral-tint'],
  teal: ['canvas', 'surface', 'surface-raised', 'wash', 'teal-tint'],
};

for (const [themeName, theme] of [['light', light], ['dark', dark]] as const) {
  for (const hue of ['coral', 'teal'] as const) {
    test(`${hue} accent text reaches 4.5:1 on its surfaces (${themeName} theme)`, () => {
      const text = theme[`${hue}-accent`];
      assert.ok(text, `${hue}-accent`);
      for (const s of SURFACES[hue]) {
        const bg = theme[s];
        assert.ok(bg, s);
        const r = ratio(text, bg);
        assert.ok(r >= 4.5, `${hue} text ${text} on ${s} ${bg} is ${r.toFixed(2)}:1`);
      }
    });
  }
}

test('brand fills are untouched: coral-500 and teal-500 are still the approved hues', () => {
  assert.match(css, /--color-coral-500:\s*#FE6336/);
  assert.match(css, /--color-teal-500:\s*#38BBAC/);
  assert.match(css, /--color-navy-900:\s*#0C2248/);
});
