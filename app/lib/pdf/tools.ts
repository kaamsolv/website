/**
 * The PDF suite as data: which tools exist, which are live, and how they group on the hub.
 * Pure (no React, no PDF library, no catalogue) so the in-workspace picker (a client component),
 * the hub (a server component) and the tests all read the same list without growing the client bundle.
 *
 * A tool is only `live` once its page and engine are built and tested; `soon` entries are shown
 * greyed, dashed and never linked (CLAUDE.md §13). The hub's cards take their name, blurb and live
 * status from the catalogue (see `hub-data.ts`), and a unit test fails if this list and the
 * catalogue ever disagree about what is live.
 */

import type { Accent } from '../catalogue';

export type PdfTask =
  | 'hub'
  | 'compress'
  | 'merge'
  | 'split'
  | 'rotate'
  | 'delete'
  | 'rearrange'
  | 'page-numbers'
  | 'watermark'
  | 'protect'
  | 'pdf-to-jpg'
  | 'pdf-to-png'
  | 'pdf-to-word'
  | 'pdf-to-text'
  | 'jpg-to-pdf';

/** What the workspace is doing. `convert` has sub-modes (see ConvertMode). */
export type Action = 'compress' | 'merge' | 'split' | 'rotate' | 'delete' | 'rearrange' | 'numbers' | 'watermark' | 'protect' | 'convert';
export type ConvertMode = 'to-jpg' | 'to-png' | 'to-word' | 'to-text' | 'from-images';

export type PdfSectionId = 'organize' | 'optimize' | 'convert' | 'secure' | 'scan';

/** Drawn by `PdfIcon` (app/_components/pdf/pdf-icons.tsx): one glyph per task, plus one per section. */
export type PdfIconName =
  | 'merge'
  | 'split'
  | 'rotate'
  | 'delete'
  | 'rearrange'
  | 'compress'
  | 'to-jpg'
  | 'to-png'
  | 'jpg-to-pdf'
  | 'to-word'
  | 'to-text'
  | 'protect'
  | 'watermark'
  | 'numbers'
  | 'section-organize'
  | 'section-optimize'
  | 'section-convert'
  | 'section-secure'
  | 'section-scan';

export type PdfSection = { id: PdfSectionId; title: string; short: string; blurb: string; accent: Accent; icon: PdfIconName; /** A line shown beside a group with a single tool. */ note?: string };

/**
 * Each section borrows one colour of the approved palette (the same `ACCENT` map the category cards use),
 * so the directory has rhythm instead of one purple "Documents" everywhere.
 */
export const PDF_SECTIONS: PdfSection[] = [
  { id: 'organize', title: 'Organise PDF', short: 'Organise', blurb: 'Join, split, turn, remove and reorder pages.', accent: 'purple', icon: 'section-organize' },
  { id: 'optimize', title: 'Compress & Optimise', short: 'Compress', blurb: 'Make a PDF small enough to send.', accent: 'coral', icon: 'section-optimize', note: 'Works best on scans and photo-heavy PDFs. Text, links and bookmarks stay exactly as they were.' },
  { id: 'convert', title: 'Convert PDF', short: 'Convert', blurb: 'To and from images, Word and plain text.', accent: 'teal', icon: 'section-convert' },
  { id: 'secure', title: 'Secure & Enhance', short: 'Secure & enhance', blurb: 'Lock it, mark it, number it.', accent: 'yellow', icon: 'section-secure' },
  { id: 'scan', title: 'Scan & Extract', short: 'Scan', blurb: 'Read scanned pages and pull out tables.', accent: 'navy', icon: 'section-scan' },
];

export type LiveTool = {
  status: 'live';
  task: Exclude<PdfTask, 'hub'>;
  action: Action;
  mode?: ConvertMode;
  /** Short name for cards and the picker. */
  label: string;
  /** Short line for the in-page picker (the hub's cards use the catalogue's blurb). */
  hint: string;
  path: string;
  /** Catalogue slug: the hub's name, blurb and live status come from there. */
  slug: string;
  icon: PdfIconName;
  section: PdfSectionId;
  /** Shown in the "Popular PDF tasks" row on the hub. */
  popular?: boolean;
};
export type SoonTool = { status: 'soon'; label: string; hint: string; section: PdfSectionId };
export type PdfToolEntry = LiveTool | SoonTool;

