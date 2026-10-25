import { Document, Font, Image, Page, StyleSheet, Text, View, type Styles } from '@react-pdf/renderer';
import { hasPaymentDetails, type Invoice } from '@/app/lib/invoice/types';
import { parseNumber, type Totals } from '@/app/lib/invoice/totals';
import { formatMoney } from '@/app/lib/invoice/money';
import { displayDate } from '@/app/lib/invoice/defaults';
import { EXPORT_CODE, placeOfSupplyLabel } from '@/app/lib/invoice/gst-tax';
import { stateName } from '@/app/lib/invoice/india';
import { rupeesInWords } from '@/app/lib/invoice/words';
import { DEFAULT_DESIGN, textOn, type Design } from '@/app/lib/invoice/design';

/*
 * The PDF template (A4). Loaded only by generate-pdf.tsx, in the browser.
 * Three looks (classic, minimal, bold) and a brand colour (Pro, design.ts).
 * Long invoices flow onto more pages: the table header repeats, rows and the
 * closing block never split, and page numbers appear only past one page. Inter (OFL, public/fonts) is embedded: the built-in PDF fonts have
 * no ₹ glyph.
 */
const origin = typeof window !== 'undefined' ? window.location.origin : '';
Font.register({
  family: 'Inter',
  fonts: [
    { src: `${origin}/fonts/Inter-Regular.ttf`, fontWeight: 400 },
    { src: `${origin}/fonts/Inter-Bold.ttf`, fontWeight: 700 },
  ],
});
// Don't hyphenate names, emails or invoice numbers.
Font.registerHyphenationCallback((word) => [word]);

const NAVY = '#0C2248';
const MUTED = '#5B6478';
const LINE = '#E3E7EF';
const CORAL = '#FE6336';

