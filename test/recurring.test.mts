/**
 * Stage 2C-2 (Invoice Pro): recurring reminders, CSV export, batch from CSV and
 * currency reference rates. Real Postgres (PGlite) with the real migrations.
 */

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { eq } from 'drizzle-orm';
import { makeTestDb } from './helpers/test-db.mts';
import type { Db } from '../db/links.ts';
import { authUsers, invoices, subscriptions } from '../db/schema.ts';
import { getEntitlements } from '../db/entitlements.ts';
import { createBatch, createInvoice, getInvoice, getProfile, listDueToRecur, listForExport, recurInvoice, saveSettings, setRecurring, DEFAULT_SETTINGS } from '../db/invoices.ts';
import { entitlementsFrom } from '../app/lib/entitlements.ts';
import { clientTodayOk, isIsoDate, nextRecurAfter, nextRecurDate } from '../app/lib/invoice/recurring.ts';
import { csvCell, invoicesCsv, linesCsv, parseCsv, toCsv } from '../app/lib/invoice/csv.ts';
import { buildBatch, readDate, templateCsv, type BatchProfile } from '../app/lib/invoice/batch.ts';
import { fromInr, readFrankfurter, toInr } from '../app/lib/invoice/fx.ts';
import { computeTotals } from '../app/lib/invoice/totals.ts';
import { newInvoice } from '../app/lib/invoice/defaults.ts';
import type { Invoice } from '../app/lib/invoice/types.ts';

let db: Db;
let close: () => Promise<void>;
before(async () => ({ db, close } = await makeTestDb()));
after(async () => close());

async function makeUser(email: string, pro = true): Promise<string> {
  const [u] = await db.insert(authUsers).values({ name: '', email, emailVerified: true }).returning({ id: authUsers.id });
  if (pro) await db.insert(subscriptions).values({ userId: u.id, provider: 'manual', providerRef: `manual:${email}`, planKey: 'invoice_pro', status: 'active' });
  return u.id;
}
function doc(number: string, over: Partial<Invoice> = {}): Invoice {
  const inv = newInvoice(new Date(2026, 9, 22));
  return { ...inv, number, client: { ...inv.client, name: 'Acme' }, items: [{ id: 'a', description: 'Work', qty: '2', rate: '1000' }], ...over };
}
const MH = '27AAPFU0939F1ZV';
const KA = '29AAGCB7383J1Z4';

// ─── Recurring dates ────────────────────────────────────────────────────────

test('dates: real calendar dates only', () => {
  assert.equal(isIsoDate('2026-02-28'), true);
  assert.equal(isIsoDate('2026-02-30'), false);
  assert.equal(isIsoDate('2028-02-29'), true);
  assert.equal(isIsoDate('2026-13-01'), false);
  assert.equal(isIsoDate('1 Nov 2026'), false);
  assert.equal(isIsoDate(20261101), false);
});

test('next date: week, month (end-of-month safe), quarter, year, leap day', () => {
  assert.equal(nextRecurDate('2026-10-28', 'week'), '2026-11-04');
  assert.equal(nextRecurDate('2026-12-28', 'week'), '2027-01-04');
  assert.equal(nextRecurDate('2026-10-01', 'month'), '2026-11-01');
  assert.equal(nextRecurDate('2026-12-15', 'month'), '2027-01-15');
  assert.equal(nextRecurDate('2026-01-31', 'month'), '2026-02-28');
  assert.equal(nextRecurDate('2028-01-31', 'month'), '2028-02-29', 'leap year');
  assert.equal(nextRecurDate('2026-11-30', 'quarter'), '2027-02-28');
  assert.equal(nextRecurDate('2026-10-15', 'quarter'), '2027-01-15');
  assert.equal(nextRecurDate('2028-02-29', 'year'), '2029-02-28');
  assert.equal(nextRecurDate('2026-03-01', 'year'), '2027-03-01');
});

test('after a missed period the next date lands in the future, not the past', () => {
  assert.equal(nextRecurAfter('2026-07-01', 'month', '2026-10-22'), '2026-11-01');
  assert.equal(nextRecurAfter('2026-10-22', 'month', '2026-10-22'), '2026-11-22');
  assert.equal(nextRecurAfter('2026-10-01', 'week', '2026-10-22'), '2026-10-29');
});

