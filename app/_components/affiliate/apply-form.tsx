'use client';

import { useRef, useState } from 'react';
import { INPUT, PRIMARY } from '@/app/_components/account/account-shell';
import { Notice } from '@/app/_components/notice';
import { AFFILIATE_CATEGORIES, AFFILIATE_CHANNELS, AFFILIATE_LIMITS, cleanApplication, type ApplicationField } from '@/app/lib/affiliate/application';

const label = 'block text-sm font-bold text-ink';
const hint = 'mt-1 text-xs text-muted';
/** The red outline for a field with a problem. `aria-invalid` drives it, so what is drawn and what a screen reader hears match. */
const INVALID = 'aria-invalid:border-danger-700 aria-invalid:ring-1 aria-invalid:ring-danger-700';

const IDS: Record<ApplicationField, string> = {
  displayName: 'a-name',
  category: 'a-cat',
  channel: 'a-chan',
  website: 'a-site',
  country: 'a-country',
  message: 'a-msg',
};
/** Top to bottom, so the first problem is the one nearest the top. */
const ORDER: ApplicationField[] = ['displayName', 'category', 'channel', 'website', 'country', 'message'];

/** A message tied to one field: it sits right under the box, in words and an icon as well as colour. */
function FieldError({ field, text }: { field: ApplicationField; text?: string }) {
  if (!text) return null;
  return (
    <p id={`${IDS[field]}-error`} role="alert" className="mt-1.5 flex items-start gap-1.5 text-sm font-medium text-danger-700">
      <span aria-hidden="true" className="mt-0.5 font-bold">!</span>
      <span>{text}</span>
    </p>
  );
}

/**
 * The application form. Each field says for itself what is wrong: the box is outlined in red, the message sits under
 * it, and the first problem takes focus. Only the name is required; the rest help the merchant decide. A hidden field
 * (`website2`) that a person never sees, and the time the form opened, go with it as cheap bot checks; the server also
 * rate-limits. Says plainly what the merchant gets to see.
 */
