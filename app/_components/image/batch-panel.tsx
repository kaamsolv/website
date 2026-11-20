'use client';

import { BATCH_MAX_FILES, zipBlobs, type BatchTally } from '@/app/lib/image/batch';
import { downloadBlob } from '@/app/lib/image/export';
import { formatBytes } from '@/app/lib/image/validate';
import type { ConvertStage } from '@/app/lib/image/types';
import { useState } from 'react';
import { type DailyQuota } from '@/app/lib/image/quota-client';
import { ShareBar } from '@/app/_components/share-bar';
import { Icon } from '@/app/_components/icons';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { BatchItem } from './use-image-batch';
import { OnDeviceNote } from './on-device-note';

const STAGE_LABEL: Record<ConvertStage, string> = {
  preparing: 'Getting ready',
  reading: 'Reading',
  decoding: 'Decoding',
  processing: 'Resizing',
  encoding: 'Converting',
  finalizing: 'Finishing',
};

/** Files that can be downloaded: finished, not stale, and smaller than the original. */
export function downloadable<S>(items: readonly BatchItem<S>[]) {
  return items.filter((i) => i.status === 'done' && i.result && !i.result.keepOriginal && !i.stale);
}

/** Packs the downloadable files into one ZIP and saves it. */
export async function downloadBatchZip<S>(items: readonly BatchItem<S>[], zipName: string): Promise<void> {
  const ready = downloadable(items);
  if (ready.length === 0) return;
  const zip = await zipBlobs(ready.map((i) => ({ name: i.result!.name, blob: i.result!.blob })));
  downloadBlob(zip, zipName);
}

function statusLine<S>(item: BatchItem<S>): string {
  if (item.status === 'queued') return 'Waiting';
  if (item.status === 'working') return item.stage ? `${STAGE_LABEL[item.stage]}…` : 'Getting ready…';
  if (item.status === 'failed' || item.status === 'blocked') return item.message ?? '';
  if (!item.result) return '';
  if (item.stale) return 'Settings changed. Convert again to update this file.';
  if (item.result.keepOriginal) return 'Already the smaller file. Keep the original.';
  const pct =
    item.result.beforeBytes > 0 ? Math.round((1 - item.result.afterBytes / item.result.beforeBytes) * 100) : 0;
  const size = `${formatBytes(item.result.beforeBytes)} → ${formatBytes(item.result.afterBytes)}`;
  if (pct > 0) return `${size} · ${pct}% smaller`;
  if (pct < 0) return `${size} · ${Math.abs(pct)}% larger`;
  return `${size} · same size`;
}

function Bar({ fraction, label, tone }: { fraction: number; label: string; tone: 'coral' | 'teal' }) {
  const pct = Math.round(fraction * 100);
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      className="mt-2 h-1.5 overflow-hidden rounded-full bg-wash"
    >
      <div
        className={`h-full rounded-full transition-[width] duration-300 motion-reduce:transition-none ${
          tone === 'teal' ? 'bg-teal-500' : 'bg-coral-500'
        }`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

const ICON_BTN =
  'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-500 disabled:opacity-50';
const SMALL_BTN =
  'inline-flex min-h-11 items-center justify-center rounded-full px-4 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-500 sm:min-h-9';

function RetryIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 12a9 9 0 1 0 3-6.7" />
      <path d="M3 4v5h5" />
    </svg>
  );
}

type Props<S> = {
  items: BatchItem<S>[];
  summary: BatchTally;
  working: boolean;
  staleCount: number;
  zipping: boolean;
  /** Button text for re-running the batch, e.g. "Convert again". */
  againLabel: string;
  /** Tool name and address for the share row under the results. */
  share: { name: string; url: string };
  onConvertAgain: () => void;
  onRetry: (id: string) => void;
  onRemove: (id: string) => void;
  onClear: () => void;
  onDownload: (item: BatchItem<S>) => void;
  onDownloadAll: () => void;
};

