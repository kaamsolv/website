'use client';

import { useCallback, useEffect, useState } from 'react';
import { PRIMARY, SECONDARY } from '../account/account-shell';
import { fmtDateOnly, plural } from './stats-data';
import { CAMPAIGN_DESCRIPTION_MAX, CAMPAIGN_NAME_MAX } from '@/app/lib/qr/campaigns';

export type Campaign = {
  id: string;
  name: string;
  description: string;
  startsOn: string | null;
  endsOn: string | null;
  codes: number;
  scans: number;
  createdAt: string;
};

const FIELD =
  'h-11 w-full rounded-lg border border-hair bg-fieldbg px-3 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-500';

/** Create or edit a campaign. Only groups codes — it never touches where a code points. */
export function CampaignForm({
  initial,
  onSaved,
  onCancel,
}: {
  initial?: Campaign;
  onSaved: (id: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [startsOn, setStartsOn] = useState(initial?.startsOn ?? '');
  const [endsOn, setEndsOn] = useState(initial?.endsOn ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ field?: string; message: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    const res = await fetch(initial ? `/api/qr/campaigns/${initial.id}` : '/api/qr/campaigns', {
      method: initial ? 'PUT' : 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, description, startsOn: startsOn || null, endsOn: endsOn || null }),
    }).catch(() => null);
    const body = (await res?.json().catch(() => ({}))) as { id?: string; message?: string; field?: string } | undefined;
    setBusy(false);
    if (!res?.ok) return setError({ field: body?.field, message: body?.message ?? 'Couldn’t save that. Check your connection and try again.' });
    onSaved(initial?.id ?? body!.id!);
  }

  const err = (f: string) => (error?.field === f ? error.message : null);
  return (
    <form onSubmit={submit} className="space-y-4 rounded-xl2 border border-hair bg-surface p-5" aria-label={initial ? 'Edit campaign' : 'New campaign'}>
      <label className="block text-sm font-semibold text-ink">
        Campaign name
        <input value={name} maxLength={CAMPAIGN_NAME_MAX} onChange={(e) => setName(e.target.value)} className={`${FIELD} mt-1`} aria-invalid={err('name') ? true : undefined} />
        {err('name') && <span className="mt-1 block text-sm font-medium text-danger-600">{err('name')}</span>}
      </label>
      <label className="block text-sm font-semibold text-ink">
        Description <span className="font-normal text-muted">(optional)</span>
        <textarea value={description} maxLength={CAMPAIGN_DESCRIPTION_MAX} rows={2} onChange={(e) => setDescription(e.target.value)} className={`${FIELD} mt-1 h-auto py-2`} />
        {err('description') && <span className="mt-1 block text-sm font-medium text-danger-600">{err('description')}</span>}
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-semibold text-ink">
          Starts <span className="font-normal text-muted">(optional)</span>
          <input type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} className={`${FIELD} mt-1`} />
          {err('startsOn') && <span className="mt-1 block text-sm font-medium text-danger-600">{err('startsOn')}</span>}
        </label>
        <label className="block text-sm font-semibold text-ink">
          Ends <span className="font-normal text-muted">(optional)</span>
          <input type="date" value={endsOn} onChange={(e) => setEndsOn(e.target.value)} className={`${FIELD} mt-1`} />
          {err('endsOn') && <span className="mt-1 block text-sm font-medium text-danger-600">{err('endsOn')}</span>}
        </label>
      </div>
      {error && !error.field && (
        <p role="alert" className="text-sm font-semibold text-danger-600">
          {error.message}
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        <button type="submit" disabled={busy || !name.trim()} className={PRIMARY}>
          {busy ? 'Saving…' : initial ? 'Save campaign' : 'Create campaign'}
        </button>
        <button type="button" onClick={onCancel} className={SECONDARY}>
          Cancel
        </button>
      </div>
      <p className="text-xs text-muted">A campaign only groups codes. It never changes where a code sends people.</p>
    </form>
  );
}

const dates = (c: Campaign) => (c.startsOn || c.endsOn ? `${fmtDateOnly(c.startsOn) ?? '…'} – ${fmtDateOnly(c.endsOn) ?? '…'}` : null);

export function Campaigns() {
  const [list, setList] = useState<Campaign[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch('/api/qr/campaigns', { cache: 'no-store', credentials: 'same-origin' }).catch(() => null);
    if (!res?.ok) return setError('Couldn’t load your campaigns. Refresh to try again.');
    setList(((await res.json()) as { campaigns: Campaign[] }).campaigns);
    setError(null);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function remove(c: Campaign) {
    if (busy) return;
    if (!window.confirm(`Delete the campaign “${c.name}”? Its ${plural(c.codes, 'code')} stay exactly as they are, just no longer grouped.`)) return;
    setBusy(c.id);
    const res = await fetch(`/api/qr/campaigns/${c.id}`, { method: 'DELETE', credentials: 'same-origin' }).catch(() => null);
    setBusy(null);
    if (!res?.ok) return setNotice('That didn’t work. Try again.');
    setNotice(`Deleted “${c.name}”. Its codes are untouched.`);
    await load();
  }

  if (error) return <p role="alert" className="text-strong">{error}</p>;
  if (!list) return <div className="h-40 animate-pulse rounded-xl2 bg-wash" aria-hidden="true" />;

  return (
    <div className="space-y-5">
      {notice && (
        <p role="status" className="text-sm font-semibold text-ink">
          {notice}
        </p>
      )}
      {creating ? (
        <CampaignForm
          onCancel={() => setCreating(false)}
          onSaved={(id) => {
            window.location.assign(`/app/qr/campaigns/${id}`);
          }}
        />
      ) : (
        <button type="button" onClick={() => setCreating(true)} className={PRIMARY}>
          + New campaign
        </button>
      )}

      {list.length === 0 && !creating ? (
        <div className="rounded-xl2 border border-dashed border-hair bg-surface p-8 text-center">
          <p className="font-display text-xl font-bold text-ink">No campaigns yet</p>
          <p className="mt-2 text-muted">Group the codes of one print run — flyers, a shop window, a menu — and see their scans together.</p>
        </div>
      ) : (
        <ul aria-label="Campaigns" className="divide-y divide-hair overflow-hidden rounded-xl2 border border-hair bg-surface">
          {list.map((c) =>
            editing === c.id ? (
              <li key={c.id} className="p-4">
                <CampaignForm
                  initial={c}
                  onCancel={() => setEditing(null)}
                  onSaved={async () => {
                    setEditing(null);
                    setNotice(`Saved “${c.name}”.`);
                    await load();
                  }}
                />
              </li>
            ) : (
              <li key={c.id} className="grid gap-2 p-4 md:grid-cols-[1fr_auto] md:items-center md:gap-4">
                <a href={`/app/qr/campaigns/${c.id}`} className="group min-w-0 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-500">
                  <span className="font-semibold text-ink group-hover:underline">{c.name}</span>
                  {c.description && <span className="mt-0.5 block truncate text-sm text-muted">{c.description}</span>}
                  <span className="mt-0.5 flex flex-wrap gap-x-3 text-sm text-muted">
                    <span>{plural(c.codes, 'code')}</span>
                    <span className="tabular-nums font-semibold text-ink">{plural(c.scans, 'scan')} all time</span>
                    {dates(c) && <span>{dates(c)}</span>}
                  </span>
                </a>
                <div className="-ml-3 flex flex-wrap gap-1 md:ml-0">
                  <a href={`/app/qr/campaigns/${c.id}`} className={ROW_BTN} aria-label={`Open ${c.name}`}>
                    Open
                  </a>
                  <button type="button" className={ROW_BTN} onClick={() => setEditing(c.id)} aria-label={`Edit ${c.name}`}>
                    Edit
                  </button>
                  <button type="button" className={`${ROW_BTN} hover:text-[#B42318] dark:hover:text-danger-600`} disabled={busy !== null} onClick={() => void remove(c)} aria-label={`Delete ${c.name}`}>
                    Delete
                  </button>
                </div>
              </li>
            ),
          )}
        </ul>
      )}
    </div>
  );
}

export const ROW_BTN =
  'inline-flex h-10 items-center justify-center rounded-full px-3.5 text-sm font-semibold text-strong hover:bg-wash focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-500 disabled:opacity-60';
