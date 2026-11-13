'use client';

import { useEffect, useMemo, useState } from 'react';
import { Chips, Segmented } from '../choice';
import { CopyButton } from '../copy-button';
import { Icon } from '../icons';
import { FIELD } from '../calc/everyday-calculators';
import { InfoHeading } from '../calc/info-tip';
import { Frame, Problem } from '../calc/interest-calculators';
import { SliderField } from '../calc/slider-field';
import { trackToolError, trackToolSuccess } from '@/app/lib/analytics';
import { parseAmount } from '@/app/lib/calc/everyday';
import { applyPrefix, cleanPrefix, COUPON_LIMITS, describeStrength, generateCoupons, type CharsetKey } from '@/app/lib/coupons/generate';
import { describeOdds } from '@/app/lib/coupons/describe';
import { checkDiscount, checkExpiryDate, couponFileName, couponsToCsv, couponsToTxt, type DiscountLabel } from '@/app/lib/coupons/export';
import { downloadBlob } from '@/app/lib/image/export';

/** How many codes one batch may hold on this page. The engine could do 10,000; generation is free and on the visitor's device, so this is a comfort limit, not a paywall. */
const MAX_CODES = 1000;

type DiscountMode = 'none' | 'percent' | 'amount';

const SETS: { value: CharsetKey; label: string }[] = [
  { value: 'clear', label: 'Clear, no look-alikes' },
  { value: 'letters', label: 'Letters' },
  { value: 'digits', label: 'Digits' },
  { value: 'all', label: 'Letters and digits' },
];

const DASHES = [
  { value: 4, label: 'Every 4' },
  { value: 3, label: 'Every 3' },
  { value: 0, label: 'None' },
];

const HELP = {
  count: 'How many different codes you want. Every one is different, so you can hand one to each customer.',
  length: 'Longer codes are harder to guess. 8 is plenty for most sales; go longer if a code is worth real money.',
  prefix: 'Letters and digits that start every code, like SALE or DIWALI25. Handy for telling one campaign from another.',
  charset: 'Clear leaves out the letters and digits that look alike (I, L, O, 0 and 1), so a code is easy to read out and type.',
  dashes: 'Dashes make a code easier to read out loud. Some tills and forms do not accept them: choose None then.',
  discount: 'Optional. It goes into the CSV so you can see what each batch was for, and some stores read it when you import. It does not make the discount work: your store sets the real one.',
  expiry: 'Optional. The last day the codes should be accepted. It is a note in your file: your store or till has to enforce it.',
};

const LABEL = 'text-sm font-semibold text-ink';
const BUTTON =
  'inline-flex h-12 w-full items-center justify-center gap-2 rounded-full border border-hair bg-surface px-5 text-sm font-semibold text-strong transition-colors hover:bg-wash focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-500 focus-visible:ring-offset-2 focus-visible:ring-offset-surface disabled:cursor-not-allowed disabled:opacity-50';
const NOTE = 'rounded-xl border border-yellow-300 bg-yellowx-100 px-4 py-3 text-sm text-strong';

/** The first number the visitor typed, if it is a whole number in range; otherwise null. */
function wholeInRange(text: string, min: number, max: number): number | null {
  const n = parseAmount(text);
  return Number.isInteger(n) && n >= min && n <= max ? n : null;
}

/**
 * Coupon codes, made on the visitor's device. The settings that shape the codes (length, characters, dashes) draw a pool of
 * unique random codes; how many to show and the prefix are applied on top, so dragging the count or typing a prefix never
 * reshuffles the codes you are looking at. The discount and the date are labels that travel in the CSV: nothing here can
 * enforce them, and the page says so. Engine and rules: app/lib/coupons (docs/products/coupons.md).
 */
