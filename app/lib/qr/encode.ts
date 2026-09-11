/**
 * Canonical payload string + encode target.
 *
 * Phase 1: the QR image contains the payload string itself (static).
 * Later: resolveEncodeTarget() can return a tracking URL instead, without
 * changing field validation or the renderer.
 *
 * Framework-free — no React, no Next, no DOM.
 */

import {
  MAX_TEXT_LENGTH,
  type EncodeResult,
  type QrPayload,
} from './types';
import { encodeEventPayload } from './payloads/event';
import { encodeFilePayload } from './payloads/file';
import { encodeLocationPayload } from './payloads/location';
import { encodeSmsPayload } from './payloads/sms';
import { encodeSocialPayload } from './payloads/social';
import { encodeUpiPayload } from './payloads/upi';
import {
  hasControlChars,
  normalizeEmail,
  normalizeHttpUrl,
  telDigits,
  whatsappDigits,
} from './validate';

export function isPayloadEmpty(payload: QrPayload): boolean {
  switch (payload.kind) {
    case 'url':
      return !payload.url.trim();
    case 'text':
      return !payload.text.trim();
    case 'wifi':
      return !payload.ssid.trim();
    case 'email':
      return !payload.email.trim();
    case 'phone':
      return !payload.phone.trim();
    case 'sms':
      return !payload.phone.trim();
    case 'whatsapp':
      return !payload.phone.trim();
    case 'vcard':
      return !payload.name.trim();
    case 'location':
      return !payload.latitude.trim() && !payload.longitude.trim();
    case 'event':
      return !payload.title.trim();
    case 'social':
      return !payload.url.trim();
    case 'file':
      return !payload.url.trim();
    case 'upi':
      return !payload.upiId.trim();
  }
}

/** WIFI: values escape `\ ; , " :` */
export function escapeWifiValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/"/g, '\\"').replace(/:/g, '\\:');
}