export const PDF_TOOLS: PdfToolEntry[] = [
  // Organise
  { status: 'live', task: 'merge', action: 'merge', label: 'Merge PDF', hint: 'Join PDFs into one', path: '/merge-pdf', slug: 'merge-pdf', icon: 'merge', section: 'organize', popular: true },
  { status: 'live', task: 'split', action: 'split', label: 'Split PDF', hint: 'Pick pages, ranges or every N', path: '/split-pdf', slug: 'split-pdf', icon: 'split', section: 'organize', popular: true },
  { status: 'live', task: 'rotate', action: 'rotate', label: 'Rotate PDF', hint: 'Turn pages the right way up', path: '/rotate-pdf', slug: 'rotate-pdf', icon: 'rotate', section: 'organize' },
  { status: 'live', task: 'delete', action: 'delete', label: 'Delete pages', hint: 'Remove pages you don’t need', path: '/delete-pdf-pages', slug: 'delete-pdf-pages', icon: 'delete', section: 'organize' },
  { status: 'live', task: 'rearrange', action: 'rearrange', label: 'Rearrange pages', hint: 'Put pages in a new order', path: '/rearrange-pdf-pages', slug: 'rearrange-pdf-pages', icon: 'rearrange', section: 'organize' },
  // Compress & Optimise
  { status: 'live', task: 'compress', action: 'compress', label: 'Compress PDF', hint: 'Make it smaller', path: '/compress-pdf', slug: 'compress-pdf', icon: 'compress', section: 'optimize', popular: true },
  // Convert
  { status: 'live', task: 'pdf-to-jpg', action: 'convert', mode: 'to-jpg', label: 'PDF to JPG', hint: 'Every page as an image', path: '/pdf-to-jpg', slug: 'pdf-to-jpg', icon: 'to-jpg', section: 'convert' },
  { status: 'live', task: 'pdf-to-png', action: 'convert', mode: 'to-png', label: 'PDF to PNG', hint: 'Sharp images, bigger files', path: '/pdf-to-png', slug: 'pdf-to-png', icon: 'to-png', section: 'convert' },
  { status: 'live', task: 'jpg-to-pdf', action: 'convert', mode: 'from-images', label: 'JPG to PDF', hint: 'Photos and scans into a PDF', path: '/jpg-to-pdf', slug: 'jpg-to-pdf', icon: 'jpg-to-pdf', section: 'convert' },
  { status: 'live', task: 'pdf-to-word', action: 'convert', mode: 'to-word', label: 'PDF to Word', hint: 'The text, in a Word file', path: '/pdf-to-word', slug: 'pdf-to-word', icon: 'to-word', section: 'convert' },
  { status: 'live', task: 'pdf-to-text', action: 'convert', mode: 'to-text', label: 'PDF to Text', hint: 'Plain text you can copy', path: '/pdf-to-text', slug: 'pdf-to-text', icon: 'to-text', section: 'convert' },
  // Secure & Enhance
  { status: 'live', task: 'protect', action: 'protect', label: 'Protect PDF', hint: 'Lock it with a password', path: '/protect-pdf', slug: 'protect-pdf', icon: 'protect', section: 'secure' },
  { status: 'live', task: 'watermark', action: 'watermark', label: 'Watermark PDF', hint: 'Words or a logo on every page', path: '/watermark-pdf', slug: 'watermark-pdf', icon: 'watermark', section: 'secure' },
  { status: 'live', task: 'page-numbers', action: 'numbers', label: 'Page numbers', hint: 'Number the pages', path: '/add-page-numbers-to-pdf', slug: 'add-page-numbers-to-pdf', icon: 'numbers', section: 'secure' },
  // Scan & Extract (planned: shown as "Coming soon", never linked)
  { status: 'soon', label: 'OCR PDF', hint: 'Make scanned pages searchable', section: 'scan' },
  { status: 'soon', label: 'Extract tables', hint: 'Tables out of a PDF', section: 'scan' },
  { status: 'soon', label: 'Compare PDFs', hint: 'See what changed', section: 'scan' },
];

export const LIVE_TOOLS = PDF_TOOLS.filter((t): t is LiveTool => t.status === 'live');

/** The picker's tool for a task page (the hub starts on Compress, like it always has). */
export function initialAction(task: PdfTask): { action: Action; mode: ConvertMode } {
  if (task === 'hub') return { action: 'compress', mode: 'to-jpg' };
  const tool = LIVE_TOOLS.find((t) => t.task === task)!;
  return { action: tool.action, mode: tool.mode ?? 'to-jpg' };
}

/** Which task page matches the workspace's current action (the address bar follows it). */
export function taskOf(action: Action, mode: ConvertMode): Exclude<PdfTask, 'hub'> {
  const tool = LIVE_TOOLS.find((t) => t.action === action && (action !== 'convert' || t.mode === mode));
  return tool!.task;
}

export const pathOf = (task: Exclude<PdfTask, 'hub'>): string => LIVE_TOOLS.find((t) => t.task === task)!.path;
