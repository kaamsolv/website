/**
 * Text Cleaner — fixes the mess left by copying from PDFs, emails, websites
 * and chat apps. Each option is independent and safe to combine. Framework-free.
 */

export type CleanOptionId =
  | 'invisible'
  | 'trimLines'
  | 'spaces'
  | 'blankLines'
  | 'joinLines'
  | 'oneLine'
  | 'quotes'
  | 'html'
  | 'duplicates'
  | 'emoji';

export type CleanOptions = Record<CleanOptionId, boolean>;

export const CLEAN_OPTIONS: { id: CleanOptionId; label: string; hint: string }[] = [
  { id: 'invisible', label: 'Remove invisible characters', hint: 'Zero-width spaces, soft hyphens and non-breaking spaces.' },
  { id: 'trimLines', label: 'Trim spaces at line ends', hint: 'Spaces and tabs at the start and end of each line.' },
  { id: 'spaces', label: 'Fix double spaces', hint: 'Turns runs of spaces and tabs into a single space.' },
  { id: 'blankLines', label: 'Remove extra blank lines', hint: 'Keeps at most one empty line between paragraphs.' },
  { id: 'joinLines', label: 'Fix broken lines', hint: 'Joins lines inside a paragraph — handy for text copied from a PDF.' },
  { id: 'oneLine', label: 'Put everything on one line', hint: 'Removes every line break.' },
  { id: 'quotes', label: 'Straighten quotes', hint: '“Curly” quotes and ’apostrophes’ become plain " and \'.' },
  { id: 'html', label: 'Remove HTML tags', hint: 'Strips <tags> and turns &amp; and friends back into text.' },
  { id: 'duplicates', label: 'Remove duplicate lines', hint: 'Keeps the first of any repeated line.' },
  { id: 'emoji', label: 'Remove emoji', hint: 'Takes out emoji and pictographs.' },
];

export const DEFAULT_CLEAN_OPTIONS: CleanOptions = {
  invisible: true,
  trimLines: true,
  spaces: true,
  blankLines: true,
  joinLines: false,
  oneLine: false,
  quotes: false,
  html: false,
  duplicates: false,
  emoji: false,
};

const HTML_ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&apos;': "'",
  '&nbsp;': ' ',
};

export function cleanText(input: string, options: CleanOptions): string {
  let text = input.replace(/\r\n?/g, '\n');

  if (options.html) {
    text = text
      .replace(/<(br|\/p|\/div|\/li|\/h[1-6])\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&(amp|lt|gt|quot|apos|nbsp|#39);/g, (m) => HTML_ENTITIES[m] ?? m);
  }
  if (options.invisible) {
    text = text.replace(/[​-‍⁠﻿­]/g, '').replace(/[   ]/g, ' ');
  }
  if (options.emoji) {
    text = text.replace(/[\p{Extended_Pictographic}\u{1F3FB}-\u{1F3FF}\u{FE0F}\u{200D}]/gu, '');
  }
  if (options.quotes) {
    text = text.replace(/[“”„″]/g, '"').replace(/[‘’‚′]/g, "'");
  }
  if (options.spaces) {
    text = text.replace(/[ \t]{2,}/g, ' ');
  }
  if (options.trimLines) {
    text = text
      .split('\n')
      .map((l) => l.trim())
      .join('\n');
  }
  if (options.duplicates) {
    const seen = new Set<string>();
    text = text
      .split('\n')
      .filter((line) => {
        if (line.trim() === '') return true;
        if (seen.has(line)) return false;
        seen.add(line);
        return true;
      })
      .join('\n');
  }
  if (options.joinLines) {
    // Inside a paragraph (no blank line), a single line break becomes a space;
    // a hyphen split across lines ("exam-\nple") is rejoined.
    text = text
      .split(/\n[ \t]*\n/)
      .map((para) => para.replace(/(\p{L})-\n(\p{Ll})/gu, '$1$2').replace(/[ \t]*\n[ \t]*/g, ' '))
      .join('\n\n');
  }
  if (options.blankLines) {
    text = text.replace(/\n[ \t]*(\n[ \t]*)+/g, '\n\n');
  }
  if (options.oneLine) {
    text = text.replace(/\s*\n\s*/g, ' ');
  }
  if (options.spaces) {
    text = text.replace(/ {2,}/g, ' ');
  }
  return options.trimLines || options.oneLine || options.blankLines ? text.trim() : text;
}
