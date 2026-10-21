'use client';

import { formatBytes, labelForFormat } from '@/app/lib/image/validate';
import type { ImageFormat } from '@/app/lib/image/types';
import { ImagePreview } from './image-preview';

type Props = {
  name: string;
  bytes: number;
  format: ImageFormat;
  width?: number;
  height?: number;
  previewUrl?: string | null;
  transparent?: boolean;
  onRemove: () => void;
};

export function ImageFileCard({
  name,
  bytes,
  format,
  width,
  height,
  previewUrl,
  transparent,
  onRemove,
}: Props) {
  return (
    <div className="rounded-xl2 border border-hair bg-surface p-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        {previewUrl && (
          <div className="w-full shrink-0 sm:w-36">
            <ImagePreview
              src={previewUrl}
              alt={`Preview of ${name}`}
              transparent={transparent}
              maxHeightClass="max-h-36"
            />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-ink">{name}</p>
          <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
            <div>
              <dt className="text-faint">Format</dt>
              <dd className="font-medium text-strong">{labelForFormat(format)}</dd>
            </div>
            <div>
              <dt className="text-faint">Size</dt>
              <dd className="font-medium text-strong">{formatBytes(bytes)}</dd>
            </div>
            {width && height ? (
              <div className="col-span-2">
                <dt className="text-faint">Dimensions</dt>
                <dd className="font-medium text-strong">{width} × {height} px</dd>
              </div>
            ) : null}
          </dl>
          <button
            type="button"
            onClick={onRemove}
            className="mt-3 text-xs font-semibold text-strong hover:text-danger-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral-500"
          >
            Remove
          </button>
        </div>
      </div>
    </div>
  );
}
