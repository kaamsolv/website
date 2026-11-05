/**
 * The PDF suite as data: which tools exist, which are live, and how they group on the hub.
 * Pure (no React, no PDF library) so the hub (a server component), the in-workspace picker
 * and the tests all read the same list. A tool is only `live` once its page and engine are
 * built and tested; `soon` entries are shown greyed and never linked (CLAUDE.md §13).
 */

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

export const PDF_SECTIONS: { id: PdfSectionId; title: string; short: string; blurb: string }[] = [
  { id: 'organize', title: 'Organize PDF', short: 'Organize', blurb: 'Join, split, turn, remove and reorder pages.' },
  { id: 'optimize', title: 'Compress and Optimize', short: 'Compress', blurb: 'Make a PDF smaller.' },
  { id: 'convert', title: 'Convert PDF', short: 'Convert', blurb: 'To and from images and Word.' },
  { id: 'secure', title: 'Secure and Sign', short: 'Secure', blurb: 'Passwords, watermarks and signatures.' },
  { id: 'scan', title: 'Scan and Extract', short: 'Scan', blurb: 'Read scanned pages and pull out tables.' },
];

type LiveTool = {
  status: 'live';
  task: Exclude<PdfTask, 'hub'>;
  action: Action;
  mode?: ConvertMode;
  label: string;
  hint: string;
  path: string;
  section: PdfSectionId;
};
type SoonTool = { status: 'soon'; label: string; hint: string; section: PdfSectionId };
export type PdfToolEntry = LiveTool | SoonTool;

export const PDF_TOOLS: PdfToolEntry[] = [
  { status: 'live', task: 'merge', action: 'merge', label: 'Merge PDF', hint: 'Join PDFs into one', path: '/merge-pdf', section: 'organize' },
  { status: 'live', task: 'split', action: 'split', label: 'Split PDF', hint: 'Pick pages, ranges or every N', path: '/split-pdf', section: 'organize' },
  { status: 'live', task: 'rotate', action: 'rotate', label: 'Rotate PDF', hint: 'Turn pages the right way up', path: '/rotate-pdf', section: 'organize' },
  { status: 'live', task: 'delete', action: 'delete', label: 'Delete pages', hint: 'Remove pages you don’t need', path: '/delete-pdf-pages', section: 'organize' },
  { status: 'live', task: 'rearrange', action: 'rearrange', label: 'Rearrange pages', hint: 'Put pages in a new order', path: '/rearrange-pdf-pages', section: 'organize' },
  { status: 'live', task: 'page-numbers', action: 'numbers', label: 'Page numbers', hint: 'Number the pages', path: '/add-page-numbers-to-pdf', section: 'organize' },
  { status: 'live', task: 'compress', action: 'compress', label: 'Compress PDF', hint: 'Make it smaller', path: '/compress-pdf', section: 'optimize' },
  { status: 'live', task: 'pdf-to-jpg', action: 'convert', mode: 'to-jpg', label: 'PDF to JPG', hint: 'Every page as an image', path: '/pdf-to-jpg', section: 'convert' },
  { status: 'live', task: 'pdf-to-png', action: 'convert', mode: 'to-png', label: 'PDF to PNG', hint: 'Sharp images, bigger files', path: '/pdf-to-png', section: 'convert' },
  { status: 'live', task: 'jpg-to-pdf', action: 'convert', mode: 'from-images', label: 'JPG to PDF', hint: 'Photos and scans into a PDF', path: '/jpg-to-pdf', section: 'convert' },
  { status: 'live', task: 'pdf-to-word', action: 'convert', mode: 'to-word', label: 'PDF to Word', hint: 'The text, in a Word file', path: '/pdf-to-word', section: 'convert' },
  { status: 'live', task: 'pdf-to-text', action: 'convert', mode: 'to-text', label: 'PDF to Text', hint: 'Plain text you can copy', path: '/pdf-to-text', section: 'convert' },
  { status: 'soon', label: 'Word to PDF', hint: 'Word documents as PDFs', section: 'convert' },
  { status: 'live', task: 'watermark', action: 'watermark', label: 'Watermark PDF', hint: 'Words or a logo on every page', path: '/watermark-pdf', section: 'secure' },
  { status: 'live', task: 'protect', action: 'protect', label: 'Protect PDF', hint: 'Lock it with a password', path: '/protect-pdf', section: 'secure' },
  { status: 'soon', label: 'Unlock PDF', hint: 'Remove a password you know', section: 'secure' },
  { status: 'soon', label: 'Sign PDF', hint: 'Add your signature', section: 'secure' },
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
