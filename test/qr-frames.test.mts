import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CTA_MAX_LENGTH, defaultCtaText, frameHasCta, resolveCtaText, sanitizeCtaInput } from '../app/lib/qr/frames.ts';
import { computeArtboardLayout } from '../app/lib/qr/compositor/artboard.ts';
import { createMatrix } from '../app/lib/qr/matrix.ts';
import { DEFAULT_QR_DESIGN } from '../app/lib/qr/design.ts';

test('CTA frames have defaults', () => {
  assert.equal(defaultCtaText('pay-here'), 'Pay Here');
  assert.equal(defaultCtaText('none'), null);
});

test('CTA text is capped at 24 characters', () => {
  const long = 'A'.repeat(30);
  assert.equal(sanitizeCtaInput(long).length, CTA_MAX_LENGTH);
  assert.equal(resolveCtaText('scan-me', long)?.length, CTA_MAX_LENGTH);
});

test('border frame has no CTA', () => {
  assert.equal(frameHasCta('border'), false);
  assert.equal(resolveCtaText('border'), null);
});

test('artboard layout preserves quiet zone outside frame', () => {
  const matrix = createMatrix('https://example.com', 'M');
  const design = {
    ...DEFAULT_QR_DESIGN,
    frame: { id: 'scan-me' as const, ctaText: 'Scan Me' },
  };
  const layout = computeArtboardLayout(matrix, design, 200);
  assert.ok(layout.qrOffsetX >= layout.framePadPx);
  assert.equal(design.quietZoneModules, 4);
});
