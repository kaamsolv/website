/**
 * Builds the accountant pack for one owner and one calendar month: a ZIP of dated CSV files and a README, from the
 * same report queries (db/invoice-reports.ts) and CSV writer (app/lib/invoice/csv.ts) as Reports & exports. Nothing
 * is recomputed here; the tax summary adds up the register's own tax columns. Every query is scoped to `userId`.
 *
 * Bounded for a Worker: each report is read in its usual pages, but only up to a smaller cap than the Reports page
 * (a request may make only so many database calls). Over the cap, that file is replaced by a note that says to use
 * Reports & exports in parts. At most two currencies; one file per report per currency. Nothing is logged or stored.
 */

import { strToU8, zipSync } from 'fflate';
import { PACK_COVERAGE, SECTION_LABELS, periodOf, type PackSection } from '../app/lib/invoice/accountant.ts';
import { toCsv } from '../app/lib/invoice/csv.ts';
import { toCents } from '../app/lib/invoice/payments.ts';
import {
  COLUMNS,
  OPERATIONAL_NOTE,
  ageingCells,
  outstandingCells,
  paymentCells,
  registerCells,
  type ReportKind,
  type ReportQuery,
  type RegisterRow,
} from '../app/lib/invoice/reports.ts';
import type { CurrencyCode } from '../app/lib/invoice/types.ts';
import { listCurrencies } from './collections.ts';
import { ageingSummary, outstandingPage, paymentsPage, registerPage } from './invoice-reports.ts';
import type { Db } from './links.ts';

/** Most rows a pack holds per file (smaller than EXPORT_CAP: the pack is built within one request). */
export const PACK_ROW_CAP = { register: 2_000, payments: 5_000, outstanding: 2_000 } as const;
export const PACK_MAX_CURRENCIES = 2;

export type PackFile = { name: string; rows: number | null; note?: string };
export type PackSummary = { period: string; label: string; asOf: string; currencies: string[]; files: PackFile[] };
export type BuiltPack = { summary: PackSummary; zip: Uint8Array; filename: string };

const fixed = (cents: number): string => `${cents < 0 ? '-' : ''}${Math.floor(Math.abs(cents) / 100)}.${String(Math.abs(cents) % 100).padStart(2, '0')}`;

function query(report: ReportKind, currency: CurrencyCode, from: string, to: string, today: string, page: number): ReportQuery {
  const pageSize = report === 'register' ? 100 : report === 'ageing' ? 10 : 500;
  return { report, currency, today, from, to, includeVoided: false, page, pageSize };
}

/** Reads every page of a report up to `cap` rows. Returns null (not the rows) when more would match than the cap. */
async function allRows<T>(read: (page: number) => Promise<{ rows: T[]; matched: number }>, cap: number): Promise<T[] | null> {
  const first = await read(1);
  if (first.matched > cap) return null;
  const rows = [...first.rows];
  const pages = Math.ceil(first.matched / (first.rows.length || 1));
  for (let p = 2; rows.length < first.matched && p <= pages + 1; p++) {
    const next = await read(p);
    if (!next.rows.length) break;
    rows.push(...next.rows);
  }
  return rows;
}

function taxSummary(rows: RegisterRow[], currency: string): string[][] {
  let n = 0;
  let blank = 0;
  const sum = { subtotal: 0, discount: 0, taxable: 0, cgst: 0, sgst: 0, igst: 0, tax: 0, total: 0 };
  for (const r of rows) {
    n++;
    sum.total += toCents(r.total);
    if (r.taxable === null || r.tax === null) {
      blank++;
      continue;
    }
    sum.subtotal += toCents(r.subtotal ?? 0);
    sum.discount += toCents(r.discount ?? 0);
    sum.taxable += toCents(r.taxable);
    sum.cgst += toCents(r.cgst ?? 0);
    sum.sgst += toCents(r.sgst ?? 0);
    sum.igst += toCents(r.igst ?? 0);
    sum.tax += toCents(r.tax);
  }
  return [
    ['Currency', 'Invoices', 'Subtotal', 'Discount', 'Taxable value', 'CGST', 'SGST / UTGST', 'IGST', 'Total tax', 'Invoice total', 'Invoices without a tax breakdown'],
    [currency, String(n), fixed(sum.subtotal), fixed(sum.discount), fixed(sum.taxable), fixed(sum.cgst), fixed(sum.sgst), fixed(sum.igst), fixed(sum.tax), fixed(sum.total), String(blank)],
  ];
}

/**
 * Builds the pack. `today` is the India date it is built on (for "as of" columns). `build: false` returns the same
 * summary without the ZIP bytes cost (still reads the data, so counts are real). Returns null for a bad period.
 */
