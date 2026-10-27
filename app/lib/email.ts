/**
 * Transactional email (sign-in links) via Resend's REST API — plain `fetch`,
 * no SDK. Sender: login@send.kaamsolv.com (a subdomain, so sign-in mail can't
 * affect the main domain's reputation).
 *
 *   Production: RESEND_API_KEY is required; a missing key is logged loudly and
 *               the email is not sent (the visitor still sees the neutral
 *               "check your inbox" message — nothing leaks).
 *   Dev / e2e:  with no key, or with KK_E2E=1, the email is not sent. It is
 *               printed to the dev server log and appended to
 *               test-results/mail-outbox.jsonl, which Playwright reads. That
 *               branch is compiled out of production builds.
 */

import { isProductionServer } from './runtime-platform';

export const EMAIL_FROM = 'KaamSolv <login@send.kaamsolv.com>';
/** Sender for sales invoices (same verified sending subdomain as sign-in mail). */
export const BILLING_EMAIL_FROM = 'KaamSolv Billing <billing@send.kaamsolv.com>';
/** Sender for the opt-in receivables summary. */
export const SUMMARY_EMAIL_FROM = 'KaamSolv <summary@send.kaamsolv.com>';

/**
 * Offer "Email me a sign-in link" only when it can actually arrive: always in
 * dev (the link goes to the dev log), and in production only once
 * RESEND_API_KEY is set. Otherwise /login shows Google only.
 */
export function emailSignInAvailable(): boolean {
  return process.env.NODE_ENV !== 'production' || Boolean(process.env.RESEND_API_KEY?.trim());
}

export type Email = { to: string; subject: string; text: string; html: string };

export type SendResult = { ok: true; id: string } | { ok: false; code: string };

/**
 * Sends one email and says what happened. Unlike `sendEmail`, a missing key or a refusal from Resend comes back
 * as `{ ok: false, code }` (a short code: never the address, the body or the key), so a caller that must not lose
 * the message (the invoice outbox) can retry it. `from` defaults to the sign-in sender.
 */
export async function sendEmailChecked(email: Email, from: string = EMAIL_FROM, idempotencyKey?: string): Promise<SendResult> {
  const key = process.env.RESEND_API_KEY?.trim();

  if (process.env.NODE_ENV !== 'production' && (!key || process.env.KK_E2E === '1')) {
    await writeDevOutbox(email);
    return { ok: true, id: 'dev-outbox' };
  }
  if (!key) return { ok: false, code: 'email_not_configured' };

  let res: Response;
  try {
    res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}) },
      body: JSON.stringify({ from, to: [email.to], subject: email.subject, text: email.text, html: email.html }),
    });
  } catch {
    return { ok: false, code: 'email_network_error' };
  }
  if (!res.ok) return { ok: false, code: `email_rejected_${res.status}` };
  const body = (await res.json().catch(() => null)) as { id?: unknown } | null;
  return { ok: true, id: typeof body?.id === 'string' ? body.id : '' };
}

/** Sign-in email: fire and forget. A failure is logged (status only) and the visitor still sees the neutral message. */
export async function sendEmail(email: Email): Promise<void> {
  const result = await sendEmailChecked(email);
  if (result.ok) return;
  if (result.code === 'email_not_configured') {
    console.error('[email] RESEND_API_KEY is not set — sign-in email not sent.' + (isProductionServer() ? '' : ' (dev)'));
  } else {
    // Status only — never the address or the link.
    console.error(`[email] ${result.code}`);
  }
}

async function writeDevOutbox(email: Email): Promise<void> {
  const link = /https?:\/\/\S+/.exec(email.text)?.[0] ?? '';
  console.log(`[email:dev] to=${email.to} subject="${email.subject}" link=${link}`);
  const { appendFile, mkdir } = await import('node:fs/promises');
  await mkdir('test-results', { recursive: true });
  await appendFile('test-results/mail-outbox.jsonl', JSON.stringify({ to: email.to, link, at: Date.now() }) + '\n');
}

/** The sign-in email. Plain, short, and says what to do if it wasn't you. */
export function signInEmail(to: string, url: string): Email {
  const text = [
    'Here’s your link to sign in to KaamSolv:',
    '',
    url,
    '',
    'It works once and expires in 15 minutes.',
    'Didn’t ask for this? Ignore this email — nothing happens without the link.',
  ].join('\n');
  const html = `<div style="font-family:Inter,Arial,sans-serif;font-size:15px;line-height:1.5;color:#0C2248;max-width:480px">
<p style="font-size:20px;font-weight:700;margin:0 0 16px">Kaam<span style="color:#FE6336">Solv</span></p>
<p>Here’s your link to sign in:</p>
<p><a href="${escapeHtml(url)}" style="display:inline-block;background:#FE6336;color:#0C2248;font-weight:700;text-decoration:none;padding:12px 20px;border-radius:999px">Sign in to KaamSolv</a></p>
<p style="color:#5B6478;font-size:13px">It works once and expires in 15 minutes. Didn’t ask for this? Ignore this email — nothing happens without the link.</p>
</div>`;
  return { to, subject: 'Your KaamSolv sign-in link', text, html };
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
