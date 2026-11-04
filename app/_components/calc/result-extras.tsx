'use client';

import { useEffect, useRef, useState } from 'react';
import { Icon } from '../icons';
import { Chips, Segmented } from '../choice';
import { WHATSAPP_BUTTON } from '../whatsapp-style';
import { InfoHeading, useInfo } from './info-tip';
import { SliderField } from './slider-field';
import { readShare, type ShareValues } from '@/app/lib/calc/share-state';
import { SITE_ORIGIN } from '@/app/lib/site-urls';

/** Plain-words explanations shown behind the small "i" buttons. Short, no jargon, no advice. */
export const HELP = {
  today: "Prices go up over the years, so ₹1 crore later buys less than ₹1 crore now. Switch this on to see roughly what the final amount would buy in today's terms.",
  inflation: "How much prices rise in a year, on average. Around 5 to 6% is a common guess for India. Change it to see the effect.",
  tax: "Interest you earn is added to your income and taxed. Pick the percentage you pay on your income (your tax slab) and we'll estimate the tax. It's only an estimate: TDS, rebates and extra charges aren't worked out.",
  compounding: "How often the bank adds interest to your balance. The more often, the slightly more you earn, because earlier interest starts earning interest too. Most banks use quarterly.",
  goal: "The amount you want to have at the end. The calculator works backwards to tell you what to put in.",
} as const;

/** Print / save as PDF, for results that must not go into a link. */
export function PrintAction() {
  return (
    <div className="flex flex-wrap items-center gap-2.5" data-print-hide data-testid="result-actions">
      <button
        type="button"
        onClick={() => window.print()}
        data-testid="print-result"
        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-hair bg-surface px-4 text-sm font-semibold text-strong transition-colors hover:bg-wash focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-500 focus-visible:ring-offset-2"
      >
        Print / save as PDF
      </button>
    </div>
  );
}

export type CalcMode = 'value' | 'goal';

/** "Find my value | Reach a goal". */
export function ModeToggle({ mode, onChange, goalLabel = 'Reach a goal' }: { mode: CalcMode; onChange: (m: CalcMode) => void; goalLabel?: string }) {
  return (
    <Segmented
      legend="What do you want to work out?"
      hideLegend
      options={[
        { value: 'value' as const, label: 'Find my value' },
        { value: 'goal' as const, label: goalLabel },
      ]}
      value={mode}
      onChange={onChange}
    />
  );
}

/** A switch for the today's-money view; the inflation slider appears only when it is on. */
export function TodayMoneyField({ id, on, onToggle, rate, onRate }: { id: string; on: boolean; onToggle: (v: boolean) => void; rate: string; onRate: (v: string) => void }) {
  const { button: infoButton, note: infoNote } = useInfo(HELP.today);
  return (
    <div className="space-y-3 rounded-xl border border-hair bg-wash/60 p-3">
      <div className="flex items-center justify-between gap-3">
        <label className="flex min-h-10 cursor-pointer items-center gap-3 text-sm font-semibold text-ink">
          <input type="checkbox" id={`${id}-today`} checked={on} onChange={(e) => onToggle(e.target.checked)} className="h-5 w-5 accent-coral-500" />
          Show it in today&apos;s money
        </label>
        {infoButton}
      </div>
      {infoNote}
      {on && <SliderField id={`${id}-infl`} label="Prices rise each year by" value={rate} onChange={onRate} min={0} max={12} step={0.5} suffix="%" minLabel="0%" maxLabel="12%" info={HELP.inflation} />}
    </div>
  );
}

const TAX_CHOICES = [0, 5, 10, 20, 30];

/** Your tax rate, for the after-tax estimate (FD, RD). The user picks it; no slab rules are built in. */
export function TaxField({ tax, onChange }: { tax: number; onChange: (n: number) => void }) {
  return (
    <div className="space-y-2">
      <InfoHeading info={HELP.tax}>Your tax rate on the interest (optional)</InfoHeading>
      <Chips legend="Your tax rate on the interest" hideLegend options={TAX_CHOICES.map((n) => ({ value: n, label: n === 0 ? 'No tax' : `${n}%` }))} value={tax} onChange={onChange} />
      {tax > 0 && <p className="mt-1.5 text-xs text-muted">A simple estimate at the rate you choose. TDS, rebates, surcharge and cess are not worked out.</p>}
    </div>
  );
}