// Larger text sets its own lineHeight — the page's inherited value is resolved at
// the 9.5 pt body size, which made headings overlap the line below.
const s = StyleSheet.create({
  page: { fontFamily: 'Inter', fontSize: 9.5, color: NAVY, paddingTop: 36, paddingBottom: 48, paddingHorizontal: 44 },
  // Body line height lives here, not on the Page: page-level render-time text
  // (running header, page numbers) that inherits it is dropped by react-pdf.
  body: { fontSize: 9.5, lineHeight: 1.3 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between' },
  logo: { maxWidth: 120, maxHeight: 48, objectFit: 'contain', marginBottom: 6 },
  seller: { width: '55%' },
  sellerName: { fontSize: 14, lineHeight: 1.25, fontWeight: 700, marginBottom: 4 },
  muted: { color: MUTED },
  meta: { width: '40%', alignItems: 'flex-end' },
  title: { fontSize: 22, lineHeight: 1.15, fontWeight: 700, letterSpacing: 1, marginBottom: 10 },
  metaRow: { flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 2 },
  metaLabel: { color: MUTED, width: 70, textAlign: 'right', marginRight: 8 },
  rule: { height: 2, backgroundColor: CORAL, width: 40, marginTop: 14, marginBottom: 12 },
  caption: { fontSize: 8, fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 3 },
  clientName: { fontSize: 11, lineHeight: 1.3, fontWeight: 700, marginBottom: 2 },
  table: { marginTop: 14 },
  thead: { flexDirection: 'row', backgroundColor: '#F3F5FA', paddingVertical: 6, paddingHorizontal: 6 },
  th: { fontSize: 8, fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: 0.5 },
  tr: { flexDirection: 'row', paddingVertical: 4, paddingHorizontal: 6, borderBottomWidth: 1, borderBottomColor: LINE, fontSize: 9, lineHeight: 1.25 },
  cDesc: { width: '52%', paddingRight: 8 },
  cQty: { width: '12%', textAlign: 'right' },
  cRate: { width: '18%', textAlign: 'right' },
  cAmt: { width: '18%', textAlign: 'right' },
  bottom: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 12 },
  totals: { width: '44%' },
  tRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
  grand: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6, paddingTop: 7, borderTopWidth: 1.5, borderTopColor: NAVY },
  grandText: { fontSize: 12, lineHeight: 1.3, fontWeight: 700 },
  notes: { width: '50%', paddingRight: 12, fontSize: 8.5, lineHeight: 1.3 },
  gstin: { marginTop: 2, fontWeight: 700, fontSize: 9 },
  payBlock: { marginTop: 10 },
  payRow: { flexDirection: 'row', alignItems: 'flex-start' },
  qrBox: { width: 78, marginLeft: 8, alignItems: 'center' },
  qr: { width: 72, height: 72 },
  qrCaption: { fontSize: 6.5, color: MUTED, textAlign: 'center', marginTop: 2 },
  footer: { position: 'absolute', bottom: 24, left: 44, right: 44, textAlign: 'center', fontSize: 7.5, color: '#8A93A6' },
  // Stage 2C-1 — more than one page (text filled in at render time).
  running: { position: 'absolute', top: 16, left: 44, right: 44, fontSize: 7.5, color: '#8A93A6' },
  pageNo: { position: 'absolute', bottom: 24, left: 44, right: 44, fontSize: 7.5, color: '#8A93A6', textAlign: 'right' },
  // Stage 2C-1 — templates
  band: { marginTop: -36, marginHorizontal: -44, paddingHorizontal: 44, paddingVertical: 18, marginBottom: 16 },
  bandTitle: { fontSize: 20, lineHeight: 1.15, fontWeight: 700, letterSpacing: 1.5 },
  hairline: { height: 0.75, backgroundColor: LINE, marginTop: 14, marginBottom: 12 },
  // Stage 2B — GST tax invoice
  docNote: { fontSize: 7.5, color: MUTED, textAlign: 'right', marginTop: -6, marginBottom: 8, maxWidth: 200 },
  parties: { flexDirection: 'row', justifyContent: 'space-between' },
  party: { width: '48%' },
  gHsn: { width: '11%' },
  gDesc: { width: '37%', paddingRight: 6 },
  gQty: { width: '11%', textAlign: 'right' },
  gRate: { width: '14%', textAlign: 'right' },
  gPct: { width: '8%', textAlign: 'right' },
  gAmt: { width: '19%', textAlign: 'right' },
  words: { fontSize: 8, color: MUTED, marginTop: 4, textAlign: 'right' },
  // Tax summary (left) and signatory (right) share one row, so a full page still fits.
  closing: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 10 },
  summary: { width: '62%', borderTopWidth: 1, borderTopColor: LINE },
  sHead: { flexDirection: 'row', paddingVertical: 3, paddingHorizontal: 6, backgroundColor: '#F3F5FA' },
  sRow: { flexDirection: 'row', paddingVertical: 2.5, paddingHorizontal: 6, borderBottomWidth: 1, borderBottomColor: LINE, fontSize: 8.5 },
  sCell: { width: '21%', textAlign: 'right' },
  sFirst: { width: '16%' },
  sign: { width: '33%', alignItems: 'center' },
  signImg: { maxWidth: 150, maxHeight: 36, objectFit: 'contain', marginVertical: 4 },
  signSpace: { height: 30 },
  signLine: { borderTopWidth: 1, borderTopColor: MUTED, width: '100%', paddingTop: 3, textAlign: 'center', fontSize: 8, color: MUTED },
});

const lines = (t: string) => t.split('\n').filter((l) => l.trim() !== '');

