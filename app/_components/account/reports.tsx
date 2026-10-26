'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { INPUT, PRIMARY, SECONDARY } from './account-shell';
import { Segmented } from '../choice';
import { PRESET_LABELS, RANGE_PRESETS, financialYearLabel, resolvePreset, validateRange, type RangePreset } from '@/app/lib/invoice/collections';
import { isoDate } from '@/app/lib/invoice/defaults';
import { invoicesHref } from '@/app/lib/invoice/filters';
import { formatMoney } from '@/app/lib/invoice/money';
import { METHOD_LABELS, PAYMENT_METHODS, type PaymentMethod } from '@/app/lib/invoice/payments';
import { ReportExportError, exportReport, fetchReportPage, type ExportProgress } from '@/app/lib/invoice/report-export';
import { OPERATIONAL_NOTE, OUTSTANDING_STATES, REPORTS, REPORT_BASIS, REPORT_LABELS, bucketLabel, type ReportKind, type ReportTotals } from '@/app/lib/invoice/reports';
import { AGEING_BUCKETS } from '@/app/lib/invoice/collections';
import { FILTER_STATES, STATE_FILTER_LABELS, type FilterState } from '@/app/lib/invoice/filters';
import type { CurrencyCode } from '@/app/lib/invoice/types';
import { downloadBlob } from '@/app/lib/image/export';

type Customer = { id: string; name: string };
type Currency = { code: CurrencyCode; invoices: number; outstanding: number };
type Preview = { matched: number; totals: ReportTotals; cap: number };

const REPORT_HINT: Record<ReportKind, string> = {
  register: 'Every invoice issued in the period',
  payments: 'Every payment received in the period',
  outstanding: 'Everything still owed, as of today',
  ageing: 'What’s owed, by how overdue it is',
};

const plural = (n: number, w: string) => `${n.toLocaleString('en-IN')} ${w}${n === 1 ? '' : 's'}`;

/**
 * Invoices → Reports & exports (Pro). Pick a report, narrow it, see what it will hold, download a CSV. The numbers
 * all come from the server; the file is put together here from its small pages (lib/invoice/report-export.ts),
 * checked against the server's totals, and only then offered. One currency per file, always.
 */
