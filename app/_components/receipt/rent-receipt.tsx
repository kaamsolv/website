'use client';

import { useEffect, useMemo, useState } from 'react';
import { Chips, Segmented } from '../choice';
import { CARD, FIELD } from '../calc/everyday-calculators';
import { downloadBlob } from '@/app/lib/image/export';
import { trackToolError, trackToolSuccess } from '@/app/lib/analytics';
import { buildReceipts, LIMITS, rentPdfFilename, type Field, type ReceiptInput, type ReceiptSet } from '@/app/lib/rent-receipt/build';
import { currentFinancialYear, financialYearStart, MONTH_NAMES, type DateRule, type YearMonth } from '@/app/lib/rent-receipt/months';
import { PAY_MODES, STAMP_LIMIT_RUPEES, PAN_LIMIT_RUPEES, type PayMode } from '@/app/lib/rent-receipt/rules';

const LABEL = 'mb-1.5 block text-sm font-semibold text-ink';
const HELP = 'mt-1.5 text-sm text-muted';
const ERR = 'mt-1.5 text-sm font-medium text-danger-700';
const NOTE = 'rounded-xl border border-yellow-300 bg-yellowx-100 px-4 py-3 text-sm text-strong';

type RangeMode = 'fy' | 'custom';

const nowYearMonth = (): YearMonth => {
  const d = new Date();
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
};

/**
 * Rent receipts for HRA: one per month, three to an A4 page, ready for the landlord to sign.
 * Live preview as you type; the PDF is made in the browser when you press Download. Nothing is
 * sent anywhere and nothing is saved, not even in this browser. Wording and rules:
 * app/lib/rent-receipt/ (docs/products/rent-receipt.md).
 */
