'use client';

import { Icon } from '@/app/_components/icons';
import type { QrKind, QrPayload, WifiSecurity } from '@/app/lib/qr/types';
import { isWifiSecurity } from '@/app/lib/qr/validate';

const INPUT =
  'h-12 w-full rounded-lg border border-hair bg-fieldbg px-4 text-sm text-ink placeholder:text-faint focus-visible:border-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-500 disabled:opacity-60';
const SELECT =
  'h-12 w-full rounded-lg border border-hair bg-fieldbg px-3 text-sm text-ink focus-visible:border-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-500';
const TEXTAREA =
  'min-h-[7rem] w-full resize-y rounded-lg border border-hair bg-fieldbg px-4 py-3 text-sm text-ink placeholder:text-faint focus-visible:border-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-500';
const LABEL = 'block text-sm font-semibold text-ink';
const ERROR = 'mt-1.5 flex items-start gap-1.5 text-sm font-medium text-danger-700';

type Props = {
  kind: QrKind;
  payload: QrPayload;
  onChange: (payload: QrPayload) => void;
  fieldErrors: Record<string, string>;
  touched: boolean;
};

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} role="alert" className={ERROR}>
      <Icon name="alert-triangle" className="mt-0.5 h-4 w-4 shrink-0" />
      {message}
    </p>
  );
}

