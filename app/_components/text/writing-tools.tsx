'use client';

import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { OnDeviceNote } from '../image/on-device-note';
import { TextInput, TextOutput } from './text-boxes';
import { CHARACTER_LIMITS, countCharacters, countWords, formatDuration, LIMITS_CHECKED, textStats } from '@/app/lib/text/count';
import { CASES, convertCase, type CaseId } from '@/app/lib/text/case';
import { CLEAN_OPTIONS, cleanText, DEFAULT_CLEAN_OPTIONS, type CleanOptions } from '@/app/lib/text/clean';
import { clampCount, generateLorem, LOREM_LIMITS, type LoremUnit } from '@/app/lib/text/lorem';

const nf = new Intl.NumberFormat('en-IN');

const PILL = (active: boolean) =>
  `h-9 rounded-full px-3.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-500 ${
    active ? 'bg-navy-900 text-white' : 'border border-hair bg-fieldbg text-strong hover:bg-wash'
  }`;

function Stat({ label, value, big = false }: { label: string; value: string; big?: boolean }) {
  return (
    <div className="rounded-xl border border-hair bg-surface px-4 py-3">
      <dt className="text-xs font-medium text-muted">{label}</dt>
      <dd className={`mt-0.5 font-display font-bold text-ink ${big ? 'text-3xl' : 'text-xl'}`}>{value}</dd>
    </div>
  );
}

// ---------------------------------------------------------------- Word Counter

export function WordCounter() {
  const [text, setText] = useState('');
  const deferred = useDeferredValue(text);
  const s = useMemo(() => textStats(deferred), [deferred]);

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <OnDeviceNote subject="text" />
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4" aria-live="polite">
        <Stat label="Words" value={nf.format(s.words)} big />
        <Stat label="Characters" value={nf.format(s.characters)} big />
        <Stat label="Sentences" value={nf.format(s.sentences)} big />
        <Stat label="Paragraphs" value={nf.format(s.paragraphs)} big />
      </dl>
      <TextInput id="wc-text" label="Your text" value={text} onChange={setText} rows={12} />
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Characters (no spaces)" value={nf.format(s.charactersNoSpaces)} />
        <Stat label="Lines" value={nf.format(s.lines)} />
        <Stat label="Reading time" value={formatDuration(s.readingSeconds)} />
        <Stat label="Speaking time" value={formatDuration(s.speakingSeconds)} />
      </dl>
    </div>
  );
}

// ----------------------------------------------------------- Character Counter

