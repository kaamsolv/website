/**
 * The rent-receipt PDF, rendered for real (react-pdf in Node, with the real Inter font) and read back
 * with pdf.js: pages, order, wording, the stamp box and the PAN line appear exactly when they should.
 *
 * Not checked here: how a printed page looks (the browser tests take screenshots) or whether an
 * employer's payroll team accepts the format (they differ, and the page says so).
 */

import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { test } from 'node:test';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { registerFonts, rentReceiptDocument } from '../app/_components/receipt/rent-receipt-pdf.ts';
import { buildReceipts, rentPdfFilename, type ReceiptInput, type ReceiptSet } from '../app/lib/rent-receipt/build.ts';

const rp = await import('@react-pdf/renderer');
const FONTS = `${resolve(import.meta.dirname, '../public/fonts').replace(/\\/g, '/')}/`;
registerFonts(rp, FONTS);

const FORM: ReceiptInput = {
  tenant: 'Priya Sharma',
  landlord: 'Rakesh Gupta',
  landlordPan: 'abcde1234f',
  address: 'Flat 4B, Green Park Apartments, Koramangala, Bengaluru 560034',
  rent: '25,000',
  mode: 'upi',
  reference: '',
  dateRule: 'last',
  from: { year: 2026, month: 4 },
  to: { year: 2027, month: 3 },
};

function setOf(over: Partial<ReceiptInput> = {}): ReceiptSet {
  const r = buildReceipts({ ...FORM, ...over });
  assert.ok(r.ok, JSON.stringify(r.ok ? '' : r.errors));
  return r.ok ? r.set : (null as never);
}

async function render(set: ReceiptSet) {
  const buf = await rp.renderToBuffer(rentReceiptDocument(rp, set));
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf), isEvalSupported: false, verbosity: 0 }).promise;
  const pages: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const content = await (await doc.getPage(i)).getTextContent();
    pages.push(content.items.map((it) => ('str' in it ? it.str : '')).join(' '));
  }
  return { bytes: buf.length, pages, all: pages.join(' \n '), count: (needle: string) => pages.join(' ').split(needle).length - 1 };
}

test('a financial year: 12 receipts on 4 pages of 3, in month order, with amount, words, landlord and PAN on each', async () => {
  const out = await render(setOf());
  assert.equal(out.pages.length, 4);
  assert.equal(out.count('RENT RECEIPT'), 12);
  for (const page of out.pages) assert.equal(page.split('RENT RECEIPT').length - 1, 3, 'three to a page');
  const months = ['April 2026', 'May 2026', 'June 2026', 'July 2026', 'August 2026', 'September 2026', 'October 2026', 'November 2026', 'December 2026', 'January 2027', 'February 2027', 'March 2027'];
  let at = -1;
  for (const m of months) {
    const found = out.all.indexOf(`For ${m}`, at + 1);
    assert.ok(found > at, `${m} appears, after the month before it`);
    at = found;
  }
  assert.equal(out.count('₹25,000'), 12, 'the rupee sign survives (the Inter font has it)');
  assert.equal(out.count('Rupees Twenty-Five Thousand Only'), 12);
  assert.equal(out.count('PAN: ABCDE1234F'), 12, 'the PAN is upper-cased');
  assert.equal(out.count('Signature of landlord'), 12);
  assert.equal(out.count('Rakesh Gupta'), 12);
  assert.equal(out.count('Revenue stamp'), 0, 'UPI: no stamp box');
  assert.ok(out.all.includes('Date: 30 Apr 2026') && out.all.includes('Date: 31 Mar 2027'));
  assert.ok(out.all.includes('Received with thanks from Priya Sharma the sum of ₹25,000'));
});

test('cash above ₹5,000: a revenue-stamp box on every receipt; cash at ₹5,000 or UPI: none', async () => {
  assert.equal((await render(setOf({ mode: 'cash' }))).count('Revenue stamp ₹1'), 12);
  assert.equal((await render(setOf({ mode: 'cash', rent: '5,000' }))).count('Revenue stamp'), 0);
  assert.equal((await render(setOf({ mode: 'bank' }))).count('Revenue stamp'), 0);
});

test('page counts for other lengths: 1 → 1 page, 4 → 2, 6 → 2, 7 → 3, 24 → 8', async () => {
  const pagesFor = async (to: { year: number; month: number }) => (await render(setOf({ to }))).pages.length;
  assert.equal(await pagesFor({ year: 2026, month: 4 }), 1);
  assert.equal(await pagesFor({ year: 2026, month: 7 }), 2);
  assert.equal(await pagesFor({ year: 2026, month: 9 }), 2);
  assert.equal(await pagesFor({ year: 2026, month: 10 }), 3);
  assert.equal(await pagesFor({ year: 2028, month: 3 }), 8);
});

test('no PAN given: no PAN line at all; paise and the reference print correctly; special characters stay as text', async () => {
  const none = await render(setOf({ landlordPan: '', rent: '8,333.50', from: { year: 2026, month: 4 }, to: { year: 2026, month: 4 } }));
  assert.equal(none.count('PAN:'), 0);
  assert.ok(none.all.includes('₹8,333.50'));
  assert.ok(none.all.includes('Rupees Eight Thousand Three Hundred Thirty-Three and Fifty Paise Only'));

  const odd = await render(setOf({ tenant: 'A & B <Sharma>', mode: 'cheque', reference: '000123', to: { year: 2026, month: 4 } }));
  assert.ok(odd.all.includes('A & B <Sharma>'));
  assert.ok(odd.all.includes('Paid by Cheque (Ref: 000123).'));
});

test('long names and addresses do not break the page: still 3 receipts a page, all text present', async () => {
  const long = await render(setOf({ tenant: 'T'.repeat(80), landlord: 'L'.repeat(80), address: 'Address line, '.repeat(14).slice(0, 200) }));
  assert.equal(long.pages.length, 4);
  assert.equal(long.count('RENT RECEIPT'), 12);
  assert.ok(long.count('Signature of landlord') === 12);
});

test('the file name says what is inside', () => {
  assert.equal(rentPdfFilename(setOf()), 'rent-receipts-April-2026-to-March-2027.pdf');
  assert.equal(rentPdfFilename(setOf({ to: { year: 2026, month: 4 } })), 'rent-receipt-April-2026.pdf');
});
