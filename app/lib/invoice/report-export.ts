/**
 * Builds a report file in the browser from the server's small pages (app/api/invoices/reports).
 *
 *   • Sequential page requests (one at a time — each is a cheap read), with progress after every page.
 *   • Cancel: the caller's AbortSignal stops the next request and the file is never built.
 *   • A dropped connection or a 5xx is retried twice; anything else (not allowed, too many rows, rate limit,
 *     a bad request) stops the export with the server's own words.
 *   • Not one atomic snapshot — so every page carries the totals over all matches, and the export stops if they
 *     change between pages ("your invoices changed while exporting").
 *   • Before a file is offered, the rows received are added up and compared with the server's totals
 *     (`verifyRows`, whole paise): a dropped page or a changed figure means no file.
 *   • The file itself is `toCsv`: quoting, spreadsheet-formula defusing, CRLF and the UTF-8 byte-order mark.
 *
 * Framework-free; `fetch` is injectable so the whole flow is tested without a browser.
 */

import { toCsv } from './csv';
import { reportFilename, parseReportQuery, verifyRows, type Column, type ReportTotals } from './reports';

export type ExportErrorCode = 'invalid' | 'forbidden' | 'too_many' | 'rate_limited' | 'changed' | 'integrity' | 'network' | 'server';

export class ReportExportError extends Error {
  constructor(
    public readonly code: ExportErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ReportExportError';
  }
}

export type ReportPage = {
  ok: true;
  report: string;
  title: string;
  currency: string;
  today: string;
  columns: Column[];
  rows: string[][];
  totals: ReportTotals;
  matched: number;
  page: number;
  pages: number;
  pageSize: number;
  cap: number;
  blanked: number;
};

export type ExportProgress = { page: number; pages: number; rows: number; matched: number };

export type ExportResult = { blob: Blob; filename: string; rows: number; totals: ReportTotals; blanked: number };

type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException('Aborted', 'AbortError'));
    const t = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => (clearTimeout(t), reject(new DOMException('Aborted', 'AbortError'))), { once: true });
  });

const abortError = () => new DOMException('Aborted', 'AbortError');

/** How many rows page `n` must hold, given the first page's size and the total number of matches. */
const rowsOnPage = (first: Pick<ReportPage, 'pageSize' | 'matched' | 'report'>, n: number) =>
  first.report === 'ageing' ? first.matched : Math.max(0, Math.min(first.pageSize, first.matched - (n - 1) * first.pageSize));

/** One page, retried on a dropped connection or a server error. Everything else stops with the server's message. */
export async function fetchReportPage(
  params: URLSearchParams,
  page: number,
  opts: { signal?: AbortSignal; fetcher?: Fetcher; retryDelayMs?: number } = {},
): Promise<ReportPage> {
  const fetcher: Fetcher = opts.fetcher ?? ((u, i) => fetch(u, i));
  const q = new URLSearchParams(params);
  q.set('page', String(page));
  let lastError: ReportExportError = new ReportExportError('network', 'Couldn’t reach KaamSolv. Check your connection and try again.');
  for (let attempt = 0; attempt < 3; attempt++) {
    if (opts.signal?.aborted) throw abortError();
    if (attempt > 0) await sleep((opts.retryDelayMs ?? 600) * attempt, opts.signal);
    let res: Response;
    try {
      res = await fetcher(`/api/invoices/reports?${q}`, { credentials: 'same-origin', cache: 'no-store', signal: opts.signal });
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') throw e;
      lastError = new ReportExportError('network', 'Couldn’t reach KaamSolv. Check your connection and try again.');
      continue;
    }
    const body = (await res.json().catch(() => null)) as (Partial<ReportPage> & { error?: string; message?: string }) | null;
    if (res.ok && body?.ok) return body as ReportPage;
    const message = body?.message || 'That report didn’t load. Try again.';
    if (res.status >= 500) {
      lastError = new ReportExportError('server', message);
      continue;
    }
    if (res.status === 403) throw new ReportExportError('forbidden', message);
    if (res.status === 413) throw new ReportExportError('too_many', message);
    if (res.status === 429) throw new ReportExportError('rate_limited', message);
    throw new ReportExportError('invalid', message);
  }
  throw lastError;
}

/**
 * Reads every page, checks the whole, and returns the CSV. `params` are the report parameters without `page`.
 * Throws `ReportExportError` (or an `AbortError` when cancelled).
 */
export async function exportReport(
  params: URLSearchParams,
  opts: { signal?: AbortSignal; onProgress?: (p: ExportProgress) => void; fetcher?: Fetcher; retryDelayMs?: number } = {},
): Promise<ExportResult> {
  const parsed = parseReportQuery(params);
  if (!parsed.ok) throw new ReportExportError('invalid', parsed.message);
  const base = new URLSearchParams(params);
  base.delete('page');
  base.delete('pageSize');

  const first = await fetchReportPage(base, 1, opts);
  const fingerprint = JSON.stringify([first.totals, first.matched, first.columns]);
  if (first.page !== 1 || first.rows.length !== rowsOnPage(first, 1)) throw new ReportExportError('integrity', 'A page of the report came back wrong. Run it again.');
  const rows: string[][] = [...first.rows];
  let blanked = first.blanked;
  opts.onProgress?.({ page: 1, pages: first.pages, rows: rows.length, matched: first.matched });

  for (let page = 2; page <= first.pages; page++) {
    if (opts.signal?.aborted) throw abortError();
    const next = await fetchReportPage(base, page, opts);
    if (JSON.stringify([next.totals, next.matched, next.columns]) !== fingerprint) {
      throw new ReportExportError('changed', 'Your invoices or payments changed while exporting, so the file wouldn’t add up. Run it again.');
    }
    if (next.page !== page || next.rows.length !== rowsOnPage(first, page)) {
      throw new ReportExportError('integrity', 'A page of the report came back wrong. Run it again.');
    }
    rows.push(...next.rows);
    blanked += next.blanked;
    opts.onProgress?.({ page, pages: first.pages, rows: rows.length, matched: first.matched });
  }
  if (opts.signal?.aborted) throw abortError();

  const check = verifyRows(first.columns, rows, first.totals);
  if (!check.ok) throw new ReportExportError('integrity', check.message);

  const csv = toCsv([first.columns.map((c) => c.label), ...rows]);
  return {
    blob: new Blob([csv], { type: 'text/csv;charset=utf-8' }),
    filename: reportFilename(parsed.value),
    rows: rows.length,
    totals: first.totals,
    blanked,
  };
}
