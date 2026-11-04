/**
 * A named accountant's read-only access: what may be invited, what the accountant may see, and the words used. Pure.
 *
 * The accountant is an ordinary signed-in person whose verified email matches the invitation. They get the views in
 * `ACCESS_VIEWS` of ONE business, read-only, and nothing else: no editing, no payments, no settings, no billing, and no
 * customer email, phone or address.
 */

import { checkAccountant } from './accountant';

export const INVITE_DAYS = 7;
/** Live (invited or active) accountants one owner may have at once. */
export const MAX_ACCOUNTANTS = 5;

export const ACCESS_VIEWS = ['register', 'payments', 'customers'] as const;
export type AccessView = (typeof ACCESS_VIEWS)[number];
export const isView = (v: unknown): v is AccessView => typeof v === 'string' && (ACCESS_VIEWS as readonly string[]).includes(v);

export const VIEW_LABELS: Record<AccessView, string> = { register: 'Invoices', payments: 'Payments', customers: 'Customers' };

/** What an accountant can and cannot do, shown to the owner before inviting and to the accountant after accepting. */
export const ACCESS_CAN = ['See your sales invoices and payments, month by month.', 'See customer names, GSTIN and state (not their email, phone or address).', 'Download the monthly accountant pack.'] as const;
export const ACCESS_CANNOT = ['Change, create or delete anything.', 'Record payments, send reminders or invite anyone.', 'See your settings, plan or billing.'] as const;

export type InviteCheck = { ok: true; name: string; email: string } | { ok: false; message: string };

/** The invited person's name and email, checked with the same rules as the accountant's address elsewhere. */
export function checkInvite(name: unknown, email: unknown, ownerEmail: string): InviteCheck {
  const c = checkAccountant({ name, email, enabled: false, day: 5, hour: 10, sections: ['register'] });
  if (!c.ok) return { ok: false, message: c.message };
  if (c.value.email === ownerEmail.trim().toLowerCase()) return { ok: false, message: 'That’s your own email. Invite your accountant’s.' };
  return { ok: true, name: c.value.name, email: c.value.email };
}

export const EVENT_TEXT: Record<string, string> = {
  invited: 'Invited',
  accepted: 'Accepted the invitation',
  revoked: 'Access ended',
  viewed: 'Opened',
  downloaded: 'Downloaded a pack',
};

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function inviteEmail(i: { accountantName: string; businessName: string; url: string }): { subject: string; text: string; html: string } {
  const biz = i.businessName || 'A KaamSolv user';
  const text = [
    `Hi ${i.accountantName},`,
    '',
    `${biz} has invited you to view their sales invoices and payments on KaamSolv, read-only.`,
    '',
    `Accept the invitation: ${i.url}`,
    '',
    'You will be asked to sign in with this email address. The link works once and expires in 7 days.',
    `You will be able to: ${ACCESS_CAN.join(' ')}`,
    `You will not be able to: ${ACCESS_CANNOT.join(' ')}`,
    '',
    'Not expecting this? Ignore it and nothing happens.',
  ].join('\n');
  const html = `<div style="font-family:Inter,Arial,sans-serif;font-size:15px;line-height:1.5;color:#0C2248;max-width:520px">
<p>Hi ${esc(i.accountantName)},</p>
<p>${esc(biz)} has invited you to view their sales invoices and payments on KaamSolv, read-only.</p>
<p><a href="${esc(i.url)}" style="display:inline-block;background:#FE6336;color:#0C2248;font-weight:700;text-decoration:none;padding:12px 20px;border-radius:999px">Accept the invitation</a></p>
<p style="color:#5B6478;font-size:13px">You will be asked to sign in with this email address. The link works once and expires in 7 days.</p>
<p style="color:#5B6478;font-size:13px"><b>You can:</b> ${esc(ACCESS_CAN.join(' '))}<br><b>You can’t:</b> ${esc(ACCESS_CANNOT.join(' '))}</p>
<p style="color:#5B6478;font-size:13px">Not expecting this? Ignore it and nothing happens.</p></div>`;
  return { subject: `${biz} invited you to view their books on KaamSolv`, text, html };
}
