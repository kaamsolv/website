/**
 * The rent-receipt PDF (A4, three receipts to a page, each with a signature line and, for cash
 * above ₹5,000, a box for a ₹1 revenue stamp).
 *
 * Written with plain createElement, and handed the react-pdf module instead of importing it:
 * the browser passes `await import('@react-pdf/renderer')` (loaded only when someone presses
 * Download), and the unit tests pass it too, so the real PDF is rendered and read back in Node.
 * No JSX on purpose: the test runner loads .tsx through a path where react-pdf's own
 * dependencies don't resolve.
 */

import { createElement as h, type ReactElement } from 'react';
import type { Receipt, ReceiptSet } from '@/app/lib/rent-receipt/build';

type ReactPdf = typeof import('@react-pdf/renderer');
type DocumentProps = import('@react-pdf/renderer').DocumentProps;

const PER_PAGE = 3;
const NAVY = '#0C2248';
const MUTED = '#5B6478';
const LINE = '#B9C0D0';

/** Inter has the ₹ glyph; the built-in PDF fonts don't. `base` ends in a slash: "/fonts/" or a folder path. */
export function registerFonts(rp: ReactPdf, base: string): void {
  rp.Font.register({
    family: 'Inter',
    fonts: [
      { src: `${base}Inter-Regular.ttf`, fontWeight: 400 },
      { src: `${base}Inter-Bold.ttf`, fontWeight: 700 },
    ],
  });
  // Don't break names, PANs or addresses across lines with hyphens.
  rp.Font.registerHyphenationCallback((word) => [word]);
}

function receiptBlock(rp: ReactPdf, set: ReceiptSet, r: Receipt, last: boolean): ReactElement {
  const { View, Text } = rp;
  return h(
    View,
    { key: r.monthLabel, wrap: false, style: { height: '33.3%', paddingVertical: 14, paddingHorizontal: 6, borderBottomWidth: last ? 0 : 1, borderBottomStyle: 'dashed', borderBottomColor: LINE } },
    h(
      View,
      { style: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' } },
      h(Text, { style: { fontSize: 15, fontWeight: 700, letterSpacing: 0.8 } }, 'RENT RECEIPT'),
      h(Text, { style: { fontSize: 9, color: MUTED } }, `Date: ${r.dateLabel}`),
    ),
    h(Text, { style: { fontSize: 9, color: MUTED, marginTop: 3 } }, `For ${r.monthLabel}`),
    h(Text, { style: { fontSize: 10.5, lineHeight: 1.5, marginTop: 10 } }, r.received),
    h(Text, { style: { fontSize: 9.5, marginTop: 6, color: MUTED } }, r.paidBy),
    h(
      View,
      { style: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 'auto' } },
      h(
        View,
        { style: { maxWidth: '50%' } },
        h(Text, { style: { fontSize: 9, color: MUTED } }, 'Landlord'),
        h(Text, { style: { fontSize: 10.5, fontWeight: 700 } }, set.landlord),
        set.landlordPan ? h(Text, { style: { fontSize: 9.5 } }, `PAN: ${set.landlordPan}`) : null,
      ),
      h(
        View,
        { style: { flexDirection: 'row', alignItems: 'flex-end' } },
        set.stamp
          ? h(
              View,
              { style: { width: 76, height: 62, borderWidth: 1, borderStyle: 'dashed', borderColor: LINE, marginRight: 14, alignItems: 'center', justifyContent: 'center' } },
              h(Text, { style: { fontSize: 7.5, color: MUTED, textAlign: 'center' } }, 'Revenue stamp ₹1'),
              h(Text, { style: { fontSize: 6.5, color: MUTED, textAlign: 'center' } }, 'sign across'),
            )
          : null,
        h(
          View,
          { style: { width: 130, borderTopWidth: 1, borderTopColor: NAVY, paddingTop: 3 } },
          h(Text, { style: { fontSize: 8.5, color: MUTED, textAlign: 'center' } }, 'Signature of landlord'),
        ),
      ),
    ),
  );
}

/** The whole document: pages of three receipts. */
export function rentReceiptDocument(rp: ReactPdf, set: ReceiptSet): ReactElement<DocumentProps> {
  const { Document, Page } = rp;
  const pages: Receipt[][] = [];
  for (let i = 0; i < set.receipts.length; i += PER_PAGE) pages.push(set.receipts.slice(i, i + PER_PAGE));
  return h(
    Document as never,
    { title: `Rent receipts — ${set.tenant}`, creator: 'KaamSolv' },
    ...pages.map((group, p) =>
      h(
        Page,
        { key: p, size: 'A4', style: { fontFamily: 'Inter', fontSize: 10, color: NAVY, paddingVertical: 28, paddingHorizontal: 40 } },
        ...group.map((r, i) => receiptBlock(rp, set, r, i === group.length - 1 && group.length === PER_PAGE)),
      ),
    ),
  ) as ReactElement<DocumentProps>;
}