test('client "today": any real local date within a day of server UTC passes — IST just after midnight included', () => {
  // 31 Oct 19:00 UTC is already 1 Nov 00:30 in India.
  const serverNow = new Date(Date.UTC(2026, 9, 31, 19, 0, 0));
  assert.equal(clientTodayOk('2026-11-01', serverNow), true, 'IST 12:30 AM — client date is a day ahead of UTC');
  assert.equal(clientTodayOk('2026-10-31', serverNow), true);
  // UTC-8 evening: the server has already rolled over, the client hasn't.
  const nextDay = new Date(Date.UTC(2026, 10, 1, 4, 0, 0));
  assert.equal(clientTodayOk('2026-10-31', nextDay), true, 'UTC-8 evening — client date is a day behind UTC');
  assert.equal(clientTodayOk('2026-11-04', serverNow), false, 'three days off');
  assert.equal(clientTodayOk('2026-10-27', serverNow), false);
  assert.equal(clientTodayOk('tomorrow', serverNow), false);
  assert.equal(clientTodayOk(undefined, serverNow), false);
});

// ─── Recurring in the database ──────────────────────────────────────────────

test('recurring: schedule, due list, Create makes the next invoice and moves the date; the copy doesn’t repeat', async () => {
  const id = await makeUser('recur@example.test');
  await saveSettings(db, id, { ...DEFAULT_SETTINGS, name: 'Me', defaultDueDays: 7 });
  const made = await createInvoice(db, id, doc('INV-0001', { client: { name: 'Acme', address: '', email: '' } }), null);
  assert.ok(made.ok);
  const src = made.ok ? made.id : '';
  assert.equal(await setRecurring(db, id, src, { every: 'month', next: '2026-11-01' }), true);

  assert.deepEqual((await listDueToRecur(db, id, '2026-10-31')).map((r) => r.id), [], 'not due yet');
  const due = await listDueToRecur(db, id, '2026-11-01');
  assert.deepEqual(due.map((r) => [r.id, r.recurEvery, r.recurNext]), [[src, 'month', '2026-11-01']]);

  const r = await recurInvoice(db, id, src, 'create', '2026-11-01', null);
  assert.ok(r.ok && r.id);
  assert.equal(r.ok && r.next, '2026-12-01');
  const copy = await getInvoice(db, id, r.ok && r.id ? r.id : '');
  assert.equal(copy?.invoice.number, 'INV-0002');
  assert.equal(copy?.invoice.issueDate, '2026-11-01');
  assert.equal(copy?.invoice.dueDate, '2026-11-08', 'the account’s days to pay');
  assert.equal(copy?.invoice.client.name, 'Acme');
  const [row] = await db.select({ every: invoices.recurEvery, next: invoices.recurNext }).from(invoices).where(eq(invoices.id, r.ok && r.id ? r.id : ''));
  assert.deepEqual([row.every, row.next], [null, null], 'the copy does not repeat');
  assert.deepEqual((await listDueToRecur(db, id, '2026-11-01')).map((x) => x.id), [], 'handled');

  // A second click on the same reminder (another tab) is refused, not doubled.
  const again = await recurInvoice(db, id, src, 'create', '2026-11-01', null);
  assert.deepEqual(again, { ok: false, reason: 'not_due' });
});

test('recurring: Skip moves the date and creates nothing; a missed period lands in the future', async () => {
  const id = await makeUser('recur-skip@example.test');
  const made = await createInvoice(db, id, doc('INV-0001'), null);
  const src = made.ok ? made.id : '';
  await setRecurring(db, id, src, { every: 'month', next: '2026-07-01' });
  const r = await recurInvoice(db, id, src, 'skip', '2026-10-22', null);
  assert.deepEqual(r, { ok: true, id: null, next: '2026-11-01' });
  const all = await db.select({ id: invoices.id }).from(invoices).where(eq(invoices.userId, id));
  assert.equal(all.length, 1, 'nothing was created');
});