export function CouponGenerator() {
  const [count, setCount] = useState('100');
  const [length, setLength] = useState('8');
  const [prefix, setPrefix] = useState('');
  const [charset, setCharset] = useState<CharsetKey>('clear');
  const [group, setGroup] = useState(4);
  const [mode, setMode] = useState<DiscountMode>('none');
  const [discountValue, setDiscountValue] = useState('10');
  const [expiry, setExpiry] = useState('');
  const [nonce, setNonce] = useState(0);
  const [pool, setPool] = useState<string[] | null>(null);
  const [today, setToday] = useState('');

  const n = wholeInRange(count, 1, MAX_CODES);
  const len = wholeInRange(length, COUPON_LIMITS.minLength, COUPON_LIMITS.maxLength);
  const ok = n !== null && len !== null;

  // Codes are random, so they are made after the page loads (the page is pre-rendered, and a pre-rendered random code would not match).
  useEffect(() => {
    if (len === null) return;
    try {
      setPool(generateCoupons({ count: MAX_CODES, length: len, groupSize: group, charset }));
    } catch {
      setPool(null);
      trackToolError('generate_failed', 'generator');
    }
  }, [len, group, charset, nonce]);

  useEffect(() => {
    setToday(new Date().toLocaleDateString('en-CA'));
  }, []);

  const codes = useMemo(() => (pool && ok ? pool.slice(0, n).map((c) => applyPrefix(prefix, c)) : []), [pool, ok, n, prefix]);

  const discount: DiscountLabel | null = mode === 'none' ? null : { type: mode, value: parseAmount(discountValue) };
  let discountProblem: string | null = null;
  if (discount) {
    try {
      checkDiscount(discount);
    } catch (e) {
      discountProblem = (e as Error).message;
    }
  }
  let expiryProblem: string | null = null;
  if (expiry) {
    try {
      checkExpiryDate(expiry);
    } catch (e) {
      expiryProblem = (e as Error).message;
    }
  }
  const filesOk = codes.length > 0 && !discountProblem && !expiryProblem;
  const expired = Boolean(expiry && today && expiry < today && !expiryProblem);

  const strength = ok ? describeStrength(n, len, charset) : null;
  const odds = strength ? describeOdds(strength.oneIn) : null;
  const headline = ok ? `${n.toLocaleString('en-IN')} ${n === 1 ? 'code' : 'codes'}` : null;
  const showSample = codes.slice(0, 6);

  function switchMode(next: DiscountMode) {
    setMode(next);
    if (next === 'percent') setDiscountValue('10');
    if (next === 'amount') setDiscountValue('100');
  }

  function save(kind: 'csv' | 'txt') {
    if (!filesOk) return;
    const text = kind === 'csv' ? couponsToCsv(codes, { discount, expiresOn: expiry || null }) : couponsToTxt(codes);
    const blob = new Blob([text], { type: kind === 'csv' ? 'text/csv;charset=utf-8' : 'text/plain;charset=utf-8' });
    downloadBlob(blob, couponFileName(kind, codes.length, prefix));
    trackToolSuccess('generator');
  }

  return (
    <Frame
      stickyLabel="Codes ready"
      stickyValue={headline}
      inputs={
        <>
          <SliderField id="cp-count" label="How many codes" value={count} onChange={setCount} min={1} max={MAX_CODES} step={1} minLabel="1" maxLabel="1,000" info={HELP.count} />
          {n === null && <Problem>Pick a whole number from 1 to {MAX_CODES.toLocaleString('en-IN')}.</Problem>}

          <SliderField id="cp-length" label="Characters in each code" value={length} onChange={setLength} min={COUPON_LIMITS.minLength} max={COUPON_LIMITS.maxLength} step={1} minLabel="4" maxLabel="16" info={HELP.length} />
          {len === null && (
            <Problem>
              Make the code {COUPON_LIMITS.minLength} to {COUPON_LIMITS.maxLength} characters long.
            </Problem>
          )}

          <div>
            <div className="mb-1.5">
              <InfoHeading info={HELP.prefix}>
                <label htmlFor="cp-prefix">Starts with (optional)</label>
              </InfoHeading>
            </div>
            <input
              id="cp-prefix"
              className={`${FIELD} uppercase`}
              value={prefix}
              onChange={(e) => setPrefix(cleanPrefix(e.target.value).slice(0, COUPON_LIMITS.maxPrefix))}
              maxLength={COUPON_LIMITS.maxPrefix * 2}
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              placeholder="SALE"
            />
          </div>

          <div className="space-y-2">
            <InfoHeading info={HELP.charset}>Characters</InfoHeading>
            <Chips legend="Characters" hideLegend options={SETS} value={charset} onChange={setCharset} />
          </div>

          <div className="space-y-2">
            <InfoHeading info={HELP.dashes}>Dashes</InfoHeading>
            <Chips legend="Dashes" hideLegend options={DASHES} value={group} onChange={setGroup} />
          </div>

          <div className="space-y-3">
            <InfoHeading info={HELP.discount}>Discount (a label for your CSV)</InfoHeading>
            <Segmented
              legend="Discount"
              hideLegend
              options={[
                { value: 'none' as const, label: 'None' },
                { value: 'percent' as const, label: '% off' },
                { value: 'amount' as const, label: '₹ off' },
              ]}
              value={mode}
              onChange={switchMode}
            />
            {mode === 'percent' && <SliderField id="cp-discount" label="Percent off" value={discountValue} onChange={setDiscountValue} min={1} max={100} step={1} suffix="%" minLabel="1%" maxLabel="100%" />}
            {mode === 'amount' && <SliderField id="cp-discount" label="Amount off" value={discountValue} onChange={setDiscountValue} min={10} max={2000} step={10} prefix="₹" group minLabel="₹10" maxLabel="₹2,000" />}
            {discountProblem && <Problem>{discountProblem}</Problem>}
          </div>

          <div>
            <div className="mb-1.5">
              <InfoHeading info={HELP.expiry}>
                <label htmlFor="cp-expiry">Valid until (a label too)</label>
              </InfoHeading>
            </div>
            <input id="cp-expiry" type="date" className={FIELD} value={expiry} onChange={(e) => setExpiry(e.target.value)} aria-invalid={expiryProblem ? true : undefined} />
            {expiryProblem && <Problem>{expiryProblem}</Problem>}
            {expired && <p className="mt-1.5 text-sm text-muted">That date has already passed. Pick a later one if the codes are for the future.</p>}
          </div>
        </>
      }
      results={
        <>
          <div className="rounded-xl border border-teal-300 bg-tealx-100 px-5 py-4" aria-live="polite" data-testid="coupon-answer">
            <p className="text-sm font-medium text-strong">Ready to use</p>
            <p className="mt-1 min-w-0 break-words font-display text-2xl font-extrabold text-ink sm:text-3xl" data-testid="coupon-count">
              {headline ?? '—'}
            </p>
          </div>

          {!ok && <p className="text-sm text-strong">Fix the number above to see your codes.</p>}

          {ok && odds && (
            <div data-testid="coupon-strength">
              <p className="text-sm text-strong">
                A random guess matches one of your codes <span className="font-semibold text-ink">{odds.phrase}</span>.
              </p>
              <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-wash" aria-hidden="true">
                <div className={`h-full rounded-full ${odds.weak ? 'bg-coral-500' : 'bg-teal-500'}`} style={{ width: `${odds.percent}%` }} />
              </div>
              {odds.weak && <p className="mt-2 text-sm font-medium text-strong">These codes are on the short side. Make them longer if a code is worth real money.</p>}
            </div>
          )}

          {ok &&
            (pool ? (
              <div>
                <ul className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2" aria-label="A few of your codes" data-testid="coupon-sample">
                  {showSample.map((c) => (
                    <li key={c} className="min-w-0 break-words rounded-lg bg-wash px-3 py-2 font-mono text-sm font-semibold text-ink">
                      {c}
                    </li>
                  ))}
                </ul>
                {codes.length > showSample.length && (
                  <p className="mt-2 text-sm text-muted">and {(codes.length - showSample.length).toLocaleString('en-IN')} more. Copy or download to get all of them.</p>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2" aria-hidden="true">
                {Array.from({ length: 6 }, (_, i) => (
                  <div key={i} className="h-9 rounded-lg bg-wash motion-safe:animate-pulse" />
                ))}
              </div>
            ))}

          {codes.length > 0 && (
            <div className="grid gap-2 sm:grid-cols-2">
              <CopyButton primary className="w-full" value={codes.join('\n')} label="Copy all codes" copiedLabel="Copied" onCopied={() => trackToolSuccess('generator')} />
              <button type="button" className={BUTTON} onClick={() => save('csv')} disabled={!filesOk} data-testid="coupon-csv">
                <Icon name="download" className="h-4 w-4" />
                Download CSV
              </button>
              <button type="button" className={BUTTON} onClick={() => save('txt')} disabled={!filesOk} data-testid="coupon-txt">
                <Icon name="download" className="h-4 w-4" />
                Download TXT
              </button>
              <button type="button" className={BUTTON} onClick={() => setNonce((v) => v + 1)} data-testid="coupon-new">
                Make a new set
              </button>
            </div>
          )}
          {codes.length > 0 && !filesOk && <p className="text-sm text-strong">Fix the discount or the date to download the files.</p>}

          {codes.length > 0 && (
            <details className="rounded-xl border border-hair px-3 py-2">
              <summary className="min-h-10 cursor-pointer py-1.5 text-sm font-semibold text-ink pointer-coarse:min-h-11">See every code</summary>
              <textarea readOnly aria-label="Every code, one per line" rows={8} value={codes.join('\n')} className={`${FIELD} mt-2 !h-auto py-2 font-mono !text-sm`} data-testid="coupon-all" />
            </details>
          )}

          <p className={NOTE} data-testid="coupon-labels-note">
            The discount and date are labels in your file. Your store or till has to enforce them. This page can’t stop a code being used twice.
          </p>
          <p className="flex items-center gap-2 text-xs text-muted">
            <Icon name="lock" className="h-4 w-4 shrink-0" />
            Made on your device. Nothing is uploaded.
          </p>
        </>
      }
    />
  );
}
