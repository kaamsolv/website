import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument, degrees } from '@cantoo/pdf-lib';
import { buildFromPages, extractGroups } from '../app/lib/pdf/organize.ts';
import { chunkPages, evenPages, formatPageRanges, oddPages, parsePageRanges, singlePages } from '../app/lib/pdf/ranges.ts';
import { describeEdit, editReducer, initEdit, isEdited, toPlan, type EditAction, type EditState } from '../app/lib/pdf/page-edit.ts';
import { labelledPdf } from './helpers/pdf-fixtures.mts';

/** labelledPdf makes page i (0-based) of a file 200 + i points wide, so widths tell pages apart. */
const widths = async (bytes: Uint8Array) => (await PDFDocument.load(bytes)).getPages().map((p) => Math.round(p.getWidth()));
const angles = async (bytes: Uint8Array) => (await PDFDocument.load(bytes)).getPages().map((p) => p.getRotation().angle);

test('buildFromPages: rotate, delete and reorder in one pass, nothing else disturbed', async () => {
  const src = await labelledPdf('A', 5); // widths 200..204
  const out = await buildFromPages(src, [
    { index: 3, rotate: 90 },
    { index: 0, rotate: 0 },
    { index: 4, rotate: 270 },
  ]);
  assert.deepEqual(await widths(out), [203, 200, 204]);
  assert.deepEqual(await angles(out), [90, 0, 270]);
  const doc = await PDFDocument.load(out, { updateMetadata: false });
  assert.match(doc.getProducer() ?? '', /KaamSolv/);
});

test('buildFromPages: rotation adds to what the page already had, and wraps at 360', async () => {
  const doc = await PDFDocument.create();
  doc.addPage([300, 400]).setRotation(degrees(90));
  doc.addPage([300, 400]).setRotation(degrees(270));
  const out = await buildFromPages(await doc.save(), [
    { index: 0, rotate: 90 },
    { index: 1, rotate: 180 },
  ]);
  assert.deepEqual(await angles(out), [180, 90]);
});

test('buildFromPages: the same page can’t be asked for out of range, and an empty plan is refused', async () => {
  const src = await labelledPdf('A', 2);
  await assert.rejects(() => buildFromPages(src, []), /at least one page/);
  await assert.rejects(() => buildFromPages(src, [{ index: 2, rotate: 0 }]), /isn’t in this PDF/);
  await assert.rejects(() => buildFromPages(src, [{ index: -1, rotate: 0 }]), /isn’t in this PDF/);
  await assert.rejects(() => buildFromPages(src, [{ index: 0, rotate: 45 }]), /90 degrees/);
});

test('extractGroups: one PDF per group, in the groups’ own order, source loaded once', async () => {
  const src = await labelledPdf('A', 7);
  const progress: number[] = [];
  const out = await extractGroups(src, chunkPages(7, 3), (d) => progress.push(d));
  assert.equal(out.length, 3);
  assert.deepEqual(await widths(out[0]), [200, 201, 202]);
  assert.deepEqual(await widths(out[2]), [206]);
  assert.deepEqual(progress, [1, 2, 3]);
  const each = await extractGroups(src, singlePages(7));
  assert.equal(each.length, 7);
  assert.deepEqual(await widths(each[4]), [204]);
  await assert.rejects(() => extractGroups(src, []), /Nothing to split/);
  await assert.rejects(() => extractGroups(src, [[9]]), /isn’t in this PDF/);
});

test('page ranges: the usual forms, open ends, spaces and repeats', () => {
  const ok = (text: string, count: number) => {
    const r = parsePageRanges(text, count);
    assert.ok(r.ok, JSON.stringify(r));
    return r.ok ? r.pages.map((i) => i + 1) : [];
  };
  assert.deepEqual(ok('1-3, 5', 10), [1, 2, 3, 5]);
  assert.deepEqual(ok('8-', 10), [8, 9, 10]);
  assert.deepEqual(ok('-3', 10), [1, 2, 3]);
  assert.deepEqual(ok('  2 - 4 ; 4,2 7 ', 10), [2, 3, 4, 7]);
  assert.deepEqual(ok('5', 5), [5]);
  assert.deepEqual(ok('', 5), []);
  assert.deepEqual(ok('   ', 5), []);
});