export function CharacterCounter() {
  const [text, setText] = useState('');
  const deferred = useDeferredValue(text);
  const chars = useMemo(() => countCharacters(deferred), [deferred]);
  const words = useMemo(() => countWords(deferred), [deferred]);

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <OnDeviceNote subject="text" />
      <dl className="grid grid-cols-2 gap-3" aria-live="polite">
        <Stat label="Characters" value={nf.format(chars)} big />
        <Stat label="Words" value={nf.format(words)} big />
      </dl>
      <TextInput id="cc-text" label="Your text" value={text} onChange={setText} rows={8} />

      <section aria-labelledby="limits-title" className="rounded-xl border border-hair bg-surface p-4 sm:p-5">
        <h2 id="limits-title" className="font-display text-lg font-bold text-ink">
          Will it fit?
        </h2>
        <ul className="mt-4 space-y-4">
          {CHARACTER_LIMITS.map((l) => {
            const over = chars > l.limit;
            const pct = Math.min(100, (chars / l.limit) * 100);
            return (
              <li key={l.id}>
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="font-semibold text-ink">{l.label}</span>
                  <span className={over ? 'font-semibold text-danger-700' : 'text-muted'}>
                    {nf.format(chars)} / {nf.format(l.limit)} ·{' '}
                    {over ? `${nf.format(chars - l.limit)} over` : `${nf.format(l.limit - chars)} left`}
                  </span>
                </div>
                <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-chip" aria-hidden="true">
                  <div
                    className={`h-full rounded-full ${over ? 'bg-danger-600' : pct > 90 ? 'bg-yellow-500' : 'bg-teal-500'}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                {l.note && <p className="mt-1 text-xs text-muted">{l.note}</p>}
              </li>
            );
          })}
        </ul>
        <p className="mt-4 text-xs text-muted">Limits checked {LIMITS_CHECKED}. Platforms change them now and then.</p>
      </section>
    </div>
  );
}

// -------------------------------------------------------------- Case Converter

export function CaseConverter() {
  const [text, setText] = useState('');
  const [mode, setMode] = useState<CaseId>('sentence');
  const output = useMemo(() => convertCase(text, mode), [text, mode]);

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <OnDeviceNote subject="text" />
      <TextInput id="case-text" label="Your text" value={text} onChange={setText} rows={7} />
      <fieldset>
        <legend className="mb-2 text-sm font-semibold text-ink">Change to</legend>
        <div className="flex flex-wrap gap-2">
          {CASES.map((c) => (
            <button
              key={c.id}
              type="button"
              aria-pressed={mode === c.id}
              title={c.example}
              onClick={() => setMode(c.id)}
              className={PILL(mode === c.id)}
            >
              {c.label}
            </button>
          ))}
        </div>
      </fieldset>
      <TextOutput id="case-output" label="Result" value={output} rows={7} />
    </div>
  );
}

// ---------------------------------------------------------------- Text Cleaner

export function TextCleaner() {
  const [text, setText] = useState('');
  const [options, setOptions] = useState<CleanOptions>(DEFAULT_CLEAN_OPTIONS);
  const output = useMemo(() => cleanText(text, options), [text, options]);
  const removed = countCharacters(text) - countCharacters(output);

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <OnDeviceNote subject="text" />
      <TextInput id="clean-text" label="Messy text" value={text} onChange={setText} rows={8} />

      <fieldset className="rounded-xl border border-hair bg-surface p-4 sm:p-5">
        <legend className="px-1 text-sm font-semibold text-ink">Fix</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {CLEAN_OPTIONS.map((o) => (
            <label key={o.id} className="flex cursor-pointer items-start gap-2.5">
              <input
                type="checkbox"
                checked={options[o.id]}
                onChange={(e) => setOptions((prev) => ({ ...prev, [o.id]: e.target.checked }))}
                className="mt-0.5 h-4 w-4 shrink-0 accent-coral-500"
              />
              <span>
                <span className="block text-sm font-semibold text-ink">{o.label}</span>
                <span className="block text-xs text-muted">{o.hint}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <TextOutput id="clean-output" label="Clean text" value={output} rows={8} />
      {text && (
        <p className="text-sm text-muted" aria-live="polite">
          {removed > 0
            ? `Cleaned up — ${nf.format(removed)} character${removed === 1 ? '' : 's'} removed.`
            : removed < 0
              ? 'Done.'
              : 'Nothing to clean with these options.'}
        </p>
      )}
    </div>
  );
}

// ------------------------------------------------------- Lorem Ipsum Generator

const UNITS: { id: LoremUnit; label: string }[] = [
  { id: 'paragraphs', label: 'Paragraphs' },
  { id: 'sentences', label: 'Sentences' },
  { id: 'words', label: 'Words' },
];

export function LoremIpsumGenerator() {
  const [unit, setUnit] = useState<LoremUnit>('paragraphs');
  const [countInput, setCountInput] = useState(String(LOREM_LIMITS.paragraphs.default));
  const [startWithLorem, setStartWithLorem] = useState(true);
  const [html, setHtml] = useState(false);
  const [seed, setSeed] = useState(0);
  const [output, setOutput] = useState('');

  const count = clampCount(unit, Number(countInput));
  const limits = LOREM_LIMITS[unit];

  // Generated on the client only, so server and browser HTML always match.
  useEffect(() => {
    setOutput(generateLorem({ unit, count, startWithLorem, html: html && unit === 'paragraphs' }));
  }, [unit, count, startWithLorem, html, seed]);

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="space-y-5 rounded-xl border border-hair bg-surface p-4 sm:p-5">
        <fieldset>
          <legend className="mb-2 text-sm font-semibold text-ink">Make</legend>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="number"
              inputMode="numeric"
              aria-label={`Number of ${unit}`}
              min={limits.min}
              max={limits.max}
              value={countInput}
              onChange={(e) => setCountInput(e.target.value)}
              onBlur={() => setCountInput(String(count))}
              className="h-9 w-24 rounded-lg border border-hair bg-fieldbg px-3 text-sm font-semibold text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-500"
            />
            {UNITS.map((u) => (
              <button
                key={u.id}
                type="button"
                aria-pressed={unit === u.id}
                onClick={() => {
                  setUnit(u.id);
                  setCountInput(String(LOREM_LIMITS[u.id].default));
                }}
                className={PILL(unit === u.id)}
              >
                {u.label}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-xs text-muted">
            {nf.format(limits.min)}–{nf.format(limits.max)} {unit}.
          </p>
        </fieldset>
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-medium text-strong">
            <input
              type="checkbox"
              checked={startWithLorem}
              onChange={(e) => setStartWithLorem(e.target.checked)}
              className="h-4 w-4 accent-coral-500"
            />
            Start with “Lorem ipsum…”
          </label>
          {unit === 'paragraphs' && (
            <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-medium text-strong">
              <input
                type="checkbox"
                checked={html}
                onChange={(e) => setHtml(e.target.checked)}
                className="h-4 w-4 accent-coral-500"
              />
              Wrap in &lt;p&gt; tags
            </label>
          )}
        </div>
        <button
          type="button"
          onClick={() => setSeed((s) => s + 1)}
          className="inline-flex h-11 items-center rounded-full bg-coral-500 px-6 text-sm font-semibold text-navy-900 hover:bg-coral-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-500 focus-visible:ring-offset-2"
        >
          Generate new text
        </button>
      </div>
      <TextOutput id="lorem-output" label="Placeholder text" value={output} rows={12} />
    </div>
  );
}
