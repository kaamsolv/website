/**
 * PDF → Word (app/lib/pdf/to-word/): paragraphs and headings from text positions, the hand-written
 * .docx, and the whole chain against real PDFs read by the real pdf.js (running in Node).
 *
 * What these cannot show: that Microsoft Word / Google Docs / Pages open the file and look right.
 * They check the structure is valid XML in the right parts, and that the text is exactly right.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { unzipSync } from 'fflate';
import { PDFDocument, StandardFonts, degrees } from '@cantoo/pdf-lib';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { PdfToolError } from '../app/lib/pdf/errors.ts';
import { MAX_TEXT_PAGES } from '../app/lib/pdf/limits.ts';
import { pagesToDocx, SPARSE_CHARS_PER_PAGE } from '../app/lib/pdf/to-word/convert.ts';
import { buildDocx, pageSetup, xmlText } from '../app/lib/pdf/to-word/docx.ts';
import { extractPages } from '../app/lib/pdf/to-word/extract.ts';
import { pdfToDocx, wordFileName } from '../app/lib/pdf/to-word/index.ts';
import { layoutDocument, type Block, type PageBlocks, type PageText, type TextRun } from '../app/lib/pdf/to-word/paragraphs.ts';

// ───────────────────────────── helpers ─────────────────────────────

/** One word-run: width as Helvetica roughly measures (0.5 em per character). */
const run = (str: string, x: number, y: number, size = 11): TextRun => ({ str, x, y, size, width: str.length * size * 0.5 });
/** A whole line as a single run starting at the left margin. */
const row = (text: string, y: number, size = 11, x = 72) => run(text, x, y, size);
const page = (runs: TextRun[], width = 595, height = 842): PageText => ({ width, height, runs });
const blocksOf = (runs: TextRun[]) => layoutDocument([page(runs)])[0].blocks;
const texts = (blocks: Block[]) => blocks.map((b) => b.text);

/** Every part of a .docx, as text. */
function parts(bytes: Uint8Array): Record<string, string> {
  const dec = new TextDecoder();
  return Object.fromEntries(Object.entries(unzipSync(bytes)).map(([name, data]) => [name, dec.decode(data)]));
}

