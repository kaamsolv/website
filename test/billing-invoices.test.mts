/**
 * Billing M2: the sales invoice for a verified payment, its private link, the email job and its retries, the
 * outbox, the small server PDF, and "Share on WhatsApp". Real Postgres (PGlite) with the real migrations.
 */

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { eq, sql } from 'drizzle-orm';
import { makeTestDb } from './helpers/test-db.mts';
import type { Db } from '../db/links.ts';
import { authUsers, billingPayments, invoiceLinks, invoicePayments, invoices, outbox } from '../db/schema.ts';
import { attachOrder, createPendingPayment, priceFor, processBillingEvent } from '../db/billing.ts';
import { issueInvoice } from '../db/billing-invoice.ts';
import { billingLinkToken, createLink, ensureLink, liveLinks, resolveLink, revokeLinks } from '../db/invoice-links.ts';
import { claimDue, enqueue, runDue, settle, BACKOFF_MINUTES, MAX_ATTEMPTS } from '../db/outbox.ts';
import { deleteInvoice, SalesInvoiceError, saveProfile } from '../db/invoices.ts';
import { holdsSalesInvoices } from '../db/accounts.ts';
import { billingReport, billingSettingsPresent } from '../db/billing-report.ts';
import { billingInvoiceJob, queueInvoiceFor, queueResend } from '../app/lib/billing/jobs.ts';
import { billingConfig, buildSubscriptionInvoice } from '../app/lib/billing/invoice.ts';
import { invoiceEmail } from '../app/lib/billing/email.ts';
import { deriveToken, hashToken, isTokenShape } from '../app/lib/links/token.ts';
import { whatsappHref, whatsappMessage, whatsappNumber } from '../app/lib/invoice/share.ts';
import { invoicePdf } from '../app/lib/invoice/server-pdf.ts';
import { MiniPdf, ascii, textWidth } from '../app/lib/pdf/mini-pdf.ts';
import { gstinCheckChar } from '../app/lib/invoice/india.ts';
import { computeTotals } from '../app/lib/invoice/totals.ts';
import { newInvoice } from '../app/lib/invoice/defaults.ts';
import { cleanSettings } from '../app/lib/invoice/settings.ts';

const SECRET = 'test-link-secret';
const gstin = (() => {
  const first14 = '27AAAAA0000A1Z';
  return first14 + gstinCheckChar(first14);
})();

// ---- tokens --------------------------------------------------------------------------------------------------

test('a token is 22 URL-safe characters, always the same for one link and secret, different otherwise', async () => {
  const id = crypto.randomUUID();
  const a = await deriveToken(SECRET, id);
  assert.match(a, /^[A-Za-z0-9_-]{22}$/);
  assert.equal(a, await deriveToken(SECRET, id));
  assert.notEqual(a, await deriveToken(SECRET, crypto.randomUUID()));
  assert.notEqual(a, await deriveToken('another-secret', id));
  assert.equal(isTokenShape(a), true);
  for (const bad of ['', 'short', a + 'x', a.slice(1), 'has space and symbols!!!!!', '../../etc/passwd-aaaaaa']) assert.equal(isTokenShape(bad), false, bad);
  const h = await hashToken(a);
  assert.match(h, /^[0-9a-f]{64}$/);
  assert.notEqual(h, a);
});

// ---- WhatsApp share ------------------------------------------------------------------------------------------

test('the WhatsApp message carries seller, first name, number, amount, due date and the link, and nothing else', () => {
  const m = whatsappMessage({ sellerName: 'ABC Studio', clientName: 'Rahul Sharma', number: 'INV-2026-014', total: 11800, currency: 'INR', dueDate: '2026-11-05', url: 'https://kaamsolv.com/i/Ab3xK9Ab3xK9Ab3xK9Ab3x' });
  assert.equal(
    m,
    ['Hi Rahul, your invoice from ABC Studio is ready.', '', 'Invoice: INV-2026-014', 'Amount: ₹11,800.00', 'Due date: 5 Nov 2026', '', 'View invoice: https://kaamsolv.com/i/Ab3xK9Ab3xK9Ab3xK9Ab3x'].join('\n'),
  );
  const noName = whatsappMessage({ sellerName: '', clientName: '', number: 'N1', total: 5, currency: 'INR', dueDate: '', url: 'https://x/i/t' });
  assert.match(noName, /^Hi, your invoice is ready\./);
  assert.ok(!noName.includes('Due date'));
  assert.match(whatsappMessage({ sellerName: 'S', clientName: 'A', number: 'N', total: 5, currency: 'INR', dueDate: '2026-11-05', url: 'u', paid: true }), /Status: Paid/);
});

