import { Document, Font, Image, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import { hasPaymentDetails, type Invoice } from '@/app/lib/invoice/types';
import { parseNumber, type Totals } from '@/app/lib/invoice/totals';
import { formatMoney } from '@/app/lib/invoice/money';
import { displayDate } from '@/app/lib/invoice/defaults';

/*
 * The PDF template (A4, one page). Loaded only by generate-pdf.tsx, in the
 * browser. Inter (OFL, public/fonts) is embedded: the built-in PDF fonts have
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
  page: { fontFamily: 'Inter', fontSize: 9.5, color: NAVY, paddingTop: 36, paddingBottom: 48, paddingHorizontal: 44, lineHeight: 1.3 },
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
});

const lines = (t: string) => t.split('\n').filter((l) => l.trim() !== '');

export function InvoiceDocument({
  invoice,
  totals,
  watermark,
  upiQr = null,
}: {
  invoice: Invoice;
  totals: Totals;
  watermark: boolean;
  /** PNG data URL of the "Scan to pay" UPI QR (made in generate-pdf.tsx), if wanted. */
  upiQr?: string | null;
}) {
  const money = (n: number) => formatMoney(n, invoice.currency);
  const pay = hasPaymentDetails(invoice.payment) ? invoice.payment : null;
  const discountLabel =
    invoice.discountType === 'percent' && invoice.discountValue.trim() ? `Discount (${invoice.discountValue.trim()}%)` : 'Discount';
  const taxLabel = `${invoice.taxLabel.trim() || 'Tax'}${invoice.taxRate.trim() ? ` (${invoice.taxRate.trim()}%)` : ''}`;
  const items = invoice.items.filter((it, i) => it.description.trim() || it.rate.trim() || totals.lines[i]?.amount);

  return (
    <Document
      title={`Invoice ${invoice.number}`}
      author={invoice.seller.name || undefined}
      creator="KaamSolv Invoice Generator"
      producer="KaamSolv"
    >
      <Page size="A4" style={s.page}>
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
          </View>
          <View style={s.meta}>
            <Text style={s.title}>INVOICE</Text>
            <View style={s.metaRow}>
              <Text style={s.metaLabel}>Invoice no.</Text>
              <Text>{invoice.number}</Text>
            </View>
            <View style={s.metaRow}>
              <Text style={s.metaLabel}>Date</Text>
              <Text>{displayDate(invoice.issueDate)}</Text>
            </View>
            {invoice.dueDate ? (
              <View style={s.metaRow}>
                <Text style={s.metaLabel}>Due</Text>
                <Text>{displayDate(invoice.dueDate)}</Text>
              </View>
            ) : null}
          </View>
        </View>

        <View style={s.rule} />

        <View>
          <Text style={s.caption}>Bill to</Text>
          {invoice.client.name ? <Text style={s.clientName}>{invoice.client.name}</Text> : null}
          {lines(invoice.client.address).map((l, i) => (
            <Text key={i} style={s.muted}>
              {l}
            </Text>
          ))}
          {invoice.client.email ? <Text style={s.muted}>{invoice.client.email}</Text> : null}
          {invoice.client.gstin ? <Text style={s.gstin}>GSTIN {invoice.client.gstin}</Text> : null}
        </View>

        <View style={s.table}>
          <View style={s.thead}>
            <Text style={[s.th, s.cDesc]}>Description</Text>
            <Text style={[s.th, s.cQty]}>Qty</Text>
            <Text style={[s.th, s.cRate]}>Rate</Text>
            <Text style={[s.th, s.cAmt]}>Amount</Text>
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
            {totals.tax > 0 ? (
              <View style={s.tRow}>
                <Text style={s.muted}>{taxLabel}</Text>
                <Text>{money(totals.tax)}</Text>
              </View>
            ) : null}
            <View style={s.grand}>
              <Text style={s.grandText}>Total</Text>
              <Text style={s.grandText}>{money(totals.total)}</Text>
            </View>
          </View>
        </View>

        {watermark ? (
          <Text style={s.footer} fixed>
            Made with KaamSolv · kaamsolv.com
          </Text>
        ) : null}
      </Page>
    </Document>
  );
}
