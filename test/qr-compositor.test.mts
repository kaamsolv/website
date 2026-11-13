import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_QR_DESIGN } from '../app/lib/qr/design.ts';
import { buildModuleOps } from '../app/lib/qr/compositor/draw-modules.ts';
import { renderArtboardSvg } from '../app/lib/qr/compositor/render-svg.ts';
import { createMatrix } from '../app/lib/qr/matrix.ts';

const TEXT = 'https://example.com';

test('square modules produce rect elements', () => {
  const matrix = createMatrix(TEXT, 'M');
  const ops = buildModuleOps(matrix, 4, 8, 0, 0, 'square', 'square');
  assert.ok(ops.length > 0);
  assert.ok(ops.every((o) => o.kind === 'square'));
});

test('dots modules produce circles', () => {
  const matrix = createMatrix(TEXT, 'M');
  const ops = buildModuleOps(matrix, 4, 8, 0, 0, 'dots', 'square');
  assert.ok(ops.some((o) => o.kind === 'circle'));
});

test('rounded modules produce roundRect', () => {
  const matrix = createMatrix(TEXT, 'M');
  const ops = buildModuleOps(matrix, 4, 8, 0, 0, 'rounded', 'rounded');
  assert.ok(ops.some((o) => o.kind === 'roundRect'));
});

test('SVG includes modules group', () => {
  const matrix = createMatrix(TEXT, 'M');
  const svg = renderArtboardSvg(matrix, DEFAULT_QR_DESIGN, 200);
  assert.match(svg, /<svg/);
  assert.match(svg, /id="qr-modules"/);
});

test('SVG embeds logo when present', () => {
  const matrix = createMatrix(TEXT, 'H');
  const design = {
    ...DEFAULT_QR_DESIGN,
    logo: { dataUrl: 'data:image/png;base64,TEST', size: 'm' as const },
  };
  const svg = renderArtboardSvg(matrix, design, 200);
  assert.match(svg, /<image/);
  assert.match(svg, /data:image\/png;base64,TEST/);
});

test('SVG includes CTA for scan-me frame', () => {
  const matrix = createMatrix(TEXT, 'M');
  const design = {
    ...DEFAULT_QR_DESIGN,
    frame: { id: 'scan-me' as const, ctaText: 'Scan Me' },
  };
  const svg = renderArtboardSvg(matrix, design, 200);
  assert.match(svg, /<text/);
  assert.match(svg, /Scan Me/);
});

test('SVG includes frame border when set', () => {
  const matrix = createMatrix(TEXT, 'M');
  const design = {
    ...DEFAULT_QR_DESIGN,
    frame: { id: 'border' as const },
  };
  const svg = renderArtboardSvg(matrix, design, 200);
  assert.match(svg, /stroke=/);
});

test('square modules touch: no gap between neighbours (a gap drew a hairline grid across the code)', () => {
  const matrix = createMatrix(TEXT, 'M');
  const ops = buildModuleOps(matrix, 4, 8, 0, 0, 'square', 'square');
  const byRow = new Map<number, typeof ops>();
  for (const o of ops) byRow.set(o.y, [...(byRow.get(o.y) ?? []), o]);
  let touching = 0;
  for (const row of byRow.values()) {
    const sorted = [...row].sort((a, b) => a.x - b.x);
    for (let i = 1; i < sorted.length; i++) if (Math.abs(sorted[i - 1].x + sorted[i - 1].w - sorted[i].x) < 1e-9) touching += 1;
    for (const o of row) assert.equal(o.w, 8, 'a square module fills its whole cell');
  }
  assert.ok(touching > 20, 'there are many touching neighbours');
});

test('SVG draws square modules as one path, other shapes as their own elements', () => {
  const matrix = createMatrix(TEXT, 'M');
  const square = renderArtboardSvg(matrix, DEFAULT_QR_DESIGN, 200);
  const group = /<g id="qr-modules">([\s\S]*?)<\/g>/.exec(square)![1];
  assert.equal((group.match(/<path /g) ?? []).length, 1);
  assert.equal((group.match(/<rect /g) ?? []).length, 0);
  const dots = renderArtboardSvg(matrix, { ...DEFAULT_QR_DESIGN, modules: { ...DEFAULT_QR_DESIGN.modules, shape: 'dots' as const } }, 200);
  assert.ok((/<g id="qr-modules">([\s\S]*?)<\/g>/.exec(dots)![1].match(/<circle /g) ?? []).length > 20);
});