export function canonicalPayload(payload: QrPayload): EncodeResult {
  switch (payload.kind) {
    case 'url': {
      const url = normalizeHttpUrl(payload.url);
      if (!url.ok) return { ok: false, field: 'url', message: url.message };
      return { ok: true, text: url.url, mode: 'static', kind: 'url' };
    }
    case 'text': {
      const text = payload.text.trim();
      if (!text) return { ok: false, field: 'text', message: 'Type the text you want in the QR.' };
      if (text.length > MAX_TEXT_LENGTH) {
        return { ok: false, field: 'text', message: 'That’s a bit long for a QR. Shorten it a little.' };
      }
      if (hasControlChars(text)) {
        return { ok: false, field: 'text', message: 'That text has characters a QR can’t use. Remove them and try again.' };
      }
      return { ok: true, text, mode: 'static', kind: 'text' };
    }
    case 'wifi': {
      const ssid = payload.ssid.trim();
      if (!ssid) return { ok: false, field: 'ssid', message: 'Add the network name (SSID).' };
      if (ssid.length > 32) return { ok: false, field: 'ssid', message: 'That network name is too long.' };
      if (hasControlChars(ssid)) {
        return { ok: false, field: 'ssid', message: 'That network name has characters a QR can’t use.' };
      }
      if (payload.security !== 'nopass' && !payload.password) {
        return { ok: false, field: 'password', message: 'Add the Wi-Fi password, or choose an open network.' };
      }
      const t = payload.security;
      const p = t === 'nopass' ? '' : payload.password;
      const parts = [`WIFI:T:${t}`, `S:${escapeWifiValue(ssid)}`];
      if (t !== 'nopass') parts.push(`P:${escapeWifiValue(p)}`);
      if (payload.hidden) parts.push('H:true');
      return { ok: true, text: `${parts.join(';')};;`, mode: 'static', kind: 'wifi' };
    }
    case 'email': {
      const email = normalizeEmail(payload.email);
      if (!email.ok) return { ok: false, field: 'email', message: email.message };
      const params = new URLSearchParams();
      const subject = payload.subject.trim();
      const body = payload.body.trim();
      if (subject) params.set('subject', subject);
      if (body) params.set('body', body);
      const qs = params.toString();
      const text = qs ? `mailto:${email.email}?${qs}` : `mailto:${email.email}`;
      return { ok: true, text, mode: 'static', kind: 'email' };
    }
    case 'phone': {
      const tel = telDigits(payload.phone);
      if (!tel.ok) return { ok: false, field: 'phone', message: tel.message };
      return { ok: true, text: `tel:${tel.tel}`, mode: 'static', kind: 'phone' };
    }
    case 'sms':
      return encodeSmsPayload(payload.phone, payload.message);
    case 'whatsapp': {
      const digits = whatsappDigits(payload.phone);
      if (!digits.ok) return { ok: false, field: 'phone', message: digits.message };
      const message = payload.message.trim();
      const text = message
        ? `https://wa.me/${digits.digits}?text=${encodeURIComponent(message)}`
        : `https://wa.me/${digits.digits}`;
      return { ok: true, text, mode: 'static', kind: 'whatsapp' };
    }
    case 'vcard': {
      const name = payload.name.trim();
      if (!name) return { ok: false, field: 'name', message: 'Add a name for the contact card.' };
      if (name.length > 200) return { ok: false, field: 'name', message: 'That name is too long.' };

      const lines = ['BEGIN:VCARD', 'VERSION:3.0', `FN:${vcardEscape(name)}`];

      const org = payload.org.trim();
      if (org) lines.push(`ORG:${vcardEscape(org)}`);

      const phone = payload.phone.trim();
      if (phone) {
        const tel = telDigits(phone);
        if (!tel.ok) return { ok: false, field: 'phone', message: tel.message };
        lines.push(`TEL:${tel.tel}`);
      }

      const emailRaw = payload.email.trim();
      if (emailRaw) {
        const email = normalizeEmail(emailRaw);
        if (!email.ok) return { ok: false, field: 'email', message: email.message };
        lines.push(`EMAIL:${email.email}`);
      }

      const urlRaw = payload.url.trim();
      if (urlRaw) {
        const url = normalizeHttpUrl(urlRaw);
        if (!url.ok) return { ok: false, field: 'url', message: url.message };
        lines.push(`URL:${url.url}`);
      }

      const address = payload.address.trim();
      if (address) {
        if (address.length > 300) return { ok: false, field: 'address', message: 'That address is too long.' };
        lines.push(`ADR:;;${vcardEscape(address)};;;;`);
      }

      lines.push('END:VCARD');
      return { ok: true, text: lines.join('\n'), mode: 'static', kind: 'vcard' };
    }
    case 'location':
      return encodeLocationPayload(payload.latitude, payload.longitude, payload.name);
    case 'event':
      return encodeEventPayload(
        payload.title,
        payload.start,
        payload.end,
        payload.location,
        payload.description,
      );
    case 'social':
      return encodeSocialPayload(payload.platform, payload.url);
    case 'file':
      return encodeFilePayload(payload.url);
    case 'upi':
      return encodeUpiPayload(payload.upiId, payload.payeeName, payload.amount, payload.note);
  }
}

/**
 * Maps a canonical payload string to what is actually drawn in the QR.
 * Phase 1 always returns the payload unchanged. A later dynamic QR path
 * would return a KaamKit tracking URL here instead.
 */
export function resolveEncodeTarget(canonicalText: string): { text: string; mode: 'static' } {
  return { text: canonicalText, mode: 'static' };
}

export function encodePayload(payload: QrPayload): EncodeResult {
  const canonical = canonicalPayload(payload);
  if (!canonical.ok) return canonical;
  const target = resolveEncodeTarget(canonical.text);
  return { ...canonical, text: target.text, mode: target.mode };
}

function vcardEscape(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
}
