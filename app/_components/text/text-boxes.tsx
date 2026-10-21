'use client';

import { CopyButton } from '../copy-button';

const BOX =
  'block w-full resize-y rounded-xl border border-hair bg-fieldbg px-4 py-3 text-base leading-relaxed text-ink placeholder:text-faint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-500';

/** Labelled text area with a Clear button — the input for every writing tool. */
export function TextInput({
  id,
  label,
  value,
  onChange,
  placeholder = 'Type or paste your text here…',
  rows = 10,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <div>
      <div className="mb-2 flex items-end justify-between gap-3">
        <label htmlFor={id} className="text-sm font-semibold text-ink">
          {label}
        </label>
        {value && (
          <button
            type="button"
            onClick={() => onChange('')}
            className="rounded text-sm font-semibold text-coral-600 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-500"
          >
            Clear
          </button>
        )}
      </div>
      <textarea
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        spellCheck
        className={BOX}
      />
    </div>
  );
}

/** Read-only result with a Copy button. */
export function TextOutput({
  id,
  label,
  value,
  placeholder = 'Your result will appear here.',
  rows = 10,
}: {
  id: string;
  label: string;
  value: string;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <div>
      <div className="mb-2 flex items-end justify-between gap-3">
        <label htmlFor={id} className="text-sm font-semibold text-ink">
          {label}
        </label>
        {value && <CopyButton value={value} />}
      </div>
      <textarea id={id} value={value} readOnly placeholder={placeholder} rows={rows} className={`${BOX} bg-surface`} />
    </div>
  );
}