test('phone numbers become wa.me numbers; anything unusable opens the chat picker instead', () => {
  assert.equal(whatsappNumber('98765 43210'), '919876543210');
  assert.equal(whatsappNumber('+91 98765-43210'), '919876543210');
  assert.equal(whatsappNumber('09876543210'), '919876543210');
  assert.equal(whatsappNumber('0091 98765 43210'), '919876543210');
  assert.equal(whatsappNumber('+1 415 555 2671'), '14155552671');
  for (const bad of [undefined, '', 'call me', '12345', '+12', '9876543']) assert.equal(whatsappNumber(bad), null, String(bad));
  assert.match(whatsappHref('9876543210', 'Hi & bye\nnext'), /^https:\/\/wa\.me\/919876543210\?text=Hi%20%26%20bye%0Anext$/);
  assert.match(whatsappHref(undefined, 'x'), /^https:\/\/wa\.me\/\?text=x$/);
});

// ---- billing configuration and the invoice document ----------------------------------------------------------

test('billing settings: nothing is guessed, and an unsupported treatment is said so', () => {
  assert.equal(billingConfig({}).problem, 'seller_account_not_set');
  assert.equal(billingConfig({ BILLING_SELLER_EMAIL: 'a@b.c' }).problem, 'tax_treatment_not_set');
  assert.equal(billingConfig({ BILLING_SELLER_EMAIL: 'a@b.c', BILLING_TAX_TREATMENT: 'exclusive' }).problem, 'tax_treatment_unsupported');
  assert.equal(billingConfig({ BILLING_SELLER_EMAIL: 'a@b.c', BILLING_TAX_TREATMENT: 'inclusive' }).problem, 'tax_rate_not_set');
  assert.equal(billingConfig({ BILLING_SELLER_EMAIL: 'a@b.c', BILLING_TAX_TREATMENT: 'inclusive', BILLING_TAX_RATE: '17' }).problem, 'tax_rate_not_set');
  assert.equal(billingConfig({ BILLING_SELLER_EMAIL: 'A@B.C', BILLING_TAX_TREATMENT: 'none' }).treatment?.mode, 'none');
  assert.deepEqual(billingConfig({ BILLING_SELLER_EMAIL: 'a@b.c', BILLING_TAX_TREATMENT: 'inclusive', BILLING_TAX_RATE: '18' }).treatment, { mode: 'inclusive', rate: '18' });
  assert.equal(billingConfig({ BILLING_SELLER_EMAIL: 'A@B.C', BILLING_TAX_TREATMENT: 'none' }).sellerEmail, 'a@b.c');
});

const SELLER = { name: 'Beam Me Up', address: '1 Test Road\nMumbai', email: 'billing@example.test', phone: '', stateCode: '27', gstin, composition: false, bankAccountName: '', bankAccountNumber: '', bankIfsc: '', bankName: '', upiId: '' };
const base = { seller: SELLER, buyer: { name: 'Pat Example', email: 'pat@example.test' }, planName: 'Invoice Pro', period: 'month' as const, amountPaise: 14900, paidOn: '2026-10-27', treatment: { mode: 'none' as const } };

test('with no tax, the invoice total is exactly the price', () => {
  const r = buildSubscriptionInvoice(base);
  assert.ok(r.ok);
  assert.equal(Math.round(computeTotals(r.doc).total * 100), 14900);
  assert.equal(r.doc.items[0].description, 'Invoice Pro — monthly plan');
  assert.equal(r.doc.client.name, 'Pat Example');
  assert.equal(r.doc.dueDate, r.doc.issueDate);
});

test('with tax included, an invoice is made only when its total is exactly what was charged; otherwise it says so', () => {
  const seen = { ok: 0, mismatch: 0 };
  for (const paise of [14900, 149000, 9900, 99000, 19900, 199000]) {
    for (const rate of ['5', '18', '40', '3', '0.25']) {
      const r = buildSubscriptionInvoice({ ...base, amountPaise: paise, treatment: { mode: 'inclusive', rate } });
      if (r.ok) {
        const t = computeTotals(r.doc);
        assert.equal(Math.round(t.total * 100), paise, `${paise} at ${rate}%`);
        assert.ok(t.gst, 'a GST tax invoice with the split');
        seen.ok++;
      } else {
        assert.equal(r.code, 'rounding_mismatch', `${paise} at ${rate}%`);
        seen.mismatch++;
      }
    }
  }
  assert.ok(seen.ok > 20, 'most prices decompose exactly');
  // A known one: Rs 149 including 18% GST can't be split into two half-rate taxes that add back to 149.00.
  assert.deepEqual(buildSubscriptionInvoice({ ...base, amountPaise: 14900, treatment: { mode: 'inclusive', rate: '18' } }), { ok: false, code: 'rounding_mismatch' });
  assert.equal(buildSubscriptionInvoice({ ...base, amountPaise: 149000, treatment: { mode: 'inclusive', rate: '18' } }).ok, true);
});

