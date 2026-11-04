'use client';

import { FIELD } from './everyday-calculators';
import { useInfo } from './info-tip';
import { parseAmount } from '@/app/lib/calc/everyday';

/**
 * A number you can drag or type: a labelled slider with its smallest and largest value underneath, and a box beside the
 * label for the exact figure. They stay in step: dragging fills the box, typing moves the slider (to its nearest end if the
 * typed number is outside the slider's range, while the typed number itself is still used). The box keeps the page's field
 * id, so the typed value is what a screen reader and a keyboard user work with; the slider is an extra way to reach it.
 */
export function SliderField({
  id,
  label,
  value,
  onChange,
  min,
  max,
  step,
  prefix,
  suffix,
  minLabel,
  maxLabel,
  group = false,
  placeholder,
  info,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  min: number;
  max: number;
  step: number;
  prefix?: string;
  suffix?: string;
  minLabel: string;
  maxLabel: string;
  /** Show the number with Indian digit grouping while dragging (amounts). */
  group?: boolean;
  placeholder?: string;
  /** Plain-words help, opened by a small "i" next to the label. */
  info?: string;
}) {
  const { button: infoButton, note: infoNote } = useInfo(info);
  const n = parseAmount(value);
  const invalid = value.trim() !== '' && Number.isNaN(n);
  const sliderValue = Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : min;
  const show = (v: number) => (group ? v.toLocaleString('en-IN') : String(v));
  const valueText = `${prefix ?? ''}${Number.isFinite(n) ? show(n) : ''}${suffix ? ` ${suffix}` : ''}`.trim();

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <label htmlFor={id} className="text-sm font-semibold text-ink">
            {label}
          </label>
          {infoButton}
        </div>
        <div className="relative w-36 shrink-0">
          {prefix && <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-muted">{prefix}</span>}
          <input
            id={id}
            inputMode="decimal"
            autoComplete="off"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            aria-invalid={invalid || undefined}
            aria-describedby={invalid ? `${id}-err` : undefined}
            className={`${FIELD} !h-10 !text-right !text-sm ${prefix ? '!pl-7' : ''} ${suffix ? '!pr-9' : ''}`}
          />
          {suffix && <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-muted">{suffix}</span>}
        </div>
      </div>
      {infoNote}
      <input
        id={`${id}-slider`}
        type="range"
        aria-label={`${label}, slider`}
        aria-valuetext={valueText || undefined}
        min={min}
        max={max}
        step={step}
        value={sliderValue}
        onChange={(e) => onChange(show(Number(e.target.value)))}
        className="mt-1 block h-8 w-full cursor-pointer accent-coral-500"
      />
      <div className="-mt-1 flex justify-between text-[11px] text-muted" aria-hidden="true">
        <span>{minLabel}</span>
        <span>{maxLabel}</span>
      </div>
      {invalid && (
        <p id={`${id}-err`} className="mt-1 text-xs font-medium text-danger-700">
          Enter a number, like 2500 or 12.5.
        </p>
      )}
    </div>
  );
}
