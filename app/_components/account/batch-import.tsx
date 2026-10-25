'use client';

import { useEffect, useRef, useState } from 'react';
import { PRIMARY, SECONDARY } from './account-shell';
import { zipInvoices } from '../invoice/pdf-zip';
import { downloadBlob } from '@/app/lib/image/export';
import { BATCH_MAX, buildBatch, templateCsv, type BatchPreview, type BatchProfile } from '@/app/lib/invoice/batch';
import { parseCsv } from '@/app/lib/invoice/csv';
import { isoDate } from '@/app/lib/invoice/defaults';
import { formatMoney } from '@/app/lib/invoice/money';
import { refreshMe, useEntitlements } from '@/app/lib/me-client';

const MAX_FILE_BYTES = 1_000_000;
type Created = { index: number; id: string; number: string }[];
type Existing = { number: string; clientName: string; total: number; issueDate: string | null; updatedAt: string };

/**
 * Pro: make several invoices from one CSV. Download the template → fill it →
 * upload → check the preview (each invoice, its total, anything wrong) →
 * create → download a ZIP of the PDFs. Reading and checking happen in the
 * browser; the server re-checks every invoice before saving. Every invoice is
 * saved before the ZIP is made, so a closed tab loses nothing: the ZIP can be
 * rebuilt from All invoices ("Download as ZIP").
 */
