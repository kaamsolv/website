import type { EncodeResult } from '../types';
import { formatUpiAmount, validateUpiId, validateUpiNote, validateUpiPayeeName } from '../validate';

/** NPCI-style `upi://pay` URI — generic, not tied to one payment app. */
export function encodeUpiPayload(
  upiId: string,
  payeeName: string,
  amount: string,
  note: string,
): EncodeResult {
  const id = validateUpiId(upiId);
  if (!id.ok) return { ok: false, field: 'upiId', message: id.message };

  const params = new URLSearchParams();
  params.set('pa', id.id);
  params.set('cu', 'INR');

  const name = payeeName.trim();
  if (name) {
    const pn = validateUpiPayeeName(name);
    if (!pn.ok) return { ok: false, field: 'payeeName', message: pn.message };
    params.set('pn', pn.name);
  }

  const amountRaw = amount.trim();
  if (amountRaw) {
    const am = formatUpiAmount(amountRaw);
    if (!am.ok) return { ok: false, field: 'amount', message: am.message };
    params.set('am', am.amount);
  }

  const noteRaw = note.trim();
  if (noteRaw) {
    const tn = validateUpiNote(noteRaw);
    if (!tn.ok) return { ok: false, field: 'note', message: tn.message };
    params.set('tn', tn.note);
  }

  return { ok: true, text: `upi://pay?${params.toString()}`, mode: 'static', kind: 'upi' };
}
