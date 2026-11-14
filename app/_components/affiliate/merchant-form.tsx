'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { INPUT, PRIMARY, SECONDARY } from '@/app/_components/account/account-shell';
import { Notice } from '@/app/_components/notice';
import { Skeleton } from '@/app/_components/skeleton';
import { LOGO_TYPES } from '@/app/lib/invoice/limits';
import { readLogo } from '@/app/lib/invoice/logo';
import {
  BRAND_COLOUR_RE,
  DEFAULT_BRAND_COLOUR,
  MERCHANT_LIMITS,
  checkSlug,
  portalLabel,
  slugFromName,
  type MerchantBrand,
} from '@/app/lib/affiliate/merchant';
import { PortalView } from './portal-view';

type Saved = { slug: string; name: string; brand: MerchantBrand; portalPath: string };

const label = 'block text-sm font-bold text-ink';
const hint = 'mt-1 text-xs text-muted';

/** Set up the programme and its branded portal (/app/affiliate/portal). Creates it once, then edits it. */
export function MerchantForm() {
  const [loaded, setLoaded] = useState<'loading' | 'error' | 'ready'>('loading');
  const [saved, setSaved] = useState<Saved | null>(null);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [brand, setBrand] = useState<MerchantBrand>({ logo: null, brandColour: DEFAULT_BRAND_COLOUR, programmeName: '', programmeDescription: '', terms: '' });
  const [colourText, setColourText] = useState(DEFAULT_BRAND_COLOUR);
  const [state, setState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [logoError, setLogoError] = useState<string | null>(null);
  const logoInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch('/api/affiliate/merchant', { credentials: 'same-origin', cache: 'no-store' })
      .then((r) => r.json())
      .then((b: { merchant: Saved | null }) => {
        if (b.merchant) {
          setSaved(b.merchant);
          setName(b.merchant.name);
          setSlug(b.merchant.slug);
          setBrand(b.merchant.brand);
          setColourText(b.merchant.brand.brandColour);
        }
        setLoaded('ready');
      })
      .catch(() => setLoaded('error'));
  }, []);

  if (loaded === 'loading') return <Skeleton className="h-96" />;
  if (loaded === 'error') return <Notice role="alert">Couldn’t load your programme. Refresh to try again.</Notice>;

  const touch = () => {
    setState('idle');
    setError(null);
  };
  const setB = (patch: Partial<MerchantBrand>) => {
    setBrand((b) => ({ ...b, ...patch }));
    touch();
  };
  const onName = (v: string) => {
    setName(v);
    if (!saved && !slugTouched) setSlug(slugFromName(v));
    touch();
  };
  const onColour = (v: string) => {
    setColourText(v);
    if (BRAND_COLOUR_RE.test(v)) setB({ brandColour: v.toUpperCase() });
    else touch();
  };

  async function onLogo(file: File | undefined) {
    if (!file) return;
    setLogoError(null);
    try {
      setB({ logo: await readLogo(file) });
    } catch (e) {
      setLogoError(e instanceof Error ? e.message : 'That logo couldn’t be read.');
    }
  }

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    if (!BRAND_COLOUR_RE.test(colourText)) return setError('Use a colour like #FE6336.');
    if (!saved) {
      const c = checkSlug(slug);
      if (!c.ok) return setError(c.message);
    }
    setState('saving');
    setError(null);
    try {
      const res = await fetch('/api/affiliate/merchant', {
        method: 'PUT',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name, slug, ...brand }),
      });
      const b = (await res.json()) as { ok: boolean; message?: string; merchant?: Saved };
      if (!res.ok || !b.merchant) {
        setState('idle');
        return setError(b.message ?? 'We couldn’t save that. Try again in a moment.');
      }
      setSaved(b.merchant);
      setState('saved');
    } catch {
      setState('idle');
      setError('We couldn’t reach KaamSolv. Check your connection and try again.');
    }
  }

  return (
    <div className="grid gap-8 lg:grid-cols-2">
      <form onSubmit={onSave} className="space-y-5" noValidate>
        <div>
          <label htmlFor="m-name" className={label}>
            Business name
          </label>
          <input id="m-name" className={`${INPUT} mt-1`} value={name} maxLength={MERCHANT_LIMITS.name} onChange={(e) => onName(e.target.value)} required autoComplete="organization" />
        </div>

        <div>
          <label htmlFor="m-slug" className={label}>
            Portal address
          </label>
          {saved ? (
            <p className="mt-1 break-all rounded-lg border border-hair bg-wash px-3 py-2 text-sm font-semibold text-strong" data-testid="portal-address">
              {portalLabel(saved.slug)}
            </p>
          ) : (
            <div className="mt-1 flex items-center gap-2">
              <span className="shrink-0 text-xs text-muted sm:text-sm">kaamsolv.com/affiliate/</span>
              <input
                id="m-slug"
                className={INPUT}
                value={slug}
                maxLength={40}
                onChange={(e) => {
                  setSlug(e.target.value.toLowerCase());
                  setSlugTouched(true);
                  touch();
                }}
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                aria-describedby="m-slug-hint"
              />
            </div>
          )}
          <p id="m-slug-hint" className={hint}>
            {saved ? 'This stays the same, so links you’ve shared keep working.' : 'Letters, numbers and hyphens. You can’t change it later.'}
          </p>
        </div>

        <div>
          <label htmlFor="m-programme" className={label}>
            Programme name <span className="font-normal text-muted">(optional)</span>
          </label>
          <input id="m-programme" className={`${INPUT} mt-1`} value={brand.programmeName} maxLength={MERCHANT_LIMITS.programmeName} placeholder={name ? `${name} affiliate programme` : 'Partner programme'} onChange={(e) => setB({ programmeName: e.target.value })} />
        </div>

        <div>
          <label htmlFor="m-desc" className={label}>
            What affiliates should know <span className="font-normal text-muted">(optional)</span>
          </label>
          <textarea id="m-desc" rows={4} className={`${INPUT} mt-1`} value={brand.programmeDescription} maxLength={MERCHANT_LIMITS.programmeDescription} onChange={(e) => setB({ programmeDescription: e.target.value })} />
          <p className={hint}>{brand.programmeDescription.length} / {MERCHANT_LIMITS.programmeDescription}</p>
        </div>

        <div>
          <label htmlFor="m-terms" className={label}>
            Terms and conditions <span className="font-normal text-muted">(optional)</span>
          </label>
          <textarea id="m-terms" rows={6} className={`${INPUT} mt-1`} value={brand.terms} maxLength={MERCHANT_LIMITS.terms} onChange={(e) => setB({ terms: e.target.value })} />
          <p className={hint}>Your own terms, shown as you write them. KaamSolv doesn’t write or check them.</p>
        </div>

        <div>
          <label htmlFor="m-colour" className={label}>
            Brand colour
          </label>
          <div className="mt-1 flex items-center gap-3">
            <input type="color" aria-label="Pick a brand colour" className="h-11 w-14 shrink-0 cursor-pointer rounded-lg border border-hair bg-surface p-1" value={BRAND_COLOUR_RE.test(colourText) ? colourText : brand.brandColour} onChange={(e) => onColour(e.target.value.toUpperCase())} />
            <input id="m-colour" className={`${INPUT} max-w-[9rem]`} value={colourText} maxLength={7} onChange={(e) => onColour(e.target.value)} spellCheck={false} autoCapitalize="characters" />
          </div>
          <p className={hint}>Used for the portal’s top band. The text on it switches to white or navy so it stays readable.</p>
        </div>

        <div>
          <span className={label}>Logo</span>
          <div className="mt-1 flex flex-wrap items-center gap-3">
            <input ref={logoInput} type="file" accept={LOGO_TYPES.join(',')} className="sr-only" aria-label="Upload a logo" onChange={(e) => { void onLogo(e.target.files?.[0]); e.target.value = ''; }} />
            <button type="button" className={SECONDARY} onClick={() => logoInput.current?.click()}>
              {brand.logo ? 'Change logo' : 'Add a logo'}
            </button>
            {brand.logo && (
              <button type="button" className="text-sm font-semibold underline" onClick={() => setB({ logo: null })}>
                Remove
              </button>
            )}
          </div>
          {logoError && <p role="alert" className="mt-1 text-sm font-medium text-danger-700">{logoError}</p>}
          <p className={hint}>PNG, JPG or WebP. It’s shrunk to fit before it’s saved.</p>
        </div>

        {error && <Notice role="alert">{error}</Notice>}
        {state === 'saved' && saved && (
          <Notice tone="info" role="status">
            Done. Your portal is live at{' '}
            <Link href={saved.portalPath} className="font-bold underline" target="_blank">
              {portalLabel(saved.slug)}
            </Link>
            .
          </Notice>
        )}

        <button type="submit" className={PRIMARY} disabled={state === 'saving'}>
          {state === 'saving' ? 'Saving…' : saved ? 'Save changes' : 'Create my portal'}
        </button>
      </form>

      <section aria-label="Preview of your portal" className="min-w-0">
        <p className="mb-2 text-sm font-bold text-ink">Preview</p>
        <div className="overflow-hidden rounded-xl2 border border-hair bg-canvas">
          <PortalView name={name.trim() || 'Your business'} brand={brand} />
        </div>
      </section>
    </div>
  );
}