/** One "what if" line, with a tap to try it. */
export type Nudge = { text: string; apply: () => void };

export function Nudges({ items }: { items: Nudge[] }) {
  if (items.length === 0) return null;
  return (
    <div data-testid="nudges" data-print-hide>
      <h3 className="text-sm font-bold text-ink">What if?</h3>
      <ul className="mt-2 space-y-2">
        {items.map((n) => (
          <li key={n.text} className="flex items-center justify-between gap-3 rounded-xl border border-hair px-3 py-2 text-sm text-strong">
            <span className="min-w-0">{n.text}</span>
            <button type="button" onClick={n.apply} className="min-h-9 shrink-0 rounded-full border border-hair px-3 text-xs font-semibold text-ink hover:bg-wash focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-500">
              Try it
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Share this exact answer: WhatsApp with the numbers and a link that opens the calculator filled in, a copy of that
 * link, and Print / save as PDF. The link holds only the numbers typed here; nothing is sent to KaamSolv.
 */
export function ResultActions({ message, query, path }: { message: string; query: string; path: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  const url = `${SITE_ORIGIN}${path}${query ? `?${query}` : ''}`;
  const whatsapp = `https://wa.me/?text=${encodeURIComponent(`${message}\n${url}`)}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      return;
    }
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 2200);
  }

  const small = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-hair bg-surface px-4 text-sm font-semibold text-strong transition-colors hover:bg-wash focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-500 focus-visible:ring-offset-2';
  return (
    <div className="flex flex-wrap items-center gap-2.5" data-print-hide data-testid="result-actions">
      <a href={whatsapp} target="_blank" rel="noopener noreferrer" data-testid="share-whatsapp-result" className={`${WHATSAPP_BUTTON} !min-h-11 !px-4 text-sm`}>
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden="true">
          <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38a9.9 9.9 0 0 0 4.74 1.21h.01c5.46 0 9.91-4.45 9.91-9.91A9.84 9.84 0 0 0 12.04 2zm4.52 11.99c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.12-.17.25-.64.81-.78.97-.14.17-.29.19-.54.06-.25-.12-1.05-.39-2-1.23-.74-.66-1.23-1.47-1.38-1.72-.14-.25-.02-.38.11-.5.11-.11.25-.29.37-.43.12-.14.17-.25.25-.41.08-.17.04-.31-.02-.43-.06-.12-.56-1.34-.76-1.84-.2-.48-.4-.42-.56-.43h-.48c-.17 0-.43.06-.66.31-.23.25-.87.85-.87 2.07 0 1.22.89 2.4 1.01 2.56.12.17 1.75 2.67 4.23 3.74.59.26 1.05.41 1.41.52.59.19 1.13.16 1.56.1.48-.07 1.47-.6 1.67-1.18.21-.58.21-1.07.14-1.18-.06-.1-.23-.16-.48-.29z" />
        </svg>
        Share my result
      </a>
      <button type="button" onClick={copy} className={small} data-testid="share-copy-result" aria-live="polite">
        <Icon name={copied ? 'check' : 'copy'} className="h-4 w-4" />
        {copied ? 'Link copied' : 'Copy link with my numbers'}
      </button>
      <button type="button" onClick={() => window.print()} className={small} data-testid="print-result">
        Print / save as PDF
      </button>
    </div>
  );
}

/** The numbers in the page address, read once after the page loads (so the server and first paint stay the same). */
export function useSharedValues(apply: (v: ShareValues) => void) {
  const done = useRef(false);
  useEffect(() => {
    if (done.current) return;
    done.current = true;
    const v = readShare(window.location.search);
    if (Object.keys(v).length > 0) apply(v);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