export function Reports() {
  const [today] = useState(() => isoDate(new Date()));
  const [report, setReport] = useState<ReportKind>('register');
  const [preset, setPreset] = useState<RangePreset>('fy');
  const [customFrom, setCustomFrom] = useState(() => resolvePreset('fy', isoDate(new Date())).from);
  const [customTo, setCustomTo] = useState(() => isoDate(new Date()));
  const [currencies, setCurrencies] = useState<Currency[] | null>(null);
  const [currency, setCurrency] = useState<CurrencyCode | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customer, setCustomer] = useState('');
  const [state, setState] = useState('');
  const [bucket, setBucket] = useState('');
  const [method, setMethod] = useState('');
  const [includeVoided, setIncludeVoided] = useState(false);

  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewError, setPreviewError] = useState<{ message: string; tooMany: boolean } | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  const [progress, setProgress] = useState<ExportProgress | null>(null);
  const [exporting, setExporting] = useState(false);
  const [result, setResult] = useState<{ tone: 'ok' | 'error' | 'info'; message: string } | null>(null);
  const exportAbort = useRef<AbortController | null>(null);
  const previewAbort = useRef<AbortController | null>(null);
  const ids = useId();

  const periodApplies = report === 'register' || report === 'payments';
  const range = useMemo(() => (preset === 'custom' ? { from: customFrom, to: customTo } : resolvePreset(preset, today)), [preset, customFrom, customTo, today]);
  const rangeCheck = useMemo(() => validateRange(range.from, range.to), [range]);

  // The currencies this account has invoices in, and its saved customers.
  useEffect(() => {
    fetchReportMeta()
      .then((m) => {
        setCurrencies(m.currencies);
        setCurrency((c) => c ?? (m.currencies.find((x) => x.code === 'INR')?.code ?? m.currencies[0]?.code ?? 'INR'));
      })
      .catch((e: unknown) => setLoadError(e instanceof Error ? e.message : 'Couldn’t load this page.'));
    fetch('/api/customers', { credentials: 'same-origin', cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((b: { rows?: Customer[] } | null) => setCustomers(b?.rows ?? []))
      .catch(() => undefined);
  }, [attempt]);

  // Filters that don't belong to the chosen report are dropped, not sent.
  useEffect(() => {
    setState((s) => (report === 'register' ? s : report === 'payments' ? '' : (OUTSTANDING_STATES as readonly string[]).includes(s) ? s : ''));
    if (report !== 'outstanding') setBucket('');
    if (report !== 'payments') {
      setMethod('');
      setIncludeVoided(false);
    }
  }, [report]);

  const params = useMemo(() => {
    if (!currency) return null;
    const p = new URLSearchParams({ report, currency, today });
    if (periodApplies) {
      p.set('from', range.from);
      p.set('to', range.to);
    }
    if (customer) p.set('customer', customer);
    if (state) p.set('state', state);
    if (bucket) p.set('bucket', bucket);
    if (method) p.set('method', method);
    if (includeVoided) p.set('includeVoided', '1');
    return p;
  }, [report, currency, today, periodApplies, range, customer, state, bucket, method, includeVoided]);

  const ready = !!params && (!periodApplies || rangeCheck.ok);

  // What this choice will hold: one tiny request (a single row) for the count and the totals.
  useEffect(() => {
    previewAbort.current?.abort();
    setResult(null);
    if (!params || !ready) {
      setPreview(null);
      setPreviewError(null);
      return;
    }
    const ctl = new AbortController();
    previewAbort.current = ctl;
    setLoading(true);
    const q = new URLSearchParams(params);
    q.set('pageSize', '1');
    fetchReportPage(q, 1, { signal: ctl.signal })
      .then((p) => {
        setPreview({ matched: p.matched, totals: p.totals, cap: p.cap });
        setPreviewError(null);
        setLoading(false);
      })
      .catch((e: unknown) => {
        if (e instanceof DOMException && e.name === 'AbortError') return;
        setPreview(null);
        setPreviewError({ message: e instanceof Error ? e.message : 'Couldn’t load this report.', tooMany: e instanceof ReportExportError && e.code === 'too_many' });
        setLoading(false);
      });
    return () => ctl.abort();
  }, [params, ready, attempt]);

  useEffect(() => () => exportAbort.current?.abort(), []);

  async function download() {
    if (!params || exporting) return;
    const ctl = new AbortController();
    exportAbort.current = ctl;
    setExporting(true);
    setProgress({ page: 0, pages: 1, rows: 0, matched: preview?.matched ?? 0 });
    setResult(null);
    try {
      const out = await exportReport(params, { signal: ctl.signal, onProgress: setProgress });
      downloadBlob(out.blob, out.filename);
      setResult({
        tone: 'ok',
        message:
          `Done — ${plural(out.rows, 'row')} in ${out.filename}.` +
          (out.blanked ? ` ${plural(out.blanked, 'invoice')} had the tax columns left blank because the saved total no longer matches the lines; the total, received and balance are as saved.` : ''),
      });
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') setResult({ tone: 'info', message: 'Cancelled. Nothing was downloaded.' });
      else setResult({ tone: 'error', message: e instanceof Error ? e.message : 'Couldn’t make the file. Try again.' });
    } finally {
      setExporting(false);
      setProgress(null);
      exportAbort.current = null;
    }
  }

  if (loadError && !currencies) {
    return (
      <div role="alert" className="rounded-xl2 border border-hair bg-surface p-6">
        <p className="font-semibold text-ink">{loadError}</p>
        <button type="button" className={`${SECONDARY} mt-3`} onClick={() => (setLoadError(null), setAttempt((n) => n + 1))}>
          Try again
        </button>
      </div>
    );
  }
  if (!currencies) return <div className="h-64 animate-pulse rounded-xl2 bg-wash" aria-hidden="true" />;
  if (currencies.length === 0) {
    return (
      <div className="rounded-xl2 border border-dashed border-hair bg-surface p-8 text-center">
        <p className="font-display text-xl font-bold text-ink">Nothing to export yet</p>
        <p className="mt-2 text-muted">Save an invoice and record what you’re paid, and your reports show up here.</p>
        <a href="/invoice-generator" className={`${PRIMARY} mt-5`}>
          Make an invoice
        </a>
      </div>
    );
  }

  const money = (n: number) => formatMoney(n, currency ?? 'INR');
  const hasRows = !!preview && (preview.totals.report === 'ageing' ? preview.totals.count > 0 : preview.matched > 0);
  const canDownload = ready && hasRows && !previewError && !exporting && !loading;
  const empty = ready && !!preview && !previewError && !loading && !hasRows;

  return (
    <div className="space-y-8" aria-busy={loading || exporting}>
      <p className="rounded-lg border border-hair bg-wash p-3 text-sm text-strong" data-testid="rep-note">
        {OPERATIONAL_NOTE}
      </p>

      <fieldset className="grid gap-3 sm:grid-cols-2" data-testid="rep-kinds">
        <legend className="mb-2 text-sm font-semibold text-ink">Which report?</legend>
        {REPORTS.map((k) => (
          <label key={k} className="relative block">
            <input type="radio" name={`${ids}-report`} checked={report === k} onChange={() => setReport(k)} className="peer sr-only" data-testid={`rep-kind-${k}`} />
            <span className="block min-h-[4.5rem] cursor-pointer rounded-xl2 border border-hair bg-surface p-4 transition-colors hover:bg-wash peer-checked:border-coral-500 peer-checked:ring-2 peer-checked:ring-coral-500 peer-focus-visible:ring-2 peer-focus-visible:ring-coral-500 peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-surface">
              <span className="block font-semibold text-ink">
                {REPORT_LABELS[k]}
                {report === k && <span aria-hidden="true"> ✓</span>}
              </span>
              <span className="mt-0.5 block text-sm text-muted">{REPORT_HINT[k]}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <p className="-mt-4 text-sm text-muted" data-testid="rep-basis">
        {REPORT_BASIS[report]}
      </p>

      <section aria-label="Narrow it down" className="flex flex-wrap items-end gap-4">
        {periodApplies && (
          <div className="text-sm font-semibold text-ink">
            <label htmlFor={`${ids}-period`}>Period</label>
            <select id={`${ids}-period`} value={preset} onChange={(e) => setPreset(e.target.value as RangePreset)} className={`${INPUT} mt-1 block h-11 w-auto min-w-[14rem] text-sm`}>
              {RANGE_PRESETS.map((p) => (
                <option key={p} value={p}>
                  {PRESET_LABELS[p]}
                </option>
              ))}
            </select>
          </div>
        )}
        {periodApplies && preset === 'custom' && (
          <>
            <div className="text-sm font-semibold text-ink">
              <label htmlFor={`${ids}-from`}>From</label>
              <input id={`${ids}-from`} type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className={`${INPUT} mt-1 block h-11 w-auto text-sm`} />
            </div>
            <div className="text-sm font-semibold text-ink">
              <label htmlFor={`${ids}-to`}>To</label>
              <input id={`${ids}-to`} type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className={`${INPUT} mt-1 block h-11 w-auto text-sm`} />
            </div>
          </>
        )}
        {currencies.length > 1 && currency && (
          <Segmented<CurrencyCode> legend="Currency (one per file)" options={currencies.map((c) => ({ value: c.code, label: c.code }))} value={currency} onChange={setCurrency} />
        )}
        {customers.length > 0 && (
          <div className="text-sm font-semibold text-ink">
            <label htmlFor={`${ids}-customer`}>Customer</label>
            <select id={`${ids}-customer`} value={customer} onChange={(e) => setCustomer(e.target.value)} className={`${INPUT} mt-1 block h-11 w-auto min-w-[12rem] text-sm`}>
              <option value="">All customers</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        )}
        {(report === 'register' || report === 'outstanding' || report === 'ageing') && (
          <div className="text-sm font-semibold text-ink">
            <label htmlFor={`${ids}-state`}>Payment status</label>
            <select id={`${ids}-state`} value={state} onChange={(e) => setState(e.target.value)} className={`${INPUT} mt-1 block h-11 w-auto min-w-[12rem] text-sm`}>
              <option value="">{report === 'register' ? 'Any status' : 'Any that’s owed'}</option>
              {(report === 'register' ? FILTER_STATES : OUTSTANDING_STATES).map((s) => (
                <option key={s} value={s}>
                  {STATE_FILTER_LABELS[s as FilterState]}
                </option>
              ))}
            </select>
          </div>
        )}
        {report === 'outstanding' && (
          <div className="text-sm font-semibold text-ink">
            <label htmlFor={`${ids}-bucket`}>Age</label>
            <select id={`${ids}-bucket`} value={bucket} onChange={(e) => setBucket(e.target.value)} className={`${INPUT} mt-1 block h-11 w-auto min-w-[12rem] text-sm`}>
              <option value="">Any age</option>
              {AGEING_BUCKETS.map((b) => (
                <option key={b.key} value={b.key}>
                  {b.label}
                </option>
              ))}
            </select>
          </div>
        )}
        {report === 'payments' && (
          <>
            <div className="text-sm font-semibold text-ink">
              <label htmlFor={`${ids}-method`}>Method</label>
              <select id={`${ids}-method`} value={method} onChange={(e) => setMethod(e.target.value)} className={`${INPUT} mt-1 block h-11 w-auto min-w-[10rem] text-sm`}>
                <option value="">Any method</option>
                {PAYMENT_METHODS.map((m) => (
                  <option key={m} value={m}>
                    {METHOD_LABELS[m as PaymentMethod]}
                  </option>
                ))}
              </select>
            </div>
            <label className="flex min-h-11 items-center gap-2 text-sm font-semibold text-ink">
              <input type="checkbox" checked={includeVoided} onChange={(e) => setIncludeVoided(e.target.checked)} className="h-5 w-5 accent-coral-500" />
              Include voided payments
            </label>
          </>
        )}
      </section>
      {includeVoided && report === 'payments' && (
        <p className="-mt-4 text-sm text-muted">Voided payments are listed, labelled “Voided” and “Counted in totals: No” — they’re never added into the totals.</p>
      )}
      {periodApplies && !rangeCheck.ok && (
        <p role="alert" className="font-semibold text-danger-600">
          {rangeCheck.message}
        </p>
      )}
      {periodApplies && rangeCheck.ok && (preset === 'fy' || preset === 'fy-1') && <p className="-mt-4 text-sm text-muted">Financial year {financialYearLabel(range.from)}.</p>}

      {/* What the file will hold */}
      <section aria-label="What the file will hold" aria-live="polite" className="rounded-xl2 border border-hair bg-surface p-5" data-testid="rep-summary">
        {previewError ? (
          <div role="alert">
            <p className="font-semibold text-danger-600">{previewError.message}</p>
            {!previewError.tooMany && (
              <button type="button" className={`${SECONDARY} mt-3`} onClick={() => setAttempt((n) => n + 1)}>
                Try again
              </button>
            )}
          </div>
        ) : !ready ? (
          <p className="text-muted">Pick a valid period to see what the file will hold.</p>
        ) : !preview ? (
          <p className="text-muted">Checking…</p>
        ) : (
          <Summary kind={report} preview={preview} money={money} currency={currency ?? 'INR'} empty={empty} today={today} range={range} customer={customer} />
        )}
      </section>

      {/* Download */}
      <section aria-label="Download" className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className={PRIMARY} onClick={download} disabled={!canDownload} data-testid="rep-download">
            {exporting ? 'Making your file…' : 'Download CSV'}
          </button>
          {exporting && (
            <button type="button" className={SECONDARY} onClick={() => exportAbort.current?.abort()} data-testid="rep-cancel">
              Cancel
            </button>
          )}
        </div>
        {exporting && progress && (
          <div data-testid="rep-progress" role="status">
            <progress className="h-2 w-full max-w-md" max={Math.max(1, progress.pages)} value={progress.page} aria-label="Export progress" />
            <p className="mt-1 text-sm text-muted">
              {progress.page === 0 ? 'Starting…' : `Read ${progress.rows.toLocaleString('en-IN')} of ${progress.matched.toLocaleString('en-IN')} rows (page ${progress.page} of ${progress.pages}).`}
            </p>
          </div>
        )}
        {result && (
          <p role={result.tone === 'error' ? 'alert' : 'status'} className={`text-sm font-semibold ${result.tone === 'error' ? 'text-danger-600' : 'text-strong'}`} data-testid="rep-result">
            {result.message}
            {result.tone === 'error' && (
              <>
                {' '}
                <button type="button" className="underline underline-offset-2" onClick={download}>
                  Try again
                </button>
              </>
            )}
          </p>
        )}
        <p className="text-sm text-muted">
          Opens in Excel, Google Sheets and Numbers. Amounts are plain numbers with two decimals, one currency per file, dates as YYYY-MM-DD.
          Anything that could be read as a formula is stored as text so it can’t run.
        </p>
      </section>
    </div>
  );
}

async function fetchReportMeta(): Promise<{ currencies: Currency[] }> {
  const res = await fetch('/api/invoices/reports?report=meta', { credentials: 'same-origin', cache: 'no-store' });
  const body = (await res.json().catch(() => null)) as { ok?: boolean; currencies?: Currency[]; message?: string } | null;
  if (!res.ok || !body?.ok || !body.currencies) throw new Error(body?.message ?? 'Couldn’t load this page. Check your connection and try again.');
  return { currencies: body.currencies };
}

function Summary({
  kind,
  preview,
  money,
  currency,
  empty,
  today,
  range,
  customer,
}: {
  kind: ReportKind;
  preview: Preview;
  money: (n: number) => string;
  currency: CurrencyCode;
  empty: boolean;
  today: string;
  range: { from: string; to: string };
  customer: string;
}) {
  const t = preview.totals;
  const link = (f: Parameters<typeof invoicesHref>[0]) => invoicesHref({ currency, ...(customer ? { customer } : {}), ...f });
  if (empty) {
    return (
      <div>
        <p className="font-semibold text-ink" data-testid="rep-empty">
          Nothing matches yet.
        </p>
        <p className="mt-1 text-sm text-muted">Try a wider period or fewer filters. The file would only hold its header row.</p>
        {t.report === 'payments' && t.markedPaid.count > 0 && <MarkedPaidNote count={t.markedPaid.count} total={money(t.markedPaid.total)} />}
      </div>
    );
  }
  const row = (label: string, value: string, testId: string) => (
    <div key={testId} className="flex items-baseline justify-between gap-4 border-b border-hair py-2 last:border-0">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="font-display text-lg font-bold tabular-nums text-ink" data-testid={testId}>
        {value}
      </dd>
    </div>
  );
  return (
    <div>
      <p className="font-semibold text-ink" data-testid="rep-count">
        {t.report === 'payments'
          ? `${plural(t.counted.count, 'payment')}${t.voided ? ` + ${plural(t.voided.count, 'voided payment')}` : ''}`
          : t.report === 'ageing'
            ? `Four age groups · ${plural(t.count, 'invoice')}`
            : plural(preview.matched, 'invoice')}{' '}
        <span className="font-normal text-muted">in {currency}</span>
      </p>
      <dl className="mt-2 max-w-md">
        {t.report === 'register' && (
          <>
            {row('Invoiced', money(t.total), 'rep-total')}
            {row('Received so far', money(t.received), 'rep-received')}
            {row('Still owed', money(t.balance), 'rep-balance')}
          </>
        )}
        {t.report === 'payments' && (
          <>
            {row('Received in this period', money(t.counted.amount), 'rep-received')}
            {t.voided && row('Voided (not counted)', money(t.voided.amount), 'rep-voided')}
          </>
        )}
        {t.report === 'outstanding' && (
          <>
            {row('Still owed', money(t.balance), 'rep-balance')}
            {row('Of which overdue', money(t.overdue), 'rep-overdue')}
          </>
        )}
        {t.report === 'ageing' && (
          <>
            {t.buckets.map((b) => row(`${bucketLabel(b.bucket)} (${b.count})`, money(b.amount), `rep-bucket-${b.bucket}`))}
            {row('Total owed', money(t.balance), 'rep-balance')}
          </>
        )}
      </dl>
      {t.report === 'payments' && t.markedPaid.count > 0 && <MarkedPaidNote count={t.markedPaid.count} total={money(t.markedPaid.total)} />}
      <p className="mt-3 text-sm text-muted">
        {kind === 'register' && (
          <a href={link({ issuedFrom: range.from, issuedTo: range.to })} className="font-semibold underline underline-offset-2">
            See these invoices
          </a>
        )}
        {kind === 'outstanding' && (
          <a href={link({ state: 'outstanding' })} className="font-semibold underline underline-offset-2">
            See these invoices
          </a>
        )}
        {kind === 'payments' && (
          <a href="/app/invoices/collections" className="font-semibold underline underline-offset-2">
            Compare with Payments &amp; collections
          </a>
        )}
        {kind === 'ageing' && (
          <a href="/app/invoices/collections" className="font-semibold underline underline-offset-2">
            Compare with Payments &amp; collections
          </a>
        )}
        <span className="sr-only"> (as of {today})</span>
      </p>
    </div>
  );
}

function MarkedPaidNote({ count, total }: { count: number; total: string }) {
  return (
    <p className="mt-3 rounded-lg border border-hair bg-wash p-3 text-sm text-strong" data-testid="rep-marked">
      {plural(count, 'invoice')} ({total}) issued in this period {count === 1 ? 'was' : 'were'} marked paid before payments were recorded. {count === 1 ? 'It has' : 'They have'} no payment
      records, so {count === 1 ? 'it isn’t' : 'they aren’t'} listed or counted here — and none were made up.
    </p>
  );
}
