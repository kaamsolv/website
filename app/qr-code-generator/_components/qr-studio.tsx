'use client';

import { Icon } from '@/app/_components/icons';
import {
  DEFAULT_QR_DESIGN,
  LOGO_SIZES,
  MODULE_SHAPES,
  QR_FG_PRESETS,
  type EyeShape,
  type FrameId,
  type PresetId,
  type QrDesign,
  type QrExportOptions,
  effectiveErrorCorrection,
  hasLogo,
  isEyeShape,
  isExportSize,
  isModuleShape,
} from '@/app/lib/qr/design';
import { FRAME_OPTIONS, frameHasCta, sanitizeCtaInput } from '@/app/lib/qr/frames';
import { PRESETS, applyPreset } from '@/app/lib/qr/presets';
import type { ScanabilityReport } from '@/app/lib/qr/scanability';
import { EC_OPTIONS, SIZE_OPTIONS } from '@/app/lib/qr/style';
import { QR_EC_LEVELS, type QrEcLevel, LOGO_TYPES, MAX_LOGO_BYTES } from '@/app/lib/qr/types';
import { isHexColor } from '@/app/lib/qr/validate';

const CHIP =
  'h-9 shrink-0 rounded-full border px-3 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-500';
const CHIP_ACTIVE = 'border-activebg bg-activebg text-activetext';
const CHIP_IDLE = 'border-hair text-strong hover:bg-wash';
const CHIP_SCROLL =
  'flex gap-2 overflow-x-auto overscroll-x-contain [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden md:flex-wrap md:overflow-visible';
const CHIP_BTN_TOUCH = 'touch-manipulation select-none';

type Props = {
  design: QrDesign;
  exportOptions: QrExportOptions;
  onDesignChange: (design: QrDesign) => void;
  onExportChange: (opts: QrExportOptions) => void;
  logoName: string | null;
  logoError: string | null;
  onLogoPick: (file: File | null) => void;
  scanReport: ScanabilityReport;
};

