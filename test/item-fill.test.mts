/**
 * Stage E — filling an invoice line from a saved item: the rule never overwrites what was typed, never leaves a
 * stale value behind when switching items, and does nothing when the name is ambiguous.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fillFromSavedItem, matchSavedItem, type LineFill, type SavedItemLike } from '../app/lib/invoice/item-fill.ts';
import type { LineItem } from '../app/lib/invoice/types.ts';

const A: SavedItemLike = { id: 'a', name: 'Logo design', hsnSac: '998391', unit: 'pcs', rate: '15000', gstRate: '18' };
const B: SavedItemLike = { id: 'b', name: 'Hosting', hsnSac: '', unit: '', rate: '2500', gstRate: '' };
const C: SavedItemLike = { id: 'c', name: 'Retainer', hsnSac: '', unit: '', rate: '', gstRate: '5' };
const items = [A, B, C];
const blank = (over: Partial<LineItem> = {}): LineItem => ({ id: 'l1', description: '', qty: '1', rate: '', ...over });
const apply = (line: LineItem, description: string, prev: LineFill | undefined, list: SavedItemLike[] = items) => {
  const r = fillFromSavedItem(line, description, list, prev);
  return { line: { ...line, ...r.patch }, ...r };
};

test('matching: exact name, any case, spaces at the ends ignored; partial and empty never match; duplicates are reported', () => {
  assert.equal(matchSavedItem('Logo design', items).kind, 'one');
  assert.equal(matchSavedItem('  LOGO DESIGN ', items).kind, 'one');
  assert.equal(matchSavedItem('Logo', items).kind, 'none', 'a partial name is not a match');
  assert.equal(matchSavedItem('Logo designs', items).kind, 'none');
  assert.equal(matchSavedItem('', items).kind, 'none');
  assert.equal(matchSavedItem('   ', items).kind, 'none');
  const dup = matchSavedItem('hosting', [...items, { ...B, id: 'b2' }]);
  assert.deepEqual(dup, { kind: 'many', count: 2, name: 'Hosting' });
});

test('a blank line takes everything the saved item has', () => {
  const r = apply(blank(), 'Logo design', undefined);
  assert.deepEqual([r.line.description, r.line.rate, r.line.hsn, r.line.unit, r.line.gstRate], ['Logo design', '15000', '998391', 'pcs', '18']);
  assert.deepEqual(r.fill, { itemId: 'a', rate: '15000', hsn: '998391', unit: 'pcs', gstRate: '18' });
  assert.equal(r.hint, null);
  assert.equal(r.line.qty, '1', 'the quantity is never touched');
});

test('what was typed is never overwritten, and the person is told', () => {
  const typed = blank({ rate: '999', hsn: '4321' });
  const r = apply(typed, 'Logo design', undefined);
  assert.deepEqual([r.line.rate, r.line.hsn], ['999', '4321'], 'rate and HSN/SAC stay as typed');
  assert.deepEqual([r.line.unit, r.line.gstRate], ['pcs', '18'], 'the blanks are filled');
  assert.deepEqual(r.fill, { itemId: 'a', rate: null, hsn: null, unit: 'pcs', gstRate: '18' });
  assert.match(r.hint!, /Kept the rate and HSN\/SAC you typed/);
  // The same value typed by hand is not "different": no hint.
  assert.equal(apply(blank({ rate: '15000' }), 'Logo design', undefined).hint, null);
  assert.equal(typed.rate, '999', 'the input line is not changed');
});

test('typing the full name again later restores untouched fields and still leaves edited ones alone', () => {
  const first = apply(blank(), 'Logo design', undefined);
  // The person raises the rate by hand, then edits the description away and back.
  const edited = { ...first.line, rate: '18000' };
  const away = apply(edited, 'Logo design v2', first.fill);
  assert.equal(away.line.rate, '18000');
  assert.deepEqual(away.fill, first.fill, 'no match: the record is kept');
  const back = apply(away.line, 'Logo design', away.fill);
  assert.equal(back.line.rate, '18000', 'the rate they set is not clobbered');
  assert.deepEqual([back.line.hsn, back.line.unit, back.line.gstRate], ['998391', 'pcs', '18']);
  assert.match(back.hint!, /Kept the rate you typed/);
});

test('switching to another saved item replaces the first one’s values — and clears ones the new item doesn’t have', () => {
  const first = apply(blank(), 'Logo design', undefined);
  const next = apply(first.line, 'Hosting', first.fill);
  assert.deepEqual([next.line.rate, next.line.hsn, next.line.unit, next.line.gstRate], ['2500', '', '', ''], 'no stale HSN/SAC, unit or GST rate from the logo item');
  assert.equal(next.hint, null);
  const third = apply(next.line, 'Retainer', next.fill);
  assert.deepEqual([third.line.rate, third.line.gstRate], ['', '5'], 'an item with no rate clears the previous rate');
});

test('switching items keeps a value the person typed even when it came after the first fill', () => {
  const first = apply(blank(), 'Logo design', undefined);
  const withUnit = { ...first.line, unit: 'hrs' }; // edited by hand
  const next = apply(withUnit, 'Hosting', first.fill);
  assert.equal(next.line.unit, 'hrs', 'the typed unit survives');
  assert.deepEqual([next.line.rate, next.line.hsn, next.line.gstRate], ['2500', '', ''], 'the untouched ones follow the new item');
});

test('two saved items with the same name: nothing is filled, and the person is told why', () => {
  const dups = [...items, { ...A, id: 'a2', rate: '1' }];
  const r = apply(blank({ rate: '77' }), 'logo design', undefined, dups);
  assert.equal(r.line.rate, '77');
  assert.equal(r.line.hsn, undefined);
  assert.equal(r.line.description, 'logo design');
  assert.match(r.hint!, /2 saved items are called “Logo design”/);
  assert.equal(r.fill, undefined);
});

test('no match changes only the description; an empty saved value on a blank line stays blank', () => {
  const r = apply(blank({ rate: '5' }), 'Something else', undefined);
  assert.deepEqual(r.patch, { description: 'Something else' });
  assert.equal(r.hint, null);
  const c = apply(blank(), 'Retainer', undefined);
  assert.deepEqual([c.line.rate, c.line.hsn, c.line.unit, c.line.gstRate], ['', '', '', '5']);
});
