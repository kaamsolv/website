'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  BATCH_CONCURRENCY,
  fractionFor,
  selectBatchFiles,
  tally,
  type BatchRejection,
  type BatchStatus,
  type BatchTally,
} from '@/app/lib/image/batch';
import { BLOCKED_ROW_MESSAGE, giveBackDailyFile, reserveDailyFile } from '@/app/lib/image/quota-client';
import type { ConvertProgress, ConvertStage } from '@/app/lib/image/types';

/** A finished file. `keepOriginal` means the result is not smaller, so it is not offered. */
export type BatchResult = {
  blob: Blob;
  url: string;
  name: string;
  width: number;
  height: number;
  beforeBytes: number;
  afterBytes: number;
  keepOriginal: boolean;
};

export type ConvertOutcome =
  | { ok: true; result: Omit<BatchResult, 'url'> }
  | { ok: false; message: string };

export type BatchItem<S> = {
  id: string;
  file: File;
  /** Settings this file was queued with. Changing the page settings later doesn't rewrite a queued file. */
  settings: S;
  status: BatchStatus;
  stage: ConvertStage | null;
  fraction: number;
  message: string | null;
  result: BatchResult | null;
  /** Settings changed after this file was converted. */
  stale: boolean;
};

export type ConvertOne<S> = (
  file: File,
  settings: S,
  onProgress: (p: ConvertProgress) => void,
) => Promise<ConvertOutcome>;

const FAILED_MESSAGE = "Couldn't convert this file. Try again, or pick another file.";

/**
 * The batch queue for one tool page. Two files run at a time. Each file asks
 * the daily counter before it starts; if the day's free files are used up,
 * the rest of the batch waits as "blocked" instead of converting.
 */
