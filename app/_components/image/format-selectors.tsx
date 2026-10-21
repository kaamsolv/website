'use client';

import type { FormatId } from '@/app/lib/image/registry/format-registry';
import type { OutputFormat } from '@/app/lib/image/types';
import {
  getGroupedInputFormats,
  getGroupedOutputFormats,
} from '@/app/lib/image/registry/capabilities';

type Props = {
  from: FormatId;
  to: OutputFormat;
  disabled?: boolean;
  onFromChange: (format: FormatId) => void;
  onToChange: (format: OutputFormat) => void;
  onSwap: () => void;
};

const SELECT_CLASS =
  'h-11 min-w-[7.5rem] flex-1 appearance-none rounded-lg border border-hair bg-fieldbg px-3 pr-8 text-sm font-semibold text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-500 disabled:opacity-60';

function Chevron() {
  return (
    <svg
      className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-faint"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

export function FormatSelectors({
  from,
  to,
  disabled,
  onFromChange,
  onToChange,
  onSwap,
}: Props) {
  const inputGroups = getGroupedInputFormats();
  const outputGroups = getGroupedOutputFormats();

  return (
    <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3">
      <div className="relative min-w-[8rem] flex-1 sm:max-w-[11rem]">
        <label htmlFor="input-format" className="sr-only">Input format</label>
        <select
          id="input-format"
          className={SELECT_CLASS}
          value={from}
          disabled={disabled}
          onChange={(e) => onFromChange(e.target.value as FormatId)}
        >
          {inputGroups.map((g) => (
            <optgroup key={g.group} label={g.label}>
              {g.formats.map((f) => (
                <option key={f.id} value={f.id}>{f.label}</option>
              ))}
            </optgroup>
          ))}
        </select>
        <Chevron />
      </div>

      <button
        type="button"
        onClick={onSwap}
        disabled={disabled}
        className="grid h-11 w-11 shrink-0 place-items-center rounded-lg border border-hair bg-surface text-strong transition-colors hover:bg-wash focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-500 disabled:opacity-60"
        aria-label="Swap input and output formats"
        title="Swap formats"
      >
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M7 16V4M3 8l4-4 4 4M17 8v12M21 12l-4 4-4-4" />
        </svg>
      </button>

      <div className="relative min-w-[8rem] flex-1 sm:max-w-[11rem]">
        <label htmlFor="output-format" className="sr-only">Output format</label>
        <select
          id="output-format"
          className={SELECT_CLASS}
          value={to}
          disabled={disabled}
          onChange={(e) => onToChange(e.target.value as OutputFormat)}
        >
          {outputGroups.map((g) => (
            <optgroup key={g.group} label={g.label}>
              {g.formats.map((f) => (
                <option key={f.id} value={f.id}>{f.label}</option>
              ))}
            </optgroup>
          ))}
        </select>
        <Chevron />
      </div>
    </div>
  );
}