test('the invoice is NOT made when the seller details or treatment can not honour it', () => {
  const inc = { mode: 'inclusive' as const, rate: '18' };
  assert.deepEqual(buildSubscriptionInvoice({ ...base, seller: { ...SELLER, name: '' } }), { ok: false, code: 'seller_not_configured' });
  assert.deepEqual(buildSubscriptionInvoice({ ...base, seller: { ...SELLER, address: ' ' } }), { ok: false, code: 'seller_not_configured' });
  assert.deepEqual(buildSubscriptionInvoice({ ...base, treatment: inc, seller: { ...SELLER, gstin: '' } }), { ok: false, code: 'seller_gstin_missing' });
  assert.deepEqual(buildSubscriptionInvoice({ ...base, treatment: inc, seller: { ...SELLER, gstin: '27AAAAA0000A1Z0' } }), { ok: false, code: 'seller_gstin_missing' });
  assert.deepEqual(buildSubscriptionInvoice({ ...base, treatment: inc, seller: { ...SELLER, composition: true } }), { ok: false, code: 'composition_cannot_charge_gst' });
  assert.equal(buildSubscriptionInvoice({ ...base, seller: { ...SELLER, composition: true } }).ok, true, 'a composition seller can issue a bill of supply with no tax');
});

test('the buyer is named by email when the account has no name; the email says what was bought and links', () => {
  const r = buildSubscriptionInvoice({ ...base, buyer: { name: '', email: 'pat@example.test' } });
  assert.ok(r.ok);
  assert.equal(r.doc.client.name, 'pat@example.test');
  const e = invoiceEmail({ to: 'pat@example.test', buyerName: 'Pat Example', number: 'INV-0001', planName: 'Invoice Pro', amountPaise: 14900, url: 'https://kaamsolv.com/i/abc' });
  assert.equal(e.subject, 'Your KaamSolv invoice INV-0001');
  assert.match(e.text, /Hi Pat,/);
  assert.match(e.text, /₹149\.00/);
  assert.ok(e.text.includes('https://kaamsolv.com/i/abc') && e.html.includes('href="https://kaamsolv.com/i/abc"'));
  assert.ok(!invoiceEmail({ to: 'a@b.c', buyerName: '<script>', number: 'N"', planName: 'P', amountPaise: 100, url: 'u' }).html.includes('<script>'));
});

// ---- the small PDF -------------------------------------------------------------------------------------------

test('the mini PDF is a well-formed file: header, objects at the offsets xref says, trailer', () => {
  const pdf = new MiniPdf('Test (1)');
  pdf.text(50, 780, 'Hello (world) \\ backslash', 12, true);
  pdf.line(50, 770, 300, 770);
  pdf.addPage();
  pdf.text(50, 780, 'Page two');
  const text = new TextDecoder().decode(pdf.save());
  assert.ok(text.startsWith('%PDF-1.4\n') && text.trimEnd().endsWith('%%EOF'));
  const startxref = Number(/startxref\n(\d+)\n/.exec(text)![1]);
  assert.ok(text.slice(startxref).startsWith('xref\n'));
  const entries = [...text.slice(startxref).matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => Number(m[1]));
  assert.ok(entries.length >= 9, 'catalog, pages, 2 fonts, info, 2 pages with content');
  entries.forEach((offset, i) => assert.ok(text.slice(offset).startsWith(`${i + 1} 0 obj\n`), `object ${i + 1} is where xref says`));
  assert.match(text, /\/Count 2/);
  assert.ok(text.includes('(Hello \\(world\\) \\\\ backslash)'), 'text is escaped');
  const lengths = [...text.matchAll(/<< \/Length (\d+) >>\nstream\n([\s\S]*?)\nendstream/g)];
  assert.equal(lengths.length, 2);
  for (const m of lengths) assert.equal(Number(m[1]), m[2].length, 'stream length is exact');
});

test('only ASCII is drawn: typographic characters are swapped, the rest become "?"; widths follow Helvetica', () => {
  assert.equal(ascii('A — “b” ₹5 ·x'), 'A - "b" Rs. 5 -x');
  assert.equal(ascii('नमस्ते'), '??????');
  assert.equal(textWidth('iiii', 10), 4 * 2.22);
  assert.ok(textWidth('Total', 10, true) > textWidth('Total', 10, false));
});

