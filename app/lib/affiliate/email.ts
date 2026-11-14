/**
 * The three affiliate emails, in plain KaamSolv style (not the merchant's branding: that is a later, paid option).
 * Short, one job each, one link. Pure.
 *
 *   received  → the merchant: someone applied, and where to review it.
 *   approved  → the applicant: you're in, and where to see your programmes.
 *   rejected  → the applicant: not approved this time, the reason if one was given, when they can apply again.
 */

import type { Email } from '../email';
import { REAPPLY_COOLDOWN_DAYS } from './application';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const first = (name: string) => name.trim().split(/\s+/)[0] || 'there';

function wrap(inner: string, button?: { label: string; url: string }): string {
  return `<div style="font-family:Inter,Arial,sans-serif;font-size:15px;line-height:1.5;color:#0C2248;max-width:480px">
<p style="font-size:20px;font-weight:700;margin:0 0 16px">Kaam<span style="color:#FE6336">Solv</span></p>
${inner}
${button ? `<p><a href="${esc(button.url)}" style="display:inline-block;background:#FE6336;color:#0C2248;font-weight:700;text-decoration:none;padding:12px 20px;border-radius:999px">${esc(button.label)}</a></p>` : ''}
</div>`;
}

export function applicationReceivedEmail(input: { to: string; ownerName: string; applicantName: string; programmeName: string; reviewUrl: string }): Email {
  const text = [
    `Hi ${first(input.ownerName)},`,
    '',
    `${input.applicantName || 'Someone'} has applied to ${input.programmeName}. Nobody joins until you approve them.`,
    '',
    input.reviewUrl,
  ].join('\n');
  const html = wrap(
    `<p>Hi ${esc(first(input.ownerName))},</p><p><strong>${esc(input.applicantName || 'Someone')}</strong> has applied to ${esc(input.programmeName)}. Nobody joins until you approve them.</p>`,
    { label: 'Review the application', url: input.reviewUrl },
  );
  return { to: input.to, subject: `New application to ${input.programmeName}`, text, html };
}

export function applicationDecisionEmail(input: {
  to: string;
  name: string;
  merchantName: string;
  programmeName: string;
  approved: boolean;
  note: string;
  programmesUrl: string;
  portalUrl: string;
}): Email {
  const note = input.note.trim();
  if (input.approved) {
    const text = [
      `Hi ${first(input.name)},`,
      '',
      `${input.merchantName} approved your application to ${input.programmeName}. You're in.`,
      ...(note ? ['', `A note from ${input.merchantName}: ${note}`] : []),
      '',
      'See your programmes:',
      input.programmesUrl,
    ].join('\n');
    const html = wrap(
      `<p>Hi ${esc(first(input.name))},</p><p><strong>${esc(input.merchantName)}</strong> approved your application to ${esc(input.programmeName)}. You’re in.</p>${note ? `<p style="border-left:3px solid #FE6336;padding-left:12px;color:#334155">${esc(note)}</p>` : ''}`,
      { label: 'See my programmes', url: input.programmesUrl },
    );
    return { to: input.to, subject: `You’re in: ${input.programmeName}`, text, html };
  }
  const again = `You can apply again after ${REAPPLY_COOLDOWN_DAYS} days.`;
  const text = [
    `Hi ${first(input.name)},`,
    '',
    `${input.merchantName} didn't approve your application to ${input.programmeName} this time. ${again}`,
    ...(note ? ['', `A note from ${input.merchantName}: ${note}`] : []),
    '',
    'Their programme page:',
    input.portalUrl,
  ].join('\n');
  const html = wrap(
    `<p>Hi ${esc(first(input.name))},</p><p><strong>${esc(input.merchantName)}</strong> didn’t approve your application to ${esc(input.programmeName)} this time. ${esc(again)}</p>${note ? `<p style="border-left:3px solid #FE6336;padding-left:12px;color:#334155">${esc(note)}</p>` : ''}`,
    { label: 'See their programme page', url: input.portalUrl },
  );
  return { to: input.to, subject: `Your application to ${input.programmeName}`, text, html };
}