/** A small well-formedness check: balanced tags, quoted attributes, no raw `<` or stray `&` in text. */
function assertWellFormed(xml: string, name: string) {
  const body = xml.replace(/^<\?xml[^>]*\?>\s*/, '');
  const stack: string[] = [];
  const tag = /<(\/?)([A-Za-z_][\w:.-]*)((?:\s+[\w:.-]+="[^"]*")*)\s*(\/?)>/g;
  let last = 0;
  let m: RegExpExecArray | null;
  const check = (text: string) => {
    assert.ok(!text.includes('<'), `${name}: a raw "<" in text`);
    assert.ok(!/&(?!amp;|lt;|gt;|quot;|apos;|#\d+;)/.test(text), `${name}: a bare "&" in text`);
    // eslint-disable-next-line no-control-regex
    assert.ok(!/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(text), `${name}: a control character`);
  };
  while ((m = tag.exec(body))) {
    check(body.slice(last, m.index));
    last = tag.lastIndex;
    const [, closing, tagName, , selfClosing] = m;
    if (selfClosing) continue;
    if (closing) assert.equal(stack.pop(), tagName, `${name}: </${tagName}> does not match`);
    else stack.push(tagName);
  }
  check(body.slice(last));
  assert.deepEqual(stack, [], `${name}: unclosed tags`);
}

/** The document's text, paragraph by paragraph (tabs as \t), with the style each paragraph uses. */
function paragraphsOf(docXml: string): { style: string | null; breakBefore: boolean; text: string }[] {
  const out: { style: string | null; breakBefore: boolean; text: string }[] = [];
  for (const m of docXml.matchAll(/<w:p>(.*?)<\/w:p>/gs)) {
    const inner = m[1];
    const text = [...inner.matchAll(/<w:t(?: [^>]*)?>(.*?)<\/w:t>|<w:tab\/>/gs)]
      .map((t) => (t[0] === '<w:tab/>' ? '\t' : t[1].replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')))
      .join('');
    out.push({ style: /<w:pStyle w:val="([^"]+)"/.exec(inner)?.[1] ?? null, breakBefore: inner.includes('<w:pageBreakBefore/>'), text });
  }
  return out;
}

// ───────────────────────────── layout ─────────────────────────────

test('lines: runs on one baseline are joined in left-to-right order, with spaces from gaps', () => {
  // given out of order, 6pt of jitter on y is within the same line
  const blocks = blocksOf([run('world', 72 + 5 * 11 * 0.5 + 3, 100.4), run('Hello', 72, 100)]);
  assert.deepEqual(texts(blocks), ['Hello world']);
  // touching runs (no gap) stay together: no invented space
  assert.deepEqual(texts(blocksOf([run('Hel', 72, 100), run('lo', 72 + 3 * 5.5, 100)])), ['Hello']);
  // runs that already carry their space do not get a second one
  assert.deepEqual(texts(blocksOf([run('Hello ', 72, 100), run('world', 72 + 6 * 5.5 + 2, 100)])), ['Hello world']);
});

test('lines: a wide gap (a column or tab stop) becomes a tab, a normal gap a space', () => {
  const blocks = blocksOf([run('Item', 72, 100), run('Qty', 72 + 200, 100), run('Price', 72 + 300, 100)]);
  assert.deepEqual(texts(blocks), ['Item\tQty\tPrice']);
});

test('reading order: top to bottom, whatever order the runs arrive in', () => {
  const blocks = blocksOf([row('third line down here', 160), row('first line is at the top', 100), row('second in the middle', 130)]);
  assert.deepEqual(texts(blocks).join(' | ').includes('first line is at the top'), true);
  const flat = texts(blocks).join(' ');
  assert.ok(flat.indexOf('first') < flat.indexOf('second') && flat.indexOf('second') < flat.indexOf('third'));
});

test('paragraphs: lines of one paragraph join; a blank line, a short last line, an indent, a bullet or a size change starts a new one', () => {
  const W = 'x'.repeat(80); // a full-width line at 11pt (440pt)
  const full = (y: number) => row(W, y);
  // lines 14pt apart, all full width: one paragraph
  assert.equal(blocksOf([full(100), full(114), full(128)]).length, 1);
  // a blank line (gap of 30 > 1.65 x 11)
  assert.equal(blocksOf([full(100), full(114), full(150), full(164)]).length, 2);
  // the line before stops well short of the right edge: that paragraph ended
  assert.equal(blocksOf([full(100), full(114), row('short end.', 128), full(142)]).length, 2);
  // a first-line indent starts a paragraph; coming back to the margin continues it
  const indented = blocksOf([full(100), full(114), run(W, 100, 128), full(142)]);
  assert.equal(indented.length, 2);
  assert.equal(indented[0].text, `${W} ${W}`);
  assert.equal(indented[1].text, `${W} ${W}`);
  // bullets, numbers and letters each start a paragraph
  const list = blocksOf([row('• first thing here', 100), row('• second thing here', 114), row('3. third thing here', 128), row('b) fourth thing here', 142)]);
  assert.equal(list.length, 4);
  // a size change
  assert.equal(blocksOf([row('Body text at normal size.', 100, 11), row('Bigger now.', 114, 14)]).length, 2);
});

test('headings: short, clearly larger text becomes h1 / h2 / h3 against the body size', () => {
  const body = (y: number) => row('The quick brown fox jumps over the lazy dog again and again to fill this line out.', y);
  const blocks = blocksOf([
    row('Annual Report', 60, 28),
    row('Section two', 110, 17),
    row('A little heading', 150, 14),
    body(190),
    body(204),
    body(218),
    body(232),
  ]);
  assert.deepEqual(blocks.slice(0, 3).map((b) => b.kind), ['h1', 'h2', 'h3']);
  assert.equal(blocks.find((b) => b.text.startsWith('The quick'))?.kind, 'p');
  // large type that is long is just a big paragraph, not a heading
  const long = blocksOf([row('word '.repeat(40).trim(), 60, 20), body(100), body(114), body(128), body(142), body(156)]);
  assert.equal(long[0].kind, 'p');
  // everything one size: no headings at all
  assert.ok(blocksOf([row('one', 100), row('two', 140), row('three', 180)]).every((b) => b.kind === 'p'));
});

test('a word split across lines by the typesetter is put back together; real line breaks keep their space', () => {
  const blocks = blocksOf([row('x'.repeat(78) + ' well-', 100), row('known fact about the thing.', 114)]);
  assert.ok(texts(blocks)[0].endsWith('well-known fact about the thing.'), texts(blocks)[0]);
  const plain = blocksOf([row('x'.repeat(80), 100), row('and then more words follow.', 114)]);
  assert.ok(texts(plain)[0].endsWith(' and then more words follow.'));
});

test('odd input never throws: blank pages, whitespace-only runs, NaN and zero sizes, huge coordinates', () => {
  const pages = [
    page([]),
    page([run('   ', 10, 10), run('\n', 20, 20)]),
    page([{ str: 'NaN here', x: Number.NaN, y: 10, size: 11, width: 5 }, { str: 'Inf here', x: 10, y: Infinity, size: 11, width: 5 }]),
    page([{ str: 'zero size', x: 72, y: 100, size: 0, width: 0 }, { str: 'neg size', x: 72, y: 120, size: -5, width: -3 }]),
    page([run('far away', 1e9, 1e9), run('negative', -500, -500)]),
  ];
  const out = layoutDocument(pages);
  assert.equal(out.length, 5);
  assert.deepEqual(out[0].blocks, []);
  assert.deepEqual(out[1].blocks, []);
  assert.deepEqual(out[2].blocks, [], 'non-finite positions are dropped');
  assert.deepEqual(texts(out[3].blocks).join(' ').includes('zero size'), true);
  assert.equal(out[4].blocks.length > 0, true);
});

// ───────────────────────────── the .docx ─────────────────────────────

const sample: PageBlocks[] = [
  { width: 595, height: 842, blocks: [{ kind: 'h1', text: 'Title' }, { kind: 'p', text: 'First page paragraph.' }] },
  { width: 595, height: 842, blocks: [{ kind: 'p', text: 'Second page.' }, { kind: 'h2', text: 'Sub' }] },
  { width: 595, height: 842, blocks: [] },
  { width: 595, height: 842, blocks: [{ kind: 'p', text: 'Item\tQty\tPrice' }] },
];

test('docx: a valid package with every part, and every XML part well-formed', () => {
  const p = parts(buildDocx(sample));
  assert.deepEqual(Object.keys(p).sort(), ['[Content_Types].xml', '_rels/.rels', 'word/_rels/document.xml.rels', 'word/document.xml', 'word/styles.xml'].sort());
  for (const [name, xml] of Object.entries(p)) assertWellFormed(xml, name);
  assert.match(p['[Content_Types].xml'], /\/word\/document\.xml.*wordprocessingml\.document\.main\+xml/);
  assert.match(p['_rels/.rels'], /officeDocument" Target="word\/document\.xml"/);
  assert.match(p['word/_rels/document.xml.rels'], /\/styles" Target="styles\.xml"/);
  assert.ok(buildDocx(sample)[0] === 0x50 && buildDocx(sample)[1] === 0x4b, 'starts with the zip signature "PK"');
});

test('docx: paragraphs, heading styles, tabs and one page break per page, in order', () => {
  const doc = paragraphsOf(parts(buildDocx(sample))['word/document.xml']);
  assert.deepEqual(
    doc.map((d) => [d.style, d.breakBefore, d.text]),
    [
      ['Heading1', false, 'Title'],
      [null, false, 'First page paragraph.'],
      [null, true, 'Second page.'],
      ['Heading2', false, 'Sub'],
      [null, true, ''], // an empty page keeps its place
      [null, true, 'Item\tQty\tPrice'],
    ],
  );
  const styles = parts(buildDocx(sample))['word/styles.xml'];
  for (const id of ['Normal', 'Heading1', 'Heading2', 'Heading3']) assert.match(styles, new RegExp(`w:styleId="${id}"`), `${id} is defined`);
});

test('docx: text is escaped and illegal characters are removed — never breaking the XML', () => {
  const nasty = 'A & B <tag> "quoted" \u0000\u0001\u0008\u000B\u000C\u001F end ￾￿ ok \ud800 lone \udc00 low';
  assert.equal(xmlText('a<b>&c'), 'a&lt;b&gt;&amp;c');
  const cleaned = xmlText(nasty);
  assert.ok(!/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/.test(cleaned));
  assert.ok(!/[\ud800-\udfff]/.test(cleaned), 'lone surrogates are replaced');
  const p = parts(buildDocx([{ width: 595, height: 842, blocks: [{ kind: 'p', text: nasty }] }]));
  assertWellFormed(p['word/document.xml'], 'document.xml');
  assert.match(paragraphsOf(p['word/document.xml'])[0].text, /^A & B <tag> "quoted" +end +ok � lone � low$|^A & B <tag> "quoted" {1,2}end/);
  // text that looks like markup or an entity stays text
  const t = paragraphsOf(parts(buildDocx([{ width: 595, height: 842, blocks: [{ kind: 'p', text: '</w:t><w:p>&amp;&#x41;' }] }]))['word/document.xml']);
  assert.equal(t.length, 1);
  assert.equal(t[0].text, '</w:t><w:p>&amp;&#x41;');
});

test('docx: an empty document and a document of empty pages still build', () => {
  assertWellFormed(parts(buildDocx([]))['word/document.xml'], 'empty');
  assertWellFormed(parts(buildDocx([{ width: 595, height: 842, blocks: [] }]))['word/document.xml'], 'blank page');
});

test('docx: page size follows the first page — A4 and Letter snap, landscape and odd sizes are kept, absurd ones clamped', () => {
  assert.deepEqual(pageSetup(595, 842), { w: 11906, h: 16838, landscape: false, margin: 952 });
  assert.deepEqual(pageSetup(594.96, 841.92), { w: 11906, h: 16838, landscape: false, margin: 952 });
  assert.equal(pageSetup(612, 792).w, 12240);
  assert.equal(pageSetup(612, 792).h, 15840);
  const land = pageSetup(842, 595);
  assert.deepEqual([land.w, land.h, land.landscape], [16838, 11906, true]);
  const odd = pageSetup(400, 300);
  assert.deepEqual([odd.w, odd.h, odd.landscape], [8000, 6000, true]);
  const huge = pageSetup(100000, 100000);
  assert.ok(huge.w <= 31680 && huge.h <= 31680);
  const tiny = pageSetup(10, 10);
  assert.ok(tiny.w >= 2880 && tiny.h >= 2880);
  const doc = parts(buildDocx([{ width: 842, height: 595, blocks: [{ kind: 'p', text: 'x' }] }]))['word/document.xml'];
  assert.match(doc, /<w:pgSz w:w="16838" w:h="11906" w:orient="landscape"\/>/);
});

// ───────────────────────────── conversion rules ─────────────────────────────

test('no text at all is refused as a scan; very little text is allowed but flagged', () => {
  assert.throws(() => pagesToDocx([page([]), page([run('   ', 10, 10)])]), (e) => e instanceof PdfToolError && e.code === 'no-text');
  assert.throws(() => pagesToDocx([]), (e) => e instanceof PdfToolError && e.code === 'no-text');
  const sparse = pagesToDocx([page([row('1', 700)]), page([row('2', 700)])]);
  assert.equal(sparse.sparse, true);
  assert.equal(sparse.chars, 2);
  const full = pagesToDocx([page([row('x'.repeat(SPARSE_CHARS_PER_PAGE), 100)])]);
  assert.equal(full.sparse, false);
});

test('file names: report → report.docx', () => {
  assert.equal(wordFileName('report'), 'report.docx');
});

// ─────────────────── the whole chain, with real PDFs and the real pdf.js ───────────────────

async function readPdf(bytes: Uint8Array) {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes), isEvalSupported: false, verbosity: 0 }).promise;
  return doc as unknown as Parameters<typeof pdfToDocx>[0];
}

async function sampleReport(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const helv = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const p1 = doc.addPage([595, 842]);
  p1.drawText('Quarterly Report', { x: 72, y: 760, size: 28, font: bold });
  const lines = [
    'This is the first paragraph of the report. It is long enough to run onto a second line so that',
    'the converter has to join the lines back into one paragraph again.',
  ];
  lines.forEach((l, i) => p1.drawText(l, { x: 72, y: 720 - i * 14, size: 11, font: helv }));
  p1.drawText('Second paragraph starts after a gap & has <symbols>.', { x: 72, y: 670, size: 11, font: helv });
  const p2 = doc.addPage([595, 842]);
  p2.drawText('Page two heading', { x: 72, y: 760, size: 17, font: bold });
  p2.drawText('Body text on the second page.', { x: 72, y: 720, size: 11, font: helv });
  return doc.save();
}

test('real PDF → .docx: text, paragraphs, headings and pages come out right', async () => {
  const pdf = await readPdf(await sampleReport());
  const result = await pdfToDocx(pdf);
  assert.equal(result.pages, 2);
  assert.equal(result.sparse, false);
  const p = parts(result.bytes);
  for (const [name, xml] of Object.entries(p)) assertWellFormed(xml, name);
  const doc = paragraphsOf(p['word/document.xml']);
  assert.deepEqual(
    doc.map((d) => [d.style, d.breakBefore, d.text]),
    [
      ['Heading1', false, 'Quarterly Report'],
      [null, false, 'This is the first paragraph of the report. It is long enough to run onto a second line so that the converter has to join the lines back into one paragraph again.'],
      [null, false, 'Second paragraph starts after a gap & has <symbols>.'],
      ['Heading2', true, 'Page two heading'],
      [null, false, 'Body text on the second page.'],
    ],
  );
});

test('real PDF: extraction gives top-down coordinates (the layout code relies on it)', async () => {
  const pdf = await readPdf(await sampleReport());
  const pages = await extractPages(pdf);
  assert.equal(pages.length, 2);
  assert.deepEqual([pages[0].width, pages[0].height], [595, 842]);
  const title = pages[0].runs.find((r) => r.str === 'Quarterly Report')!;
  const body = pages[0].runs.find((r) => r.str.startsWith('This is the first'))!;
  assert.ok(title.y < body.y, 'the title is above the body (smaller y)');
  assert.ok(Math.abs(title.size - 28) < 0.01 && Math.abs(body.size - 11) < 0.01, 'sizes are read');
  assert.ok(Math.abs(title.x - 72) < 0.01);
});

test('real PDF: progress is reported page by page', async () => {
  const seen: [number, number][] = [];
  await pdfToDocx(await readPdf(await sampleReport()), (d, t) => seen.push([d, t]));
  assert.deepEqual(seen, [[0, 2], [1, 2], [2, 2]]);
});

test('real PDF: a page with no text (an image-only scan) is refused with the scan message', async () => {
  const doc = await PDFDocument.create();
  doc.addPage([595, 842]); // nothing drawn at all
  const pdf = await readPdf(await doc.save());
  await assert.rejects(pdfToDocx(pdf), (e) => e instanceof PdfToolError && e.code === 'no-text');
});

test('real PDF: a rotated page still reads in the right order', async () => {
  const doc = await PDFDocument.create();
  const helv = await doc.embedFont(StandardFonts.Helvetica);
  const p = doc.addPage([842, 595]);
  p.drawText('Landscape title line', { x: 72, y: 520, size: 12, font: helv });
  p.drawText('Landscape second line', { x: 72, y: 480, size: 12, font: helv });
  p.setRotation(degrees(0));
  const out = parts((await pdfToDocx(await readPdf(await doc.save()))).bytes)['word/document.xml'];
  assert.match(out, /w:orient="landscape"/);
  const flat = paragraphsOf(out).map((d) => d.text).join(' | ');
  assert.ok(flat.indexOf('title') < flat.indexOf('second'), flat);
});

test('real PDF: more pages than the limit is refused before any work', async () => {
  const fake = { numPages: MAX_TEXT_PAGES + 1, getPage: () => assert.fail('should not read pages') } as unknown as Parameters<typeof pdfToDocx>[0];
  await assert.rejects(pdfToDocx(fake), (e) => e instanceof PdfToolError && e.code === 'too-many-pages');
});

test('real PDF: accented and non-Latin text survives (as far as the PDF stores it as Unicode)', async () => {
  const doc = await PDFDocument.create();
  const helv = await doc.embedFont(StandardFonts.Helvetica);
  const p = doc.addPage([595, 842]);
  p.drawText('Café résumé naïve — ₹ 1,25,000', { x: 72, y: 700, size: 12, font: helv });
  const out = paragraphsOf(parts((await pdfToDocx(await readPdf(await doc.save()))).bytes)['word/document.xml']);
  assert.match(out[0].text, /^Café résumé naïve/);
});