test('page ranges: wrong input gets a plain sentence, never a crash', () => {
  const bad = (text: string, count = 10) => {
    const r = parsePageRanges(text, count);
    assert.equal(r.ok, false, text);
    return r.ok ? '' : r.message;
  };
  assert.match(bad('abc'), /isn’t a page or a range/);
  assert.match(bad('1-3-5'), /isn’t a page or a range/);
  assert.match(bad('-'), /isn’t a page or a range/);
  assert.match(bad('0'), /start at 1/);
  assert.match(bad('5-2'), /backwards.*2-5/);
  assert.match(bad('11'), /has 10 pages, so page 11 isn’t there/);
  assert.match(bad('3-12'), /page 12 isn’t there/);
  assert.match(bad('2', 1), /has 1 page, so page 2/);
  assert.match(bad('1e3'), /isn’t a page or a range/);
});

test('page ranges: formatting is the short way back, and odd / even / chunks are right', () => {
  assert.equal(formatPageRanges([0, 1, 2, 4, 7, 8]), '1-3, 5, 8-9');
  assert.equal(formatPageRanges([]), '');
  assert.equal(formatPageRanges([3, 3, 1]), '2, 4');
  assert.deepEqual(oddPages(5), [0, 2, 4]);
  assert.deepEqual(evenPages(5), [1, 3]);
  assert.deepEqual(evenPages(1), []);
  assert.deepEqual(chunkPages(7, 3), [[0, 1, 2], [3, 4, 5], [6]]);
  assert.deepEqual(chunkPages(2, 5), [[0, 1]]);
  assert.deepEqual(chunkPages(3, 0), [[0], [1], [2]]);
  assert.deepEqual(chunkPages(0, 3), []);
});

/** Apply actions in order to a fresh editor of `count` pages. */
const run = (count: number, ...actions: EditAction[]): EditState => actions.reduce(editReducer, initEdit(count));
const order = (s: EditState) => s.pages.map((p) => p.src);

test('page editor: starts as the file is, nothing selected, nothing to undo', () => {
  const s = initEdit(4);
  assert.deepEqual(order(s), [0, 1, 2, 3]);
  assert.equal(isEdited(s), false);
  assert.deepEqual(s.selected, []);
  assert.equal(describeEdit(s), '');
});

test('page editor: select, toggle, select all and clear', () => {
  let s = run(4, { type: 'toggle', src: 1 }, { type: 'toggle', src: 3 });
  assert.deepEqual(s.selected, [1, 3]);
  s = editReducer(s, { type: 'toggle', src: 1 });
  assert.deepEqual(s.selected, [3]);
  s = editReducer(s, { type: 'selectAll' });
  assert.equal(s.selected.length, 4);
  s = editReducer(s, { type: 'clearSelection' });
  assert.deepEqual(s.selected, []);
  s = editReducer(s, { type: 'select', srcs: [2, 2, 9] });
  assert.deepEqual(s.selected, [2]); // repeats and pages that aren’t there are dropped
  assert.equal(s.past.length, 0); // selecting is not an edit
});

test('page editor: rotate one or many pages, in steps that wrap', () => {
  let s = run(3, { type: 'rotate', srcs: [0, 2], by: 90 });
  assert.deepEqual(s.pages.map((p) => p.rotate), [90, 0, 90]);
  s = editReducer(s, { type: 'rotate', srcs: [0], by: 270 });
  assert.equal(s.pages[0].rotate, 0);
  s = editReducer(s, { type: 'rotate', srcs: [2], by: 180 });
  assert.equal(s.pages[2].rotate, 270);
  assert.equal(editReducer(s, { type: 'rotate', srcs: [], by: 90 }), s);
  assert.equal(describeEdit(s), '1 page turned');
});

