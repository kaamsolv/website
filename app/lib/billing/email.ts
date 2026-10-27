/**
 * The email that carries a KaamSolv sales invoice. Plain and short: what was bought, the amount, and a private
 * link to the invoice (view it, download the PDF). No attachment, so nothing sensitive sits in an inbox copy
 * beyond the link, which can be revoked. Pure.
 */

import type { Email } from '../email';
import { formatMoney } from '../invoice/money';

export function invoiceEmail(input: { to: string; buyerName: string; number: string; planName: string; amountPaise: number; url: string }): Email {
  const first = input.buyerName.trim().split(/\s+/)[0] || 'there';
  const amount = formatMoney(input.amountPaise / 100, 'INR');
  const text = [
    `Hi ${first},`,
    '',
    `Thanks for choosing ${input.planName}. Your invoice ${input.number} for ${amount} is ready:`,
    '',
    input.url,
    '',
    'Open it to view or download the PDF. Anyone with this link can open the invoice, so keep it to yourself.',
    '',
    'Questions? Just reply to this email.',
  ].join('\n');
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const html = `<div style="font-family:Inter,Arial,sans-serif;font-size:15px;line-height:1.5;color:#0C2248;max-width:480px">
<p style="font-size:20px;font-weight:700;margin:0 0 16px">Kaam<span style="color:#FE6336">Solv</span></p>
<p>Hi ${esc(first)},</p>
<p>Thanks for choosing ${esc(input.planName)}. Your invoice <strong>${esc(input.number)}</strong> for <strong>${esc(amount)}</strong> is ready.</p>
<p><a href="${esc(input.url)}" style="display:inline-block;background:#FE6336;color:#0C2248;font-weight:700;text-decoration:none;padding:12px 20px;border-radius:999px">View invoice</a></p>
<p style="color:#5B6478;font-size:13px">Open it to view or download the PDF. Anyone with this link can open the invoice, so keep it to yourself. Questions? Just reply to this email.</p>
</div>`;
  return { to: input.to, subject: `Your KaamSolv invoice ${input.number}`, text, html };
}