test('recurring: the IST just-after-midnight case — client date 1 Nov, still due, the copy is dated 1 Nov', async () => {
  const id = await makeUser('recur-ist@example.test');
  const made = await createInvoice(db, id, doc('INV-0001'), null);
  const src = made.ok ? made.id : '';
  await setRecurring(db, id, src, { every: 'month', next: '2026-11-01' });
  // The server's own UTC date is 31 Oct at this moment; the client says 1 Nov.
  assert.equal(clientTodayOk('2026-11-01', new Date(Date.UTC(2026, 9, 31, 19, 0, 0))), true);
  const r = await recurInvoice(db, id, src, 'create', '2026-11-01', null);
  assert.ok(r.ok && r.id);
  assert.equal((await getInvoice(db, id, r.ok && r.id ? r.id : ''))?.invoice.issueDate, '2026-11-01');
  assert.equal(r.ok && r.next, '2026-12-01');
});

test('recurring: the save limit puts the schedule back; quotations and other users’ invoices can’t repeat', async () => {
  const id = await makeUser('recur-limit@example.test');
  const made = await createInvoice(db, id, doc('INV-0001'), null);
  const src = made.ok ? made.id : '';
  await setRecurring(db, id, src, { every: 'week', next: '2026-10-20' });
  const full = await recurInvoice(db, id, src, 'create', '2026-10-22', 1);
  assert.deepEqual(full, { ok: false, reason: 'limit' });
  const [row] = await db.select({ next: invoices.recurNext }).from(invoices).where(eq(invoices.id, src));
  assert.equal(row.next, '2026-10-20', 'still due — nothing lost');

  const quote = await createInvoice(db, id, doc('QT-0001', { kind: 'quote' }), null);
  assert.equal(await setRecurring(db, id, quote.ok ? quote.id : '', { every: 'month', next: '2026-11-01' }), false, 'quotes never repeat');
  const other = await makeUser('recur-other@example.test');
  assert.equal(await setRecurring(db, other, src, { every: 'month', next: '2026-11-01' }), false);
  assert.deepEqual(await recurInvoice(db, other, src, 'skip', '2026-10-22', null), { ok: false, reason: 'not_found' });
  assert.equal(await setRecurring(db, id, src, null), true, 'stopping works');
});

test('plans: recurring, CSV export, batch and currency rates are Pro only', async () => {
  const free = entitlementsFrom(await getEntitlements(db, await makeUser('plan2-free@example.test', false)));
  const pro = entitlementsFrom(await getEntitlements(db, await makeUser('plan2-pro@example.test')));
  for (const key of ['invoice_recurring', 'invoice_csv_export', 'invoice_batch_csv', 'invoice_fx_rates'] as const) {
    assert.equal(free.can(key), false, `${key} free`);
    assert.equal(pro.can(key), true, `${key} Pro`);
  }
});

// ─── CSV ────────────────────────────────────────────────────────────────────

test('CSV reader: quotes, commas and newlines inside quotes, "" escapes, CRLF, BOM, blank lines', () => {
  const text = '﻿a,b,c\r\n1,"x, y","say ""hi"""\r\n\r\n"two\nlines",,end';
  assert.deepEqual(parseCsv(text), [['a', 'b', 'c'], ['1', 'x, y', 'say "hi"'], ['two\nlines', '', 'end']]);
  assert.deepEqual(parseCsv(''), []);
  assert.deepEqual(parseCsv('a,b'), [['a', 'b']]);
});

test('CSV writer: quoting, BOM, and formula cells are defused', () => {
  assert.equal(csvCell('plain'), 'plain');
  assert.equal(csvCell('a,b'), '"a,b"');
  assert.equal(csvCell('say "hi"'), '"say ""hi"""');
  assert.equal(csvCell('=HYPERLINK("x")'), '"\'=HYPERLINK(""x"")"');
  assert.equal(csvCell('+91 98100 00000'), "'+91 98100 00000");
  assert.equal(csvCell('-5'), "'-5");
  assert.equal(csvCell('@cmd'), "'@cmd");
  assert.equal(csvCell(-5), '-5', 'a real number stays a number');
  assert.equal(csvCell(null), '');
  assert.ok(toCsv([['a'], ['b']]).startsWith('﻿a\r\n'));
  assert.deepEqual(parseCsv(toCsv([['a,b', 'c "d"']])), [['a,b', 'c "d"']], 'what we write we can read');
});

