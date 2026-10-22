'use client';

import { useEffect, useRef, useState } from 'react';
import { INPUT, PRIMARY, SECONDARY } from './account-shell';
import { GST_RATES, GST_RATES_NOTE, TAX_LABELS } from '@/app/lib/invoice/gst';
import { GST_STATES } from '@/app/lib/invoice/india';
import { LOGO_TYPES, MAX_LEN } from '@/app/lib/invoice/limits';
import { readLogo } from '@/app/lib/invoice/logo';
import { CURRENCY_LABELS } from '@/app/lib/invoice/money';
import { cleanSettings, type Settings } from '@/app/lib/invoice/settings';
import { CURRENCIES } from '@/app/lib/invoice/types';
import { formatSequentialNumber } from '@/app/lib/invoice/validate';

type Form = Settings & { logo: string | null; signature: string | null };

const SELECT = `${INPUT} pr-8`;

/**
 * Settings, in two parts that share one record (/api/settings):
 *   - "business": the business profile shared by all business tools
 *     (details, GSTIN, logo, getting paid) — /app/business
 *   - "invoice":  invoice numbering and defaults — /app/invoices/settings
 * Each part shows only its own fields and sends the rest back unchanged.
 * Checked as you save, field by field.
 */
export function SettingsForm({ part }: { part: 'business' | 'invoice' }) {
  const [form, setForm] = useState<Form | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [logoError, setLogoError] = useState<string | null>(null);
  const logoInput = useRef<HTMLInputElement>(null);
  const signatureInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch('/api/settings', { credentials: 'same-origin', cache: 'no-store' })
      .then((r) => r.json())
      .then((b: { settings: Form }) => setForm(b.settings))
      .catch(() => setState('error'));
  }, []);

  if (!form) return state === 'error' ? <p role="alert">Couldn’t load your settings. Refresh to try again.</p> : <div className="h-96 animate-pulse rounded-xl2 bg-wash" aria-hidden="true" />;

  const set = (patch: Partial<Form>) => {
    setForm((f) => (f ? { ...f, ...patch } : f));
    setState('idle');
  };

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    const checked = cleanSettings(form);
    if (!checked.ok) {
      setErrors(checked.errors);
      setState('error');
      document.getElementById(`s-${Object.keys(checked.errors)[0]}`)?.focus();
      return;
    }
    setErrors({});
    setState('saving');
    const res = await fetch('/api/settings', {
      method: 'PUT',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      // Only the business profile owns the logo; the invoice part leaves it untouched.
      body: JSON.stringify(part === 'business' ? { ...checked.value, logo: form!.logo, signature: form!.signature ?? null } : checked.value),
    }).catch(() => null);
    const body = (await res?.json().catch(() => ({}))) as { errors?: Record<string, string> } | undefined;
    if (!res?.ok) {
      setErrors(body?.errors ?? {});
      setState('error');
      return;
    }
    setForm((f) => (f ? { ...f, ...checked.value } : f));
    setState('saved');
  }

  const field = (key: keyof Settings, label: string, input: React.ReactNode, hint?: string) => (
    <div>
      <label htmlFor={`s-${key}`} className="block text-sm font-semibold text-ink">
        {label}
      </label>
      {hint && <p className="text-xs text-muted">{hint}</p>}
      <div className="mt-1">{input}</div>
      {errors[key] && (
        <p id={`s-${key}-error`} className="mt-1 text-sm font-medium text-danger-600">
          {errors[key]}
        </p>
      )}
    </div>
  );
  const text = (key: keyof Settings, opts: { max: number; type?: string; inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode']; upper?: boolean; placeholder?: string } = { max: 80 }) => (
    <input
      id={`s-${key}`}
      type={opts.type ?? 'text'}
      inputMode={opts.inputMode}
      maxLength={opts.max}
      placeholder={opts.placeholder}
      value={String(form[key] ?? '')}
      aria-invalid={errors[key] ? true : undefined}
      aria-describedby={errors[key] ? `s-${key}-error` : undefined}
      onChange={(e) => set({ [key]: opts.upper ? e.target.value.toUpperCase() : e.target.value } as Partial<Form>)}
      className={INPUT}
    />
  );
  const taxType = form.defaultTaxLabel === '' ? 'none' : form.defaultTaxLabel;

  return (
    <form onSubmit={onSave} noValidate className="space-y-8">
      {part === 'business' && (
      <>
      <Section title="Your business">
        <div className="flex items-center gap-4">
          {form.logo ? (
            // eslint-disable-next-line @next/next/no-img-element -- data URL
            <img src={form.logo} alt="Your logo" className="max-h-14 max-w-[140px] rounded object-contain" />
          ) : (
            <span className="text-sm text-muted">No logo yet</span>
          )}
          <button type="button" onClick={() => logoInput.current?.click()} className={SECONDARY}>
            {form.logo ? 'Change logo' : 'Add logo'}
          </button>
          {form.logo && (
            <button type="button" onClick={() => set({ logo: null })} className="text-sm font-semibold underline">
              Remove
            </button>
          )}
          <input
            ref={logoInput}
            type="file"
            accept={LOGO_TYPES.join(',')}
            className="sr-only"
            aria-label="Choose a logo image"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (!f) return;
              try {
                setLogoError(null);
                set({ logo: await readLogo(f) });
              } catch (err) {
                setLogoError(err instanceof Error ? err.message : 'Couldn’t read that logo.');
              }
            }}
          />
        </div>
        {logoError && <p className="text-sm font-medium text-danger-600">{logoError}</p>}
        {field('name', 'Business name', text('name', { max: MAX_LEN.name }))}
        {field(
          'address',
          'Address',
          <textarea id="s-address" rows={3} maxLength={MAX_LEN.address} value={form.address} onChange={(e) => set({ address: e.target.value })} className={`${INPUT} h-auto py-2`} />,
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          {field(
            'stateCode',
            'State',
            <select id="s-stateCode" value={form.stateCode} onChange={(e) => set({ stateCode: e.target.value })} className={SELECT} aria-invalid={errors.stateCode ? true : undefined}>
              <option value="">Not in India / not set</option>
              {GST_STATES.map(([code, name]) => (
                <option key={code} value={code}>
                  {name} ({code})
                </option>
              ))}
            </select>,
          )}
          {field('gstin', 'GSTIN', text('gstin', { max: 15, upper: true, placeholder: 'Optional' }), 'Only if you’re GST-registered.')}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {field('email', 'Email', text('email', { max: MAX_LEN.email, type: 'email', inputMode: 'email' }))}
          {field('phone', 'Phone', text('phone', { max: MAX_LEN.phone, type: 'tel', inputMode: 'tel' }))}
        </div>
      </Section>

      <Section title="GST and signing" intro="How your invoices are titled and signed.">
        <label className="flex items-start gap-3 text-sm text-strong">
          <input type="checkbox" checked={!!form.composition} onChange={(e) => set({ composition: e.target.checked })} className="mt-0.5 h-5 w-5 accent-[#FE6336]" />
          <span>
            I’m under the GST composition scheme
            <span className="block text-xs text-muted">Your documents become a “Bill of Supply” with no tax, as composition sellers can’t collect GST.</span>
          </span>
        </label>
        <div>
          <p className="text-sm font-semibold text-ink">Signature (optional)</p>
          <p className="text-xs text-muted">Printed above “Authorised signatory” on tax invoices. Without one, there’s a line to sign by hand.</p>
          <div className="mt-2 flex flex-wrap items-center gap-4">
            {form.signature ? (
              // eslint-disable-next-line @next/next/no-img-element -- data URL
              <img src={form.signature} alt="Your signature" className="max-h-12 max-w-[160px] rounded bg-white object-contain p-1" />
            ) : (
              <span className="text-sm text-muted">No signature yet</span>
            )}
            <button type="button" onClick={() => signatureInput.current?.click()} className={SECONDARY}>
              {form.signature ? 'Change signature' : 'Add signature'}
            </button>
            {form.signature && (
              <button type="button" onClick={() => set({ signature: null })} className="text-sm font-semibold underline">
                Remove
              </button>
            )}
            <input
              ref={signatureInput}
              type="file"
              accept={LOGO_TYPES.join(',')}
              className="sr-only"
              aria-label="Choose a signature image"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (!f) return;
                try {
                  setLogoError(null);
                  set({ signature: await readLogo(f) });
                } catch (err) {
                  setLogoError(err instanceof Error ? err.message : 'Couldn’t read that image.');
                }
              }}
            />
          </div>
        </div>
      </Section>

      <Section title="Getting paid" intro="Printed as “Payment details” on your invoices. Leave blank to skip.">
        {field('bankAccountName', 'Account name', text('bankAccountName', { max: MAX_LEN.bankAccountName }))}
        <div className="grid gap-4 sm:grid-cols-2">
          {field('bankAccountNumber', 'Account number', text('bankAccountNumber', { max: MAX_LEN.bankAccountNumber, inputMode: 'numeric' }))}
          {field('bankIfsc', 'IFSC', text('bankIfsc', { max: MAX_LEN.ifsc, upper: true, placeholder: 'HDFC0001234' }))}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {field('bankName', 'Bank name', text('bankName', { max: MAX_LEN.bankName }))}
          {field('upiId', 'UPI ID', text('upiId', { max: MAX_LEN.upiId, placeholder: 'name@bank' }))}
        </div>
        <label className="flex min-h-11 items-center gap-3 text-sm text-strong">
          <input type="checkbox" checked={form.showUpiQr} onChange={(e) => set({ showUpiQr: e.target.checked })} className="h-5 w-5 accent-[#FE6336]" />
          Show a “Scan to pay” UPI QR on rupee invoices
        </label>
      </Section>

      </>
      )}

      {part === 'invoice' && (
      <Section title="Numbering and defaults">
        <div className="grid gap-4 sm:grid-cols-2">
          {field('invoicePrefix', 'Number prefix', text('invoicePrefix', { max: MAX_LEN.prefix }), 'e.g. INV- or KS/25-26/')}
          {field(
            'nextSequence',
            'Next number',
            <input
              id="s-nextSequence"
              type="number"
              min={1}
              inputMode="numeric"
              value={form.nextSequence}
              onChange={(e) => set({ nextSequence: Number(e.target.value) })}
              className={INPUT}
              aria-invalid={errors.nextSequence ? true : undefined}
            />,
          )}
        </div>
        <p className="text-sm text-muted">
          Next invoice: <strong className="text-ink">{formatSequentialNumber(form.nextSequence || 1, form.invoicePrefix)}</strong>
        </p>
        {formatSequentialNumber(form.nextSequence || 1, form.invoicePrefix).length > 16 && (
          <p className="text-sm font-medium text-danger-600">GST tax invoice numbers can be at most 16 characters — use a shorter prefix.</p>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          {field(
            'defaultCurrency',
            'Currency',
            <select id="s-defaultCurrency" value={form.defaultCurrency} onChange={(e) => set({ defaultCurrency: e.target.value as Settings['defaultCurrency'] })} className={SELECT}>
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {CURRENCY_LABELS[c]}
                </option>
              ))}
            </select>,
          )}
          {field(
            'defaultDueDays',
            'Days to pay',
            <input id="s-defaultDueDays" type="number" min={0} max={365} inputMode="numeric" value={form.defaultDueDays} onChange={(e) => set({ defaultDueDays: Number(e.target.value) })} className={INPUT} aria-invalid={errors.defaultDueDays ? true : undefined} />,
          )}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {field(
            'defaultTaxLabel',
            'Tax',
            <select
              id="s-defaultTaxLabel"
              value={taxType}
              onChange={(e) => set(e.target.value === 'none' ? { defaultTaxLabel: '', defaultTaxRate: '' } : { defaultTaxLabel: e.target.value })}
              className={SELECT}
            >
              {TAX_LABELS.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
              <option value="none">No tax</option>
            </select>,
          )}
          {taxType !== 'none' &&
            field(
              'defaultTaxRate',
              'Rate',
              taxType === 'GST' ? (
                <select id="s-defaultTaxRate" value={form.defaultTaxRate} onChange={(e) => set({ defaultTaxRate: e.target.value })} className={SELECT}>
                  <option value="">Choose each time</option>
                  {GST_RATES.map((r) => (
                    <option key={r} value={r}>
                      {r}%
                    </option>
                  ))}
                </select>
              ) : (
                text('defaultTaxRate', { max: 6, inputMode: 'decimal', placeholder: '%' })
              ),
              taxType === 'GST' ? GST_RATES_NOTE : undefined,
            )}
        </div>
        {field(
          'defaultNotes',
          'Notes or terms',
          <textarea id="s-defaultNotes" rows={3} maxLength={MAX_LEN.notes} value={form.defaultNotes} onChange={(e) => set({ defaultNotes: e.target.value })} className={`${INPUT} h-auto py-2`} />,
          'Printed on every new invoice — you can still change it per invoice.',
        )}
      </Section>
      )}

      <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center gap-3 border-t border-hair bg-canvas/95 px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0">
        <button type="submit" disabled={state === 'saving'} className={PRIMARY}>
          {state === 'saving' ? 'Saving…' : part === 'business' ? 'Save business profile' : 'Save invoice settings'}
        </button>
        <span role="status" className={`text-sm font-medium ${state === 'error' ? 'text-danger-600' : 'text-muted'}`}>
          {state === 'saved' ? (part === 'business' ? 'Saved. Your invoices will use these details.' : 'Saved. New invoices will use these.') : state === 'error' ? 'Check the highlighted fields.' : ''}
        </span>
      </div>
    </form>
  );
}

function Section({ title, intro, children }: { title: string; intro?: string; children: React.ReactNode }) {
  const id = `sec-${title.toLowerCase().replace(/\W+/g, '-')}`;
  return (
    <section aria-labelledby={id} className="space-y-4 rounded-xl2 border border-hair bg-surface p-5 sm:p-6">
      <div>
        <h2 id={id} className="font-display text-lg font-bold text-ink">
          {title}
        </h2>
        {intro && <p className="text-sm text-muted">{intro}</p>}
      </div>
      {children}
    </section>
  );
}
