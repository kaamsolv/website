/**
 * PDF tool limits — the one place the free / Pro boundary lives.
 *
 * Every limit asks `can(key)` for its own entitlement key (CLAUDE.md §25):
 * never "if paid, allow everything". Anonymous visitors and free accounts get
 * the free numbers today; the Pro keys are seeded in a later stage.
 *
 * Safety caps (pages to draw, hidden ceilings) are about what a phone can
 * handle, not a paywall, and apply to every plan.
 */

import type { Entitlements } from '../entitlements';

const MB = 1024 * 1024;

export const FREE_MAX_FILE_BYTES = 10 * MB;
export const PRO_MAX_FILE_BYTES = 50 * MB;
export const FREE_MERGE_FILES = 3;
export const FREE_IMAGES_TO_PDF = 5;

/** Hidden ceiling on files in one merge / images in one PDF, for every plan. */
export const BATCH_HARD_CAP = 100;
/** Pages we'll draw (thumbnails, PDF → JPG) in one document. */
export const MAX_RENDER_PAGES = 300;

type Can = Pick<Entitlements, 'can'>;

export function maxFileBytes(ent: Can): number {
  return ent.can('pdf_large_files') ? PRO_MAX_FILE_BYTES : FREE_MAX_FILE_BYTES;
}

export function maxMergeFiles(ent: Can): number {
  return ent.can('pdf_unlimited_merge') ? BATCH_HARD_CAP : FREE_MERGE_FILES;
}

export function maxImagesToPdf(ent: Can): number {
  return ent.can('pdf_batch_convert') ? BATCH_HARD_CAP : FREE_IMAGES_TO_PDF;
}

/** "10 MB" — for copy that states the limit. */
export function sizeLimitLabel(bytes: number): string {
  return `${Math.round(bytes / MB)} MB`;
}