function gstInvoice(over: Partial<Invoice> = {}): Invoice {
  const base = newInvoice(new Date(2026, 9, 22));
  return {
    ...base,
    number: 'INV-0001',
    currency: 'INR',
    taxLabel: 'GST',
    taxRate: '18',
    seller: { ...base.seller, name: 'Sharma Studio', gstin: MH, state: '27' },
    client: { name: '=Acme', address: '', email: '', gstin: KA },
    items: [
      { id: 'a', description: 'Design', qty: '1', rate: '10000', hsn: '998391', unit: 'pcs' },
      { id: 'b', description: 'Print, A3', qty: '10', rate: '100', hsn: '4911', gstRate: '5' },
    ],
    ...over,
  };
}

test('invoices CSV: GST split, client GSTIN, place of supply — and it matches computeTotals', () => {
  const inv = gstInvoice();
  const t = computeTotals(inv);
  const [head, row] = parseCsv(invoicesCsv([{ invoice: inv, status: 'paid', paidAt: new Date('2026-10-30T10:00:00Z') }]));
  const get = (name: string) => row[head.indexOf(name)];
  assert.equal(get('Number'), 'INV-0001');
  assert.equal(get('Type'), 'Invoice');
  assert.equal(get('Status'), 'Paid');
  assert.equal(get('Paid on'), '2026-10-30');
  assert.equal(get('Client'), "'=Acme", 'a name that starts with = is defused');
  assert.equal(get('Client GSTIN'), KA);
  assert.equal(get('Place of supply'), '29', 'Karnataka — different state from the seller');
  assert.equal(Number(get('IGST')), t.gst!.igst);
  assert.equal(get('CGST'), '0');
  assert.equal(Number(get('Total')), t.total);
  assert.equal(Number(get('Subtotal')), 11000);
  assert.equal(Number(get('Taxable value')), 11000);
});

test('invoices CSV: a plain invoice leaves the GST columns blank; a quotation has no status', () => {
  const plain = doc('P-1', { taxLabel: 'VAT', taxRate: '10' });
  const quote = gstInvoice({ kind: 'quote', number: 'QT-0001' });
  const [head, p, q] = parseCsv(invoicesCsv([{ invoice: plain, status: 'unpaid', paidAt: null }, { invoice: quote, status: 'unpaid', paidAt: null }]));
  assert.equal(p[head.indexOf('CGST')], '');
  assert.equal(p[head.indexOf('IGST')], '');
  assert.equal(p[head.indexOf('Status')], 'Unpaid');
  assert.equal(q[head.indexOf('Type')], 'Quotation');
  assert.equal(q[head.indexOf('Status')], '');
});

test('lines CSV: one row per line with HSN, unit, GST %, taxable value and tax; lines add up to the invoice', () => {
  const inv = gstInvoice({ discountType: 'percent', discountValue: '10' });
  const [head, ...rows] = parseCsv(linesCsv([{ invoice: inv, status: 'unpaid', paidAt: null }]));
  assert.equal(rows.length, 2);
  const col = (r: string[], n: string) => r[head.indexOf(n)];
  assert.equal(col(rows[0], 'HSN / SAC'), '998391');
  assert.equal(col(rows[0], 'Unit'), 'pcs');
  assert.equal(col(rows[0], 'GST %'), '18', 'the invoice rate');
  assert.equal(col(rows[1], 'GST %'), '5', 'the line’s own rate');
  assert.equal(col(rows[1], 'Description'), 'Print, A3');
  const taxable = rows.reduce((n, r) => n + Number(col(r, 'Taxable value')), 0);
  assert.equal(Math.round(taxable * 100) / 100, computeTotals(inv).taxable, 'lines add up after the discount');
  assert.equal(Number(col(rows[0], 'Taxable value')), 9000);
  assert.equal(Number(col(rows[0], 'Tax')), 1620);
});

test('export reads only the user’s own invoices, in a date range, one past the cap so a cut is visible', async () => {
  const a = await makeUser('export-a@example.test');
  const b = await makeUser('export-b@example.test');
  await createInvoice(db, a, doc('A-1', { issueDate: '2026-04-10' }), null);
  await createInvoice(db, a, doc('A-2', { issueDate: '2026-09-10' }), null);
  await createInvoice(db, b, doc('B-1', { issueDate: '2026-09-10' }), null);
  assert.deepEqual((await listForExport(db, a, {})).map((r) => r.invoice.number), ['A-1', 'A-2']);
  assert.deepEqual((await listForExport(db, a, { from: '2026-06-01' })).map((r) => r.invoice.number), ['A-2']);
  assert.deepEqual((await listForExport(db, a, { to: '2026-06-01' })).map((r) => r.invoice.number), ['A-1']);
  assert.deepEqual((await listForExport(db, b, {})).map((r) => r.invoice.number), ['B-1']);
});