test('an invoice PDF has the number, the lines, the tax split and PAID; long invoices flow onto more pages; odd text does not break it', () => {
  const r = buildSubscriptionInvoice({ ...base, amountPaise: 149000, treatment: { mode: 'inclusive', rate: '18' } });
  assert.ok(r.ok);
  const doc = { ...r.doc, number: 'INV-0007' };
  const text = new TextDecoder().decode(invoicePdf(doc, { status: 'paid', amountPaid: 1490 }));
  for (const needle of ['TAX INVOICE', 'INV-0007', 'Invoice Pro - monthly plan', 'CGST 9%', 'SGST 9%', 'Rs. 1,490.00', 'PAID', 'Beam Me Up']) assert.ok(text.includes(needle), needle);

  const many = { ...doc, items: Array.from({ length: 80 }, (_, i) => ({ id: `i${i}`, description: `Line ${i} नमस्ते and a long description that goes on and on to wrap across the column width`, qty: '1', rate: '10' })) };
  const big = new TextDecoder().decode(invoicePdf(many, { status: 'unpaid', amountPaid: 0 }));
  assert.ok(Number(/\/Count (\d+)/.exec(big)![1]) >= 3, 'long invoices run to more pages');
  assert.ok(!big.includes('PAID'));
  assert.ok(big.includes('Line 79'));
});

// ---- the database --------------------------------------------------------------------------------------------

let db: Db;
let close: () => Promise<void>;
before(async () => {
  ({ db, close } = await makeTestDb());
});
after(async () => {
  await close();
});

let n = 0;
async function user(email: string, name = 'Pat Example'): Promise<string> {
  const [u] = await db.insert(authUsers).values({ name, email, emailVerified: true }).returning({ id: authUsers.id });
  return u.id;
}
async function seller(email = 'seller@example.test', overrides: Record<string, unknown> = {}): Promise<string> {
  const id = await user(email, 'Seller');
  const cleaned = cleanSettings({ ...SELLER, defaultCurrency: 'INR', defaultTaxLabel: 'GST', defaultTaxRate: '18', defaultDueDays: 14, defaultNotes: '', invoicePrefix: 'INV-', nextSequence: 1, showUpiQr: false, quotePrefix: 'QT-', quoteNextNumber: 1, defaultTemplate: 'classic', defaultBrandColor: '#0C2248', bankAccountName: '', ...overrides });
  assert.ok(cleaned.ok, JSON.stringify(cleaned));
  await saveProfile(db, id, cleaned.value, undefined, undefined);
  return id;
}
async function paidPayment(buyerId: string, planKey = 'invoice_pro', period: 'month' | 'year' = 'month'): Promise<string> {
  const price = await priceFor(db, planKey, period);
  assert.ok(price);
  const id = await createPendingPayment(db, buyerId, price);
  const orderId = `order_m2_${++n}`;
  await attachOrder(db, id, orderId);
  await processBillingEvent(db, `evt_m2_${n}`, 'captured', { kind: 'captured', paymentId: `pay_m2_${n}`, orderId, amountPaise: price.amountPaise, currency: 'INR' });
  return id;
}
const ENV = { BILLING_SELLER_EMAIL: 'seller@example.test', BILLING_TAX_TREATMENT: 'none' };

test('a verified payment queues exactly one invoice job; redelivery adds none; a lost queue write is repaired', async () => {
  const buyer = await user('buyer-queue@example.test');
  const pay = await paidPayment(buyer);
  assert.equal((await db.select().from(outbox).where(eq(outbox.dedupeKey, `billing_invoice:${pay}`))).length, 1);
  assert.equal(await queueInvoiceFor(db, pay), false, 'already queued');
  await db.delete(outbox).where(eq(outbox.dedupeKey, `billing_invoice:${pay}`)); // the first delivery died before queueing
  const [p] = await db.select().from(billingPayments).where(eq(billingPayments.id, pay));
  await processBillingEvent(db, 'evt_repair', 'captured', { kind: 'captured', paymentId: p.razorpayPaymentId!, orderId: p.razorpayOrderId!, amountPaise: p.amountPaise, currency: 'INR' });
  assert.equal((await db.select().from(outbox).where(eq(outbox.dedupeKey, `billing_invoice:${pay}`))).length, 1, 'the redelivery put it back');
});

test('nothing is invoiced until the seller account and tax treatment are set, and the reason is named', async () => {
  const buyer = await user('buyer-blocked@example.test');
  const pay = await paidPayment(buyer);
  assert.deepEqual(await issueInvoice(db, pay, {}), { ok: false, kind: 'blocked', code: 'seller_account_not_set' });
  assert.deepEqual(await issueInvoice(db, pay, { BILLING_SELLER_EMAIL: 'nobody@example.test', BILLING_TAX_TREATMENT: 'none' }), { ok: false, kind: 'blocked', code: 'seller_account_missing' });
  await user('seller-noprofile@example.test');
  assert.deepEqual(await issueInvoice(db, pay, { BILLING_SELLER_EMAIL: 'seller-noprofile@example.test', BILLING_TAX_TREATMENT: 'none' }), { ok: false, kind: 'blocked', code: 'seller_not_configured' });
  const [p] = await db.select().from(billingPayments).where(eq(billingPayments.id, pay));
  assert.equal(p.invoiceId, null);
  assert.equal(p.invoicedAt, null, 'a blocked attempt leaves nothing half-done');
});

