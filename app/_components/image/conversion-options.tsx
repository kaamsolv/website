'use client';

import { Segmented } from '../choice';
import { supportsQualityControl } from '@/app/lib/image/registry/encoding';
import { labelForFormatId } from '@/app/lib/image/registry/capabilities';
import {
  MAX_SCALE_PERCENT,
  MIN_SCALE_PERCENT,
  resolveOutputDimensions,
} from '@/app/lib/image/transform/resize';
import type { OutputFormat, ResizeMode, ResizeOptions } from '@/app/lib/image/types';
import { DEFAULT_RESIZE_OPTIONS } from '@/app/lib/image/types';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  disabled?: boolean;
  outputFormat: OutputFormat;
  sourceDimensions: { width: number; height: number } | null;
  resize: ResizeOptions;
  onResizeChange: (resize: ResizeOptions) => void;
  quality: number;
  onQualityChange: (quality: number) => void;
  hasTransparency?: boolean;
};

const INPUT_CLASS =
  'h-10 w-full rounded-lg border border-hair bg-fieldbg px-3 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-500 disabled:opacity-60';

const MODE_OPTIONS: { value: ResizeMode; label: string }[] = [
  { value: 'original', label: 'Original size' },
  { value: 'scale', label: 'Scale %' },
  { value: 'dimensions', label: 'Custom px' },
];

