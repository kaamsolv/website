'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { INPUT, PRIMARY, SECONDARY } from './account-shell';
import { Pager } from './pager';
import { isoDate } from '@/app/lib/invoice/defaults';
import { GST_RATES } from '@/app/lib/invoice/gst';
import { GST_STATES, stateName } from '@/app/lib/invoice/india';
import { formatMoney } from '@/app/lib/invoice/money';
import { cleanCustomer, cleanItem } from '@/app/lib/invoice/settings';
import type { CurrencyCode } from '@/app/lib/invoice/types';
import { refreshMe } from '@/app/lib/me-client';

type Row = Record<string, string> & { id: string };
type FieldDef = { key: string; label: string; kind?: 'text' | 'area' | 'state' | 'gst' | 'unit'; max: number; inputMode?: 'decimal' | 'email' | 'tel' | 'numeric'; upper?: boolean; placeholder?: string };
type Stat = { invoiceCount: number; money: { currency: CurrencyCode; invoiced: number; outstanding: number; overdue: number }[] };

const UNITS = ['pcs', 'nos', 'hrs', 'days', 'months', 'kg', 'g', 'litre', 'm', 'sq ft', 'box', 'set'];
const PAGE_SIZE = 25;

const CONFIG = {
  customers: {
    api: '/api/customers',
    noun: 'customer',
    clean: cleanCustomer,
    empty: { name: '', contactName: '', email: '', phone: '', address: '', stateCode: '', gstin: '' },
    fields: [
      { key: 'name', label: 'Business or person', max: 80 },
      { key: 'contactName', label: 'Contact name', max: 80 },
      { key: 'email', label: 'Email', max: 120, inputMode: 'email' },
      { key: 'phone', label: 'Phone', max: 30, inputMode: 'tel' },
      { key: 'address', label: 'Billing address', kind: 'area', max: 200 },
      { key: 'stateCode', label: 'State', kind: 'state', max: 2 },
      { key: 'gstin', label: 'GSTIN', max: 15, upper: true, placeholder: 'Optional' },
    ] as FieldDef[],
    summary: (r: Row) => [r.contactName, r.gstin && `GSTIN ${r.gstin}`, stateName(r.stateCode)].filter(Boolean).join(' · '),
  },
  items: {
    api: '/api/items',
    noun: 'item',
    clean: cleanItem,
    empty: { name: '', hsnSac: '', unit: '', rate: '', gstRate: '' },
    fields: [
      { key: 'name', label: 'Name (as printed on the invoice)', max: 120 },
      { key: 'hsnSac', label: 'HSN / SAC code', max: 8, inputMode: 'numeric', placeholder: 'Optional — 4, 6 or 8 digits' },
      { key: 'unit', label: 'Unit', kind: 'unit', max: 12, placeholder: 'pcs, hrs, days…' },
      { key: 'rate', label: 'Default rate', max: 24, inputMode: 'decimal', placeholder: 'e.g. 1500 — filled in as typed' },
      { key: 'gstRate', label: 'GST rate', kind: 'gst', max: 6 },
    ] as FieldDef[],
    summary: (r: Row) => [r.hsnSac && `HSN/SAC ${r.hsnSac}`, r.rate && `Rate ${r.rate}${r.unit ? ` / ${r.unit}` : ''}`, r.gstRate && `GST ${r.gstRate}%`].filter(Boolean).join(' · '),
  },
} as const;

/**
 * Saved customers or items: search, add, edit, delete — 25 to a page, searched on the server, so a long list is
 * never cut off. Customers also show how many invoices are connected to them and what they owe, and link to
 * their own page. Saving a name you already have asks first (it is allowed — it is never merged).
 */