// ─── Batch from CSV ─────────────────────────────────────────────────────────

const PROFILE: BatchProfile = {
  name: 'Sharma Studio', address: '12 MG Road', email: 's@example.test', phone: '', stateCode: '27', gstin: MH,
  bankAccountName: '', bankAccountNumber: '', bankIfsc: '', bankName: '', upiId: 'sharma@okhdfc', showUpiQr: false,
  defaultCurrency: 'INR', defaultTaxLabel: 'GST', defaultTaxRate: '18', defaultDueDays: 14, defaultNotes: 'Thanks!', composition: false,
  defaultTemplate: 'bold', defaultBrandColor: '#38BBAC',
};
const HEAD = 'group,client_name,client_email,client_gstin,client_address,state_code,description,qty,rate,gst_rate,hsn,unit,issue_date,due_date,notes';

test('batch: the template itself previews cleanly as two invoices (three lines)', () => {
  const { previews, fileError } = buildBatch(parseCsv(templateCsv()), PROFILE, '2026-10-22');
  assert.equal(fileError, null);
  assert.equal(previews.length, 2);
  assert.deepEqual(previews.map((p) => p.errors), [[], []]);
  assert.equal(previews[0].invoice.items.length, 2, 'rows with the same group are one invoice');
  assert.equal(previews[0].invoice.client.name, 'Acme Traders Pvt Ltd');
  assert.equal(previews[0].total, 54280, '(40000 + 6000) at 18%');
  assert.equal(previews[0].invoice.issueDate, '2026-10-22');
  assert.equal(previews[0].invoice.dueDate, '2026-11-05', 'today + days to pay');
  assert.equal(previews[0].invoice.seller.gstin, MH, 'seller from Settings');
  assert.equal(previews[0].invoice.notes, 'Thank you!');
  assert.equal(previews[1].invoice.notes, 'Thanks!', 'blank notes use the default');
  assert.deepEqual(previews[0].invoice.design, { template: 'bold', color: '#38BBAC' });
  assert.equal(previews[0].invoice.payment?.upiId, 'sharma@okhdfc');
});

test('batch: a bad row stops only its own invoice, with the line number and what to fix', () => {
  const csv = [
    HEAD,
    'g1,Good Co,,,,,Work,1,1000,18,,,,,',
    'g2,Bad GSTIN,,27AAPFU0939F1ZX,,,Work,1,1000,18,,,,,',
    'g3,Bad rate,,,,,Work,1,abc,18,,,,,',
    'g4,Bad GST,,,,,Work,1,1000,12,,,,,',
    'g5,Bad date,,,,,Work,1,1000,18,,,01-13-2026x,,',
    'g6,Bad state,,,,99,Work,1,1000,18,,,,,',
    'g7,Bad HSN,,,,,Work,1,1000,18,99831,,,,',
    ',,,,,,Orphan,1,5,,,,,,',
  ].join('\n');
  const { previews } = buildBatch(parseCsv(csv), PROFILE, '2026-10-22');
  assert.equal(previews.length, 8);
  assert.deepEqual(previews[0].errors, []);
  const msg = (i: number) => previews[i].errors.join(' | ');
  assert.match(msg(1), /Line 3: client_gstin: .*typo/);
  assert.match(msg(2), /Line 4: rate "abc"/);
  assert.match(msg(3), /Line 5: gst_rate "12" should be 0, 0\.25, 3, 5, 18 or 40/);
  assert.match(msg(4), /Line 6: issue_date/);
  assert.match(msg(5), /Line 7: state_code "99"/);
  assert.match(msg(6), /Line 8: hsn "99831"/);
  assert.match(msg(7), /Line 9: client_name is empty/);
  assert.equal(previews[7].label, 'row 9', 'a blank group is its own invoice');
});

