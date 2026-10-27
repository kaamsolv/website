'use client';

import { useState } from 'react';
import { CopyButton } from '../copy-button';
import { useToolSuccess } from '../use-tool-success';
import { CARD, FIELD } from './everyday-calculators';
import { amountWords, figuresIndian, parseAmountText } from '@/app/lib/invoice/words';

const EXAMPLES = ['1,25,000', '1180.50', '10,00,000', '2,50,00,000'];

/** One result line with its own Copy button. Empty until the amount is valid. */
function WordsResult({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="rounded-xl border border-teal-300 bg-tealx-100 px-5 py-4">
      <p className="text-sm font-medium text-strong">{label}</p>
      {/* Phone: the words get the full width and Copy sits underneath; wider screens: side by side. */}
      <div className="mt-1 flex flex-col items-start gap-3 sm:flex-row sm:justify-between">
        <p className="min-w-0 break-words font-display text-xl font-extrabold text-ink sm:text-2xl">{value ?? '—'}</p>
        {value && <CopyButton value={value} className="shrink-0" />}
      </div>
    </div>
  );
}

/**
 * Amount in figures → Indian words (lakh, crore), live as you type. All of it runs
 * in the browser; nothing is sent anywhere. Parsing and wording are exact text work
 * (app/lib/invoice/words.ts): no floating point, so paise never drift.
 */
export function IndianNumberToWords() {
  const [text, setText] = useState('');
  const parsed = parseAmountText(text);
  const done = parsed.ok;
  useToolSuccess(done, 'utility');

  const figures = parsed.ok ? figuresIndian(parsed.parts) : null;
  const error = !parsed.ok && !parsed.empty ? parsed.message : null;

  return (
    <div className={`${CARD} space-y-5`}>
      <div>
        <label htmlFor="ntw-amount" className="mb-1.5 block text-sm font-semibold text-ink">
          Amount in figures
        </label>
        <div className="relative">
          <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-base font-semibold text-muted" aria-hidden="true">
            ₹
          </span>
          <input
            id="ntw-amount"
            inputMode="decimal"
            autoComplete="off"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="1,25,000.50"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? 'ntw-amount-err' : 'ntw-amount-hint'}
            className={`${FIELD} pl-9`}
          />
        </div>
        {error ? (
          <p id="ntw-amount-err" role="alert" className="mt-1.5 text-sm font-medium text-danger-700">
            {error}
          </p>
        ) : (
          <p id="ntw-amount-hint" className="mt-1.5 text-sm text-muted">
            {figures ? (
              <>
                Reads as <span className="font-semibold text-ink">₹{figures}</span>
              </>
            ) : (
              <>Type or paste an amount. Commas, ₹ and paise (up to 2 decimals) are fine.</>
            )}
          </p>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted">Try</span>
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              type="button"
              onClick={() => setText(ex)}
              className="min-h-9 rounded-full border border-hair px-3 text-sm font-semibold text-strong transition-colors hover:bg-wash focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-500"
            >
              {ex}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-3" aria-live="polite">
        <WordsResult label="Cheque style" value={parsed.ok ? amountWords(parsed.parts, 'cheque') : null} />
        <WordsResult label="Just the words" value={parsed.ok ? amountWords(parsed.parts, 'plain') : null} />
      </div>
    </div>
  );
}
