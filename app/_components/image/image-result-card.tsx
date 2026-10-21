'use client';

import { formatBytes, labelForFormat, sizeDeltaLabel } from '@/app/lib/image/validate';
import type { OutputFormat } from '@/app/lib/image/types';
import { ImagePreview } from './image-preview';

type Props = {
  filename: string;
  outputFormat: OutputFormat;
  inputBytes: number;
  outputBytes: number;
  previewUrl: string;
  width: number;
  height: number;
  transparent?: boolean;
  onDownload: () => void;
  onReset: () => void;
  /** Label for the second button. */
  resetLabel?: string;
  /** Small print under the buttons; `null` hides it. */
  footnote?: React.ReactNode | null;
};

export function ImageResultCard({
  filename,
  outputFormat,
  inputBytes,
  outputBytes,
  previewUrl,
  width,
  height,
  transparent,
  onDownload,
  onReset,
  resetLabel = 'Convert another',
  footnote = (
    <>
      Need a different size or smaller file? Open <span className="text-strong">More options</span> before
      converting.
    </>
  ),
}: Props) {
  const delta = sizeDeltaLabel(inputBytes, outputBytes);
  const outLabel = labelForFormat(outputFormat);

  return (
    <div className="rounded-xl2 border border-teal-300 bg-tealx-100 p-5">
      <div className="flex items-center gap-2">
        <span className="grid h-6 w-6 place-items-center rounded-full bg-teal-500 text-xs font-bold text-white" aria-hidden="true">
          ✓
        </span>
        <p className="font-display text-lg font-bold text-ink">Your image is ready</p>
      </div>

      <div className="mt-4">
        <ImagePreview
          src={previewUrl}
          alt={`Converted ${filename}`}
          transparent={transparent && outputFormat === 'png'}
        />
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        <div className="col-span-2">
          <dt className="text-xs text-faint">Filename</dt>
          <dd className="truncate font-medium text-ink">{filename}</dd>
        </div>
        <div>
          <dt className="text-xs text-faint">Format</dt>
          <dd className="font-medium text-strong">{outLabel}</dd>
        </div>
        <div>
          <dt className="text-xs text-faint">Dimensions</dt>
          <dd className="font-medium text-strong">{width} × {height} px</dd>
        </div>
        <div>
          <dt className="text-xs text-faint">Output size</dt>
          <dd className="font-medium text-strong">{formatBytes(outputBytes)}</dd>
        </div>
        <div>
          <dt className="text-xs text-faint">Original</dt>
          <dd className="font-medium text-strong">
            {formatBytes(inputBytes)}
            {delta ? ` · ${delta}` : ''}
          </dd>
        </div>
      </dl>

      <div className="mt-5 flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          onClick={onDownload}
          className="h-11 flex-1 rounded-lg bg-coral-500 px-4 text-sm font-semibold text-navy-900 hover:bg-coral-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-500"
        >
          Download {outLabel}
        </button>
        <button
          type="button"
          onClick={onReset}
          className="h-11 rounded-lg border border-hair bg-surface px-4 text-sm font-semibold text-strong hover:bg-wash focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-500"
        >
          {resetLabel}
        </button>
      </div>

      {footnote && <p className="mt-4 text-xs text-muted">{footnote}</p>}
    </div>
  );
}
