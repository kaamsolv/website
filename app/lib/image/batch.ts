/**
 * Batch rules for the Image Kit: how many files one batch takes, how progress
 * is counted, how the ZIP is named and built. Framework-free (no React, no
 * Next) so every rule has a unit test. The React state lives in
 * app/_components/image/use-image-batch.ts.
 */
import { zipSync } from 'fflate';
import { MAX_IMAGE_BYTES, type ConvertStage } from './types';

/** Files in one batch: the common free-tool standard (TinyPNG and others use 20). */
export const BATCH_MAX_FILES = 20;
/** Total input per batch. Stops a phone running out of memory when building the ZIP. */
export const BATCH_MAX_TOTAL_BYTES = 150 * 1024 * 1024;
/** Images converted at the same time. Two keeps the page responsive on phones. */
export const BATCH_CONCURRENCY = 2;

export type BatchStatus = 'queued' | 'working' | 'done' | 'failed' | 'blocked';

export type BatchRejection = { name: string; reason: 'too-big' | 'too-many' | 'too-much' };

/**
 * Decide which dropped files join the batch. Files are checked in the order
 * they were dropped, so the first ones that fit are kept and the rest are
 * named in `rejected` with the reason.
 */
export function selectBatchFiles(
  incoming: readonly File[],
  current: { count: number; totalBytes: number },
): { accepted: File[]; rejected: BatchRejection[] } {
  const accepted: File[] = [];
  const rejected: BatchRejection[] = [];
  let count = current.count;
  let total = current.totalBytes;

  for (const file of incoming) {
    if (file.size > MAX_IMAGE_BYTES) {
      rejected.push({ name: file.name, reason: 'too-big' });
    } else if (count >= BATCH_MAX_FILES) {
      rejected.push({ name: file.name, reason: 'too-many' });
    } else if (total + file.size > BATCH_MAX_TOTAL_BYTES) {
      rejected.push({ name: file.name, reason: 'too-much' });
    } else {
      accepted.push(file);
      count += 1;
      total += file.size;
    }
  }
  return { accepted, rejected };
}

export function rejectionMessage(r: BatchRejection): string {
  switch (r.reason) {
    case 'too-big':
      return `${r.name} is over 25 MB, so it was left out.`;
    case 'too-many':
      return `Up to ${BATCH_MAX_FILES} images at a time. ${r.name} was left out.`;
    case 'too-much':
      return `${r.name} would take this batch over 150 MB, so it was left out. Remove some files first.`;
  }
}

/**
 * Where each stage starts on the bar, as a fraction of the file. The bar is
 * stage-based: the stages are real, but the sizes between them are estimates,
 * not timings. Only encoding has a measured percentage inside it.
 */
const STAGE_START: Record<ConvertStage, number> = {
  preparing: 0,
  reading: 0.08,
  decoding: 0.2,
  processing: 0.35,
  encoding: 0.5,
  finalizing: 0.95,
};

export function fractionFor(stage: ConvertStage, percent?: number): number {
  if (stage === 'encoding') {
    const inside = Math.min(100, Math.max(0, percent ?? 0)) / 100;
    return 0.5 + 0.4 * inside;
  }
  return STAGE_START[stage];
}

export type BatchTallyItem = {
  status: BatchStatus;
  fraction: number;
  beforeBytes?: number;
  afterBytes?: number;
};

export type BatchTally = {
  total: number;
  done: number;
  failed: number;
  blocked: number;
  working: number;
  queued: number;
  /** Original size of the finished files, and their size after. */
  beforeBytes: number;
  afterBytes: number;
  /** 0–1 across the whole batch, for the overall bar. */
  fraction: number;
};

export function tally(items: readonly BatchTallyItem[]): BatchTally {
  const t: BatchTally = {
    total: items.length,
    done: 0,
    failed: 0,
    blocked: 0,
    working: 0,
    queued: 0,
    beforeBytes: 0,
    afterBytes: 0,
    fraction: 0,
  };
  let sum = 0;
  for (const item of items) {
    t[item.status === 'done' ? 'done' : item.status] += 1;
    if (item.status === 'done') {
      t.beforeBytes += item.beforeBytes ?? 0;
      t.afterBytes += item.afterBytes ?? 0;
      sum += 1;
    } else if (item.status === 'working') {
      sum += item.fraction;
    }
  }
  t.fraction = items.length === 0 ? 0 : sum / items.length;
  return t;
}

/**
 * A name for a ZIP entry that isn't taken yet: "photo.webp", then
 * "photo (2).webp", "photo (3).webp". Two files called the same keep both.
 */
export function uniqueName(name: string, used: Set<string>): string {
  if (!used.has(name)) {
    used.add(name);
    return name;
  }
  const dot = name.lastIndexOf('.');
  const base = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : '';
  for (let n = 2; ; n += 1) {
    const candidate = `${base} (${n})${ext}`;
    if (!used.has(candidate)) {
      used.add(candidate);
      return candidate;
    }
  }
}

/**
 * Pack finished images into one ZIP. Stored, not deflated: the images are
 * already compressed, so deflate would only cost time.
 */
export async function zipBlobs(entries: readonly { name: string; blob: Blob }[]): Promise<Blob> {
  const used = new Set<string>();
  const files: Record<string, Uint8Array> = {};
  for (const entry of entries) {
    files[uniqueName(entry.name, used)] = new Uint8Array(await entry.blob.arrayBuffer());
  }
  const zipped = zipSync(files, { level: 0 });
  return new Blob([zipped as Uint8Array<ArrayBuffer>], { type: 'application/zip' });
}
