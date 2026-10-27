/**
 * Text positions → paragraphs, for PDF → Word. Pure and framework-free: it works on
 * plain numbers, so it is tested without pdf.js (app/lib/pdf/to-word/extract.ts feeds it).
 *
 * What it does: groups text runs into lines (same baseline), lines into paragraphs
 * (blank space, a short last line, an indent, a new bullet, a size change), and
 * short large-type paragraphs into headings. What it does NOT do: tables, columns,
 * images, fonts, exact spacing. Reading order is top to bottom, left to right, so a
 * two-column page interleaves. The page says so before the download.
 *
 * Coordinates: `y` grows downward (the extractor flips pdf.js's upward axis), in points.
 */

export type TextRun = { str: string; x: number; y: number; size: number; width: number };
export type PageText = { width: number; height: number; runs: TextRun[] };
export type BlockKind = 'p' | 'h1' | 'h2' | 'h3';
export type Block = { kind: BlockKind; text: string };
export type PageBlocks = { width: number; height: number; blocks: Block[] };

type Line = { text: string; left: number; right: number; y: number; size: number };

const FALLBACK_SIZE = 10;
/** A gap wider than this many font sizes is a column or tab stop, not a space. */
const TAB_GAP = 2.2;
/** A gap wider than this many font sizes (and not already spaced) is a word space. */
const SPACE_GAP = 0.12;
const BULLET = /^(?:[•●◦▪▫■□○◆◇‣⁃–—*-]\s|\(?\d{1,3}[.)]\s|\(?[a-zA-Z][.)]\s|\([ivxIVX]{1,5}\)\s)/;

const hasText = (s: string) => /\S/.test(s);

export function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * p)));
  return sorted[i];
}

/** The font size most of the characters are set in. */
function bodySize(pages: Line[][]): number {
  const weight = new Map<number, number>();
  for (const lines of pages) {
    for (const l of lines) {
      const key = Math.round(l.size * 2) / 2;
      weight.set(key, (weight.get(key) ?? 0) + l.text.length);
    }
  }
  let best = FALLBACK_SIZE;
  let most = -1;
  for (const [size, w] of weight) {
    if (w > most) {
      most = w;
      best = size;
    }
  }
  return best;
}

function runsToLines(runs: TextRun[]): Line[] {
  const clean = runs
    .filter((r) => hasText(r.str) && Number.isFinite(r.x) && Number.isFinite(r.y))
    .map((r) => ({ ...r, size: r.size > 0 && Number.isFinite(r.size) ? r.size : FALLBACK_SIZE, width: Number.isFinite(r.width) && r.width > 0 ? r.width : 0 }));
  clean.sort((a, b) => a.y - b.y || a.x - b.x);

  const groups: (typeof clean)[] = [];
  for (const r of clean) {
    const g = groups[groups.length - 1];
    if (g && Math.abs(r.y - g[0].y) <= 0.45 * Math.max(r.size, g[0].size)) g.push(r);
    else groups.push([r]);
  }

  return groups.map((g) => {
    g.sort((a, b) => a.x - b.x);
    let text = '';
    let end = -Infinity;
    for (const r of g) {
      if (text) {
        const gap = r.x - end;
        const glued = /\s$/.test(text) || /^\s/.test(r.str);
        if (gap > TAB_GAP * r.size) text = `${text.replace(/\s+$/, '')}\t`;
        else if (gap > SPACE_GAP * r.size && !glued) text += ' ';
      }
      text += r.str;
      end = Math.max(end, r.x + r.width);
    }
    // the size of the text that fills most of the line (a superscript or drop cap doesn't set it)
    const bySize = new Map<number, number>();
    for (const r of g) bySize.set(r.size, (bySize.get(r.size) ?? 0) + r.str.trim().length);
    const size = [...bySize.entries()].sort((a, b) => b[1] - a[1])[0][0];
    return { text: text.replace(/[  ]+/g, (m) => (m.length > 1 ? ' ' : m)).trim(), left: g[0].x, right: end, y: g[0].y, size };
  });
}

function joinLines(lines: Line[]): string {
  let out = '';
  for (const l of lines) {
    if (!out) out = l.text;
    // a word split by the typesetter keeps its hyphen but loses the space: "well-" + "known"
    else if (/[A-Za-z]-$/.test(out) && /^[a-z]/.test(l.text)) out += l.text;
    else out += ` ${l.text}`;
  }
  return out;
}

function linesToBlocks(lines: Line[], body: number): Block[] {
  if (!lines.length) return [];
  const lefts = lines.map((l) => l.left).sort((a, b) => a - b);
  const rights = lines.map((l) => l.right).sort((a, b) => a - b);
  const pageLeft = percentile(lefts, 0.1);
  const pageRight = percentile(rights, 0.9);
  const textWidth = Math.max(pageRight - pageLeft, 1);

  const paragraphs: Line[][] = [];
  for (const line of lines) {
    const cur = paragraphs[paragraphs.length - 1];
    const prev = cur?.[cur.length - 1];
    if (!cur || !prev) {
      paragraphs.push([line]);
      continue;
    }
    const lead = Math.max(prev.size, line.size);
    const gap = line.y - prev.y;
    const sizeChanged = Math.abs(line.size / prev.size - 1) > 0.12;
    const newParagraph =
      gap > 1.65 * lead || // a blank line
      gap < 0.5 * lead || // not really below it
      sizeChanged ||
      BULLET.test(line.text) ||
      prev.right < pageRight - 0.18 * textWidth || // the line before stopped short: that paragraph ended
      line.left - prev.left > 0.8 * lead; // a first-line indent
    if (newParagraph) paragraphs.push([line]);
    else cur.push(line);
  }

  return paragraphs.map((para) => {
    const text = joinLines(para);
    const size = Math.max(...para.map((l) => l.size));
    const ratio = size / body;
    if (ratio >= 1.2 && para.length <= 2 && text.length <= 140) {
      return { kind: ratio >= 1.8 ? 'h1' : ratio >= 1.45 ? 'h2' : 'h3', text } as Block;
    }
    return { kind: 'p', text } as Block;
  });
}

/** Every page's text runs → that page's paragraphs, with headings picked against the document's body size. */
export function layoutDocument(pages: PageText[]): PageBlocks[] {
  const lined = pages.map((p) => runsToLines(p.runs));
  const body = bodySize(lined);
  return pages.map((p, i) => ({ width: p.width, height: p.height, blocks: linesToBlocks(lined[i], body) }));
}
