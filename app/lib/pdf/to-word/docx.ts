/**
 * A minimal, plain .docx (Office Open XML) written by hand with fflate, so PDF → Word needs no
 * extra library. Only what the converter produces: paragraphs, three heading levels, tabs, one
 * page break per PDF page, and the first page's size. No images, tables, fonts or numbering.
 *
 * A .docx is a zip: [Content_Types].xml, _rels/.rels, word/document.xml, word/styles.xml and
 * word/_rels/document.xml.rels. Framework-free.
 */

import { zipSync } from 'fflate';
import type { Block, PageBlocks } from './paragraphs';

const NS_W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const NS_R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const XML_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

/**
 * Text that is safe inside an XML element: characters XML 1.0 forbids are dropped, a lone
 * surrogate (which can't be written as UTF-8) becomes U+FFFD, and & < > are escaped.
 */
export function xmlText(s: string): string {
  return s
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '')
    .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '�')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** One text run per tab-separated piece, with a real tab between them. */
function runs(text: string): string {
  return text
    .split('\t')
    .map((piece) => (piece ? `<w:r><w:t xml:space="preserve">${xmlText(piece)}</w:t></w:r>` : ''))
    .filter(Boolean)
    .join('<w:r><w:tab/></w:r>');
}

const STYLE_OF: Record<Block['kind'], string | null> = { p: null, h1: 'Heading1', h2: 'Heading2', h3: 'Heading3' };

function paragraph(block: Block, pageBreakBefore: boolean): string {
  const style = STYLE_OF[block.kind];
  const props = `${style ? `<w:pStyle w:val="${style}"/>` : ''}${pageBreakBefore ? '<w:pageBreakBefore/>' : ''}`;
  return `<w:p>${props ? `<w:pPr>${props}</w:pPr>` : ''}${runs(block.text)}</w:p>`;
}

/** The first page's size in twentieths of a point, snapped to A4 or Letter when it is within 2%. */
export function pageSetup(width: number, height: number): { w: number; h: number; landscape: boolean; margin: number } {
  const near = (a: number, b: number) => Math.abs(a - b) / b <= 0.02;
  const portrait = height >= width;
  const [short, long] = portrait ? [width, height] : [height, width];
  let s = short;
  let l = long;
  if (near(short, 595) && near(long, 842)) [s, l] = [595.3, 841.9]; // A4
  else if (near(short, 612) && near(long, 792)) [s, l] = [612, 792]; // US Letter
  const clamp = (pt: number) => Math.min(31680, Math.max(2880, Math.round(pt * 20))); // 2 in to 22 in
  const [w, h] = portrait ? [clamp(s), clamp(l)] : [clamp(l), clamp(s)];
  return { w, h, landscape: !portrait, margin: Math.min(1440, Math.round(Math.min(w, h) * 0.08)) };
}

function documentXml(pages: PageBlocks[]): string {
  const body: string[] = [];
  pages.forEach((page, i) => {
    const blocks = page.blocks.length ? page.blocks : [{ kind: 'p' as const, text: '' }];
    blocks.forEach((b, j) => body.push(paragraph(b, i > 0 && j === 0)));
  });
  const first = pages[0] ?? { width: 595, height: 842 };
  const { w, h, landscape, margin } = pageSetup(first.width, first.height);
  const sect =
    `<w:sectPr><w:pgSz w:w="${w}" w:h="${h}"${landscape ? ' w:orient="landscape"' : ''}/>` +
    `<w:pgMar w:top="${margin}" w:right="${margin}" w:bottom="${margin}" w:left="${margin}" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr>`;
  return `${XML_HEAD}<w:document xmlns:w="${NS_W}" xmlns:r="${NS_R}"><w:body>${body.join('')}${sect}</w:body></w:document>`;
}

function headingStyle(id: string, name: string, halfPoints: number, outline: number): string {
  return (
    `<w:style w:type="paragraph" w:styleId="${id}"><w:name w:val="${name}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/>` +
    `<w:pPr><w:keepNext/><w:spacing w:before="240" w:after="80"/><w:outlineLvl w:val="${outline}"/></w:pPr>` +
    `<w:rPr><w:b/><w:sz w:val="${halfPoints}"/><w:szCs w:val="${halfPoints}"/></w:rPr></w:style>`
  );
}

const STYLES_XML =
  `${XML_HEAD}<w:styles xmlns:w="${NS_W}">` +
  `<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="Calibri" w:cs="Calibri"/><w:sz w:val="22"/><w:szCs w:val="22"/><w:lang w:val="en-IN"/></w:rPr></w:rPrDefault>` +
  `<w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="264" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>` +
  `<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>` +
  headingStyle('Heading1', 'heading 1', 36, 0) +
  headingStyle('Heading2', 'heading 2', 30, 1) +
  headingStyle('Heading3', 'heading 3', 26, 2) +
  `</w:styles>`;

const CONTENT_TYPES =
  `${XML_HEAD}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
  `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
  `<Default Extension="xml" ContentType="application/xml"/>` +
  `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>` +
  `<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>` +
  `</Types>`;

const ROOT_RELS =
  `${XML_HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
  `<Relationship Id="rId1" Type="${NS_R}/officeDocument" Target="word/document.xml"/></Relationships>`;

const DOCUMENT_RELS =
  `${XML_HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
  `<Relationship Id="rId1" Type="${NS_R}/styles" Target="styles.xml"/></Relationships>`;

/** The finished .docx bytes. */
export function buildDocx(pages: PageBlocks[]): Uint8Array {
  const enc = new TextEncoder();
  return zipSync(
    {
      '[Content_Types].xml': enc.encode(CONTENT_TYPES),
      '_rels/.rels': enc.encode(ROOT_RELS),
      'word/document.xml': enc.encode(documentXml(pages)),
      'word/styles.xml': enc.encode(STYLES_XML),
      'word/_rels/document.xml.rels': enc.encode(DOCUMENT_RELS),
    },
    { level: 6 },
  );
}

export const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
