import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_QR_DESIGN } from '../app/lib/qr/design.ts';
import { PRESETS, applyPreset, getPreset } from '../app/lib/qr/presets.ts';

test('all six presets exist', () => {
  assert.equal(PRESETS.length, 6);
  const ids = PRESETS.map((p) => p.id);
  assert.ok(ids.includes('classic'));
  assert.ok(ids.includes('minimal'));
  assert.ok(ids.includes('business'));
  assert.ok(ids.includes('payment'));
  assert.ok(ids.includes('whatsapp'));
  assert.ok(ids.includes('restaurant'));
});

test('applyPreset changes design not logo', () => {
  const withLogo = {
    ...DEFAULT_QR_DESIGN,
    logo: { dataUrl: 'data:image/png;base64,abc', size: 'm' as const },
  };
  const next = applyPreset(withLogo, 'restaurant');
  assert.equal(next.presetId, 'restaurant');
  assert.equal(next.frame.id, 'view-menu');
  assert.equal(next.logo?.dataUrl, 'data:image/png;base64,abc');
});

test('getPreset returns valid design configuration', () => {
  const p = getPreset('payment');
  assert.equal(p.design.frame.id, 'pay-here');
  assert.equal(p.design.modules.shape, 'square');
});