test('page editor: delete keeps at least one page and drops the page from the selection', () => {
  let s = run(4, { type: 'select', srcs: [1, 2] }, { type: 'delete', srcs: [1] });
  assert.deepEqual(order(s), [0, 2, 3]);
  assert.deepEqual(s.selected, [2]);
  assert.equal(describeEdit(s), '1 page removed');
  const all = editReducer(s, { type: 'delete', srcs: [0, 2, 3] });
  assert.equal(all, s, 'deleting every page is refused');
  s = editReducer(s, { type: 'delete', srcs: [0, 2] });
  assert.deepEqual(order(s), [3]);
  assert.equal(editReducer(s, { type: 'delete', srcs: [3] }), s, 'the last page can’t be deleted');
  assert.equal(describeEdit(s), '3 pages removed');
});

test('page editor: keep only the selected pages (extract)', () => {
  let s = run(5, { type: 'keepOnly', srcs: [1, 3] });
  assert.deepEqual(order(s), [1, 3]);
  assert.equal(editReducer(initEdit(3), { type: 'keepOnly', srcs: [] }).pages.length, 3);
  assert.equal(editReducer(initEdit(3), { type: 'keepOnly', srcs: [0, 1, 2] }).past.length, 0, 'keeping everything is not an edit');
  s = editReducer(s, { type: 'undo' });
  assert.deepEqual(order(s), [0, 1, 2, 3, 4]);
});

test('page editor: move reorders, ignores nonsense, and the plan follows the new order', () => {
  let s = run(4, { type: 'move', from: 0, to: 2 });
  assert.deepEqual(order(s), [1, 2, 0, 3]);
  assert.equal(describeEdit(s), 'order changed');
  assert.equal(editReducer(s, { type: 'move', from: 1, to: 1 }), s);
  assert.equal(editReducer(s, { type: 'move', from: -1, to: 2 }), s);
  assert.equal(editReducer(s, { type: 'move', from: 0, to: 9 }), s);
  s = editReducer(s, { type: 'rotate', srcs: [3], by: 90 });
  assert.deepEqual(toPlan(s), [
    { index: 1, rotate: 0 },
    { index: 2, rotate: 0 },
    { index: 0, rotate: 0 },
    { index: 3, rotate: 90 },
  ]);
});

test('page editor: undo steps back one change at a time, then does nothing', () => {
  let s = run(4, { type: 'rotate', srcs: [0], by: 90 }, { type: 'delete', srcs: [1] }, { type: 'move', from: 0, to: 1 });
  assert.equal(s.past.length, 3);
  s = editReducer(s, { type: 'undo' });
  assert.deepEqual(order(s), [0, 2, 3]);
  s = editReducer(s, { type: 'undo' });
  assert.deepEqual(order(s), [0, 1, 2, 3]);
  assert.equal(s.pages[0].rotate, 90);
  s = editReducer(s, { type: 'undo' });
  assert.equal(isEdited(s), false);
  assert.equal(editReducer(s, { type: 'undo' }), s);
});

test('page editor: reset goes back to the original and can itself be undone', () => {
  let s = run(4, { type: 'rotate', srcs: [0], by: 90 }, { type: 'delete', srcs: [2] }, { type: 'select', srcs: [0] });
  s = editReducer(s, { type: 'reset' });
  assert.equal(isEdited(s), false);
  assert.deepEqual(s.selected, []);
  s = editReducer(s, { type: 'undo' });
  assert.deepEqual(order(s), [0, 1, 3]);
  assert.equal(s.pages[0].rotate, 90);
  const fresh = initEdit(3);
  assert.equal(editReducer(fresh, { type: 'reset' }), fresh);
});

test('page editor: undo history is capped', () => {
  let s = initEdit(2);
  for (let i = 0; i < 80; i++) s = editReducer(s, { type: 'rotate', srcs: [0], by: 90 });
  assert.equal(s.past.length, 50);
});