export function useImageBatch<S>(convertOne: ConvertOne<S>) {
  const [items, setItems] = useState<BatchItem<S>[]>([]);
  const itemsRef = useRef<BatchItem<S>[]>([]);
  const convertRef = useRef(convertOne);
  const workers = useRef(0);
  const limitHit = useRef(false);
  const seq = useRef(0);

  useEffect(() => {
    convertRef.current = convertOne;
  }, [convertOne]);

  // Free every preview link when the page goes away.
  useEffect(() => {
    return () => {
      for (const item of itemsRef.current) if (item.result) URL.revokeObjectURL(item.result.url);
    };
  }, []);

  /** Writes synchronously, so the queue never reads a stale list. */
  const commit = useCallback((next: BatchItem<S>[]) => {
    itemsRef.current = next;
    setItems(next);
  }, []);

  const patch = useCallback(
    (id: string, change: Partial<BatchItem<S>>) => {
      commit(itemsRef.current.map((item) => (item.id === id ? { ...item, ...change } : item)));
    },
    [commit],
  );

  const releaseResult = (item: BatchItem<S>) => {
    if (item.result) URL.revokeObjectURL(item.result.url);
  };

  const processItem = async (id: string) => {
    const item = itemsRef.current.find((i) => i.id === id);
    if (!item) return;
    patch(id, { status: 'working', stage: 'preparing', fraction: 0, message: null, stale: false });

    const gate = await reserveDailyFile();
    if (gate === 'limit-visitor' || gate === 'limit-user') {
      limitHit.current = true;
      commit(
        itemsRef.current.map((i) =>
          i.status === 'queued' || i.id === id
            ? { ...i, status: 'blocked' as const, stage: null, fraction: 0, message: BLOCKED_ROW_MESSAGE }
            : i,
        ),
      );
      return;
    }

    let outcome: ConvertOutcome;
    try {
      outcome = await convertRef.current(item.file, item.settings, (p) =>
        patch(id, { stage: p.stage, fraction: fractionFor(p.stage, p.percent) }),
      );
    } catch {
      outcome = { ok: false, message: FAILED_MESSAGE };
    }

    if (!outcome.ok) {
      if (gate === 'ok') void giveBackDailyFile();
      patch(id, { status: 'failed', stage: null, fraction: 0, message: outcome.message });
      return;
    }

    const previous = itemsRef.current.find((i) => i.id === id);
    if (previous) releaseResult(previous);
    const url = URL.createObjectURL(outcome.result.blob);
    patch(id, {
      status: 'done',
      stage: null,
      fraction: 1,
      message: null,
      result: { ...outcome.result, url },
    });
  };

  const runWorker = async () => {
    workers.current += 1;
    try {
      for (;;) {
        if (limitHit.current) return;
        const next = itemsRef.current.find((i) => i.status === 'queued');
        if (!next) return;
        await processItem(next.id);
      }
    } finally {
      workers.current -= 1;
    }
  };

  /** Start idle workers, up to the concurrency limit. */
  const run = () => {
    limitHit.current = false;
    const free = BATCH_CONCURRENCY - workers.current;
    for (let i = 0; i < free; i += 1) void runWorker();
  };

  /**
   * Add dropped files to the batch and start converting them. Returns what
   * didn't fit (too big, too many, too much). Files are queued with `settings`.
   */
  const add = (incoming: File[], settings: S): BatchRejection[] => {
    const current = itemsRef.current;
    const totalBytes = current.reduce((sum, i) => sum + i.file.size, 0);
    const { accepted, rejected } = selectBatchFiles(incoming, { count: current.length, totalBytes });
    if (accepted.length === 0) return rejected;

    const added: BatchItem<S>[] = accepted.map((file) => ({
      id: `file-${++seq.current}`,
      file,
      settings,
      status: 'queued',
      stage: null,
      fraction: 0,
      message: null,
      result: null,
      stale: false,
    }));
    commit([...current, ...added]);
    run();
    return rejected;
  };

  /** Convert one file again, with the settings you pick now. */
  const retry = (id: string, settings: S) => {
    const item = itemsRef.current.find((i) => i.id === id);
    if (!item || item.status === 'working') return;
    releaseResult(item);
    patch(id, { status: 'queued', settings, result: null, message: null, stale: false, fraction: 0, stage: null });
    run();
  };

  /** Convert every file that isn't mid-conversion, with the settings you pick now. */
  const convertAll = (settings: S) => {
    commit(
      itemsRef.current.map((item) => {
        if (item.status === 'working') return item;
        releaseResult(item);
        return { ...item, status: 'queued', settings, result: null, message: null, stale: false, fraction: 0, stage: null };
      }),
    );
    run();
  };

  /** Settings changed on the page: finished files now say so, and wait for "Convert again". */
  const markStale = () => {
    if (!itemsRef.current.some((i) => i.status === 'done' && !i.stale)) return;
    commit(itemsRef.current.map((i) => (i.status === 'done' ? { ...i, stale: true } : i)));
  };

  const remove = (id: string) => {
    const item = itemsRef.current.find((i) => i.id === id);
    if (!item || item.status === 'working') return;
    releaseResult(item);
    commit(itemsRef.current.filter((i) => i.id !== id));
  };

  const clear = () => {
    if (itemsRef.current.some((i) => i.status === 'working')) return;
    for (const item of itemsRef.current) releaseResult(item);
    commit([]);
  };

  const working = items.some((i) => i.status === 'working');
  const summary: BatchTally = tally(
    items.map((i) => ({
      status: i.status,
      fraction: i.fraction,
      beforeBytes: i.result?.beforeBytes,
      // A file kept at its original size saved nothing, so count it as unchanged.
      afterBytes: i.result?.keepOriginal ? i.result.beforeBytes : i.result?.afterBytes,
    })),
  );

  return {
    items,
    working,
    summary,
    staleCount: items.filter((i) => i.stale).length,
    add,
    retry,
    convertAll,
    markStale,
    remove,
    clear,
  };
}
