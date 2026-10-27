'use client';

import { useMemo, useState } from 'react';
import { CopyButton } from '../copy-button';
import { Segmented } from '../choice';
import { useToolSuccess } from '../use-tool-success';
import { CARD, FIELD } from './everyday-calculators';
import { calculateGratuity, GRATUITY_CAP_RUPEES, MIN_YEARS, RULES_AS_OF, serviceLabel, type Employment, type GratuityOutcome, type Reason } from '@/app/lib/gratuity/calc';
import { groupIndian } from '@/app/lib/invoice/words';

const LABEL = 'mb-1.5 block text-sm font-semibold text-ink';
const ERR = 'mt-1.5 text-sm font-medium text-danger-700';
const NOTE = 'rounded-xl border border-yellow-300 bg-yellowx-100 px-4 py-3 text-sm text-strong';

const rupees = (n: bigint) => `₹${groupIndian(n.toString())}`;

function summary(o: GratuityOutcome): string {
  return `Gratuity: ${rupees(o.amount ?? BigInt(0))}. Worked out as ${o.working} (service ${serviceLabel(o.service)}, ${o.joinedLabel} to ${o.lastDayLabel}). An estimate under the Payment of Gratuity Act, not legal or tax advice.`;
}

/**
 * Gratuity under the Payment of Gratuity Act formula (wages × 15 × years ÷ 26), live as you type.
 * Everything runs in the browser and nothing is saved. Rules and their limits:
 * app/lib/gratuity/calc.ts and docs/products/gratuity-calculator.md. It is an estimate, not advice.
 */
export function GratuityCalculator() {
  const [joined, setJoined] = useState('');
  const [lastDay, setLastDay] = useState('');
  const [wages, setWages] = useState('');
  const [employment, setEmployment] = useState<Employment>('permanent');
  const [reason, setReason] = useState<Reason>('leaving');

  const result = useMemo(() => calculateGratuity({ wages, joined, lastDay, employment, reason }), [wages, joined, lastDay, employment, reason]);
  const errors = result.ok ? {} : result.errors;
  const o = result.ok ? result.outcome : null;
  useToolSuccess(Boolean(o?.eligible), 'calculator');

  /** A message shows once the box has something in it (a fresh form is never red). */
  const shown = (field: 'wages' | 'joined' | 'lastDay', value: string) => (value.trim() ? errors[field] : undefined);

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start">
        <div className={`${CARD} space-y-5`}>
          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <label htmlFor="gr-joined" className={LABEL}>
                Joining date
              </label>
              <input id="gr-joined" type="date" min="1950-01-01" max="2100-12-31" className={FIELD} value={joined} onChange={(e) => setJoined(e.target.value)} aria-invalid={shown('joined', joined) ? true : undefined} aria-describedby={shown('joined', joined) ? 'gr-joined-err' : undefined} />
              {shown('joined', joined) && (
                <p id="gr-joined-err" className={ERR}>
                  {shown('joined', joined)}
                </p>
              )}
            </div>
            <div>
              <label htmlFor="gr-last" className={LABEL}>
                Last working day
              </label>
              <input id="gr-last" type="date" min="1950-01-01" max="2100-12-31" className={FIELD} value={lastDay} onChange={(e) => setLastDay(e.target.value)} aria-invalid={shown('lastDay', lastDay) ? true : undefined} aria-describedby={shown('lastDay', lastDay) ? 'gr-last-err' : undefined} />
              {shown('lastDay', lastDay) && (
                <p id="gr-last-err" className={ERR}>
                  {shown('lastDay', lastDay)}
                </p>
              )}
            </div>
          </div>

          <div>
            <label htmlFor="gr-wages" className={LABEL}>
              Last drawn wages per month
            </label>
            <div className="relative">
              <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-base font-semibold text-muted" aria-hidden="true">
                ₹
              </span>
              <input id="gr-wages" inputMode="decimal" autoComplete="off" className={`${FIELD} pl-9`} value={wages} onChange={(e) => setWages(e.target.value)} placeholder="50,000" aria-invalid={shown('wages', wages) ? true : undefined} aria-describedby={shown('wages', wages) ? 'gr-wages-err' : 'gr-wages-help'} />
            </div>
            {shown('wages', wages) ? (
              <p id="gr-wages-err" className={ERR}>
                {shown('wages', wages)}
              </p>
            ) : (
              <p id="gr-wages-help" className="mt-1.5 text-sm text-muted">
                Basic pay plus dearness allowance, or the “wages” figure your employer uses. The new labour codes may count more than basic pay.
              </p>
            )}
          </div>

          <Segmented
            legend="Your job"
            options={[
              { value: 'permanent' as const, label: 'Permanent' },
              { value: 'fixed' as const, label: 'Fixed-term contract' },
            ]}
            value={employment}
            onChange={setEmployment}
          />
          <Segmented
            legend="Why you are leaving"
            options={[
              { value: 'leaving' as const, label: 'Leaving the job' },
              { value: 'death-disability' as const, label: 'Death or disability' },
            ]}
            value={reason}
            onChange={setReason}
          />
        </div>

        <div className="space-y-4 lg:sticky lg:top-24" aria-live="polite">
          {o ? <Result o={o} employment={employment} reason={reason} /> : <Empty />}
        </div>
      </div>

      <section aria-labelledby="gr-rules" className="rounded-xl2 border border-hair bg-surface p-5 sm:p-6">
        <h2 id="gr-rules" className="font-display text-lg font-bold text-ink">
          Rules this uses (checked {RULES_AS_OF})
        </h2>
        <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm text-strong">
          <li>Gratuity = last drawn wages × 15 × years of service ÷ 26.</li>
          <li>A part-year of <strong>more than six months</strong> counts as a full year. Exactly six months does not.</li>
          <li>
            You need {MIN_YEARS.permanent} years of service ({MIN_YEARS.fixed} year on a fixed-term contract). On death or disability there is no minimum.
          </li>
          <li>The Act’s maximum is {rupees(BigInt(GRATUITY_CAP_RUPEES))}. An employer may pay more.</li>
          <li>“Wages” is basic pay plus dearness allowance. The new labour codes, in force from 21 November 2025, widen what counts, so use the figure your employer uses.</li>
          <li>Employers not covered by the Act, and income tax, are not worked out here.</li>
        </ul>
        <p className="mt-3 text-sm text-muted">These come from public sources and rules can change. This is an estimate, not legal or tax advice. Nothing you type leaves your browser.</p>
      </section>
    </div>
  );
}