export function QrStudio({
  design,
  exportOptions,
  onDesignChange,
  onExportChange,
  logoName,
  logoError,
  onLogoPick,
  scanReport,
}: Props) {
  const logoPresent = hasLogo(design);
  const ecLocked = logoPresent;
  const effectiveEc = effectiveErrorCorrection(design.errorCorrection, logoPresent);
  const blocks = scanReport.issues.filter((i) => i.level === 'block');
  const warns = scanReport.issues.filter((i) => i.level === 'warn');

  function setFrame(id: FrameId) {
    onDesignChange({ ...design, presetId: undefined, frame: { id, ctaText: design.frame.ctaText } });
  }

  function setPreset(id: PresetId) {
    onDesignChange(applyPreset(design, id));
  }

  return (
    <div className="min-w-0">
      <p className="text-sm font-semibold text-ink">Style your QR</p>

      <div className="mt-4 space-y-4 sm:space-y-5">
        <div>
          <p className="text-xs font-semibold text-ink">Presets</p>
          <div
            className={`mt-1.5 ${CHIP_SCROLL}`}
            role="group"
            aria-label="QR style presets"
          >
            {PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                aria-pressed={design.presetId === p.id}
                onClick={() => setPreset(p.id)}
                className={`${CHIP} ${CHIP_BTN_TOUCH} ${design.presetId === p.id ? CHIP_ACTIVE : CHIP_IDLE}`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="text-xs font-semibold text-ink">Frame</p>
          <div
            className={`mt-1.5 ${CHIP_SCROLL}`}
            role="group"
            aria-label="QR frame"
          >
            {FRAME_OPTIONS.map((f) => (
              <button
                key={f.id}
                type="button"
                aria-pressed={design.frame.id === f.id}
                onClick={() => setFrame(f.id)}
                className={`${CHIP} ${CHIP_BTN_TOUCH} ${design.frame.id === f.id ? CHIP_ACTIVE : CHIP_IDLE}`}
              >
                {f.label}
              </button>
            ))}
          </div>
          {frameHasCta(design.frame.id) && (
            <div className="mt-3">
              <label htmlFor="qr-cta" className="text-xs font-semibold text-ink">CTA text</label>
              <input
                id="qr-cta"
                type="text"
                maxLength={24}
                value={design.frame.ctaText ?? ''}
                placeholder="Short label below the QR"
                onChange={(e) =>
                  onDesignChange({
                    ...design,
                    presetId: undefined,
                    frame: { ...design.frame, ctaText: sanitizeCtaInput(e.target.value) },
                  })
                }
                className="mt-1.5 h-10 w-full rounded-lg border border-hair bg-fieldbg px-3 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-500"
              />
              <p className="mt-1 text-xs text-muted">Up to 24 characters. Keep it short for print.</p>
            </div>
          )}
        </div>

        <details className="group">
          <summary className="accordion-trigger flex cursor-pointer list-none items-center justify-between text-xs font-semibold text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-500">
            More style options
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
                    aria-pressed={design.colors.fg === preset.value}
                    onClick={() =>
                      onDesignChange({
                        ...design,
                        presetId: undefined,
                        colors: { ...design.colors, fg: preset.value },
                      })
                    }
                    className={`h-9 w-9 rounded-full ring-2 ring-offset-2 ring-offset-surface focus-visible:outline-none focus-visible:ring-coral-500 ${
                      design.colors.fg === preset.value ? 'ring-ink' : 'ring-transparent'
                    }`}
                    style={{ backgroundColor: preset.value }}
                  />
                ))}
                <label className="flex items-center gap-2 text-xs text-muted">
                  <span className="sr-only">Custom foreground colour</span>
                  <input
                    type="color"
                    value={isHexColor(design.colors.fg) ? design.colors.fg : DEFAULT_QR_DESIGN.colors.fg}
                    onChange={(e) =>
                      onDesignChange({
                        ...design,
                        presetId: undefined,
                        colors: { ...design.colors, fg: e.target.value },
                      })
                    }
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
                    disabled={design.colors.transparent}
                    value={isHexColor(design.colors.bg) ? design.colors.bg : '#FFFFFF'}
                    onChange={(e) =>
                      onDesignChange({
                        ...design,
                        presetId: undefined,
                        colors: { ...design.colors, bg: e.target.value, transparent: false },
                      })
                    }
                    className="h-9 w-9 cursor-pointer rounded border border-hair bg-fieldbg p-0.5 disabled:opacity-40"
                  />
                  <label className="flex items-center gap-2 text-xs text-strong">
                    <input
                      type="checkbox"
                      checked={design.colors.transparent}
                      onChange={(e) =>
                        onDesignChange({
                          ...design,
                          presetId: undefined,
                          colors: {
                            ...design.colors,
                            transparent: e.target.checked,
                            bg: e.target.checked ? '#FFFFFF' : design.colors.bg || '#FFFFFF',
                          },
                        })
                      }
                      className="h-4 w-4 rounded border-hair"
                    />
                    Transparent
                  </label>
                </div>
              </div>

              <div>
                <label htmlFor="qr-export-size" className="text-xs font-semibold text-ink">Export size</label>
                <select
                  id="qr-export-size"
                  value={exportOptions.pixelSize}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    if (isExportSize(n)) onExportChange({ ...exportOptions, pixelSize: n });
                  }}
                  className="mt-2 h-10 w-full rounded-lg border border-hair bg-fieldbg px-3 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-500"
                >
                  {SIZE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="text-xs font-semibold text-ink">Module shape</p>
                <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="Module shape">
                  {MODULE_SHAPES.map((shape) => (
                    <button
                      key={shape}
                      type="button"
                      aria-pressed={design.modules.shape === shape}
                      onClick={() =>
                        isModuleShape(shape) &&
                        onDesignChange({ ...design, presetId: undefined, modules: { shape } })
                      }
                      className={`${CHIP} capitalize ${design.modules.shape === shape ? CHIP_ACTIVE : CHIP_IDLE}`}
                    >
                      {shape}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold text-ink">Eye shape</p>
                <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="Eye shape">
                  {(['square', 'rounded'] as EyeShape[]).map((shape) => (
                    <button
                      key={shape}
                      type="button"
                      aria-pressed={design.eyes.shape === shape}
                      onClick={() =>
                        isEyeShape(shape) &&
                        onDesignChange({ ...design, presetId: undefined, eyes: { shape } })
                      }
                      className={`${CHIP} capitalize ${design.eyes.shape === shape ? CHIP_ACTIVE : CHIP_IDLE}`}
                    >
                      {shape}
                    </button>
                  ))}
                </div>
              </div>
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
                {logoPresent && (
                  <>
                    <div className="flex gap-1" role="group" aria-label="Logo size">
                      {LOGO_SIZES.map((sz) => (
                        <button
                          key={sz}
                          type="button"
                          aria-pressed={design.logo?.size === sz}
                          onClick={() =>
                            design.logo &&
                            onDesignChange({ ...design, logo: { ...design.logo, size: sz } })
                          }
                          className={`${CHIP} uppercase ${design.logo?.size === sz ? CHIP_ACTIVE : CHIP_IDLE}`}
                        >
                          {sz === 's' ? 'S' : sz === 'm' ? 'M' : 'L'}
                        </button>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={() => onLogoPick(null)}
                      className="h-10 rounded-lg border border-hair px-3 text-xs font-semibold text-strong hover:bg-wash"
                    >
                      Remove
                    </button>
                  </>
                )}
              </div>
              {logoName && <p className="mt-1 truncate text-xs text-muted">{logoName}</p>}
              {logoError && (
                <p role="alert" className="mt-1.5 text-xs font-medium text-danger-700">{logoError}</p>
              )}
              <p className="mt-1.5 text-xs text-muted">
                PNG, JPG, or WEBP up to {Math.round(MAX_LOGO_BYTES / 1024)} KB. Centered on the QR.
              </p>
            </div>

            <div>
              <label htmlFor="qr-ec" className="text-xs font-semibold text-ink">Error correction (advanced)</label>
              <select
                id="qr-ec"
                value={effectiveEc}
                disabled={ecLocked}
                onChange={(e) => {
                  const v = e.target.value;
                  if ((QR_EC_LEVELS as readonly string[]).includes(v)) {
                    onDesignChange({ ...design, errorCorrection: v as QrEcLevel });
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
                  ? 'High (H) stays on while a logo is present.'
                  : EC_OPTIONS.find((o) => o.value === design.errorCorrection)?.hint}
              </p>
            </div>
          </div>
        </details>

        {blocks.length > 0 && (
          <div role="alert" className="rounded-lg border border-danger-200 bg-danger-50 px-3 py-2 text-xs font-medium text-danger-700">
            {blocks.map((b) => b.message).join(' ')}
          </div>
        )}
        {warns.length > 0 && blocks.length === 0 && (
          <div role="status" className="rounded-lg border border-yellow-300 bg-yellowx-100 px-3 py-2 text-xs font-medium text-yellowx-600">
            {warns.map((w) => w.message).join(' ')}
          </div>
        )}
      </div>
    </div>
  );
}
