/**
 * Text statistics for the Word Counter and Character Counter.
 * Framework-free; runs in the browser and in Node tests.
 *
 * Words follow Microsoft Word's rule, which is what essay and assignment limits
 * are usually checked against: anything between spaces that contains a letter
 * or number is one word ("don't", "well-known", "3.5", "नमस्ते"). Scripts
 * written without spaces (Chinese, Japanese, Thai…) are split with
 * Intl.Segmenter instead.
 */

const NO_SPACE_SCRIPTS =
  /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Thai}\p{Script=Lao}\p{Script=Khmer}\p{Script=Myanmar}]/u;
const HAS_LETTER_OR_NUMBER = /[\p{L}\p{N}]/u;

const wordSegmenter = new Intl.Segmenter(undefined, { granularity: 'word' });
const graphemeSegmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
const sentenceSegmenter = new Intl.Segmenter(undefined, { granularity: 'sentence' });

/** Average adult silent-reading and speaking speeds (words per minute). */
export const READING_WPM = 238;
export const SPEAKING_WPM = 130;

export function countWords(text: string): number {
  let words = 0;
  for (const token of text.split(/\s+/)) {
    if (!token) continue;
    if (NO_SPACE_SCRIPTS.test(token)) {
      for (const seg of wordSegmenter.segment(token)) if (seg.isWordLike) words++;
    } else if (HAS_LETTER_OR_NUMBER.test(token)) {
      words++;
    }
  }
  return words;
}

/** User-perceived characters: 👍🏽 and é are one each. */
export function countCharacters(text: string): number {
  let n = 0;
  for (const _ of graphemeSegmenter.segment(text)) n++;
  return n;
}

export function countCharactersNoSpaces(text: string): number {
  return countCharacters(text.replace(/\s+/g, ''));
}

export function countSentences(text: string): number {
  let n = 0;
  for (const seg of sentenceSegmenter.segment(text)) if (HAS_LETTER_OR_NUMBER.test(seg.segment)) n++;
  return n;
}

/** Blocks of text separated by at least one blank line. */
export function countParagraphs(text: string): number {
  return text.split(/\n\s*\n/).filter((p) => HAS_LETTER_OR_NUMBER.test(p)).length;
}

export function countLines(text: string): number {
  return text === '' ? 0 : text.split(/\r\n|\r|\n/).length;
}

export type TextStats = {
  words: number;
  characters: number;
  charactersNoSpaces: number;
  sentences: number;
  paragraphs: number;
  lines: number;
  readingSeconds: number;
  speakingSeconds: number;
};

export function textStats(text: string): TextStats {
  const words = countWords(text);
  return {
    words,
    characters: countCharacters(text),
    charactersNoSpaces: countCharactersNoSpaces(text),
    sentences: countSentences(text),
    paragraphs: countParagraphs(text),
    lines: countLines(text),
    readingSeconds: Math.round((words / READING_WPM) * 60),
    speakingSeconds: Math.round((words / SPEAKING_WPM) * 60),
  };
}

/** 0 → "0 sec", 45 → "45 sec", 200 → "3 min 20 sec", 3900 → "1 hr 5 min". */
export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds} sec`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return m > 0 ? `${h} hr ${m} min` : `${h} hr`;
  return s > 0 ? `${m} min ${s} sec` : `${m} min`;
}

/**
 * Common character limits, for the Character Counter. These are platform
 * rules that change — keep `LIMITS_CHECKED` current when editing.
 */
export const LIMITS_CHECKED = 'October 2026';

export type CharacterLimit = { id: string; label: string; limit: number; note?: string };

export const CHARACTER_LIMITS: CharacterLimit[] = [
  { id: 'x-post', label: 'X (Twitter) post', limit: 280, note: 'X counts links as 23 and some characters as 2.' },
  { id: 'instagram-caption', label: 'Instagram caption', limit: 2200 },
  { id: 'instagram-bio', label: 'Instagram bio', limit: 150 },
  { id: 'linkedin-post', label: 'LinkedIn post', limit: 3000 },
  { id: 'linkedin-headline', label: 'LinkedIn headline', limit: 220 },
  { id: 'youtube-title', label: 'YouTube title', limit: 100 },
  { id: 'meta-title', label: 'Page title (Google)', limit: 60, note: 'A guide — Google trims by width, not count.' },
  { id: 'meta-description', label: 'Meta description', limit: 160, note: 'A guide — Google trims by width, not count.' },
  { id: 'sms', label: 'One SMS', limit: 160, note: '70 if the message has emoji or non-English letters.' },
];
