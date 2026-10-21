'use client';

import { useId } from 'react';
import { Icon } from './icons';

/**
 * Single-choice controls shared by every tool. Two looks, one behaviour:
 *
 * - `Segmented` — a joined bar for switching *mode* (Add / Remove GST,
 *   Years / Months). 2–3 short options.
 * - `Chips` — separate pills for picking a *value* from a list (GST rates,
 *   KB sizes, cases). The selected chip shows a ✓, so selection never relies
 *   on colour alone.
 *
 * Both are native radio groups (fieldset + legend + hidden radios): screen
 * readers announce "radio, 2 of 3, selected", and arrow keys move between
 * options. Selected colours use the theme-aware `activebg` / `activetext`
 * tokens from the design system (navy on light, near-white on dark).
 * Hover only changes *unselected* options: every hover colour has a
 * `peer-checked:hover:` twin that keeps the selected colours, which win on
 * specificity — otherwise hovering the selected option hid its text.
 * `value` may match no option (e.g. a custom amount) — then nothing is selected.
 */

export type ChoiceOption<T> = { value: T; label: React.ReactNode };

type Props<T> = {
  legend: string;
  /** Visually hide the legend when a visible label already sits above. */
  hideLegend?: boolean;
  options: ChoiceOption<T>[];
  value: T | undefined;
  onChange: (value: T) => void;
  disabled?: boolean;
  className?: string;
};

const LEGEND = 'mb-2 text-sm font-semibold text-ink';
const FOCUS = 'peer-focus-visible:ring-2 peer-focus-visible:ring-coral-500 peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-surface';

export function Segmented<T>({ legend, hideLegend, options, value, onChange, disabled, className = '' }: Props<T>) {
  const name = useId();
  return (
    <fieldset disabled={disabled} className={className}>
      <legend className={hideLegend ? 'sr-only' : LEGEND}>{legend}</legend>
      <div className="flex w-full rounded-full border border-hair bg-wash p-1 sm:inline-flex sm:w-auto">
        {options.map((o, i) => (
          <label key={i} className="relative min-w-0 flex-1 sm:flex-none">
            <input
              type="radio"
              name={name}
              checked={value === o.value}
              onChange={() => onChange(o.value)}
              className="peer sr-only"
            />
            <span
              className={`flex min-h-10 cursor-pointer items-center justify-center rounded-full px-4 py-1.5 text-center text-sm font-semibold leading-tight text-strong transition-colors hover:bg-surface hover:text-ink peer-checked:bg-activebg peer-checked:text-activetext peer-checked:shadow-soft peer-checked:hover:bg-activebg peer-checked:hover:text-activetext peer-disabled:cursor-not-allowed peer-disabled:opacity-60 ${FOCUS}`}
            >
              {o.label}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function Chips<T>({ legend, hideLegend, options, value, onChange, disabled, className = '' }: Props<T>) {
  const name = useId();
  return (
    <fieldset disabled={disabled} className={className}>
      <legend className={hideLegend ? 'sr-only' : LEGEND}>{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((o, i) => {
          const checked = value === o.value;
          return (
            <label key={i} className="relative">
              <input
                type="radio"
                name={name}
                checked={checked}
                onChange={() => onChange(o.value)}
                className="peer sr-only"
              />
              <span
                className={`inline-flex h-10 cursor-pointer items-center gap-1.5 rounded-full border border-hair bg-wash px-4 text-sm font-semibold text-strong transition-colors hover:border-muted hover:text-ink peer-checked:border-activebg peer-checked:bg-activebg peer-checked:text-activetext peer-checked:hover:border-activebg peer-checked:hover:text-activetext peer-disabled:cursor-not-allowed peer-disabled:opacity-60 ${FOCUS}`}
              >
                {checked && <Icon name="check" className="-ml-1 h-4 w-4" />}
                {o.label}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
