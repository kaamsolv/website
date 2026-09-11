import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_QR_DESIGN } from '../app/lib/qr/design.ts';
import { createMatrix } from '../app/lib/qr/matrix.ts';
import { scanabilityReport } from '../app/lib/qr/scanability.ts';

test('blocks low contrast colours', () => {
  const matrix = createMatrix('https://example.com', 'M');
  const design = {
    ...DEFAULT_QR_DESIGN,
    colors: { fg: '#CCCCCC', bg: '#DDDDDD', transparent: false },
  };
  const r = scanabilityReport(matrix, design);
  assert.equal(r.canExport, false);
  assert.ok(r.issues.some((i) => i.code === 'fg-contrast'));
});

test('warns on transparent background', () => {
  const matrix = createMatrix('https://example.com', 'M');
  const design = {
    ...DEFAULT_QR_DESIGN,
    colors: { fg: '#0C2248', bg: '#FFFFFF', transparent: true },
  };
  const r = scanabilityReport(matrix, design);
  assert.equal(r.canExport, true);
  assert.ok(r.issues.some((i) => i.code === 'transparent-bg'));
});

test('warns on small export size', () => {
  const matrix = createMatrix('https://example.com', 'M');
  const r = scanabilityReport(matrix, DEFAULT_QR_DESIGN, 256);
  assert.ok(r.issues.some((i) => i.code === 'export-small'));
});

test('logo forces high EC check passes with H', () => {
  const matrix = createMatrix('https://example.com', 'H');
  const design = {
    ...DEFAULT_QR_DESIGN,
    errorCorrection: 'H',
    logo: { dataUrl: 'data:image/png;base64,x', size: 'm' as const },
  };
  const r = scanabilityReport(matrix, design);
  assert.equal(r.canExport, true);
});