test('a paid subscription becomes one numbered invoice in the seller account, settled in its ledger; running it again changes nothing', async () => {
  const sellerId = await seller();
  const buyer = await user('buyer-one@example.test', 'Pat Example');
  const pay = await paidPayment(buyer);
  const first = await issueInvoice(db, pay, ENV);
  assert.ok(first.ok && first.created, JSON.stringify(first));
  assert.equal(first.number, 'INV-0001');
  const [inv] = await db.select().from(invoices).where(eq(invoices.id, first.invoiceId));
  assert.equal(inv.userId, sellerId);
  assert.equal(inv.status, 'paid');
  assert.equal(inv.total, 149);
  assert.equal(inv.amountPaid, 149);
  assert.equal((inv.data as { number: string }).number, 'INV-0001', 'the number inside the document matches');
  assert.equal((inv.data as { client: { name: string } }).client.name, 'Pat Example');
  const ledger = await db.select().from(invoicePayments).where(eq(invoicePayments.invoiceId, first.invoiceId));
  assert.equal(ledger.length, 1);

  const again = await issueInvoice(db, pay, ENV);
  assert.ok(again.ok && !again.created && again.invoiceId === first.invoiceId && again.number === 'INV-0001');
  assert.equal((await db.select().from(invoices).where(eq(invoices.userId, sellerId))).length, 1);
  assert.equal((await db.select().from(invoicePayments).where(eq(invoicePayments.invoiceId, first.invoiceId))).length, 1);
});

test('many payments issued at once get unique, gapless numbers and one invoice each', async () => {
  const sellerId = await seller('seller-race@example.test');
  const env = { ...ENV, BILLING_SELLER_EMAIL: 'seller-race@example.test' };
  const pays: string[] = [];
  for (let i = 0; i < 12; i++) pays.push(await paidPayment(await user(`race${i}@example.test`)));
  const results = await Promise.all([...pays, ...pays].map((p) => issueInvoice(db, p, env))); // every payment twice, at once
  assert.ok(results.every((r) => r.ok));
  const numbers = (await db.select({ number: invoices.number }).from(invoices).where(eq(invoices.userId, sellerId))).map((r) => r.number).sort();
  assert.equal(numbers.length, 12);
  assert.equal(new Set(numbers).size, 12, 'no duplicates');
  assert.deepEqual(numbers, Array.from({ length: 12 }, (_, i) => `INV-${String(i + 1).padStart(4, '0')}`), 'no gaps');
  assert.equal((await db.select().from(invoicePayments)).filter((l) => pays.length && l.userId === sellerId).length, 12);
});

test('a refunded or failed payment is not invoiced; a deleted buyer account is skipped; a deleted invoice is not remade', async () => {
  await seller('seller-skip@example.test');
  const env = { ...ENV, BILLING_SELLER_EMAIL: 'seller-skip@example.test' };
  const buyer = await user('buyer-skip@example.test');
  const pay = await paidPayment(buyer);
  await db.update(billingPayments).set({ status: 'refunded' }).where(eq(billingPayments.id, pay));
  assert.deepEqual(await issueInvoice(db, pay, env), { ok: false, kind: 'skip', code: 'payment_is_refunded' });

  const pay2 = await paidPayment(await user('buyer-gone@example.test'));
  await db.update(billingPayments).set({ userId: null }).where(eq(billingPayments.id, pay2));
  assert.deepEqual(await issueInvoice(db, pay2, env), { ok: false, kind: 'skip', code: 'buyer_account_gone' });

  const pay3 = await paidPayment(await user('buyer-del@example.test'));
  const made = await issueInvoice(db, pay3, env);
  assert.ok(made.ok);
  await db.delete(invoices).where(eq(invoices.id, made.invoiceId));
  assert.deepEqual(await issueInvoice(db, pay3, env), { ok: false, kind: 'skip', code: 'invoice_deleted_by_seller' });
});

// ---- links ---------------------------------------------------------------------------------------------------