export function ApplyForm({ slug, merchantName, defaultName }: { slug: string; merchantName: string; defaultName: string }) {
  const openedAt = useRef(Date.now());
  const [displayName, setDisplayName] = useState(defaultName);
  const [category, setCategory] = useState('');
  const [channel, setChannel] = useState('');
  const [website, setWebsite] = useState('');
  const [country, setCountry] = useState('');
  const [message, setMessage] = useState('');
  const [trap, setTrap] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<ApplicationField, string>>>({});
  const [error, setError] = useState<string | null>(null);

  const edit = (field: ApplicationField, set: (v: string) => void) => (v: string) => {
    set(v);
    // The moment someone starts fixing a field, its error goes away.
    setFieldErrors((e) => (e[field] ? { ...e, [field]: undefined } : e));
    setError(null);
  };

  function showErrors(errors: Partial<Record<ApplicationField, string>>) {
    setFieldErrors(errors);
    const first = ORDER.find((f) => errors[f]);
    if (first) {
      const el = document.getElementById(IDS[first]);
      el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      el?.focus({ preventScroll: true });
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const check = cleanApplication({ displayName, website, message, category, channel, country });
    if (!check.ok) return showErrors({ [check.field]: check.message });

    setFieldErrors({});
    setState('sending');
    try {
      const res = await fetch('/api/affiliate/apply', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ slug, displayName, category, channel, website, country, message, website2: trap, openedAt: openedAt.current }),
      });
      const b = (await res.json()) as { ok: boolean; message?: string; field?: ApplicationField };
      if (!res.ok) {
        setState('idle');
        if (b.field && b.message) return showErrors({ [b.field]: b.message });
        return setError(b.message ?? 'We couldn’t send that. Try again in a moment.');
      }
      setState('sent');
    } catch {
      setState('idle');
      setError('We couldn’t reach KaamSolv. Check your connection and try again.');
    }
  }

  if (state === 'sent') {
    return (
      <Notice tone="info" role="status" className="mt-5">
        Sent. {merchantName} will review your application, and we’ll email you the answer. You can also see where it stands under “Joined” in your account.
      </Notice>
    );
  }

  const describe = (field: ApplicationField, extra?: string) => [fieldErrors[field] ? `${IDS[field]}-error` : null, extra].filter(Boolean).join(' ') || undefined;
  const invalid = (field: ApplicationField) => (fieldErrors[field] ? true : undefined);
  const count = Object.values(fieldErrors).filter(Boolean).length;

  return (
    <form onSubmit={onSubmit} className="mt-5 space-y-4" noValidate>
      {count > 0 && (
        <p role="alert" className="text-sm font-semibold text-danger-700">
          Please fix the highlighted {count > 1 ? 'fields' : 'field'} below.
        </p>
      )}

      <div>
        <label htmlFor="a-name" className={label}>
          Your name
        </label>
        <input
          id="a-name"
          className={`${INPUT} ${INVALID} mt-1`}
          value={displayName}
          maxLength={AFFILIATE_LIMITS.displayName}
          onChange={(e) => edit('displayName', setDisplayName)(e.target.value)}
          autoComplete="name"
          required
          aria-invalid={invalid('displayName')}
          aria-describedby={describe('displayName')}
        />
        <FieldError field="displayName" text={fieldErrors.displayName} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="a-cat" className={label}>
            Which describes you best? <span className="font-normal text-muted">(optional)</span>
          </label>
          <select
            id="a-cat"
            className={`${INPUT} ${INVALID} mt-1 pr-8`}
            value={category}
            onChange={(e) => edit('category', setCategory)(e.target.value)}
            aria-invalid={invalid('category')}
            aria-describedby={describe('category')}
          >
            <option value="">Choose one</option>
            {AFFILIATE_CATEGORIES.map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </select>
          <FieldError field="category" text={fieldErrors.category} />
        </div>
        <div>
          <label htmlFor="a-chan" className={label}>
            Where will you share it? <span className="font-normal text-muted">(optional)</span>
          </label>
          <select
            id="a-chan"
            className={`${INPUT} ${INVALID} mt-1 pr-8`}
            value={channel}
            onChange={(e) => edit('channel', setChannel)(e.target.value)}
            aria-invalid={invalid('channel')}
            aria-describedby={describe('channel')}
          >
            <option value="">Choose one</option>
            {AFFILIATE_CHANNELS.map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </select>
          <FieldError field="channel" text={fieldErrors.channel} />
        </div>
      </div>

      <div>
        <label htmlFor="a-site" className={label}>
          Link to your page or website <span className="font-normal text-muted">(optional)</span>
        </label>
        <input
          id="a-site"
          className={`${INPUT} ${INVALID} mt-1`}
          value={website}
          maxLength={AFFILIATE_LIMITS.website}
          onChange={(e) => edit('website', setWebsite)(e.target.value)}
          placeholder="instagram.com/yourname"
          inputMode="url"
          autoCapitalize="none"
          spellCheck={false}
          aria-invalid={invalid('website')}
          aria-describedby={describe('website', 'a-site-hint')}
        />
        <p id="a-site-hint" className={hint}>
          A web link where you’ll share this, like a blog or a social profile. Not an email address.
        </p>
        <FieldError field="website" text={fieldErrors.website} />
      </div>

      <div>
        <label htmlFor="a-country" className={label}>
          Country <span className="font-normal text-muted">(optional)</span>
        </label>
        <input
          id="a-country"
          className={`${INPUT} ${INVALID} mt-1`}
          value={country}
          maxLength={AFFILIATE_LIMITS.country}
          onChange={(e) => edit('country', setCountry)(e.target.value)}
          autoComplete="country-name"
          aria-invalid={invalid('country')}
          aria-describedby={describe('country')}
        />
        <FieldError field="country" text={fieldErrors.country} />
      </div>

      <div>
        <label htmlFor="a-msg" className={label}>
          A line about you <span className="font-normal text-muted">(optional)</span>
        </label>
        <textarea
          id="a-msg"
          rows={4}
          className={`${INPUT} ${INVALID} mt-1`}
          value={message}
          maxLength={AFFILIATE_LIMITS.message}
          onChange={(e) => edit('message', setMessage)(e.target.value)}
          aria-invalid={invalid('message')}
          aria-describedby={describe('message', 'a-msg-count')}
        />
        <p id="a-msg-count" className={hint}>
          {message.length} / {AFFILIATE_LIMITS.message}
        </p>
        <FieldError field="message" text={fieldErrors.message} />
      </div>

      {/* Bot trap: people never see or fill this. */}
      <div aria-hidden="true" style={{ position: 'absolute', left: '-10000px', width: 1, height: 1, overflow: 'hidden' }}>
        <label htmlFor="a-trap">Leave this empty</label>
        <input id="a-trap" tabIndex={-1} autoComplete="off" value={trap} onChange={(e) => setTrap(e.target.value)} />
      </div>

      <p className={hint}>Applying shares your answers and your sign-in email with {merchantName}, so they can review and reach you.</p>
      {error && <Notice role="alert">{error}</Notice>}
      <button type="submit" className={PRIMARY} disabled={state === 'sending'}>
        {state === 'sending' ? 'Sending…' : 'Send application'}
      </button>
    </form>
  );
}