export function InvoiceDocument({
  invoice,
  totals,
  watermark,
  upiQr = null,
  design = null,
}: {
  invoice: Invoice;
  totals: Totals;
  watermark: boolean;
  /** PNG data URL of the "Scan to pay" UPI QR (made in generate-pdf.tsx), if wanted. */
  upiQr?: string | null;
  /** Template and brand colour (Pro). Null: the classic look in coral. */
  design?: Design | null;
}) {
  const money = (n: number) => formatMoney(n, invoice.currency);
  const pay = hasPaymentDetails(invoice.payment) ? invoice.payment : null;
  const discountLabel =
    invoice.discountType === 'percent' && invoice.discountValue.trim() ? `Discount (${invoice.discountValue.trim()}%)` : 'Discount';
  const taxLabel = `${invoice.taxLabel.trim() || 'Tax'}${invoice.taxRate.trim() ? ` (${invoice.taxRate.trim()}%)` : ''}`;
  const items = invoice.items.filter((it, i) => it.description.trim() || it.rate.trim() || totals.lines[i]?.amount);
  const gst = totals.gst;
  const billOfSupply = invoice.docType === 'bill_of_supply';
  const quote = invoice.kind === 'quote';
  const title = quote ? 'QUOTATION' : gst ? 'TAX INVOICE' : billOfSupply ? 'BILL OF SUPPLY' : 'INVOICE';
  const docName = quote ? 'Quotation' : 'Invoice';
  // A quotation is never a tax invoice: no reverse charge, and a signatory only if one was added.
  const showSign = quote ? !!invoice.signature : !!(gst || billOfSupply);

  const { template, color } = design ?? DEFAULT_DESIGN;
  const onColor = textOn(color);
  const t = {
    title: template === 'minimal' ? { fontSize: 16 } : {},
    thead:
      template === 'bold'
        ? { backgroundColor: color }
        : template === 'minimal'
          ? { backgroundColor: 'transparent', borderBottomWidth: 1, borderBottomColor: color }
          : { borderBottomWidth: 1.5, borderBottomColor: color },
    th: template === 'bold' ? { color: onColor } : {},
    grand:
      template === 'bold'
        ? { backgroundColor: color, borderTopWidth: 0, paddingHorizontal: 6, paddingBottom: 6 }
        : { borderTopColor: color, borderTopWidth: template === 'minimal' ? 0.75 : 1.5 },
    grandText: template === 'bold' ? { color: onColor } : {},
  };
  const thead = [s.thead, t.thead];
  const th = (col: Styles[string]) => [s.th, t.th, col];
  const stateLine = (code: string | undefined) => (code && stateName(code) ? `State: ${stateName(code)} (${code})` : null);
  const sellerState = gst?.sellerState || invoice.seller.state;
  const clientState = invoice.client.gstin?.slice(0, 2) || invoice.client.state || (gst && gst.placeOfSupply !== EXPORT_CODE ? gst.placeOfSupply : undefined);
  const lineRate = (it: (typeof items)[number]) => (it.gstRate?.trim() ? it.gstRate.trim() : invoice.taxRate.trim() || '0');
  const sLabel = gst?.split === 'ut' ? 'UTGST' : 'SGST';

  return (
    <Document
      title={`${docName} ${invoice.number}`}
      author={invoice.seller.name || undefined}
      creator="KaamSolv Invoice Generator"
      producer="KaamSolv"
    >
      <Page size="A4" style={s.page}>
        <Text style={s.running} fixed render={({ pageNumber }) => (pageNumber > 1 ? `${docName} ${invoice.number} · continued` : '')} />
        <View style={s.body}>
        {template === 'bold' ? (
          <View style={[s.band, { backgroundColor: color }]}>
            <Text style={[s.bandTitle, { color: onColor }]}>{title}</Text>
          </View>
        ) : null}
        <View style={s.rowBetween}>
          <View style={s.seller}>
            {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image has no alt */}
            {invoice.logo && <Image src={invoice.logo} style={s.logo} />}
            {invoice.seller.name ? <Text style={s.sellerName}>{invoice.seller.name}</Text> : null}
            {lines(invoice.seller.address).map((l, i) => (
              <Text key={i} style={s.muted}>
                {l}
              </Text>
            ))}
            {invoice.seller.email ? <Text style={s.muted}>{invoice.seller.email}</Text> : null}
            {invoice.seller.phone ? <Text style={s.muted}>{invoice.seller.phone}</Text> : null}
            {invoice.seller.gstin ? <Text style={s.gstin}>GSTIN {invoice.seller.gstin}</Text> : null}
            {gst && stateLine(sellerState) ? <Text style={s.muted}>{stateLine(sellerState)}</Text> : null}
          </View>
          <View style={s.meta}>
            {template === 'bold' ? null : <Text style={[s.title, t.title]}>{title}</Text>}
            {billOfSupply && !quote ? <Text style={s.docNote}>Composition taxable person, not eligible to collect tax on supplies</Text> : null}
            {quote && gst ? <Text style={s.docNote}>GST shown is an estimate. A tax invoice follows on supply.</Text> : null}
            <View style={s.metaRow}>
              <Text style={s.metaLabel}>{quote ? 'Quote no.' : 'Invoice no.'}</Text>
              <Text>{invoice.number}</Text>
            </View>
            <View style={s.metaRow}>
              <Text style={s.metaLabel}>Date</Text>
              <Text>{displayDate(invoice.issueDate)}</Text>
            </View>
            {invoice.dueDate ? (
              <View style={s.metaRow}>
                <Text style={s.metaLabel}>{quote ? 'Valid until' : 'Due'}</Text>
                <Text>{displayDate(invoice.dueDate)}</Text>
              </View>
            ) : null}
            {gst ? (
              <View style={s.metaRow}>
                <Text style={s.metaLabel}>Place of supply</Text>
                <Text>{placeOfSupplyLabel(gst.placeOfSupply)}</Text>
              </View>
            ) : null}
            {gst && !quote ? (
              <View style={s.metaRow}>
                <Text style={s.metaLabel}>Reverse charge</Text>
                <Text>{invoice.reverseCharge ? 'Yes' : 'No'}</Text>
              </View>
            ) : null}
          </View>
        </View>

        {template === 'classic' ? <View style={[s.rule, { backgroundColor: color }]} /> : <View style={s.hairline} />}

        <View style={s.parties}>
          <View style={invoice.shipTo?.trim() ? s.party : undefined}>
            <Text style={s.caption}>Bill to</Text>
            {invoice.client.name ? <Text style={s.clientName}>{invoice.client.name}</Text> : null}
            {lines(invoice.client.address).map((l, i) => (
              <Text key={i} style={s.muted}>
                {l}
              </Text>
            ))}
            {invoice.client.email ? <Text style={s.muted}>{invoice.client.email}</Text> : null}
            {invoice.client.gstin ? <Text style={s.gstin}>GSTIN {invoice.client.gstin}</Text> : null}
            {gst && stateLine(clientState) ? <Text style={s.muted}>{stateLine(clientState)}</Text> : null}
          </View>
          {invoice.shipTo?.trim() ? (
            <View style={s.party}>
              <Text style={s.caption}>Ship to</Text>
              {lines(invoice.shipTo).map((l, i) => (
                <Text key={i} style={s.muted}>
                  {l}
                </Text>
              ))}
            </View>
          ) : null}
        </View>

        {gst ? (
          <View style={s.table}>
            <View style={thead} fixed>
              <Text style={th(s.gHsn)}>HSN/SAC</Text>
              <Text style={th(s.gDesc)}>Description</Text>
              <Text style={th(s.gQty)}>Qty</Text>
              <Text style={th(s.gRate)}>Rate</Text>
              <Text style={th(s.gPct)}>GST</Text>
              <Text style={th(s.gAmt)}>Amount</Text>
            </View>
            {items.map((it) => {
              const idx = invoice.items.indexOf(it);
              return (
                <View key={it.id} style={s.tr} wrap={false}>
                  <Text style={s.gHsn}>{it.hsn ?? ''}</Text>
                  <Text style={s.gDesc}>{it.description}</Text>
                  <Text style={s.gQty}>{`${it.qty}${it.unit ? ` ${it.unit}` : ''}`}</Text>
                  <Text style={s.gRate}>{it.rate.trim() ? money(parseNumber(it.rate) || 0) : ''}</Text>
                  <Text style={s.gPct}>{lineRate(it)}%</Text>
                  <Text style={s.gAmt}>{money(totals.lines[idx]?.amount ?? 0)}</Text>
                </View>
              );
            })}
          </View>
        ) : (
        <View style={s.table}>
          <View style={thead} fixed>
            <Text style={th(s.cDesc)}>Description</Text>
            <Text style={th(s.cQty)}>Qty</Text>
            <Text style={th(s.cRate)}>Rate</Text>
            <Text style={th(s.cAmt)}>Amount</Text>
          </View>
          {items.map((it) => {
            const idx = invoice.items.indexOf(it);
            return (
              <View key={it.id} style={s.tr} wrap={false}>
                <Text style={s.cDesc}>{it.description}</Text>
                <Text style={s.cQty}>{it.qty}</Text>
                <Text style={s.cRate}>{it.rate.trim() ? money(parseNumber(it.rate) || 0) : ''}</Text>
                <Text style={s.cAmt}>{money(totals.lines[idx]?.amount ?? 0)}</Text>
              </View>
            );
          })}
        </View>
        )}

        <View wrap={false}>
        <View style={s.bottom}>
          <View style={s.notes}>
            {invoice.notes.trim() ? (
              <View>
                <Text style={s.caption}>Notes</Text>
                <Text style={s.muted}>{invoice.notes.trim()}</Text>
              </View>
            ) : null}
            {pay ? (
              <View style={invoice.notes.trim() ? s.payBlock : undefined}>
                <Text style={s.caption}>Payment details</Text>
                <View style={s.payRow}>
                  <View style={{ flexGrow: 1 }}>
                    {pay.accountName ? <Text style={s.muted}>Account name: {pay.accountName}</Text> : null}
                    {pay.accountNumber ? <Text style={s.muted}>A/c no.: {pay.accountNumber}</Text> : null}
                    {pay.ifsc ? <Text style={s.muted}>IFSC: {pay.ifsc}</Text> : null}
                    {pay.bankName ? <Text style={s.muted}>Bank: {pay.bankName}</Text> : null}
                    {pay.upiId ? <Text style={s.muted}>UPI: {pay.upiId}</Text> : null}
                  </View>
                  {upiQr ? (
                    <View style={s.qrBox}>
                      {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image has no alt */}
                      <Image src={upiQr} style={s.qr} />
                      <Text style={s.qrCaption}>Scan to pay with any UPI app</Text>
                    </View>
                  ) : null}
                </View>
              </View>
            ) : null}
          </View>
          <View style={s.totals}>
            <View style={s.tRow}>
              <Text style={s.muted}>Subtotal</Text>
              <Text>{money(totals.subtotal)}</Text>
            </View>
            {totals.discount > 0 ? (
              <View style={s.tRow}>
                <Text style={s.muted}>{discountLabel}</Text>
                <Text>−{money(totals.discount)}</Text>
              </View>
            ) : null}
            {gst ? (
              gst.split === 'inter' ? (
                <View style={s.tRow}>
                  <Text style={s.muted}>IGST</Text>
                  <Text>{money(gst.igst)}</Text>
                </View>
              ) : (
                <>
                  <View style={s.tRow}>
                    <Text style={s.muted}>CGST</Text>
                    <Text>{money(gst.cgst)}</Text>
                  </View>
                  <View style={s.tRow}>
                    <Text style={s.muted}>{sLabel}</Text>
                    <Text>{money(gst.sgst)}</Text>
                  </View>
                </>
              )
            ) : totals.tax > 0 ? (
              <View style={s.tRow}>
                <Text style={s.muted}>{taxLabel}</Text>
                <Text>{money(totals.tax)}</Text>
              </View>
            ) : null}
            <View style={[s.grand, t.grand]}>
              <Text style={[s.grandText, t.grandText]}>Total</Text>
              <Text style={[s.grandText, t.grandText]}>{money(totals.total)}</Text>
            </View>
            {invoice.currency === 'INR' && totals.total > 0 && (gst || billOfSupply) ? <Text style={s.words}>{rupeesInWords(totals.total)}</Text> : null}
          </View>
        </View>

        {(gst && gst.rows.length > 0) || showSign ? (
          <View style={s.closing} wrap={false}>
        {gst && gst.rows.length > 0 ? (
          <View style={s.summary}>
            <View style={s.sHead}>
              <Text style={[s.th, s.sFirst]}>{quote ? 'GST rate (est.)' : 'GST rate'}</Text>
              <Text style={[s.th, s.sCell, gst.split === 'inter' ? { width: '34%' } : {}]}>Taxable value</Text>
              {gst.split === 'inter' ? (
                <Text style={[s.th, s.sCell, { width: '25%' }]}>IGST</Text>
              ) : (
                <>
                  <Text style={[s.th, s.sCell]}>CGST</Text>
                  <Text style={[s.th, s.sCell]}>{sLabel}</Text>
                </>
              )}
              <Text style={[s.th, s.sCell, gst.split === 'inter' ? { width: '25%' } : {}]}>Total tax</Text>
            </View>
            {gst.rows.map((r) => (
              <View key={r.rate} style={s.sRow}>
                <Text style={s.sFirst}>{r.rate}%</Text>
                <Text style={[s.sCell, gst.split === 'inter' ? { width: '34%' } : {}]}>{money(r.taxable)}</Text>
                {gst.split === 'inter' ? (
                  <Text style={[s.sCell, { width: '25%' }]}>{money(r.igst)}</Text>
                ) : (
                  <>
                    <Text style={s.sCell}>{money(r.cgst)}</Text>
                    <Text style={s.sCell}>{money(r.sgst)}</Text>
                  </>
                )}
                <Text style={[s.sCell, gst.split === 'inter' ? { width: '25%' } : {}]}>{money(r.tax)}</Text>
              </View>
            ))}
          </View>
        ) : (
          <View />
        )}
          {showSign ? (
            <View style={s.sign}>
              <Text style={s.muted}>For {invoice.seller.name || 'the supplier'}</Text>
              {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image has no alt */}
              {invoice.signature ? <Image src={invoice.signature} style={s.signImg} /> : <View style={s.signSpace} />}
              <Text style={s.signLine}>Authorised signatory</Text>
            </View>
          ) : null}
          </View>
        ) : null}
        </View>

        </View>
        {watermark ? (
          <Text style={s.footer} fixed>
            Made with KaamSolv · kaamsolv.com
          </Text>
        ) : null}
        <Text style={s.pageNo} fixed render={({ pageNumber, totalPages }) => (totalPages > 1 ? `Page ${pageNumber} of ${totalPages}` : '')} />
      </Page>
    </Document>
  );
}