export async function buildPack(db: Db, userId: string, period: string, sections: readonly PackSection[], today: string, businessName: string): Promise<BuiltPack | null> {
  const p = periodOf(period);
  if (!p) return null;
  const currencies = (await listCurrencies(db, userId)).slice(0, PACK_MAX_CURRENCIES).map((c) => c.code);
  const files: PackFile[] = [];
  const out: Record<string, Uint8Array> = {};
  const dir = `kaamsolv-accountant-pack-${p.period}`;
  const add = (name: string, text: string, rows: number | null, note?: string) => {
    out[`${dir}/${name}`] = strToU8(text);
    files.push({ name, rows, ...(note ? { note } : {}) });
  };
  const tooMany = (name: string, what: string, cap: number) =>
    add(name.replace(/\.csv$/, '-NOT-INCLUDED.txt'), `${what} has more than ${cap.toLocaleString('en-IN')} rows for this month, which is more than a pack holds. Export it in parts from Reports & exports in KaamSolv.\r\n`, null, 'Too many rows for the pack');

  for (const cur of currencies) {
    const tag = `${cur}-${p.period}`;
    let register: RegisterRow[] | null | undefined;
    if (sections.includes('register') || sections.includes('tax_summary')) {
      register = await allRows((n) => registerPage(db, userId, query('register', cur, p.from, p.to, today, n)), PACK_ROW_CAP.register);
    }
    if (sections.includes('register')) {
      if (register) add(`invoice-register-${tag}.csv`, toCsv([COLUMNS.register.map((c) => c.label), ...register.map(registerCells)]), register.length);
      else tooMany(`invoice-register-${tag}.csv`, 'The invoice register', PACK_ROW_CAP.register);
    }
    if (sections.includes('tax_summary')) {
      if (register) add(`tax-summary-${tag}.csv`, toCsv(taxSummary(register, cur)), 1);
      else tooMany(`tax-summary-${tag}.csv`, 'The invoices this tax summary adds up', PACK_ROW_CAP.register);
    }
    if (sections.includes('payments')) {
      const rows = await allRows((n) => paymentsPage(db, userId, query('payments', cur, p.from, p.to, today, n)), PACK_ROW_CAP.payments);
      if (rows) add(`payments-received-${tag}.csv`, toCsv([COLUMNS.payments.map((c) => c.label), ...rows.map(paymentCells)]), rows.length);
      else tooMany(`payments-received-${tag}.csv`, 'The payments list', PACK_ROW_CAP.payments);
    }
    if (sections.includes('outstanding')) {
      const rows = await allRows((n) => outstandingPage(db, userId, query('outstanding', cur, '', '', today, n)), PACK_ROW_CAP.outstanding);
      if (rows) add(`outstanding-as-of-${today}-${cur}.csv`, toCsv([COLUMNS.outstanding.map((c) => c.label), ...rows.map(outstandingCells)]), rows.length);
      else tooMany(`outstanding-as-of-${today}-${cur}.csv`, 'The outstanding invoices list', PACK_ROW_CAP.outstanding);
    }
    if (sections.includes('ageing')) {
      const a = await ageingSummary(db, userId, query('ageing', cur, '', '', today, 1));
      add(`ageing-summary-as-of-${today}-${cur}.csv`, toCsv([COLUMNS.ageing.map((c) => c.label), ...a.rows.map(ageingCells)]), a.rows.length);
    }
  }

  const readme = [
    `KaamSolv accountant pack: ${p.label}`,
    `Prepared for the books of: ${businessName || 'the account holder'}`,
    `Period: ${p.from} to ${p.to} (India dates). Prepared on ${today}.`,
    `Currencies: ${currencies.length ? currencies.join(', ') : 'none (no invoices yet)'}. One set of files per currency; nothing is converted or added across currencies.`,
    '',
    'What is in this pack',
    ...(sections.map((s) => `- ${SECTION_LABELS[s]}`)),
    '',
    'Files',
    ...files.map((f) => `- ${f.name}${f.rows !== null ? ` (${f.rows} row${f.rows === 1 ? '' : 's'})` : ''}${f.note ? `: ${f.note}` : ''}`),
    '',
    'Read this first',
    ...PACK_COVERAGE.map((c) => `- ${c}`),
    '',
    OPERATIONAL_NOTE,
    '',
    'Amounts are plain numbers with two decimals; the currency has its own column.',
  ].join('\r\n');
  out[`${dir}/README.txt`] = strToU8(readme + '\r\n');
  files.unshift({ name: 'README.txt', rows: null });

  return {
    summary: { period: p.period, label: p.label, asOf: today, currencies, files },
    zip: zipSync(out, { level: 6 }),
    filename: `${dir}.zip`,
  };
}