function Empty() {
  return (
    <div className="rounded-xl2 border border-dashed border-hair bg-surface px-5 py-10 text-center text-sm text-muted" data-testid="gratuity-empty">
      Enter your joining date, last working day and monthly wages to see your gratuity.
    </div>
  );
}

function Result({ o, employment, reason }: { o: GratuityOutcome; employment: Employment; reason: Reason }) {
  const years = o.service.years;
  const rounded = o.counted !== years;
  return (
    <>
      {o.eligible ? (
        <div className="rounded-xl border border-teal-300 bg-tealx-100 px-5 py-4" data-testid="gratuity-result">
          <p className="text-sm font-medium text-strong">Your gratuity</p>
          <div className="mt-1 flex items-center justify-between gap-3">
            <p className="font-display text-3xl font-extrabold text-ink">{rupees(o.amount ?? BigInt(0))}</p>
            <CopyButton value={summary(o)} />
          </div>
          <dl className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between gap-3 border-b border-hair pb-2">
              <dt className="text-muted">Service</dt>
              <dd className="text-right font-semibold text-ink">{serviceLabel(o.service)}</dd>
            </div>
            <div className="flex justify-between gap-3 border-b border-hair pb-2">
              <dt className="text-muted">Years counted</dt>
              <dd className="text-right font-semibold text-ink">
                {o.counted}
                {rounded && <span className="font-normal text-muted"> (more than 6 months of the last year counts as a full year)</span>}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted">Worked out</dt>
              <dd className="text-right font-semibold text-ink">{o.working}</dd>
            </div>
          </dl>
        </div>
      ) : (
        <div className="rounded-xl border border-yellow-300 bg-yellowx-100 px-5 py-4" data-testid="gratuity-not-yet" role="status">
          <p className="font-display text-lg font-bold text-ink">Not eligible yet</p>
          <p className="mt-1 text-sm text-strong">
            You have {serviceLabel(o.service)} of service. {employment === 'fixed' ? 'A fixed-term contract needs' : 'A permanent job needs'} {o.minYears} {o.minYears === 1 ? 'year' : 'years'}. That is complete on{' '}
            <strong>{o.eligibleOn}</strong>, if you are still working then.
          </p>
          {employment === 'permanent' && o.service.years === 4 && o.service.months >= 8 && (
            <p className="mt-2 text-sm text-strong">Some employers pay from 4 years and 8 months. The Act says five years, so ask your HR whether they count it.</p>
          )}
        </div>
      )}

      {o.eligible && o.capped && o.uncapped !== null && (
        <p className={NOTE} role="status">
          The formula gives {rupees(o.uncapped)}, but the Act’s maximum is {rupees(BigInt(GRATUITY_CAP_RUPEES))}. Your employer may choose to pay more.
        </p>
      )}
      {o.eligible && o.counted === 0 && (
        <p className={NOTE} role="status">
          Less than six months of service doesn’t count as a completed year, so the formula gives ₹0.
        </p>
      )}
      {reason === 'death-disability' && o.eligible && (
        <p className="text-sm text-muted">On death or disability there is no minimum service. The same formula applies.</p>
      )}

      <p className="text-xs leading-relaxed text-muted">
        Employers can pay more than the formula. Gratuity up to {rupees(BigInt(GRATUITY_CAP_RUPEES))} is generally exempt from income tax for employees covered by the Act, with conditions, so ask your CA about
        yours. This tool doesn’t work out tax.
      </p>
    </>
  );
}