export function QrTypeFields({ kind, payload, onChange, fieldErrors, touched }: Props) {
  const showError = (field: string) => (touched ? fieldErrors[field] : undefined);

  if (kind === 'url' && payload.kind === 'url') {
    return (
      <div>
        <label htmlFor="qr-url" className={LABEL}>Website address</label>
        <input
          id="qr-url"
          type="url"
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          placeholder="https://example.com"
          value={payload.url}
          onChange={(e) => onChange({ ...payload, url: e.target.value })}
          aria-invalid={showError('url') ? true : undefined}
          aria-describedby={showError('url') ? 'qr-url-error' : 'qr-url-help'}
          className={`mt-1.5 ${INPUT} ${showError('url') ? 'border-danger-400 bg-danger-50' : ''}`}
        />
        <FieldError id="qr-url-error" message={showError('url')} />
        {!showError('url') && (
          <p id="qr-url-help" className="mt-1.5 text-xs text-muted">
            The QR will open this exact link — we don&apos;t shorten it.
          </p>
        )}
      </div>
    );
  }

  if (kind === 'text' && payload.kind === 'text') {
    return (
      <div>
        <label htmlFor="qr-text" className={LABEL}>Text</label>
        <textarea
          id="qr-text"
          placeholder="Anything you want someone to read when they scan."
          value={payload.text}
          onChange={(e) => onChange({ ...payload, text: e.target.value })}
          aria-invalid={showError('text') ? true : undefined}
          aria-describedby={showError('text') ? 'qr-text-error' : undefined}
          className={`mt-1.5 ${TEXTAREA} ${showError('text') ? 'border-danger-400 bg-danger-50' : ''}`}
        />
        <FieldError id="qr-text-error" message={showError('text')} />
      </div>
    );
  }

  if (kind === 'wifi' && payload.kind === 'wifi') {
    return (
      <div className="space-y-4">
        <div>
          <label htmlFor="qr-ssid" className={LABEL}>Network name (SSID)</label>
          <input
            id="qr-ssid"
            type="text"
            autoComplete="off"
            value={payload.ssid}
            onChange={(e) => onChange({ ...payload, ssid: e.target.value })}
            aria-invalid={showError('ssid') ? true : undefined}
            aria-describedby={showError('ssid') ? 'qr-ssid-error' : undefined}
            className={`mt-1.5 ${INPUT} ${showError('ssid') ? 'border-danger-400 bg-danger-50' : ''}`}
          />
          <FieldError id="qr-ssid-error" message={showError('ssid')} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="qr-wifi-security" className={LABEL}>Security</label>
            <select
              id="qr-wifi-security"
              value={payload.security}
              onChange={(e) => {
                const v = e.target.value;
                onChange({
                  ...payload,
                  security: isWifiSecurity(v) ? v : 'WPA',
                  password: v === 'nopass' ? '' : payload.password,
                });
              }}
              className={`mt-1.5 ${SELECT}`}
            >
              <option value="WPA">WPA / WPA2</option>
              <option value="WEP">WEP</option>
              <option value="nopass">Open network</option>
            </select>
          </div>
          <div>
            <label htmlFor="qr-wifi-password" className={LABEL}>Password</label>
            <input
              id="qr-wifi-password"
              type="text"
              autoComplete="off"
              disabled={payload.security === 'nopass'}
              value={payload.password}
              onChange={(e) => onChange({ ...payload, password: e.target.value })}
              aria-invalid={showError('password') ? true : undefined}
              aria-describedby={showError('password') ? 'qr-wifi-password-error' : 'qr-wifi-note'}
              className={`mt-1.5 ${INPUT} ${showError('password') ? 'border-danger-400 bg-danger-50' : ''}`}
            />
            <FieldError id="qr-wifi-password-error" message={showError('password')} />
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm text-strong">
          <input
            type="checkbox"
            checked={payload.hidden}
            onChange={(e) => onChange({ ...payload, hidden: e.target.checked })}
            className="h-4 w-4 rounded border-hair text-coral-500 focus-visible:ring-2 focus-visible:ring-coral-500"
          />
          Hidden network
        </label>
        <p id="qr-wifi-note" className="text-xs text-muted">
          The QR stores your Wi-Fi credentials. Anyone who scans it can join the network.
        </p>
      </div>
    );
  }

  if (kind === 'email' && payload.kind === 'email') {
    return (
      <div className="space-y-4">
        <div>
          <label htmlFor="qr-email" className={LABEL}>Email address</label>
          <input
            id="qr-email"
            type="email"
            autoComplete="off"
            placeholder="you@example.com"
            value={payload.email}
            onChange={(e) => onChange({ ...payload, email: e.target.value })}
            aria-invalid={showError('email') ? true : undefined}
            aria-describedby={showError('email') ? 'qr-email-error' : undefined}
            className={`mt-1.5 ${INPUT} ${showError('email') ? 'border-danger-400 bg-danger-50' : ''}`}
          />
          <FieldError id="qr-email-error" message={showError('email')} />
        </div>
        <div>
          <label htmlFor="qr-email-subject" className={LABEL}>Subject (optional)</label>
          <input
            id="qr-email-subject"
            type="text"
            value={payload.subject}
            onChange={(e) => onChange({ ...payload, subject: e.target.value })}
            className={`mt-1.5 ${INPUT}`}
          />
        </div>
        <div>
          <label htmlFor="qr-email-body" className={LABEL}>Message (optional)</label>
          <textarea
            id="qr-email-body"
            value={payload.body}
            onChange={(e) => onChange({ ...payload, body: e.target.value })}
            className={`mt-1.5 ${TEXTAREA}`}
            rows={3}
          />
        </div>
      </div>
    );
  }

  if (kind === 'phone' && payload.kind === 'phone') {
    return (
      <div>
        <label htmlFor="qr-phone" className={LABEL}>Phone number</label>
        <input
          id="qr-phone"
          type="tel"
          inputMode="tel"
          autoComplete="off"
          placeholder="+91 98765 43210"
          value={payload.phone}
          onChange={(e) => onChange({ ...payload, phone: e.target.value })}
          aria-invalid={showError('phone') ? true : undefined}
          aria-describedby={showError('phone') ? 'qr-phone-error' : 'qr-phone-help'}
          className={`mt-1.5 ${INPUT} ${showError('phone') ? 'border-danger-400 bg-danger-50' : ''}`}
        />
        <FieldError id="qr-phone-error" message={showError('phone')} />
        {!showError('phone') && (
          <p id="qr-phone-help" className="mt-1.5 text-xs text-muted">Include country code if you can.</p>
        )}
      </div>
    );
  }

  if (kind === 'whatsapp' && payload.kind === 'whatsapp') {
    return (
      <div className="space-y-4">
        <div>
          <label htmlFor="qr-wa-phone" className={LABEL}>WhatsApp number</label>
          <input
            id="qr-wa-phone"
            type="tel"
            inputMode="tel"
            autoComplete="off"
            placeholder="+91 98765 43210"
            value={payload.phone}
            onChange={(e) => onChange({ ...payload, phone: e.target.value })}
            aria-invalid={showError('phone') ? true : undefined}
            aria-describedby={showError('phone') ? 'qr-wa-phone-error' : 'qr-wa-help'}
            className={`mt-1.5 ${INPUT} ${showError('phone') ? 'border-danger-400 bg-danger-50' : ''}`}
          />
          <FieldError id="qr-wa-phone-error" message={showError('phone')} />
        </div>
        <div>
          <label htmlFor="qr-wa-message" className={LABEL}>Pre-filled message (optional)</label>
          <textarea
            id="qr-wa-message"
            value={payload.message}
            onChange={(e) => onChange({ ...payload, message: e.target.value })}
            className={`mt-1.5 ${TEXTAREA}`}
            rows={2}
          />
        </div>
        {!showError('phone') && (
          <p id="qr-wa-help" className="text-xs text-muted">Opens a chat with this number in WhatsApp.</p>
        )}
      </div>
    );
  }

  if (kind === 'vcard' && payload.kind === 'vcard') {
    return (
      <div className="space-y-4">
        <div>
          <label htmlFor="qr-vcard-name" className={LABEL}>Full name</label>
          <input
            id="qr-vcard-name"
            type="text"
            autoComplete="name"
            value={payload.name}
            onChange={(e) => onChange({ ...payload, name: e.target.value })}
            aria-invalid={showError('name') ? true : undefined}
            aria-describedby={showError('name') ? 'qr-vcard-name-error' : undefined}
            className={`mt-1.5 ${INPUT} ${showError('name') ? 'border-danger-400 bg-danger-50' : ''}`}
          />
          <FieldError id="qr-vcard-name-error" message={showError('name')} />
        </div>
        <div>
          <label htmlFor="qr-vcard-org" className={LABEL}>Organisation (optional)</label>
          <input
            id="qr-vcard-org"
            type="text"
            value={payload.org}
            onChange={(e) => onChange({ ...payload, org: e.target.value })}
            className={`mt-1.5 ${INPUT}`}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="qr-vcard-phone" className={LABEL}>Phone (optional)</label>
            <input
              id="qr-vcard-phone"
              type="tel"
              value={payload.phone}
              onChange={(e) => onChange({ ...payload, phone: e.target.value })}
              aria-invalid={showError('phone') ? true : undefined}
              aria-describedby={showError('phone') ? 'qr-vcard-phone-error' : undefined}
              className={`mt-1.5 ${INPUT} ${showError('phone') ? 'border-danger-400 bg-danger-50' : ''}`}
            />
            <FieldError id="qr-vcard-phone-error" message={showError('phone')} />
          </div>
          <div>
            <label htmlFor="qr-vcard-email" className={LABEL}>Email (optional)</label>
            <input
              id="qr-vcard-email"
              type="email"
              value={payload.email}
              onChange={(e) => onChange({ ...payload, email: e.target.value })}
              aria-invalid={showError('email') ? true : undefined}
              aria-describedby={showError('email') ? 'qr-vcard-email-error' : undefined}
              className={`mt-1.5 ${INPUT} ${showError('email') ? 'border-danger-400 bg-danger-50' : ''}`}
            />
            <FieldError id="qr-vcard-email-error" message={showError('email')} />
          </div>
        </div>
        <div>
          <label htmlFor="qr-vcard-url" className={LABEL}>Website (optional)</label>
          <input
            id="qr-vcard-url"
            type="url"
            placeholder="https://example.com"
            value={payload.url}
            onChange={(e) => onChange({ ...payload, url: e.target.value })}
            aria-invalid={showError('url') ? true : undefined}
            aria-describedby={showError('url') ? 'qr-vcard-url-error' : undefined}
            className={`mt-1.5 ${INPUT} ${showError('url') ? 'border-danger-400 bg-danger-50' : ''}`}
          />
          <FieldError id="qr-vcard-url-error" message={showError('url')} />
        </div>
        <div>
          <label htmlFor="qr-vcard-address" className={LABEL}>Address (optional)</label>
          <input
            id="qr-vcard-address"
            type="text"
            value={payload.address}
            onChange={(e) => onChange({ ...payload, address: e.target.value })}
            aria-invalid={showError('address') ? true : undefined}
            aria-describedby={showError('address') ? 'qr-vcard-address-error' : undefined}
            className={`mt-1.5 ${INPUT} ${showError('address') ? 'border-danger-400 bg-danger-50' : ''}`}
          />
          <FieldError id="qr-vcard-address-error" message={showError('address')} />
        </div>
      </div>
    );
  }

  return null;
}
