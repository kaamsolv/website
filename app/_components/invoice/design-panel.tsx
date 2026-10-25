'use client';

import { useEffect, useId, useState } from 'react';
import { Icon } from '../icons';
import { isHexColor, SWATCHES, TEMPLATES, textOn, type Design, type TemplateId } from '@/app/lib/invoice/design';

/**
 * Template and brand colour pickers (Pro). Used by the editor's Design panel
 * and by Invoice settings (the default for new invoices). Both are native
 * radio groups; the selected swatch shows a ✓, so it never relies on colour.
 */
export function DesignPicker({
  value,
  onChange,
  templates = true,
  color = true,
}: {
  value: Design;
  onChange: (d: Design) => void;
  templates?: boolean;
  color?: boolean;
}) {
  const name = useId();
  const hexId = useId();
  const [hex, setHex] = useState(value.color);
  useEffect(() => setHex(value.color), [value.color]);
  const hexBad = hex.trim() !== '' && !isHexColor(normalHex(hex));

  return (
    <div className="space-y-5">
      {templates && (
        <fieldset>
          <legend className="mb-2 text-sm font-semibold text-ink">Template</legend>
          <div className="grid max-w-md grid-cols-3 gap-2 sm:gap-3">
            {TEMPLATES.map((t) => (
              <label key={t.id} className="relative cursor-pointer">
                <input
                  type="radio"
                  name={`${name}-t`}
                  checked={value.template === t.id}
                  onChange={() => onChange({ ...value, template: t.id })}
                  className="peer sr-only"
                />
                <span className="block rounded-xl border-2 border-hair p-1.5 transition-colors hover:border-strong peer-checked:border-coral-500 peer-focus-visible:ring-2 peer-focus-visible:ring-coral-500 peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-surface">
                  <Thumb template={t.id} color={value.color} />
                  <span className="mt-1.5 flex items-center justify-center gap-1 text-sm font-semibold text-ink">
                    {value.template === t.id && <Icon name="check" className="h-3.5 w-3.5 text-teal-500" />}
                    {t.label}
                  </span>
                </span>
                <span className="sr-only">{t.hint}</span>
              </label>
            ))}
          </div>
        </fieldset>
      )}

      {color && (
        <fieldset>
          <legend className="mb-2 text-sm font-semibold text-ink">Brand colour</legend>
          <div className="flex flex-wrap items-center gap-2">
            {SWATCHES.map((sw) => {
              const checked = value.color.toUpperCase() === sw.hex;
              return (
                <label key={sw.hex} className="relative cursor-pointer" title={sw.name}>
                  <input
                    type="radio"
                    name={`${name}-c`}
                    checked={checked}
                    onChange={() => onChange({ ...value, color: sw.hex })}
                    className="peer sr-only"
                    aria-label={sw.name}
                  />
                  <span
                    className="grid h-11 w-11 place-items-center rounded-full border-2 border-surface shadow-[0_0_0_1px_var(--color-muted)] peer-checked:shadow-[0_0_0_2px_var(--color-ink)] peer-focus-visible:ring-2 peer-focus-visible:ring-coral-500 peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-surface"
                    style={{ backgroundColor: sw.hex, color: textOn(sw.hex) }}
                  >
                    {checked && <Icon name="check" className="h-4 w-4" />}
                  </span>
                </label>
              );
            })}
            <div className="flex items-center gap-2">
              <label htmlFor={hexId} className="sr-only">
                Custom colour (hex, like #FE6336)
              </label>
              <input
                id={hexId}
                value={hex}
                maxLength={7}
                spellCheck={false}
                autoComplete="off"
                aria-invalid={hexBad || undefined}
                aria-describedby={hexBad ? `${hexId}-err` : undefined}
                onChange={(e) => {
                  setHex(e.target.value);
                  const v = normalHex(e.target.value);
                  if (isHexColor(v)) onChange({ ...value, color: v });
                }}
                placeholder="#FE6336"
                className="h-11 w-28 rounded-lg border border-hair bg-fieldbg px-3 font-mono text-sm uppercase text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-500"
              />
            </div>
          </div>
          {hexBad && (
            <p id={`${hexId}-err`} className="mt-1.5 text-sm font-medium text-danger-600">
              Use a colour like #FE6336.
            </p>
          )}
        </fieldset>
      )}
    </div>
  );
}

/** "fe6336" or "#fe6336" → "#FE6336". */
function normalHex(v: string): string {
  const t = v.trim().toUpperCase();
  return t.startsWith('#') ? t : `#${t}`;
}

/** A tiny sketch of each template, in the chosen colour, on white paper. */
function Thumb({ template, color }: { template: TemplateId; color: string }) {
  const bar = 'h-1 rounded-full bg-[#D5DAE4]';
  return (
    <span className="block aspect-[4/3] overflow-hidden rounded-md border border-[#E3E7EF] bg-white p-2 [color-scheme:light]" aria-hidden="true">
      {template === 'bold' ? (
        <span className="-mx-2 -mt-2 mb-1.5 block h-3.5" style={{ backgroundColor: color }} />
      ) : (
        <span className="mb-1.5 flex justify-end">
          <span className={`${template === 'minimal' ? 'w-5' : 'w-7'} h-1.5 rounded-full bg-[#0C2248]`} />
        </span>
      )}
      <span className={`${bar} mb-1 block w-1/2`} />
      {template === 'classic' ? (
        <span className="mb-1.5 block h-0.5 w-3" style={{ backgroundColor: color }} />
      ) : (
        <span className="mb-1.5 block h-px w-full bg-[#E3E7EF]" />
      )}
      <span
        className="mb-1 block h-1.5 w-full"
        style={
          template === 'bold'
            ? { backgroundColor: color }
            : { backgroundColor: template === 'minimal' ? 'transparent' : '#F3F5FA', borderBottom: `1px solid ${color}` }
        }
      />
      <span className={`${bar} mb-0.5 block w-full`} />
      <span className={`${bar} mb-1 block w-full`} />
      <span className="flex justify-end">
        <span className="block h-1.5 w-2/5" style={template === 'bold' ? { backgroundColor: color } : { borderTop: `1px solid ${color}` }} />
      </span>
    </span>
  );
}
