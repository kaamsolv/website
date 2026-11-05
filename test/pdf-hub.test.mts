/**
 * The PDF hub's data: the registry (app/lib/pdf/tools.ts) and the catalogue must agree about what is live,
 * every live tool must have a real page, and no page may be left off the hub.
 */

import assert from 'node:assert/strict';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { TOOLS } from '../app/lib/catalogue.ts';
import { hubSections, popularTasks } from '../app/lib/pdf/hub-data.ts';
import { LIVE_TOOLS, PDF_SECTIONS, PDF_TOOLS, initialAction, pathOf, taskOf } from '../app/lib/pdf/tools.ts';

const ROOT = join(import.meta.dirname, '..');

test('every live registry tool is live in the catalogue, at the same address, with a real page', () => {
  assert.ok(LIVE_TOOLS.length >= 14);
  for (const t of LIVE_TOOLS) {
    const entry = TOOLS.find((c) => c.url === t.path);
    assert.ok(entry, `${t.path} is in the catalogue`);
    assert.equal(entry.status, 'live', `${t.path} is live in the catalogue`);
    assert.equal(entry.slug, t.slug, `${t.path} has the catalogue's slug`);
    assert.equal(entry.category, 'Documents');
    assert.ok(existsSync(join(ROOT, 'app', '(pdf-tools)', t.path.slice(1), 'page.tsx')), `${t.path} has a page`);
  }
});

test('every page in the PDF route group is on the hub (nothing built is left off)', () => {
  const folders = readdirSync(join(ROOT, 'app', '(pdf-tools)'), { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name !== 'pdf-tools')
    .map((d) => `/${d.name}`)
    .sort();
  assert.deepEqual(LIVE_TOOLS.map((t) => t.path).sort(), folders);
});

test('the hub shows five sections in the order asked for, with the right tools in each', () => {
  const sections = hubSections();
  assert.deepEqual(sections.map((s) => s.title), ['Organise PDF', 'Compress & Optimise', 'Convert PDF', 'Secure & Enhance', 'Scan & Extract']);
  const names = (id: string) => sections.find((s) => s.id === id)!.live.map((t) => t.label);
  assert.deepEqual(names('organize'), ['Merge PDF', 'Split PDF', 'Rotate PDF', 'Delete pages', 'Rearrange pages']);
  assert.deepEqual(names('optimize'), ['Compress PDF']);
  assert.deepEqual(names('convert'), ['PDF to JPG', 'PDF to PNG', 'JPG to PDF', 'PDF to Word', 'PDF to Text']);
  assert.deepEqual(names('secure'), ['Protect PDF', 'Watermark PDF', 'Page numbers']);
  assert.deepEqual(names('scan'), []);
  assert.deepEqual(sections.find((s) => s.id === 'scan')!.soon.map((t) => t.label), ['OCR PDF', 'Extract tables', 'Compare PDFs']);
});

test('planned tools never get a link, and live cards use the catalogue’s own words', () => {
  for (const s of hubSections()) {
    for (const t of s.soon) assert.ok(!('href' in t), `${t.label} has no link`);
    for (const t of s.live) {
      assert.ok(t.href.startsWith('/'));
      assert.equal(t.blurb, TOOLS.find((c) => c.url === t.href)!.blurb);
    }
  }
  // No planned PDF tool may share an address with a live one, or with anything in the catalogue's live list.
  assert.ok(PDF_TOOLS.filter((t) => t.status === 'soon').every((t) => !TOOLS.some((c) => c.name.toLowerCase() === t.label.toLowerCase() && c.status === 'live')));
});

test('popular tasks are Merge, Split and Compress, in that order, each with its own section colour', () => {
  const popular = popularTasks();
  assert.deepEqual(popular.map((t) => t.label), ['Merge PDF', 'Split PDF', 'Compress PDF']);
  assert.deepEqual(popular.map((t) => t.accent), ['purple', 'purple', 'coral']);
});

test('the sections use different palette colours and each tool has its own icon', () => {
  assert.equal(new Set(PDF_SECTIONS.map((s) => s.accent)).size, PDF_SECTIONS.length);
  const icons = LIVE_TOOLS.map((t) => t.icon);
  assert.equal(new Set(icons).size, icons.length, 'no two tools share an icon');
});

test('the picker maps stay consistent with the registry', () => {
  for (const t of LIVE_TOOLS) {
    const start = initialAction(t.task);
    assert.equal(taskOf(start.action, start.mode), t.task);
    assert.equal(pathOf(t.task), t.path);
  }
  assert.equal(initialAction('hub').action, 'compress');
});