test('a link opens exactly one invoice, counts views, and wrong, revoked or expired links are all the same nothing', async () => {
  const sellerId = await seller('seller-links@example.test');
  const env = { ...ENV, BILLING_SELLER_EMAIL: 'seller-links@example.test' };
  const a = await issueInvoice(db, await paidPayment(await user('la@example.test')), env);
  const b = await issueInvoice(db, await paidPayment(await user('lb@example.test')), env);
  assert.ok(a.ok && b.ok);
  const link = await createLink(db, SECRET, { invoiceId: a.invoiceId, userId: sellerId, purpose: 'share' });
  const opened = await resolveLink(db, link.token);
  assert.ok(opened);
  assert.equal(opened.number, a.number);
  assert.equal(opened.status, 'paid');
  assert.ok(!('userId' in opened) && !JSON.stringify(opened).includes(sellerId), 'no account id leaks to the page');
  await resolveLink(db, link.token);
  const [row] = await db.select().from(invoiceLinks).where(eq(invoiceLinks.id, link.id));
  assert.equal(row.viewCount, 2);
  assert.ok(row.firstViewedAt && row.lastViewedAt);
  assert.notEqual(row.tokenHash, link.token, 'only a hash is stored');

  for (const bad of [await deriveToken(SECRET, crypto.randomUUID()), 'x'.repeat(22), 'short', '', link.token.toUpperCase() === link.token ? link.token.toLowerCase() : link.token.toUpperCase()]) {
    if (bad === link.token) continue;
    assert.equal(await resolveLink(db, bad), null, bad);
  }
  await db.update(invoiceLinks).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(invoiceLinks.id, link.id));
  assert.equal(await resolveLink(db, link.token), null, 'expired');
  await db.update(invoiceLinks).set({ expiresAt: null }).where(eq(invoiceLinks.id, link.id));
  assert.ok(await resolveLink(db, link.token), 'not expired again');
  assert.equal(await revokeLinks(db, 'e8c2b8a0-0000-4000-8000-000000000000', a.invoiceId), 0, 'someone else can not revoke it');
  assert.ok(await resolveLink(db, link.token));
  assert.equal(await revokeLinks(db, sellerId, a.invoiceId), 1);
  assert.equal(await resolveLink(db, link.token), null, 'revoked');
  assert.equal((await liveLinks(db, SECRET, sellerId, a.invoiceId)).length, 0);
  assert.equal(await resolveLink(db, (await createLink(db, SECRET, { invoiceId: b.invoiceId, userId: sellerId, purpose: 'share' })).token).then((r) => r?.number), b.number, 'each link opens its own invoice');
});

test('the same link can be rebuilt later, and one live link per purpose is reused', async () => {
  const sellerId = await seller('seller-reuse@example.test');
  const env = { ...ENV, BILLING_SELLER_EMAIL: 'seller-reuse@example.test' };
  const made = await issueInvoice(db, await paidPayment(await user('reuse@example.test')), env);
  assert.ok(made.ok);
  const one = await ensureLink(db, SECRET, { invoiceId: made.invoiceId, userId: sellerId, purpose: 'billing' });
  const two = await ensureLink(db, SECRET, { invoiceId: made.invoiceId, userId: sellerId, purpose: 'billing' });
  assert.deepEqual(two, one);
  assert.equal(await billingLinkToken(db, SECRET, made.invoiceId), one.token);
  const share = await ensureLink(db, SECRET, { invoiceId: made.invoiceId, userId: sellerId, purpose: 'share' });
  assert.notEqual(share.token, one.token);
});

// ---- the outbox ----------------------------------------------------------------------------------------------

test('the outbox: a job is added once, taken once, retried with a back-off, and given up on loudly', async () => {
  assert.equal(await enqueue(db, 'billing_invoice', 'ob-1', { a: 1 }), true);
  assert.equal(await enqueue(db, 'billing_invoice', 'ob-1', { a: 2 }), false);
  const [first] = await claimDue(db, 500).then((js) => js.filter((j) => j.dedupeKey === 'ob-1'));
  assert.ok(first);
  assert.equal(first.attempts, 1);
  assert.equal((await claimDue(db, 500)).filter((j) => j.dedupeKey === 'ob-1').length, 0, 'a job being worked on is not taken again');

  // Each failure waits longer; after the last allowed attempt the job is dead and visible.
  let job = first;
  for (let attempt = 1; attempt < MAX_ATTEMPTS; attempt++) {
    assert.equal(await settle(db, job, { result: 'retry', code: 'boom' }), 'failed');
    const [row] = await db.select().from(outbox).where(eq(outbox.dedupeKey, 'ob-1'));
    const minutes = (row.nextAttemptAt.getTime() - Date.now()) / 60_000;
    const want = BACKOFF_MINUTES[attempt - 1];
    assert.ok(Math.abs(minutes - want) < 1, `attempt ${attempt} waits about ${want} minutes, got ${minutes.toFixed(1)}`);
    await db.update(outbox).set({ nextAttemptAt: new Date(Date.now() - 1000) }).where(eq(outbox.dedupeKey, 'ob-1'));
    job = (await claimDue(db, 500)).find((j) => j.dedupeKey === 'ob-1')!;
    assert.equal(job.attempts, attempt + 1);
  }
  assert.equal(await settle(db, job, { result: 'retry', code: 'boom' }), 'dead');
  assert.equal((await db.select().from(outbox).where(eq(outbox.dedupeKey, 'ob-1')))[0].status, 'dead');
  await db.update(outbox).set({ nextAttemptAt: new Date(Date.now() - 1000) }).where(eq(outbox.dedupeKey, 'ob-1'));
  assert.equal((await claimDue(db, 500)).filter((j) => j.dedupeKey === 'ob-1').length, 0, 'dead jobs stay dead');
});