export function BatchPanel<S>({
  items,
  summary,
  working,
  staleCount,
  zipping,
  againLabel,
  share,
  onConvertAgain,
  onRetry,
  onRemove,
  onClear,
  onDownload,
  onDownloadAll,
}: Props<S>) {
  const readyCount = downloadable(items).length;
  const saved = Math.max(0, summary.beforeBytes - summary.afterBytes);
  const savedPct = summary.beforeBytes > 0 ? Math.round((saved / summary.beforeBytes) * 100) : 0;
  const boast = saved > 0 && summary.done > 0;

  return (
    <section aria-labelledby="batch-heading" className="rounded-xl2 border border-hair bg-surface p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="min-w-0">
          <h2 id="batch-heading" className="font-display text-xl font-bold text-ink sm:text-2xl">
            {boast ? `${formatBytes(saved)} saved` : `${summary.done} of ${summary.total} done`}
          </h2>
          <p className="mt-0.5 text-sm text-muted">
            {boast
              ? `${savedPct}% smaller than your originals · ${summary.done} of ${summary.total} done`
              : summary.done > 0
                ? `${formatBytes(summary.beforeBytes)} → ${formatBytes(summary.afterBytes)}`
                : ' '}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {readyCount >= 2 && (
            <button
              type="button"
              onClick={onDownloadAll}
              disabled={zipping || working}
              className={`${SMALL_BTN} bg-coral-500 text-navy-900 hover:bg-coral-400 disabled:opacity-60`}
            >
              {zipping ? 'Packing ZIP…' : `Download all (.zip) · ${readyCount} files`}
            </button>
          )}
          {!working && (
            <button type="button" onClick={onClear} className={`${SMALL_BTN} text-strong hover:bg-wash`}>
              Clear all
            </button>
          )}
        </div>
      </div>

      <Bar
        fraction={summary.fraction}
        label={`${summary.done} of ${summary.total} done`}
        tone={summary.done === summary.total && summary.total > 0 ? 'teal' : 'coral'}
      />

      {staleCount > 0 && !working && (
        <button
          type="button"
          onClick={onConvertAgain}
          className="mt-4 h-11 w-full rounded-full bg-coral-500 text-sm font-semibold text-navy-900 hover:bg-coral-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-500 focus-visible:ring-offset-2"
        >
          {againLabel}
        </button>
      )}

      <ul className="mt-3 divide-y divide-hair" aria-label="Files">
        {items.map((item) => {
          const name = item.result?.name ?? item.file.name;
          const line = statusLine(item);
          const showBar = item.status === 'queued' || item.status === 'working' || item.status === 'done';
          const canDownload = item.status === 'done' && item.result && !item.result.keepOriginal && !item.stale;
          const failed = item.status === 'failed' || item.status === 'blocked';
          return (
            <li key={item.id} className="py-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-ink" title={item.file.name}>
                    {item.file.name}
                  </p>
                  <p className={`mt-0.5 truncate text-xs ${failed ? 'text-danger-700' : 'text-muted'}`} title={line}>
                    {line}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {canDownload && (
                    <button
                      type="button"
                      onClick={() => onDownload(item)}
                      aria-label={`Download ${name}`}
                      title="Download"
                      className={`${ICON_BTN} bg-coral-500 text-navy-900 hover:bg-coral-400`}
                    >
                      <Icon name="download" className="h-5 w-5" />
                    </button>
                  )}
                  {item.status === 'failed' && (
                    <button
                      type="button"
                      onClick={() => onRetry(item.id)}
                      aria-label={`Try again ${item.file.name}`}
                      title="Try again"
                      className={`${ICON_BTN} border border-hair bg-surface text-strong hover:bg-wash`}
                    >
                      <RetryIcon />
                    </button>
                  )}
                  {item.status !== 'working' && (
                    <button
                      type="button"
                      onClick={() => onRemove(item.id)}
                      aria-label={`Remove ${item.file.name}`}
                      title="Remove"
                      className={`${ICON_BTN} text-muted hover:bg-wash hover:text-strong`}
                    >
                      <Icon name="close" className="h-5 w-5" />
                    </button>
                  )}
                </div>
              </div>
              {showBar && (
                <Bar
                  fraction={item.status === 'done' ? 1 : item.fraction}
                  label={`${item.file.name}: ${line || 'Waiting'}`}
                  tone={item.status === 'done' ? 'teal' : 'coral'}
                />
              )}
            </li>
          );
        })}
      </ul>

      {items.length > 0 && (
        <div className="mt-4">
          <OnDeviceNote />
        </div>
      )}

      {summary.done > 0 && !working && (
        <div className="mt-4 border-t border-hair pt-4">
          <ShareBar
            name={share.name}
            blurb={
              boast
                ? `I just saved ${formatBytes(saved)} with KaamSolv. Free, and nothing was uploaded.`
                : share.name
            }
            url={share.url}
          />
        </div>
      )}

      {items.length > 0 && items.length < BATCH_MAX_FILES && !working && (
        <p className="sr-only">Up to {BATCH_MAX_FILES - items.length} more files can be added.</p>
      )}
    </section>
  );
}

/**
 * "Free today: 18 of 25 files left". Once a visitor's files are used up, it
 * asks them to sign in. A signed-in person waits for tomorrow.
 */
export function QuotaNote({ quota, exhausted }: { quota: DailyQuota | null; exhausted: boolean }) {
  const pathname = usePathname();
  if (exhausted) {
    const needsSignIn = quota !== null && !quota.signedIn;
    return (
      <div role="status" className="rounded-xl border border-yellow-300 bg-yellowx-100 px-4 py-3 text-sm text-strong">
        <p>
          {needsSignIn
            ? "You've used today's free conversions."
            : "You've used today's free conversions. The limit resets at midnight India time."}
        </p>
        {needsSignIn && (
          <p className="mt-2">
            <Link
              href={`/login?next=${encodeURIComponent(pathname || '/')}`}
              className="font-semibold text-coralx-600 underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-500"
            >
              Sign in to keep converting today
            </Link>
          </p>
        )}
      </div>
    );
  }
  if (!quota) return null;
  return (
    <p className="text-xs text-muted">
      Free today: {quota.remaining} of {quota.limit} files left.
      {quota.signedIn ? ' Resets at midnight India time.' : ' Sign in for more.'}
    </p>
  );
}

/** Keeps one copy of the zip-in-progress flag for a panel. */
export function useZipping() {
  const [zipping, setZipping] = useState(false);
  return {
    zipping,
    run: async (task: () => Promise<void>) => {
      setZipping(true);
      try {
        await task();
      } finally {
        setZipping(false);
      }
    },
  };
}
