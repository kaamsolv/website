'use client';

import { Icon } from '@/app/_components/icons';
import type { QrKind, QrPayload, SocialPlatform, WifiSecurity } from '@/app/lib/qr/types';
import { isSocialPlatform, isWifiSecurity, parseGoogleMapsUrl } from '@/app/lib/qr/validate';

const SOCIAL_PLACEHOLDERS: Record<SocialPlatform, string> = {
  instagram: 'https://instagram.com/yourname',
  facebook: 'https://facebook.com/yourpage',
  linkedin: 'https://linkedin.com/in/yourname',
  twitter: 'https://x.com/yourname',
  youtube: 'https://youtube.com/@yourchannel',
};

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
          autoCapitalize="none"
          autoCorrect="off"
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

  if (kind === 'sms' && payload.kind === 'sms') {
    return (
      <div className="space-y-4">
        <div>
          <label htmlFor="qr-sms-phone" className={LABEL}>Phone number</label>
          <input
            id="qr-sms-phone"
            type="tel"
            inputMode="tel"
            autoComplete="off"
            placeholder="+91 98765 43210"
            value={payload.phone}
            onChange={(e) => onChange({ ...payload, phone: e.target.value })}
            aria-invalid={showError('phone') ? true : undefined}
            aria-describedby={showError('phone') ? 'qr-sms-phone-error' : 'qr-sms-help'}
            className={`mt-1.5 ${INPUT} ${showError('phone') ? 'border-danger-400 bg-danger-50' : ''}`}
          />
          <FieldError id="qr-sms-phone-error" message={showError('phone')} />
        </div>
        <div>
          <label htmlFor="qr-sms-message" className={LABEL}>Pre-filled message (optional)</label>
          <textarea
            id="qr-sms-message"
            value={payload.message}
            onChange={(e) => onChange({ ...payload, message: e.target.value })}
            className={`mt-1.5 ${TEXTAREA}`}
            rows={2}
          />
        </div>
        {!showError('phone') && (
          <p id="qr-sms-help" className="text-xs text-muted">Opens the SMS app with this number. Include country code if you can.</p>
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

  if (kind === 'location' && payload.kind === 'location') {
    const mapsCoords = parseGoogleMapsUrl(payload.mapsUrl);
    return (
      <div className="space-y-4">
        <div>
          <label htmlFor="qr-loc-name" className={LABEL}>Location name (optional)</label>
          <input
            id="qr-loc-name"
            type="text"
            placeholder="India Gate"
            value={payload.name}
            onChange={(e) => onChange({ ...payload, name: e.target.value })}
            className={`mt-1.5 ${INPUT}`}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="qr-lat" className={LABEL}>Latitude</label>
            <input
              id="qr-lat"
              type="text"
              inputMode="decimal"
              placeholder="28.6139"
              value={payload.latitude}
              onChange={(e) => onChange({ ...payload, latitude: e.target.value })}
              aria-invalid={showError('latitude') ? true : undefined}
              aria-describedby={showError('latitude') ? 'qr-lat-error' : undefined}
              className={`mt-1.5 ${INPUT} ${showError('latitude') ? 'border-danger-400 bg-danger-50' : ''}`}
            />
            <FieldError id="qr-lat-error" message={showError('latitude')} />
          </div>
          <div>
            <label htmlFor="qr-lng" className={LABEL}>Longitude</label>
            <input
              id="qr-lng"
              type="text"
              inputMode="decimal"
              placeholder="77.2090"
              value={payload.longitude}
              onChange={(e) => onChange({ ...payload, longitude: e.target.value })}
              aria-invalid={showError('longitude') ? true : undefined}
              aria-describedby={showError('longitude') ? 'qr-lng-error' : undefined}
              className={`mt-1.5 ${INPUT} ${showError('longitude') ? 'border-danger-400 bg-danger-50' : ''}`}
            />
            <FieldError id="qr-lng-error" message={showError('longitude')} />
          </div>
        </div>
        <div>
          <label htmlFor="qr-maps-url" className={LABEL}>Google Maps link (optional)</label>
          <input
            id="qr-maps-url"
            type="url"
            inputMode="url"
            placeholder="Paste a Maps link to fill coordinates"
            value={payload.mapsUrl}
            onChange={(e) => onChange({ ...payload, mapsUrl: e.target.value })}
            className={`mt-1.5 ${INPUT}`}
          />
          {mapsCoords && (
            <button
              type="button"
              onClick={() =>
                onChange({
                  ...payload,
                  latitude: String(mapsCoords.lat),
                  longitude: String(mapsCoords.lng),
                })
              }
              className="mt-2 text-sm font-semibold text-coralx-600 hover:text-coralx-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-500"
            >
              Use coordinates from link
            </button>
          )}
          <p className="mt-1.5 text-xs text-muted">
            Coordinates are encoded in the QR. The Maps link is only to help you fill the fields.
          </p>
        </div>
      </div>
    );
  }

  if (kind === 'event' && payload.kind === 'event') {
    return (
      <div className="space-y-4">
        <div>
          <label htmlFor="qr-event-title" className={LABEL}>Event title</label>
          <input
            id="qr-event-title"
            type="text"
            value={payload.title}
            onChange={(e) => onChange({ ...payload, title: e.target.value })}
            aria-invalid={showError('title') ? true : undefined}
            aria-describedby={showError('title') ? 'qr-event-title-error' : undefined}
            className={`mt-1.5 ${INPUT} ${showError('title') ? 'border-danger-400 bg-danger-50' : ''}`}
          />
          <FieldError id="qr-event-title-error" message={showError('title')} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="qr-event-start" className={LABEL}>Starts</label>
            <input
              id="qr-event-start"
              type="datetime-local"
              value={payload.start}
              onChange={(e) => onChange({ ...payload, start: e.target.value })}
              aria-invalid={showError('start') ? true : undefined}
              aria-describedby={showError('start') ? 'qr-event-start-error' : undefined}
              className={`mt-1.5 ${INPUT} ${showError('start') ? 'border-danger-400 bg-danger-50' : ''}`}
            />
            <FieldError id="qr-event-start-error" message={showError('start')} />
          </div>
          <div>
            <label htmlFor="qr-event-end" className={LABEL}>Ends</label>
            <input
              id="qr-event-end"
              type="datetime-local"
              value={payload.end}
              onChange={(e) => onChange({ ...payload, end: e.target.value })}
              aria-invalid={showError('end') ? true : undefined}
              aria-describedby={showError('end') ? 'qr-event-end-error' : undefined}
              className={`mt-1.5 ${INPUT} ${showError('end') ? 'border-danger-400 bg-danger-50' : ''}`}
            />
            <FieldError id="qr-event-end-error" message={showError('end')} />
          </div>
        </div>
        <div>
          <label htmlFor="qr-event-location" className={LABEL}>Location (optional)</label>
          <input
            id="qr-event-location"
            type="text"
            value={payload.location}
            onChange={(e) => onChange({ ...payload, location: e.target.value })}
            aria-invalid={showError('location') ? true : undefined}
            aria-describedby={showError('location') ? 'qr-event-location-error' : undefined}
            className={`mt-1.5 ${INPUT} ${showError('location') ? 'border-danger-400 bg-danger-50' : ''}`}
          />
          <FieldError id="qr-event-location-error" message={showError('location')} />
        </div>
        <div>
          <label htmlFor="qr-event-desc" className={LABEL}>Description (optional)</label>
          <textarea
            id="qr-event-desc"
            value={payload.description}
            onChange={(e) => onChange({ ...payload, description: e.target.value })}
            aria-invalid={showError('description') ? true : undefined}
            aria-describedby={showError('description') ? 'qr-event-desc-error' : undefined}
            className={`mt-1.5 ${TEXTAREA} ${showError('description') ? 'border-danger-400 bg-danger-50' : ''}`}
            rows={3}
          />
          <FieldError id="qr-event-desc-error" message={showError('description')} />
        </div>
        <p className="text-xs text-muted">Times use your local timezone as entered — we don&apos;t shift them.</p>
      </div>
    );
  }

  if (kind === 'social' && payload.kind === 'social') {
    return (
      <div className="space-y-4">
        <div>
          <label htmlFor="qr-social-platform" className={LABEL}>Platform</label>
          <select
            id="qr-social-platform"
            value={payload.platform}
            onChange={(e) => {
              const v = e.target.value;
              onChange({ ...payload, platform: isSocialPlatform(v) ? v : 'instagram' });
            }}
            className={`mt-1.5 ${SELECT}`}
          >
            <option value="instagram">Instagram</option>
            <option value="facebook">Facebook</option>
            <option value="linkedin">LinkedIn</option>
            <option value="twitter">X / Twitter</option>
            <option value="youtube">YouTube</option>
          </select>
        </div>
        <div>
          <label htmlFor="qr-social-url" className={LABEL}>Profile or page URL</label>
          <input
            id="qr-social-url"
            type="url"
            inputMode="url"
            placeholder={SOCIAL_PLACEHOLDERS[payload.platform]}
            value={payload.url}
            onChange={(e) => onChange({ ...payload, url: e.target.value })}
            aria-invalid={showError('url') ? true : undefined}
            aria-describedby={showError('url') ? 'qr-social-url-error' : 'qr-social-help'}
            className={`mt-1.5 ${INPUT} ${showError('url') ? 'border-danger-400 bg-danger-50' : ''}`}
          />
          <FieldError id="qr-social-url-error" message={showError('url')} />
          {!showError('url') && (
            <p id="qr-social-help" className="mt-1.5 text-xs text-muted">
              The QR encodes your URL directly — we don&apos;t check if the profile exists.
            </p>
          )}
        </div>
      </div>
    );
  }

  if (kind === 'file' && payload.kind === 'file') {
    return (
      <div className="space-y-4">
        <div>
          <label htmlFor="qr-file-url" className={LABEL}>File URL</label>
          <input
            id="qr-file-url"
            type="url"
            inputMode="url"
            placeholder="https://example.com/document.pdf"
            value={payload.url}
            onChange={(e) => onChange({ ...payload, url: e.target.value })}
            aria-invalid={showError('url') ? true : undefined}
            aria-describedby={showError('url') ? 'qr-file-url-error' : 'qr-file-help'}
            className={`mt-1.5 ${INPUT} ${showError('url') ? 'border-danger-400 bg-danger-50' : ''}`}
          />
          <FieldError id="qr-file-url-error" message={showError('url')} />
        </div>
        <div>
          <label htmlFor="qr-file-label" className={LABEL}>Label (optional)</label>
          <input
            id="qr-file-label"
            type="text"
            placeholder="Annual report 2025"
            value={payload.label}
            onChange={(e) => onChange({ ...payload, label: e.target.value })}
            className={`mt-1.5 ${INPUT}`}
          />
          <p id="qr-file-help" className="mt-1.5 text-xs text-muted">
            Paste a public link to a PDF or other file. We don&apos;t upload or host it — the QR opens that URL.
            {payload.label.trim() ? ' The label is for your reference only.' : ''}
          </p>
        </div>
      </div>
    );
  }

  if (kind === 'upi' && payload.kind === 'upi') {
    return (
      <div className="space-y-4">
        <div>
          <label htmlFor="qr-upi-id" className={LABEL}>UPI ID</label>
          <input
            id="qr-upi-id"
            type="text"
            inputMode="email"
            autoComplete="off"
            spellCheck={false}
            placeholder="yourname@upi"
            value={payload.upiId}
            onChange={(e) => onChange({ ...payload, upiId: e.target.value })}
            aria-invalid={showError('upiId') ? true : undefined}
            aria-describedby={showError('upiId') ? 'qr-upi-id-error' : 'qr-upi-help'}
            className={`mt-1.5 ${INPUT} ${showError('upiId') ? 'border-danger-400 bg-danger-50' : ''}`}
          />
          <FieldError id="qr-upi-id-error" message={showError('upiId')} />
        </div>
        <div>
          <label htmlFor="qr-upi-name" className={LABEL}>Payee name (optional)</label>
          <input
            id="qr-upi-name"
            type="text"
            autoComplete="off"
            placeholder="Shop name"
            value={payload.payeeName}
            onChange={(e) => onChange({ ...payload, payeeName: e.target.value })}
            aria-invalid={showError('payeeName') ? true : undefined}
            aria-describedby={showError('payeeName') ? 'qr-upi-name-error' : undefined}
            className={`mt-1.5 ${INPUT} ${showError('payeeName') ? 'border-danger-400 bg-danger-50' : ''}`}
          />
          <FieldError id="qr-upi-name-error" message={showError('payeeName')} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="qr-upi-amount" className={LABEL}>Amount in ₹ (optional)</label>
            <input
              id="qr-upi-amount"
              type="text"
              inputMode="decimal"
              placeholder="500"
              value={payload.amount}
              onChange={(e) => onChange({ ...payload, amount: e.target.value })}
              aria-invalid={showError('amount') ? true : undefined}
              aria-describedby={showError('amount') ? 'qr-upi-amount-error' : undefined}
              className={`mt-1.5 ${INPUT} ${showError('amount') ? 'border-danger-400 bg-danger-50' : ''}`}
            />
            <FieldError id="qr-upi-amount-error" message={showError('amount')} />
          </div>
          <div>
            <label htmlFor="qr-upi-note" className={LABEL}>Payment note (optional)</label>
            <input
              id="qr-upi-note"
              type="text"
              value={payload.note}
              onChange={(e) => onChange({ ...payload, note: e.target.value })}
              aria-invalid={showError('note') ? true : undefined}
              aria-describedby={showError('note') ? 'qr-upi-note-error' : undefined}
              className={`mt-1.5 ${INPUT} ${showError('note') ? 'border-danger-400 bg-danger-50' : ''}`}
            />
            <FieldError id="qr-upi-note-error" message={showError('note')} />
          </div>
        </div>
        <p id="qr-upi-help" className="text-xs text-muted">
          Generates a payment QR — not a receipt. KaamKit doesn&apos;t process or verify payments.
        </p>
      </div>
    );
  }

  return null;
}