test('a job whose worker died is taken again after the claim times out; a blocked job waits without using up its tries', async () => {
  await enqueue(db, 'billing_invoice', 'ob-2', {});
  await claimDue(db, 50);
  assert.equal((await claimDue(db, 50)).filter((j) => j.dedupeKey === 'ob-2').length, 0);
  await db.execute(sql`update outbox set claimed_at = now() - interval '11 minutes' where dedupe_key = 'ob-2'`);
  const again = (await claimDue(db, 50)).find((j) => j.dedupeKey === 'ob-2');
  assert.ok(again, 'reclaimed');
  assert.equal(await settle(db, again, { result: 'blocked', code: 'seller_not_configured' }), 'blocked');
  const [row] = await db.select().from(outbox).where(eq(outbox.dedupeKey, 'ob-2'));
  assert.equal(row.status, 'blocked');
  assert.equal(row.attempts, 0);
  assert.equal(row.lastError, 'seller_not_configured');
});

test('one job that throws does not stop the others, and an unknown kind is blocked, not lost', async () => {
  await enqueue(db, 'billing_invoice', 'ob-3a', {});
  await enqueue(db, 'billing_invoice', 'ob-3b', {});
  await enqueue(db, 'billing_invoice', 'ob-3c', {});
  await db.execute(sql`update outbox set kind = 'mystery' where dedupe_key = 'ob-3c'`);
  const seen: string[] = [];
  const out = await runDue(db, {
    billing_invoice: async (job) => {
      seen.push(job.dedupeKey);
      if (job.dedupeKey === 'ob-3a') throw new Error('kaboom');
      return { result: 'sent', ref: 'r1' };
    },
  });
  assert.ok(seen.includes('ob-3a') && seen.includes('ob-3b'));
  assert.ok(out.failed >= 1 && out.sent >= 1 && out.blocked >= 1);
  const rows = await db.select().from(outbox);
  const by = (k: string) => rows.find((r) => r.dedupeKey === k)!;
  assert.equal(by('ob-3a').status, 'failed');
  assert.equal(by('ob-3b').status, 'sent');
  assert.equal(by('ob-3b').providerRef, 'r1');
  assert.equal(by('ob-3c').lastError, 'no_handler');
});

// ---- the whole job -------------------------------------------------------------------------------------------

test('the invoice job: makes the invoice, makes the link, emails it; a failed send retries without a second invoice or link', async () => {
  const sellerId = await seller('seller-job@example.test');
  const env = { ...ENV, BILLING_SELLER_EMAIL: 'seller-job@example.test', NEXT_PUBLIC_SITE_URL: 'https://kaamsolv.test' };
  const buyer = await user('buyer-job@example.test', 'Pat Example');
  const pay = await paidPayment(buyer);
  const jobRow = (await db.select().from(outbox).where(eq(outbox.dedupeKey, `billing_invoice:${pay}`)))[0];
  const job = { id: jobRow.id, kind: jobRow.kind, dedupeKey: jobRow.dedupeKey, payload: jobRow.payload as Record<string, unknown>, attempts: 1 };

  const sent: { to: string; subject: string; text: string; key?: string }[] = [];
  const failing = { env, secret: SECRET, send: async () => ({ ok: false as const, code: 'email_rejected_500' }) };
  const working = { env, secret: SECRET, send: async (email: { to: string; subject: string; text: string }, _from?: string, key?: string) => (sent.push({ ...email, key }), { ok: true as const, id: 'resend-id-1' }) };

  assert.deepEqual(await billingInvoiceJob(db, job, failing), { result: 'retry', code: 'email_rejected_500' });
  assert.equal((await db.select().from(invoices).where(eq(invoices.userId, sellerId))).length, 1, 'the invoice exists even though the email failed');
  assert.equal((await db.select().from(invoiceLinks)).filter((l) => l.userId === sellerId).length, 1);

  assert.deepEqual(await billingInvoiceJob(db, job, { ...failing, send: async () => ({ ok: false as const, code: 'email_not_configured' }) }), { result: 'blocked', code: 'email_not_configured' });

  const ok = await billingInvoiceJob(db, { ...job, attempts: 2 }, working);
  assert.deepEqual(ok, { result: 'sent', ref: 'resend-id-1' });
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, 'buyer-job@example.test');
  assert.equal(sent[0].key, job.dedupeKey, 'the provider is given a stable idempotency key');
  const url = /https:\/\/kaamsolv\.test\/i\/([A-Za-z0-9_-]{22})/.exec(sent[0].text);
  assert.ok(url, 'the email carries the link');
  const opened = await resolveLink(db, url[1]);
  assert.ok(opened && opened.number === 'INV-0001' && opened.status === 'paid');
  assert.equal((await db.select().from(invoices).where(eq(invoices.userId, sellerId))).length, 1, 'still one invoice');
  assert.equal((await db.select().from(invoiceLinks)).filter((l) => l.userId === sellerId).length, 1, 'still one link');

  // "Email it to me again": another job, the same invoice and link.
  assert.equal(await queueResend(db, pay, 1_000_000), true);
  assert.equal(await queueResend(db, pay, 1_000_100), false, 'twice in a minute is one');
  const resent = await billingInvoiceJob(db, { ...job, dedupeKey: `billing_invoice_resend:${pay}:x`, attempts: 1 }, working);
  assert.equal(resent.result, 'sent');
  assert.equal(sent.length, 2);
  assert.equal(sent[1].text.match(/\/i\/([A-Za-z0-9_-]{22})/)![1], url[1], 'the same link');
  assert.equal((await db.select().from(invoices).where(eq(invoices.userId, sellerId))).length, 1);
});

