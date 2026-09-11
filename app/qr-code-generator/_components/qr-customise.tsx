'use client';

import { Icon } from '@/app/_components/icons';
import {
  DEFAULT_QR_STYLE,
  LOGO_TYPES,
  MAX_LOGO_BYTES,
  QR_EC_LEVELS,
  QR_FG_PRESETS,
  QR_SIZES,
  type QrEcLevel,
  type QrSize,
  type QrStyle,
} from '@/app/lib/qr/types';
import { EC_OPTIONS, SIZE_OPTIONS, effectiveErrorCorrection } from '@/app/lib/qr/style';
import { isHexColor } from '@/app/lib/qr/validate';

type Props = {
  style: QrStyle;
  onStyleChange: (style: QrStyle) => void;
  hasLogo: boolean;
  logoName: string | null;
  logoError: string | null;
  onLogoPick: (file: File | null) => void;
  styleWarning: string | null;
};

export function QrCustomise({
  style,
  onStyleChange,
  hasLogo,
  logoName,
  logoError,
  onLogoPick,
  styleWarning,
}: Props) {
  const ecLocked = hasLogo;
  const effectiveEc = effectiveErrorCorrection(style.errorCorrection, hasLogo);

  return (
    <details className="group border-t border-hair pt-4">
      <summary className="accordion-trigger flex cursor-pointer list-none items-center justify-between text-sm font-semibold text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-500">
        Customise appearance (optional)
        <Icon name="chevron-right" className="chev h-4 w-4 transition-transform group-open:rotate-90" />
      </summary>

      <div className="space-y-5 pt-4">
        <div>
          <p className="text-xs font-semibold text-ink">Foreground</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {QR_FG_PRESETS.map((preset) => (
              <button
                key={preset.value}
                type="button"
                title={preset.label}
                aria-label={`Foreground ${preset.label}`}
                aria-pressed={style.fg === preset.value}
                onClick={() => onStyleChange({ ...style, fg: preset.value })}
                className={`h-9 w-9 rounded-full ring-2 ring-offset-2 ring-offset-surface focus-visible:outline-none focus-visible:ring-coral-500 ${
                  style.fg === preset.value ? 'ring-ink' : 'ring-transparent'
                }`}
                style={{ backgroundColor: preset.value }}
              />
            ))}
            <label className="flex items-center gap-2 text-xs text-muted">
              <span className="sr-only">Custom foreground colour</span>
              <input
                type="color"
                value={isHexColor(style.fg) ? style.fg : DEFAULT_QR_STYLE.fg}
                onChange={(e) => onStyleChange({ ...style, fg: e.target.value })}
                className="h-9 w-9 cursor-pointer rounded border border-hair bg-fieldbg p-0.5"
              />
              Custom
            </label>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="qr-bg-colour" className="text-xs font-semibold text-ink">Background</label>
            <div className="mt-2 flex items-center gap-2">
              <input
                id="qr-bg-colour"
                type="color"
                disabled={style.transparent}
                value={isHexColor(style.bg) ? style.bg : '#FFFFFF'}
                onChange={(e) => onStyleChange({ ...style, bg: e.target.value, transparent: false })}
                className="h-9 w-9 cursor-pointer rounded border border-hair bg-fieldbg p-0.5 disabled:opacity-40"
              />
              <label className="flex items-center gap-2 text-xs text-strong">
                <input
                  type="checkbox"
                  checked={style.transparent}
                  onChange={(e) =>
                    onStyleChange({
                      ...style,
                      transparent: e.target.checked,
                      bg: e.target.checked ? '#FFFFFF' : style.bg || '#FFFFFF',
                    })
                  }
                  className="h-4 w-4 rounded border-hair"
                />
                Transparent (PNG/SVG)
              </label>
            </div>
          </div>

          <div>
            <label htmlFor="qr-size" className="text-xs font-semibold text-ink">Download size</label>
            <select
              id="qr-size"
              value={style.size}
              onChange={(e) => {
                const n = Number(e.target.value) as QrSize;
                if ((QR_SIZES as readonly number[]).includes(n)) {
                  onStyleChange({ ...style, size: n });
                }
              }}
              className="mt-2 h-10 w-full rounded-lg border border-hair bg-fieldbg px-3 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-500"
            >
              {SIZE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label htmlFor="qr-ec" className="text-xs font-semibold text-ink">Error correction</label>
          <select
            id="qr-ec"
            value={effectiveEc}
            disabled={ecLocked}
            onChange={(e) => {
              const v = e.target.value;
              if ((QR_EC_LEVELS as readonly string[]).includes(v)) {
                onStyleChange({ ...style, errorCorrection: v as QrEcLevel });
              }
            }}
            aria-describedby="qr-ec-help"
            className="mt-2 h-10 w-full rounded-lg border border-hair bg-fieldbg px-3 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-500 disabled:opacity-60"
          >
            {EC_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <p id="qr-ec-help" className="mt-1.5 text-xs text-muted">
            {ecLocked
              ? 'High (H) is on while a logo is present — it keeps the code scannable.'
              : EC_OPTIONS.find((o) => o.value === style.errorCorrection)?.hint}
          </p>
        </div>

        <div>
          <p className="text-xs font-semibold text-ink">Logo (optional)</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-lg border border-dashed border-hair px-3 text-xs font-semibold text-muted hover:bg-wash focus-within:ring-2 focus-within:ring-coral-500">
              <Icon name="upload" className="h-4 w-4" />
              {logoName ? 'Change logo' : 'Upload image'}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="sr-only"
                onChange={(e) => onLogoPick(e.target.files?.[0] ?? null)}
              />
            </label>
            {hasLogo && (
              <button
                type="button"
                onClick={() => onLogoPick(null)}
                className="h-10 rounded-lg border border-hair px-3 text-xs font-semibold text-strong hover:bg-wash"
              >
                Remove logo
              </button>
            )}
          </div>
          {logoName && <p className="mt-1 text-xs text-muted truncate">{logoName}</p>}
          {logoError && (
            <p role="alert" className="mt-1.5 text-xs font-medium text-danger-700">{logoError}</p>
          )}
          <p className="mt-1.5 text-xs text-muted">
            PNG or JPG, up to {Math.round(MAX_LOGO_BYTES / 1024)} KB. Logo shows in the PNG preview; SVG is QR-only.
          </p>
        </div>

        {styleWarning && (
          <p role="status" className="rounded-lg border border-yellow-300 bg-yellowx-100 px-3 py-2 text-xs font-medium text-yellowx-600">
            {styleWarning}
          </p>
        )}
      </div>
    </details>
  );
}