export function DirectoryManager({ kind }: { kind: keyof typeof CONFIG }) {
  const cfg = CONFIG[kind];
  const [rows, setRows] = useState<Row[] | null>(null);
  const [stats, setStats] = useState<Record<string, Stat>>({});
  const [total, setTotal] = useState(0);
  const [limit, setLimit] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [qInput, setQInput] = useState('');
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<Row | 'new' | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({ ...cfg.empty });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const opened = useRef(false);
  /** The search text the list currently reflects, and which request is the latest — so a late answer can't overwrite a newer one. */
  const appliedQ = useRef('');
  const latest = useRef(0);

  const load = useCallback(async () => {
    const mine = ++latest.current;
    const url = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE), ...(q ? { q } : {}) });
    if (kind === 'customers') {
      url.set('stats', '1');
      url.set('today', isoDate(new Date()));
    }
    const res = await fetch(`${cfg.api}?${url}`, { credentials: 'same-origin', cache: 'no-store' }).catch(() => null);
    // Always read the answer to the end — even one we are about to ignore — so the request is finished, not left hanging.
    type Answer = { rows: Row[]; limit: number | null; total: number; pages: number; page: number; stats?: Record<string, Stat> };
    const body = res?.ok ? ((await res.json().catch(() => null)) as Answer | null) : (await res?.text().catch(() => null), null);
    if (mine !== latest.current) return; // a newer request has been made since: this answer is out of date
    if (!body) return setNotice('Couldn’t load the list. Refresh to try again.');
    setRows(body.rows);
    setStats(body.stats ?? {});
    setTotal(body.total);
    setLimit(body.limit);
    setPages(body.pages);
    if (body.page !== page) setPage(body.page);
  }, [cfg.api, kind, page, q]);
  useEffect(() => void load(), [load]);

  // Search as you type, a moment after you stop, from the first page — but only when the text actually changed,
  // so this timer (which also runs once after the page opens) can't pull someone back from the page they chose.
  useEffect(() => {
    const t = setTimeout(() => {
      const next = qInput.trim();
      if (next === appliedQ.current) return;
      appliedQ.current = next;
      setQ(next);
      setPage(1);
    }, 250);
    return () => clearTimeout(t);
  }, [qInput]);

  const atLimit = rows !== null && limit !== null && total >= limit;

  const open = useCallback(
    (row: Row | 'new') => {
      setEditing(row);
      setDraft(row === 'new' ? { ...cfg.empty } : { ...cfg.empty, ...row });
      setErrors({});
      setNotice(null);
      requestAnimationFrame(() => document.getElementById(`d-${kind}-name`)?.focus());
    },
    [cfg.empty, kind],
  );

  // "Edit customer" on a customer's own page arrives as …/customers?edit=<id>.
  useEffect(() => {
    if (opened.current || !rows) return;
    const id = new URLSearchParams(window.location.search).get('edit');
    if (!id) return;
    opened.current = true;
    fetch(`${cfg.api}/${encodeURIComponent(id)}`, { credentials: 'same-origin', cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((b: { row?: Row } | null) => b?.row && open(b.row))
      .catch(() => undefined);
  }, [rows, cfg.api, open]);

  /** Is there already one with this name (any case)? Asked of the server, so it covers the whole list, not just this page. */
  async function nameTaken(name: string): Promise<boolean> {
    const res = await fetch(`${cfg.api}?page=1&pageSize=5&q=${encodeURIComponent(name)}`, { credentials: 'same-origin', cache: 'no-store' }).catch(() => null);
    if (!res?.ok) return false;
    const body = (await res.json().catch(() => ({}))) as { rows?: Row[] };
    return (body.rows ?? []).some((r) => r.name.trim().toLowerCase() === name.trim().toLowerCase());
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const checked = cfg.clean(draft);
    if (!checked.ok) return setErrors(checked.errors);
    const isNew = editing === 'new';
    if (isNew && (await nameTaken(checked.value.name)) && !window.confirm(`You already have a ${cfg.noun} called “${checked.value.name}”. Save another one with the same name?`)) return;
    setBusy(true);
    const res = await fetch(isNew ? cfg.api : `${cfg.api}/${(editing as Row).id}`, {
      method: isNew ? 'POST' : 'PUT',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(checked.value),
    }).catch(() => null);
    const body = (await res?.json().catch(() => ({}))) as { message?: string; errors?: Record<string, string> } | undefined;
    setBusy(false);
    if (!res?.ok) {
      if (body?.errors) setErrors(body.errors);
      setNotice(body?.message ?? 'That didn’t save. Try again.');
      return;
    }
    setEditing(null);
    setNotice(isNew ? `Saved ${checked.value.name}.` : `Updated ${checked.value.name}.`);
    await Promise.all([load(), refreshMe()]);
  }

  async function remove(row: Row) {
    const n = stats[row.id]?.invoiceCount ?? 0;
    const note =
      kind === 'customers'
        ? n > 0
          ? ` The ${n} invoice${n === 1 ? '' : 's'} connected to them will stay, with their own copy of the details, but won’t be connected to a saved customer any more.`
          : ' Past invoices keep their own copy of the details.'
        : '';
    if (!window.confirm(`Delete ${row.name}?${note}`)) return;
    const res = await fetch(`${cfg.api}/${row.id}`, { method: 'DELETE', credentials: 'same-origin' }).catch(() => null);
    setNotice(res?.ok ? `Deleted ${row.name}.` : 'That didn’t delete. Try again.');
    await Promise.all([load(), refreshMe()]);
  }

  const input = (f: FieldDef) => {
    const common = {
      id: `d-${kind}-${f.key}`,
      value: draft[f.key] ?? '',
      'aria-invalid': errors[f.key] ? true : undefined,
      'aria-describedby': errors[f.key] ? `d-${kind}-${f.key}-error` : undefined,
    };
    const onText = (v: string) => setDraft((d) => ({ ...d, [f.key]: f.upper ? v.toUpperCase() : v }));
    if (f.kind === 'area') return <textarea {...common} rows={2} maxLength={f.max} onChange={(e) => onText(e.target.value)} className={`${INPUT} h-auto py-2`} />;
    if (f.kind === 'state' || f.kind === 'gst')
      return (
        <select {...common} onChange={(e) => onText(e.target.value)} className={`${INPUT} pr-8`}>
          <option value="">{f.kind === 'state' ? 'Not set' : 'Not set'}</option>
          {f.kind === 'state'
            ? GST_STATES.map(([code, name]) => (
                <option key={code} value={code}>
                  {name} ({code})
                </option>
              ))
            : GST_RATES.map((r) => (
                <option key={r} value={r}>
                  {r}%
                </option>
              ))}
        </select>
      );
    return (
      <input
        {...common}
        list={f.kind === 'unit' ? 'unit-options' : undefined}
        inputMode={f.inputMode}
        maxLength={f.max}
        placeholder={f.placeholder}
        autoComplete="off"
        onChange={(e) => onText(e.target.value)}
        className={INPUT}
      />
    );
  };

  if (!rows) return notice ? <p role="alert">{notice}</p> : <div className="h-40 animate-pulse rounded-xl2 bg-wash" aria-hidden="true" />;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <label className="min-w-0 flex-1">
          <span className="sr-only">Search {kind}</span>
          <input type="search" value={qInput} onChange={(e) => setQInput(e.target.value)} placeholder={`Search ${kind}`} className={INPUT} maxLength={80} />
        </label>
        <button type="button" onClick={() => open('new')} disabled={atLimit || editing !== null} className={PRIMARY}>
          + Add {cfg.noun}
        </button>
      </div>

      {limit !== null && (
        <p className="text-sm text-muted">
          {total} of {limit} saved
          {atLimit && ` — the free limit. Saving more than ${limit} ${kind} is part of Pro — coming soon. You can still type any ${cfg.noun} straight onto an invoice.`}
        </p>
      )}

      {notice && (
        <p className="text-sm font-semibold text-ink" role="status">
          {notice}
        </p>
      )}

      {editing !== null && (
        <form onSubmit={save} noValidate className="space-y-4 rounded-xl2 border border-hair bg-surface p-5" aria-label={editing === 'new' ? `New ${cfg.noun}` : `Edit ${cfg.noun}`}>
          <div className="grid gap-4 sm:grid-cols-2">
            {cfg.fields.map((f) => (
              <div key={f.key} className={f.kind === 'area' || f.key === 'name' ? 'sm:col-span-2' : ''}>
                <label htmlFor={`d-${kind}-${f.key}`} className="block text-sm font-semibold text-ink">
                  {f.label}
                </label>
                <div className="mt-1">{input(f)}</div>
                {kind === 'items' && f.key === 'rate' && (
                  <p className="mt-1 text-xs text-muted">Items don’t carry a currency — the rate goes onto an invoice as typed, and you can change it there.</p>
                )}
                {errors[f.key] && (
                  <p id={`d-${kind}-${f.key}-error`} className="mt-1 text-sm font-medium text-danger-600">
                    {errors[f.key]}
                  </p>
                )}
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-3">
            <button type="submit" disabled={busy} className={PRIMARY}>
              {busy ? 'Saving…' : `Save ${cfg.noun}`}
            </button>
            <button type="button" onClick={() => setEditing(null)} className={SECONDARY}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {total === 0 && editing === null && !q ? (
        <div className="rounded-xl2 border border-dashed border-hair bg-surface p-8 text-center">
          <p className="font-display text-xl font-bold text-ink">No saved {kind} yet</p>
          <p className="mt-2 text-muted">
            {kind === 'customers' ? 'Save a customer once, then pick them on any invoice.' : 'Save what you sell once, then pick it on any invoice — rate and HSN/SAC included.'}
          </p>
        </div>
      ) : (
        <>
          <ul aria-label={`Saved ${kind}`} className="divide-y divide-hair overflow-hidden rounded-xl2 border border-hair bg-surface">
            {rows.map((r) => {
              const st = stats[r.id];
              return (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 p-4">
                  <div className="min-w-0">
                    {kind === 'customers' ? (
                      <a href={`/app/business/customers/${r.id}`} className="font-semibold text-ink underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-500">
                        {r.name}
                      </a>
                    ) : (
                      <p className="font-semibold text-ink">{r.name}</p>
                    )}
                    {cfg.summary(r) && <p className="text-sm text-muted">{cfg.summary(r)}</p>}
                    {kind === 'customers' && st && (
                      <p className="text-sm text-strong" data-testid={`cust-stat-${r.id}`}>
                        {st.invoiceCount} invoice{st.invoiceCount === 1 ? '' : 's'}
                        {st.money
                          .filter((m) => m.outstanding > 0)
                          .map((m) => ` · ${formatMoney(m.outstanding, m.currency)} outstanding${m.overdue > 0 ? ` (${formatMoney(m.overdue, m.currency)} overdue)` : ''}`)
                          .join('')}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-1">
                    {kind === 'customers' && (
                      <a href={`/app/business/customers/${r.id}`} aria-label={`Open ${r.name}`} className="inline-flex h-10 items-center rounded-full px-3.5 text-sm font-semibold text-strong hover:bg-wash focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-500">
                        Open
                      </a>
                    )}
                    <button type="button" onClick={() => open(r)} disabled={editing !== null} aria-label={`Edit ${r.name}`} className="inline-flex h-10 items-center rounded-full px-3.5 text-sm font-semibold text-strong hover:bg-wash disabled:opacity-60">
                      Edit
                    </button>
                    <button type="button" onClick={() => void remove(r)} aria-label={`Delete ${r.name}`} className="inline-flex h-10 items-center rounded-full px-3.5 text-sm font-semibold text-strong hover:bg-wash hover:text-danger-600">
                      Delete
                    </button>
                  </div>
                </li>
              );
            })}
            {rows.length === 0 && <li className="p-4 text-muted">Nothing matches “{q}”.</li>}
          </ul>
          {total > 0 && (
            <Pager
              page={page}
              pages={pages}
              pageSize={PAGE_SIZE}
              matched={total}
              hrefFor={(p) => `#page-${p}`}
              onGo={(href, e) => {
                e.preventDefault();
                setPage(Number(href.slice('#page-'.length)));
              }}
              label={`${kind === 'customers' ? 'Customer' : 'Item'} pages`}
            />
          )}
        </>
      )}

      <datalist id="unit-options">
        {UNITS.map((u) => (
          <option key={u} value={u} />
        ))}
      </datalist>
    </div>
  );
}
