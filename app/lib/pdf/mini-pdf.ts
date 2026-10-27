/**
 * A very small PDF writer: A4 pages, text in the built-in Helvetica and Helvetica-Bold, straight lines. Nothing
 * else. It exists because the server build deliberately keeps pdf-lib and @react-pdf out of the Cloudflare
 * Worker (next.config.mjs), and a plain invoice needs none of their features. Pure, no dependencies.
 *
 * Only ASCII is drawn (`ascii()` swaps common typographic characters and turns anything else into "?"), because
 * the built-in fonts have no rupee sign or Indian scripts. Widths are Adobe's published Helvetica metrics for
 * ASCII, so right-aligned columns line up.
 */

// Advance widths for ASCII 32..126, in 1/1000 em (Helvetica, Helvetica-Bold).
const HELV = [278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584];
const BOLD = [278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611, 975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556, 333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611, 611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584];

export type Rgb = readonly [number, number, number];

const SWAPS: Record<string, string> = { '‘': "'", '’': "'", '“': '"', '”': '"', '–': '-', '—': '-', '·': '-', '×': 'x', '₹': 'Rs. ', '…': '...', ' ': ' ', '•': '-' };

/** Printable ASCII only. */
export function ascii(text: string): string {
  let out = '';
  for (const ch of text.replace(/\r/g, '')) {
    if (SWAPS[ch] !== undefined) out += SWAPS[ch];
    else if (ch === '\n' || (ch >= ' ' && ch <= '~')) out += ch;
    else out += '?';
  }
  return out;
}

export function textWidth(text: string, size: number, bold = false): number {
  const table = bold ? BOLD : HELV;
  let w = 0;
  for (const ch of text) {
    const code = ch.charCodeAt(0);
    w += (code >= 32 && code <= 126 ? table[code - 32] : 556) * size;
  }
  return w / 1000;
}

const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
const num = (n: number) => (Math.round(n * 100) / 100).toString();
const color = (c: Rgb) => `${num(c[0])} ${num(c[1])} ${num(c[2])}`;

export class MiniPdf {
  readonly width = 595.28;
  readonly height = 841.89;
  private pages: string[][] = [];

  constructor(private readonly title = '') {
    this.addPage();
  }

  addPage(): void {
    this.pages.push([]);
  }

  private get ops(): string[] {
    return this.pages[this.pages.length - 1];
  }

  /** Draws one line of text with its baseline at (x, y); y counts up from the bottom of the page. */
  text(x: number, y: number, text: string, size = 10, bold = false, fill: Rgb = [0, 0, 0]): void {
    const t = ascii(text).replace(/\n/g, ' ');
    if (!t) return;
    this.ops.push(`BT /${bold ? 'F2' : 'F1'} ${num(size)} Tf ${color(fill)} rg ${num(x)} ${num(y)} Td (${esc(t)}) Tj ET`);
  }

  line(x1: number, y1: number, x2: number, y2: number, stroke: Rgb = [0.85, 0.87, 0.9], thickness = 0.6): void {
    this.ops.push(`${color(stroke)} RG ${num(thickness)} w ${num(x1)} ${num(y1)} m ${num(x2)} ${num(y2)} l S`);
  }

  save(): Uint8Array {
    const objects: string[] = [];
    const add = (body: string) => objects.push(body);
    // 1 catalog, 2 pages, 3 Helvetica, 4 Helvetica-Bold, 5 info, then (page, content) per page.
    add('<< /Type /Catalog /Pages 2 0 R >>');
    const kids = this.pages.map((_, i) => `${6 + i * 2} 0 R`).join(' ');
    add(`<< /Type /Pages /Kids [${kids}] /Count ${this.pages.length} >>`);
    add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
    add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
    add(`<< /Title (${esc(ascii(this.title))}) /Creator (KaamSolv) /Producer (KaamSolv) >>`);
    this.pages.forEach((ops, i) => {
      const content = ops.join('\n');
      add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${this.width} ${this.height}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${7 + i * 2} 0 R >>`);
      add(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
    });

    let out = '%PDF-1.4\n';
    const offsets: number[] = [];
    objects.forEach((body, i) => {
      offsets.push(out.length);
      out += `${i + 1} 0 obj\n${body}\nendobj\n`;
    });
    const xref = out.length;
    out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    for (const o of offsets) out += `${String(o).padStart(10, '0')} 00000 n \n`;
    out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info 5 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
    return new TextEncoder().encode(out);
  }
}