export function BatchImport() {
  const { can } = useEntitlements();
  const [profile, setProfile] = useState<BatchProfile | null>(null);
  const [existing, setExisting] = useState<Existing[]>([]);
  const [fileName, setFileName] = useState('');
  const [previews, setPreviews] = useState<BatchPreview[] | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [state, setState] = useState<'idle' | 'creating' | 'done'>('idle');
  const [created, setCreated] = useState<Created>([]);
  const [problem, setProblem] = useState<string | null>(null);
  const [zip, setZip] = useState<{ done: number; total: number } | null>(null);
  const [zipMsg, setZipMsg] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch('/api/settings', { credentials: 'same-origin', cache: 'no-store' })
      .then((r) => r.json())
      .then((b: { settings: BatchProfile }) => setProfile(b.settings))
      .catch(() => setProblem('Couldn’t load your settings. Refresh to try again.'));
    fetch('/api/invoices', { credentials: 'same-origin', cache: 'no-store' })
      .then((r) => r.json())
      .then((b: { invoices: Existing[] }) => setExisting(b.invoices))
      .catch(() => undefined);
  }, []);

  async function onFile(file: File | undefined) {
    setPreviews(null);
    setFileError(null);
    setProblem(null);
    setState('idle');
    if (!file || !profile) return;
    setFileName(file.name);
    if (file.size > MAX_FILE_BYTES) return setFileError('That file is over 1 MB. Split it into smaller files.');
    const rows = parseCsv(await file.text());
    const built = buildBatch(rows, profile, isoDate(new Date()));
    setFileError(built.fileError);
    // Anything that looks like one made in the last 24 hours is flagged, so a re-upload isn't a surprise.
    const day = 24 * 60 * 60 * 1000;
    for (const p of built.previews) {
      const twin = existing.find(
        (e) => e.clientName === p.invoice.client.name && e.total === p.total && e.issueDate === p.invoice.issueDate && Date.now() - Date.parse(e.updatedAt) < day,
      );
      if (twin) p.warnings.push(`Looks like ${twin.number}, made in the last 24 hours — creating it again makes a second invoice.`);
    }
    if (!built.fileError || built.previews.length) setPreviews(built.previews);
  }

  const ready = (previews ?? []).filter((p) => p.errors.length === 0);
  const blocked = (previews ?? []).length - ready.length;

  async function create() {
    if (!ready.length || state !== 'idle') return;
    setState('creating');
    setProblem(null);
    const res = await fetch('/api/invoices/batch', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ invoices: ready.map((p) => p.invoice) }),
    }).catch(() => null);
    const body = (await res?.json().catch(() => ({}))) as { created?: Created; failed?: number[]; message?: string } | undefined;
    if (!res || (!res.ok && !body?.created)) {
      setState('idle');
      setProblem(
        res
          ? (body?.message ?? 'Couldn’t create the invoices.')
          : 'The connection dropped. Some invoices may have been made — check All invoices before trying again, so you don’t make them twice.',
      );
      return;
    }
    setCreated(body?.created ?? []);
    if (body?.failed?.length) setProblem(`${body.failed.length} couldn’t be saved (your saved-invoice limit, perhaps). The others are saved.`);
    setState('done');
    void refreshMe();
  }

  async function makeZip() {
    const ctl = new AbortController();
    abort.current = ctl;
    setZipMsg(null);
    setZip({ done: 0, total: created.length });
    try {
      const r = await zipInvoices(
        created.map((c) => c.id),
        { watermark: !can('invoice_watermark_remove'), design: can('invoice_templates') || can('invoice_brand_color') },
        (done, total) => setZip({ done, total }),
        ctl.signal,
      );
      downloadBlob(r.blob, `kaamsolv-batch-${isoDate(new Date())}.zip`);
      setZipMsg(r.skipped.length ? `Done — ${r.made} PDFs. ${r.skipped.length} couldn’t be made; open them from All invoices.` : `Done — ${r.made} PDFs in your ZIP.`);
    } catch (e) {
      setZipMsg(e instanceof DOMException && e.name === 'AbortError' ? 'Cancelled. The invoices are saved — you can make the ZIP again.' : 'Couldn’t make the ZIP. The invoices are saved — try again, or use All invoices.');
    } finally {
      setZip(null);
      abort.current = null;
    }
  }

  function again() {
    setPreviews(null);
    setCreated([]);
    setFileName('');
    setFileError(null);
    setProblem(null);
    setZipMsg(null);
    setState('idle');
    if (input.current) input.current.value = '';
  }

  if (state === 'done') {
    return (
      <section aria-labelledby="done-h" className="space-y-5">
        <div className="rounded-xl2 border border-hair bg-surface p-5 sm:p-6">
          <h2 id="done-h" className="font-display text-xl font-bold text-ink">
            {created.length} invoice{created.length === 1 ? '' : 's'} made.
          </h2>
          <p className="mt-1 text-muted">They’re saved in your account: {created.map((c) => c.number).join(', ')}.</p>
          {problem && (
            <p className="mt-3 text-sm font-semibold text-danger-600" role="alert">
              {problem}
            </p>
          )}
          <div className="mt-4 flex flex-wrap items-center gap-3">
            {zip ? (
              <span className="inline-flex items-center gap-3 font-semibold text-ink" role="status">
                Making PDFs… {zip.done} of {zip.total}
                <button type="button" onClick={() => abort.current?.abort()} className={SECONDARY}>
                  Cancel
                </button>
              </span>
            ) : (
              <button type="button" onClick={() => void makeZip()} className={PRIMARY}>
                Download all as ZIP
              </button>
            )}
            <a href={`/app/invoices?select=${created.map((c) => c.id).join(',')}`} className={SECONDARY}>
              See them in All invoices
            </a>
            <button type="button" onClick={again} className={SECONDARY}>
              Make more
            </button>
          </div>
          {zipMsg && (
            <p className="mt-3 text-sm font-semibold text-ink" role="status">
              {zipMsg}
            </p>
          )}
        </div>
      </section>
    );
  }

  return (
    <div className="space-y-6">
      <ol className="space-y-5">
        <li className="rounded-xl2 border border-hair bg-surface p-5 sm:p-6">
          <h2 className="font-display text-lg font-bold text-ink">1. Get the template</h2>
          <p className="mt-1 text-sm text-muted">
            One row per line item. Rows with the same <strong className="text-ink">group</strong> become one invoice; a blank group is its own invoice. Your
            business details, tax, currency, payment details and design come from your Settings — the file only has what changes.
          </p>
          <button type="button" onClick={() => downloadBlob(new Blob([templateCsv()], { type: 'text/csv;charset=utf-8' }), 'kaamsolv-invoice-template.csv')} className={`${SECONDARY} mt-3`}>
            Download template
          </button>
        </li>
        <li className="rounded-xl2 border border-hair bg-surface p-5 sm:p-6">
          <h2 className="font-display text-lg font-bold text-ink">2. Upload your file</h2>
          <p className="mt-1 text-sm text-muted">A .csv, up to {BATCH_MAX} invoices and 1 MB. It’s read on your device first; nothing is saved until you press Create.</p>
          <label className="mt-3 block text-sm font-semibold text-ink">
            Choose a CSV file
            <input
              ref={input}
              type="file"
              accept=".csv,text/csv"
              disabled={!profile}
              onChange={(e) => void onFile(e.target.files?.[0])}
              className="mt-1 block w-full text-sm text-strong file:mr-3 file:h-11 file:cursor-pointer file:rounded-full file:border file:border-hair file:bg-surface file:px-5 file:text-sm file:font-semibold file:text-strong hover:file:bg-wash"
            />
          </label>
          {fileError && (
            <p className="mt-3 text-sm font-semibold text-danger-600" role="alert">
              {fileError}
            </p>
          )}
        </li>
      </ol>

      {previews && previews.length > 0 && (
        <section aria-labelledby="preview-h" className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 id="preview-h" className="font-display text-lg font-bold text-ink">
                3. Check the invoices
              </h2>
              <p className="text-sm text-muted" role="status">
                {fileName}: {ready.length} ready{blocked ? `, ${blocked} with problems (left out)` : ''}.
              </p>
            </div>
            <button type="button" onClick={() => void create()} disabled={!ready.length || state === 'creating'} className={PRIMARY}>
              {state === 'creating' ? 'Creating…' : `Create ${ready.length} invoice${ready.length === 1 ? '' : 's'}`}
            </button>
          </div>
          {problem && (
            <p className="text-sm font-semibold text-danger-600" role="alert">
              {problem}
            </p>
          )}
          <ul aria-label="Invoices from your file" className="divide-y divide-hair overflow-hidden rounded-xl2 border border-hair bg-surface">
            {previews.map((p) => (
              <li key={`${p.label}-${p.line}`} className="p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4">
                  <p className="font-semibold text-ink">
                    {p.invoice.client.name || 'No client'} <span className="font-normal text-muted">· {p.label} · {p.invoice.items.length} line{p.invoice.items.length === 1 ? '' : 's'}</span>
                  </p>
                  <p className="tabular-nums font-semibold text-ink">{formatMoney(p.total, p.invoice.currency)}</p>
                </div>
                {p.errors.length > 0 ? (
                  <ul className="mt-2 space-y-1 text-sm font-medium text-danger-600">
                    {p.errors.map((e) => (
                      <li key={e}>✕ {e}</li>
                    ))}
                    <li className="font-normal text-muted">This one won’t be created. Fix the file and upload it again, or carry on without it.</li>
                  </ul>
                ) : (
                  <p className="mt-1 text-sm text-muted">✓ Ready</p>
                )}
                {p.warnings.length > 0 && (
                  <ul className="mt-1 space-y-1 text-sm text-strong">
                    {p.warnings.map((w) => (
                      <li key={w}>⚠ {w}</li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