test('batch: a group must be one client; dates read both ways; a missing column or empty file is explained', () => {
  const mixed = buildBatch(parseCsv([HEAD, 'g,Acme,,,,,A,1,10,18,,,,,', 'g,Other,,,,,B,1,10,18,,,,,'].join('\n')), PROFILE, '2026-10-22');
  assert.match(mixed.previews[0].errors.join(), /must be the same client/);

  assert.equal(readDate('2026-11-01'), '2026-11-01');
  assert.equal(readDate('01/11/2026'), '2026-11-01');
  assert.equal(readDate('1-11-2026'), '2026-11-01');
  assert.equal(readDate('31/02/2026'), null);
  assert.equal(readDate('soon'), null);
  const dated = buildBatch(parseCsv([HEAD, 'g,Acme,,,,,A,1,10,18,,,05/11/2026,,'].join('\n')), PROFILE, '2026-10-22');
  assert.equal(dated.previews[0].invoice.issueDate, '2026-11-05');
  assert.equal(dated.previews[0].invoice.dueDate, '2026-11-19');

  assert.match(buildBatch(parseCsv('client_name,rate\nAcme,10'), PROFILE, '2026-10-22').fileError ?? '', /needs these columns: description/);
  assert.match(buildBatch([], PROFILE, '2026-10-22').fileError ?? '', /empty/);
  assert.match(buildBatch(parseCsv(HEAD), PROFILE, '2026-10-22').fileError ?? '', /no invoices/);
});

test('batch: more than 50 invoices is refused with how to split it', () => {
  const rows = [HEAD, ...Array.from({ length: 51 }, (_, i) => `,Client ${i},,,,,Work,1,100,18,,,,,`)].join('\n');
  assert.match(buildBatch(parseCsv(rows), PROFILE, '2026-10-22').fileError ?? '', /up to 50 at a time/);
});

test('batch: saved in order with the next numbers from the account’s sequence; the limit stops the rest', async () => {
  const id = await makeUser('batch@example.test');
  await saveSettings(db, id, { ...DEFAULT_SETTINGS, name: 'Me', invoicePrefix: 'INV-', nextSequence: 7 });
  const { previews } = buildBatch(parseCsv(templateCsv()), PROFILE, '2026-10-22');
  const docs = [...previews.map((p) => p.invoice), previews[1].invoice].map((d) => ({ ...d, number: 'IGNORED' }));
  const r = await createBatch(db, id, docs, null);
  assert.deepEqual(r.created.map((c) => c.number), ['INV-0007', 'INV-0008', 'INV-0009']);
  assert.deepEqual(r.failed, []);
  assert.equal((await getProfile(db, id))?.nextNumber, 'INV-0010');
  const saved = await getInvoice(db, id, r.created[0].id);
  assert.equal(saved?.invoice.number, 'INV-0007');
  assert.equal(saved?.invoice.client.name, 'Acme Traders Pvt Ltd');

  const capped = await createBatch(db, id, docs, 4);
  assert.deepEqual(capped.created.map((c) => c.number), ['INV-0010'], 'one fits under a limit of 4');
  assert.deepEqual(capped.failed, [1, 2], 'the rest are reported, not lost silently');
});

// ─── Currency rates ─────────────────────────────────────────────────────────

test('currency rates: read a Frankfurter answer, convert both ways, ignore anything odd', () => {
  const body = [{ date: '2026-10-23', base: 'USD', quote: 'INR', rate: 94.8032 }];
  const rate = readFrankfurter(body, 'USD');
  assert.deepEqual(rate, { rate: 94.8032, date: '2026-10-23' });
  assert.equal(toInr(1000, rate!), 94803.2);
  assert.equal(fromInr(94803.2, rate!), 1000);
  assert.equal(readFrankfurter(body, 'EUR'), null, 'wrong base');
  assert.equal(readFrankfurter([{ base: 'USD', quote: 'INR', rate: 0 }], 'USD'), null);
  assert.equal(readFrankfurter([{ base: 'USD', quote: 'INR', rate: 'x' }], 'USD'), null);
  assert.equal(readFrankfurter({ message: 'nope' }, 'USD'), null);
  assert.equal(readFrankfurter(null, 'USD'), null);
  assert.equal(readFrankfurter([{ base: 'USD', quote: 'INR', rate: 90, date: 'yesterday' }], 'USD')?.date, '');
});