export function ConversionOptions({
  open,
  onOpenChange,
  disabled,
  outputFormat,
  sourceDimensions,
  resize,
  onResizeChange,
  quality,
  onQualityChange,
  hasTransparency,
}: Props) {
  const showQuality = supportsQualityControl(outputFormat);
  const qualityPercent = Math.round(quality * 100);

  const outputPreview =
    sourceDimensions
      ? resolveOutputDimensions(sourceDimensions.width, sourceDimensions.height, resize)
      : null;

  const dimensionError = outputPreview && !outputPreview.ok ? outputPreview.message : null;
  const outputSize =
    outputPreview && outputPreview.ok
      ? `${outputPreview.width} × ${outputPreview.height} px`
      : null;

  function setMode(mode: ResizeMode) {
    if (mode === 'original') {
      onResizeChange({ ...DEFAULT_RESIZE_OPTIONS, mode: 'original' });
      return;
    }
    onResizeChange({ ...resize, mode });
  }

  function handleWidthChange(raw: string) {
    const parsed = raw === '' ? null : Number.parseInt(raw, 10);
    onResizeChange({
      ...resize,
      mode: 'dimensions',
      width: parsed !== null && Number.isNaN(parsed) ? null : parsed,
    });
  }

  function handleHeightChange(raw: string) {
    const parsed = raw === '' ? null : Number.parseInt(raw, 10);
    onResizeChange({
      ...resize,
      mode: 'dimensions',
      height: parsed !== null && Number.isNaN(parsed) ? null : parsed,
    });
  }

  return (
    <div className="space-y-2">
      <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-medium text-strong">
        <input
          type="checkbox"
          className="h-4 w-4 rounded border-hair text-coral-500 focus-visible:ring-2 focus-visible:ring-coral-500"
          checked={open}
          disabled={disabled}
          onChange={(e) => onOpenChange(e.target.checked)}
        />
        More options
      </label>

      {open && (
        <div
          className="space-y-4 rounded-xl border border-hair bg-surface p-4"
          role="region"
          aria-label="Conversion options"
        >
          <fieldset className="space-y-3" disabled={disabled}>
            <legend className="text-sm font-semibold text-ink">Resize</legend>
            <Segmented
              legend="How to resize"
              hideLegend
              options={MODE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
              value={resize.mode}
              onChange={setMode}
              disabled={disabled}
            />

            {resize.mode === 'scale' && (
              <div>
                <label htmlFor="resize-scale" className="block text-xs font-medium text-muted">
                  Scale · {resize.scalePercent}%
                </label>
                <input
                  id="resize-scale"
                  type="range"
                  min={MIN_SCALE_PERCENT}
                  max={MAX_SCALE_PERCENT}
                  value={Math.min(MAX_SCALE_PERCENT, Math.max(MIN_SCALE_PERCENT, resize.scalePercent))}
                  onChange={(e) =>
                    onResizeChange({ ...resize, scalePercent: Number(e.target.value) })
                  }
                  className="mt-1 w-full accent-coral-500"
                />
                <div className="mt-1 flex items-center gap-2">
                  <input
                    type="number"
                    min={MIN_SCALE_PERCENT}
                    max={MAX_SCALE_PERCENT}
                    value={resize.scalePercent}
                    onChange={(e) => {
                      const next = Number(e.target.value);
                      if (!Number.isFinite(next)) return;
                      onResizeChange({
                        ...resize,
                        scalePercent: Math.min(MAX_SCALE_PERCENT, Math.max(MIN_SCALE_PERCENT, next)),
                      });
                    }}
                    className={`${INPUT_CLASS} max-w-[5.5rem]`}
                    aria-label="Scale percentage"
                  />
                  <span className="text-xs text-muted">% of original</span>
                </div>
              </div>
            )}

            {resize.mode === 'dimensions' && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label htmlFor="resize-width" className="block text-xs font-medium text-muted">
                      Width
                    </label>
                    <input
                      id="resize-width"
                      type="number"
                      min={1}
                      inputMode="numeric"
                      placeholder="px"
                      value={resize.width ?? ''}
                      onChange={(e) => handleWidthChange(e.target.value)}
                      className={INPUT_CLASS}
                    />
                  </div>
                  <div>
                    <label htmlFor="resize-height" className="block text-xs font-medium text-muted">
                      Height
                    </label>
                    <input
                      id="resize-height"
                      type="number"
                      min={1}
                      inputMode="numeric"
                      placeholder="px"
                      value={resize.height ?? ''}
                      onChange={(e) => handleHeightChange(e.target.value)}
                      className={INPUT_CLASS}
                    />
                  </div>
                </div>
                <label className="inline-flex items-center gap-2 text-xs font-medium text-strong">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-hair text-coral-500 focus-visible:ring-2 focus-visible:ring-coral-500"
                    checked={resize.keepAspectRatio}
                    onChange={(e) =>
                      onResizeChange({ ...resize, keepAspectRatio: e.target.checked })
                    }
                  />
                  Keep aspect ratio
                </label>
              </div>
            )}

            {sourceDimensions && outputSize && (
              <p className="text-xs text-muted">
                Output size: <span className="font-semibold text-strong">{outputSize}</span>
                {outputPreview?.ok && outputPreview.changed && (
                  <span className="text-faint">
                    {' '}
                    (from {sourceDimensions.width} × {sourceDimensions.height})
                  </span>
                )}
              </p>
            )}

            {dimensionError && (
              <p className="text-xs font-medium text-danger-700" role="alert">
                {dimensionError}
              </p>
            )}
          </fieldset>

          {showQuality && (
            <fieldset className="space-y-2 border-t border-hair pt-4" disabled={disabled}>
              <legend className="text-sm font-semibold text-ink">
                Quality · {qualityPercent}%
              </legend>
              <p className="text-xs text-muted">
                Lower quality = smaller {labelForFormatId(outputFormat)} file.
              </p>
              <input
                id="output-quality"
                type="range"
                min={50}
                max={100}
                value={qualityPercent}
                onChange={(e) => onQualityChange(Number(e.target.value) / 100)}
                className="w-full accent-coral-500"
                aria-label="Output quality"
              />
              {outputFormat === 'jpeg' && hasTransparency && (
                <p className="text-xs text-muted">
                  Transparent areas become white — JPG doesn&apos;t support transparency.
                </p>
              )}
            </fieldset>
          )}
        </div>
      )}
    </div>
  );
}

export function hasValidResizeOptions(
  sourceDimensions: { width: number; height: number } | null,
  resize: ResizeOptions,
): boolean {
  if (!sourceDimensions) return true;
  const result = resolveOutputDimensions(sourceDimensions.width, sourceDimensions.height, resize);
  return result.ok;
}