export function RentReceiptGenerator() {
  const [tenant, setTenant] = useState('');
  const [landlord, setLandlord] = useState('');
  const [pan, setPan] = useState('');
  const [address, setAddress] = useState('');
  const [rent, setRent] = useState('');
  const [mode, setMode] = useState<PayMode>('upi');
  const [reference, setReference] = useState('');
  const [dateRule, setDateRule] = useState<DateRule>('last');
  const [rangeMode, setRangeMode] = useState<RangeMode>('fy');
  const [fyStart, setFyStart] = useState<number | null>(null); // set after mount: the page is pre-rendered, "today" is not known until then
  const [from, setFrom] = useState<YearMonth | null>(null);
  const [to, setTo] = useState<YearMonth | null>(null);
  const [touched, setTouched] = useState<Partial<Record<Field, boolean>>>({});
  const [attempted, setAttempted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [made, setMade] = useState<{ count: number; pages: number } | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const today = nowYearMonth();
    const fy = financialYearStart(today);
    setFyStart(fy);
    const range = currentFinancialYear(today);
    setFrom(range.from);
    setTo(range.to);
  }, []);

  const years = useMemo(() => {
    const base = fyStart ?? 2026;
    return [base - 3, base - 2, base - 1, base, base + 1];
  }, [fyStart]);

  const input: ReceiptInput = useMemo(() => {
    const range = rangeMode === 'fy' && fyStart !== null ? { from: { year: fyStart, month: 4 }, to: { year: fyStart + 1, month: 3 } } : { from, to };
    return { tenant, landlord, landlordPan: pan, address, rent, mode, reference, dateRule, from: range.from, to: range.to };
  }, [tenant, landlord, pan, address, rent, mode, reference, dateRule, rangeMode, fyStart, from, to]);

  const built = useMemo(() => buildReceipts(input), [input]);
  const set: ReceiptSet | null = built.ok ? built.set : null;
  const errors = built.ok ? {} : built.errors;

  const touch = (f: Field) => setTouched((t) => ({ ...t, [f]: true }));
  /** An error shows once the person has been in the field (or tried to download), never on a fresh empty form. */
  const show = (f: Field): string | undefined => (touched[f] || attempted ? errors[f] : undefined);
  // while typing a wrong value (not just an empty one) the message appears at once
  const showLive = (f: Field, value: string): string | undefined => (value.trim() && errors[f] ? errors[f] : show(f));

  function changed() {
    setMade(null);
    setFailed(false);
  }

  async function download() {
    if (!set) {
      setAttempted(true);
      return;
    }
    setBusy(true);
    setFailed(false);
    setMade(null);
    try {
      const { renderRentReceiptsPdf } = await import('./generate-rent-pdf');
      const blob = await renderRentReceiptsPdf(set);
      downloadBlob(blob, rentPdfFilename(set));
      trackToolSuccess('generator', true);
      setMade({ count: set.receipts.length, pages: Math.ceil(set.receipts.length / 3) });
    } catch {
      trackToolError('pdf_failed', 'generator');
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  const first = set?.receipts[0];

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start">
      <div className={`${CARD} space-y-5`}>
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label htmlFor="rr-tenant" className={LABEL}>
              Tenant (you)
            </label>
            <input
              id="rr-tenant"
              className={FIELD}
              autoComplete="name"
              maxLength={LIMITS.name}
              value={tenant}
              onChange={(e) => (changed(), setTenant(e.target.value))}
              onBlur={() => touch('tenant')}
              aria-invalid={show('tenant') ? true : undefined}
              aria-describedby={show('tenant') ? 'rr-tenant-err' : undefined}
              placeholder="Priya Sharma"
            />
            {show('tenant') && (
              <p id="rr-tenant-err" className={ERR}>
                {show('tenant')}
              </p>
            )}
          </div>
          <div>
            <label htmlFor="rr-landlord" className={LABEL}>
              Landlord
            </label>
            <input
              id="rr-landlord"
              className={FIELD}
              maxLength={LIMITS.name}
              value={landlord}
              onChange={(e) => (changed(), setLandlord(e.target.value))}
              onBlur={() => touch('landlord')}
              aria-invalid={show('landlord') ? true : undefined}
              aria-describedby={show('landlord') ? 'rr-landlord-err' : undefined}
              placeholder="Rakesh Gupta"
            />
            {show('landlord') && (
              <p id="rr-landlord-err" className={ERR}>
                {show('landlord')}
              </p>
            )}
          </div>
        </div>

        <div>
          <label htmlFor="rr-address" className={LABEL}>
            Address of the rented property
          </label>
          <input
            id="rr-address"
            className={FIELD}
            autoComplete="street-address"
            maxLength={LIMITS.address}
            value={address}
            onChange={(e) => (changed(), setAddress(e.target.value))}
            onBlur={() => touch('address')}
            aria-invalid={show('address') ? true : undefined}
            aria-describedby={show('address') ? 'rr-address-err' : undefined}
            placeholder="Flat 4B, Green Park Apartments, Bengaluru 560034"
          />
          {show('address') && (
            <p id="rr-address-err" className={ERR}>
              {show('address')}
            </p>
          )}
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label htmlFor="rr-rent" className={LABEL}>
              Rent per month
            </label>
            <div className="relative">
              <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-base font-semibold text-muted" aria-hidden="true">
                ₹
              </span>
              <input
                id="rr-rent"
                inputMode="decimal"
                autoComplete="off"
                className={`${FIELD} pl-9`}
                value={rent}
                onChange={(e) => (changed(), setRent(e.target.value))}
                onBlur={() => touch('rent')}
                aria-invalid={showLive('rent', rent) ? true : undefined}
                aria-describedby={showLive('rent', rent) ? 'rr-rent-err' : undefined}
                placeholder="25,000"
              />
            </div>
            {showLive('rent', rent) && (
              <p id="rr-rent-err" className={ERR}>
                {showLive('rent', rent)}
              </p>
            )}
          </div>
          <div>
            <label htmlFor="rr-pan" className={LABEL}>
              Landlord’s PAN <span className="font-normal text-muted">(if you have it)</span>
            </label>
            <input
              id="rr-pan"
              className={`${FIELD} uppercase placeholder:normal-case`}
              autoComplete="off"
              maxLength={14}
              value={pan}
              onChange={(e) => (changed(), setPan(e.target.value))}
              onBlur={() => touch('landlordPan')}
              aria-invalid={showLive('landlordPan', pan) ? true : undefined}
              aria-describedby={showLive('landlordPan', pan) ? 'rr-pan-err' : 'rr-pan-help'}
              placeholder="ABCDE1234F"
            />
            {showLive('landlordPan', pan) ? (
              <p id="rr-pan-err" className={ERR}>
                {showLive('landlordPan', pan)}
              </p>
            ) : (
              <p id="rr-pan-help" className={HELP}>
                Employers usually ask for it when rent is over ₹{PAN_LIMIT_RUPEES.toLocaleString('en-IN')} a year. We only check its shape.
              </p>
            )}
          </div>
        </div>

        <Segmented
          legend="Which months?"
          options={[
            { value: 'fy' as const, label: 'A financial year' },
            { value: 'custom' as const, label: 'Pick the months' },
          ]}
          value={rangeMode}
          onChange={(v) => (changed(), setRangeMode(v))}
        />

        {rangeMode === 'fy' ? (
          <div>
            <label htmlFor="rr-fy" className={LABEL}>
              Financial year
            </label>
            <select
              id="rr-fy"
              className={FIELD}
              value={fyStart ?? ''}
              onChange={(e) => (changed(), setFyStart(Number(e.target.value)))}
              disabled={fyStart === null}
            >
              {years.map((y) => (
                <option key={y} value={y}>
                  {`${y}-${String((y + 1) % 100).padStart(2, '0')} · Apr ${y} to Mar ${y + 1}`}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2">
            <MonthPicker idBase="rr-from" label="From" value={from} years={years} onChange={(v) => (changed(), setFrom(v))} />
            <MonthPicker idBase="rr-to" label="To" value={to} years={years} onChange={(v) => (changed(), setTo(v))} />
            {errors.months && (
              <p className={`${ERR} sm:col-span-2`} role="alert">
                {errors.months}
              </p>
            )}
          </div>
        )}

        <Chips legend="How was it paid?" options={PAY_MODES.map((m) => ({ value: m.value, label: m.label }))} value={mode} onChange={(v) => (changed(), setMode(v))} />

        <div>
          <label htmlFor="rr-ref" className={LABEL}>
            Reference <span className="font-normal text-muted">(optional)</span>
          </label>
          <input
            id="rr-ref"
            className={FIELD}
            maxLength={LIMITS.reference}
            value={reference}
            onChange={(e) => (changed(), setReference(e.target.value))}
            placeholder="UPI or cheque number"
          />
        </div>

        <Segmented
          legend="Date on each receipt"
          options={[
            { value: 'last' as const, label: 'Last day of the month' },
            { value: 'first' as const, label: '1st of the month' },
          ]}
          value={dateRule}
          onChange={(v) => (changed(), setDateRule(v))}
        />
      </div>

      <div className="space-y-4 lg:sticky lg:top-24">
        {set?.panMissing && (
          <p className={NOTE} role="status">
            Rent over ₹{PAN_LIMIT_RUPEES.toLocaleString('en-IN')} in a financial year: employers usually ask for the landlord’s PAN. Add it on the left. If your landlord has no PAN, ask your
            employer what they accept.
          </p>
        )}
        {set?.stamp && (
          <p className={NOTE} role="status">
            Cash rent over ₹{STAMP_LIMIT_RUPEES.toLocaleString('en-IN')}: landlords usually put a ₹1 revenue stamp on each receipt and sign across it. Each receipt has a box for it.
          </p>
        )}

        <div className="rounded-xl2 border border-hair bg-surface p-4 sm:p-5" aria-live="polite">
          <p className="mb-3 text-sm font-semibold text-ink">Your first receipt</p>
          {first && set ? (
            <div className="rounded-lg border border-dashed border-[#B9C0D0] bg-white p-4 text-[#0C2248] sm:p-5" data-testid="receipt-preview">
              <div className="flex items-end justify-between gap-3">
                <p className="font-display text-base font-extrabold tracking-wide">RENT RECEIPT</p>
                <p className="text-xs text-[#5B6478]">Date: {first.dateLabel}</p>
              </div>
              <p className="mt-1 text-xs text-[#5B6478]">For {first.monthLabel}</p>
              <p className="mt-3 text-sm leading-relaxed">{first.received}</p>
              <p className="mt-2 text-xs text-[#5B6478]">{first.paidBy}</p>
              <div className="mt-5 flex items-end justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs text-[#5B6478]">Landlord</p>
                  <p className="break-words text-sm font-bold">{set.landlord}</p>
                  {set.landlordPan && <p className="text-xs">PAN: {set.landlordPan}</p>}
                </div>
                <div className="flex shrink-0 items-end gap-3">
                  {set.stamp && (
                    <div className="grid h-14 w-[4.5rem] place-items-center rounded border border-dashed border-[#B9C0D0] text-center text-[9px] leading-tight text-[#5B6478]">
                      Revenue stamp ₹1
                      <br />
                      sign across
                    </div>
                  )}
                  <div className="w-28 border-t border-[#0C2248] pt-1 text-center text-[10px] text-[#5B6478]">Signature of landlord</div>
                </div>
              </div>
            </div>
          ) : (
            <p className="rounded-lg border border-dashed border-hair px-4 py-8 text-center text-sm text-muted">Fill in the details and your receipt appears here.</p>
          )}
          {set && (
            <p className="mt-3 text-sm text-strong">
              <span className="font-semibold">{set.receipts.length}</span> {set.receipts.length === 1 ? 'receipt' : 'receipts'} ({set.receipts[0].monthLabel}
              {set.receipts.length > 1 ? ` to ${set.receipts[set.receipts.length - 1].monthLabel}` : ''}) · {set.totalFigures} in all · {Math.ceil(set.receipts.length / 3)}{' '}
              {Math.ceil(set.receipts.length / 3) === 1 ? 'page' : 'pages'}, three to a page
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={download}
          disabled={busy}
          className="h-12 w-full rounded-full bg-coral-500 px-5 text-sm font-semibold text-navy-900 hover:bg-coral-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-500 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? 'Making your PDF…' : set ? `Download PDF (${set.receipts.length} ${set.receipts.length === 1 ? 'receipt' : 'receipts'})` : 'Download PDF'}
        </button>
        {attempted && !set && (
          <p className={ERR} role="alert">
            Fill in the details marked above first.
          </p>
        )}
        {made && (
          <p className="rounded-xl border border-teal-300 bg-tealx-100 px-4 py-3 text-sm text-strong" role="status">
            <span className="font-semibold text-ink">Done.</span> {made.count} {made.count === 1 ? 'receipt' : 'receipts'}, {made.pages} {made.pages === 1 ? 'page' : 'pages'}. Print, ask your landlord to sign each one
            {set?.stamp ? ' (and the stamp)' : ''}, then give them to your employer.
          </p>
        )}
        {failed && (
          <p className={ERR} role="alert">
            Couldn’t make the PDF. Try again, or refresh the page.
          </p>
        )}

        <p className="text-xs leading-relaxed text-muted">
          Only make receipts for rent you actually paid. Whether HRA is exempt for you depends on your tax regime and your employer’s rules, so ask your employer or a CA. Nothing you type here leaves your browser.
        </p>
      </div>
    </div>
  );
}

function MonthPicker({ idBase, label, value, years, onChange }: { idBase: string; label: string; value: YearMonth | null; years: number[]; onChange: (v: YearMonth) => void }) {
  const year = value?.year ?? years[years.length - 2];
  const month = value?.month ?? 4;
  const allYears = years.includes(year) ? years : [...years, year].sort((a, b) => a - b);
  return (
    <fieldset>
      <legend className={LABEL}>{label}</legend>
      <div className="grid grid-cols-[1fr_auto] gap-2">
        <select aria-label={`${label} month`} id={`${idBase}-month`} className={FIELD} value={month} onChange={(e) => onChange({ year, month: Number(e.target.value) })}>
          {MONTH_NAMES.map((n, i) => (
            <option key={n} value={i + 1}>
              {n}
            </option>
          ))}
        </select>
        <select aria-label={`${label} year`} id={`${idBase}-year`} className={`${FIELD} w-28`} value={year} onChange={(e) => onChange({ year: Number(e.target.value), month })}>
          {allYears.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </div>
    </fieldset>
  );
}