test('a job for a payment that can not be invoiced finishes quietly; one waiting on a setting is blocked, not failed', async () => {
  await seller('seller-job2@example.test');
  const pay = await paidPayment(await user('buyer-job2@example.test'));
  const job = { id: crypto.randomUUID(), kind: 'billing_invoice', dedupeKey: `x:${pay}`, payload: { paymentId: pay }, attempts: 1 };
  const send = async () => ({ ok: true as const, id: 'x' });
  assert.deepEqual(await billingInvoiceJob(db, job, { env: {}, send, secret: SECRET }), { result: 'blocked', code: 'seller_account_not_set' });
  const empty = await billingInvoiceJob(db, { ...job, payload: {} }, { env: {}, send, secret: SECRET });
  assert.equal(empty.result, 'sent');
});

test('the seller sees these sales in the ordinary invoice list and the dashboard figures', async () => {
  const sellerId = await seller('seller-view@example.test');
  const env = { ...ENV, BILLING_SELLER_EMAIL: 'seller-view@example.test' };
  await issueInvoice(db, await paidPayment(await user('view1@example.test')), env);
  await issueInvoice(db, await paidPayment(await user('view2@example.test'), 'qr_pro', 'year'), env);
  const rows = await db.select({ number: invoices.number, total: invoices.total, status: invoices.status }).from(invoices).where(eq(invoices.userId, sellerId)).orderBy(invoices.number);
  assert.deepEqual(rows, [
    { number: 'INV-0001', total: 149, status: 'paid' },
    { number: 'INV-0002', total: 990, status: 'paid' },
  ]);
});

test('the seller account and its sales invoices can not be deleted; an ordinary account and invoice still can', async () => {
  const sellerId = await seller('seller-guard@example.test');
  const env = { ...ENV, BILLING_SELLER_EMAIL: 'seller-guard@example.test' };
  const made = await issueInvoice(db, await paidPayment(await user('guard-buyer@example.test')), env);
  assert.ok(made.ok);
  assert.equal(await holdsSalesInvoices(db, sellerId), true);
  await assert.rejects(deleteInvoice(db, sellerId, made.invoiceId), SalesInvoiceError);
  assert.equal((await db.select().from(invoices).where(eq(invoices.id, made.invoiceId))).length, 1, 'still there');

  // Someone else's id is simply "not found", not "protected".
  assert.equal(await deleteInvoice(db, await user('guard-other@example.test'), made.invoiceId), false);
  // The seller's own ordinary invoices are deletable as before.
  const ordinary = await db.insert(invoices).values({ userId: sellerId, number: 'MINE-1', currency: 'INR', total: 5, data: {} }).returning({ id: invoices.id });
  assert.equal(await deleteInvoice(db, sellerId, ordinary[0].id), true);
  assert.equal(await holdsSalesInvoices(db, await user('guard-plain@example.test')), false);
});

test('the status report shows counts and ids only, and which settings are set by name', async () => {
  const report = await billingReport(db);
  assert.ok(report.payments.some((p) => p.status === 'paid'));
  assert.ok(Array.isArray(report.stuckJobs) && Array.isArray(report.problemEvents) && Array.isArray(report.paidNotInvoiced));
  const everything = JSON.stringify(report);
  assert.ok(!/@example\.test/.test(everything), 'no email addresses in the report');
  const present = billingSettingsPresent({ RAZORPAY_KEY_ID: 'x', CRON_SECRET: '  ' });
  assert.deepEqual(present.find((s) => s.name === 'RAZORPAY_KEY_ID'), { name: 'RAZORPAY_KEY_ID', set: true });
  assert.deepEqual(present.find((s) => s.name === 'CRON_SECRET'), { name: 'CRON_SECRET', set: false });
  assert.ok(!JSON.stringify(present).includes('"x"'), 'values are never included');
});
